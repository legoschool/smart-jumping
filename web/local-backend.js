/* ═══════════════════════════════════════════════════════════
   local-backend.js
   GitHub Pages(정적 호스팅)용 백엔드 대체 레이어.

   Apps Script 버전과 프론트 코드(app.js)를 100% 공유하기 위해,
   google.script.run 과 똑같은 인터페이스를 localStorage 위에 구현한다.
   → 프론트는 자기가 어느 백엔드에 붙어 있는지 몰라도 된다.

   ※ 이 파일은 데모 전용입니다. 실제 서버가 없으므로 데이터는
     이 브라우저에만 저장되고, 로그인은 형식적인 확인일 뿐입니다.
   ═══════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var NS = 'sjstatic:';
  var SEED = window.SJ_DATA;

  /* ── 저장소 ── */
  function get(key, fallback) {
    try {
      var v = localStorage.getItem(NS + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function set(key, val) {
    try { localStorage.setItem(NS + key, JSON.stringify(val)); } catch (e) {}
    return val;
  }

  /* 최초 진입 시 시드 주입 (시드 버전이 바뀌면 다시 주입)
     구글 시트와 동일하게 소유자(owner) 를 함께 저장한다.
     이게 없으면 교사가 담은 영상이 학생 계정에도 그대로 보인다. */
  if (get('ver') !== SEED.ver) {
    set('ver', SEED.ver);
    // 시드에 소유자(owner)가 행마다 들어 있으므로 그대로 복사한다
    set('classes', SEED.classes.slice());
    set('attendance', SEED.attendance.slice());
    set('equipment', SEED.equipment.slice());
    set('schedules', SEED.schedules.slice());
    set('views', {});
    set('playlists', {});
    set('profiles', {});
    // 로그인 세션 캐시도 비운다. 안 그러면 이전 시드의 이름·소속이 그대로 남는다.
    try { localStorage.removeItem('sj_user'); } catch (e) {}
  }

  /* ── SHA-256 (로그인 확인용) ── */
  function sha256(text) {
    if (!(window.crypto && window.crypto.subtle)) return Promise.resolve(null);
    var buf = new TextEncoder().encode(String(text));
    return window.crypto.subtle.digest('SHA-256', buf).then(function (d) {
      return Array.prototype.map.call(new Uint8Array(d), function (b) {
        return ('0' + b.toString(16)).slice(-2);
      }).join('');
    });
  }

  /** 사용자별 프로필 덮어쓰기 값 */
  function profile(userId) {
    return (get('profiles', {}) || {})[userId] || {};
  }
  /** 소유자 기준 필터 — 구글 시트판의 '소유자' 열과 같은 역할 */
  function mine(list, userId) {
    return (list || []).filter(function (x) { return x.owner === userId; });
  }

  var ROLES = ['관리자', '교사', '학생'];

  /** 기본 계정 + 가입 계정 + 관리자가 바꾼 값(권한·상태·비밀번호)을 합쳐서 본다 */
  function userOf(userId) {
    var all = SEED.users.concat(get('newUsers', []));
    var u = all.filter(function (x) { return x.id === userId; })[0];
    if (!u) return null;
    var o = (get('memberOverrides', {}) || {})[userId] || {};
    return {
      id: u.id, name: u.name, org: u.org, region: u.region,
      role: o.role || u.role,
      hash: o.hash || u.hash,
      status: o.status || '정상'
    };
  }
  function roleOf(userId) { var u = userOf(userId); return u ? u.role : ''; }
  function isAdmin(userId) { return roleOf(userId) === '관리자'; }

  /* ══════════════ API 구현 ══════════════ */
  var API = {

    /** 기본 계정 + 이 브라우저에서 가입한 계정을 함께 본다 */
    api_login: function (id, pw) {
      id = String(id).trim();
      var u = userOf(id);
      if (!u) return Promise.resolve({ ok: false, msg: '존재하지 않는 아이디입니다.' });
      if (get('withdrawn', []).indexOf(id) >= 0) {
        return Promise.resolve({ ok: false, msg: '탈퇴한 계정입니다.' });
      }
      if (u.status !== '정상') {
        return Promise.resolve({ ok: false, msg: '정지된 계정입니다. 관리자에게 문의하세요.' });
      }
      return sha256(pw).then(function (h) {
        if (h !== null && h !== u.hash) {
          return { ok: false, msg: '비밀번호가 올바르지 않습니다.' };
        }
        var p = profile(u.id);
        return {
          ok: true,
          user: {
            id: u.id,
            name: p.name || u.name,
            org: p.org !== undefined ? p.org : u.org,
            region: p.region !== undefined ? p.region : u.region,
            role: u.role
          }
        };
      });
    },

    api_bootstrap: function (userId) {
      var views = get('views', {});
      return {
        categories: SEED.categories,
        videos: SEED.videos.map(function (v) {
          return {
            id: v.id, c1: v.c1, c2: v.c2, title: v.title, yt: v.yt,
            dur: v.dur, views: (v.views || 0) + (views[v.id] || 0), date: v.date
          };
        }),
        // 담은 영상은 계정별로 따로 보관한다
        playlist: (get('playlists', {}) || {})[userId] || [],
        appTitle: SEED.appTitle
      };
    },

    api_savePlaylist: function (userId, ids) {
      var all = get('playlists', {}) || {};
      all[userId] = ids || [];
      set('playlists', all);
      return { ok: true, count: (ids || []).length };
    },

    api_addView: function (videoId) {
      var v = get('views', {});
      v[videoId] = (v[videoId] || 0) + 1;
      set('views', v);
      return { ok: true };
    },

    /* ── 수업관리 — 관리자는 전체, 교사는 내 것만 ── */
    api_classes: function (userId) {
      var rows = get('classes', []);
      return isAdmin(userId) ? rows.slice() : mine(rows, userId);
    },

    api_saveClass: function (userId, obj) {
      var rows = get('classes', []);
      if (obj.id) {
        var i = rows.findIndex(function (c) { return c.id === obj.id; });
        if (i < 0) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
        if (rows[i].owner !== userId && !isAdmin(userId)) {
          return { ok: false, msg: '수정 권한이 없습니다.' };
        }
        rows[i] = {
          id: obj.id, owner: rows[i].owner,   // 소유자는 그대로 유지
          ym: obj.ym, region: obj.region, school: obj.school,
          grade: obj.grade, cls: obj.cls, cap: obj.cap,
          // 값을 주지 않은 필드는 기존 값 유지 (커리큘럼 연결이 지워지던 문제)
          memo: (obj.memo === undefined) ? (rows[i].memo || '') : obj.memo,
          sched: (obj.sched === undefined) ? (rows[i].sched || '') : obj.sched
        };
        set('classes', rows);
        return { ok: true, id: obj.id };
      }
      var max = 0;
      rows.forEach(function (c) {
        var n = Number(String(c.id).replace(/\D/g, ''));
        if (n > max) max = n;
      });
      var id = 'CL' + ('00' + (max + 1)).slice(-3);
      rows.push({
        id: id, owner: userId, ym: obj.ym, region: obj.region, school: obj.school,
        grade: obj.grade, cls: obj.cls, cap: obj.cap,
        memo: obj.memo || '', sched: obj.sched || ''
      });
      set('classes', rows);
      return { ok: true, id: id };
    },

    api_deleteClass: function (classId, userId) {
      var rows = get('classes', []);
      var t = rows.filter(function (c) { return c.id === classId; })[0];
      if (!t) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
      if (userId && t.owner !== userId && !isAdmin(userId)) {
        return { ok: false, msg: '삭제 권한이 없습니다.' };
      }
      set('classes', rows.filter(function (c) { return c.id !== classId; }));
      return { ok: true };
    },

    /* ── 학급 커리큘럼 ── */
    api_classCurriculum: function (classId) {
      var c = get('classes', []).filter(function (x) { return x.id === classId; })[0];
      if (!c) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
      var label = c.school + ' ' + c.grade + '-' + c.cls;
      var group = String(c.sched || '').trim();
      if (!group) return { ok: true, group: '', items: [], className: label };
      var g = get('schedules', []).filter(function (s) {
        return s.owner === c.owner && s.name === group;
      })[0];
      return { ok: true, group: group, className: label, items: g ? g.items.slice() : [] };
    },

    /* ── 출석부 (날짜별 누적) ── */
    api_attendance: function (classId, date) {
      var rows = get('attendance', []).filter(function (a) { return a.classId === classId; });
      var dates = [];
      rows.forEach(function (r) { if (r.date && dates.indexOf(r.date) < 0) dates.push(r.date); });
      dates.sort().reverse();

      var target = (date || '').slice(0, 10) || dates[0] || SEED.today;
      var list = rows.filter(function (r) { return r.date === target; });

      var isNew = false;
      if (!list.length && dates.length) {
        isNew = true;
        list = rows.filter(function (r) { return r.date === dates[0]; })
                   .map(function (r) { return { classId: classId, name: r.name, date: target, status: '출' }; });
      }
      return { date: target, dates: dates, list: list, isNew: isNew };
    },

    api_attendanceSummary: function (classId) {
      var rows = get('attendance', []).filter(function (a) { return a.classId === classId; });
      var by = {};
      rows.forEach(function (a) {
        if (!by[a.name]) by[a.name] = { name: a.name, '출': 0, '결': 0, '지': 0, '조': 0, total: 0 };
        if (by[a.name][a.status] !== undefined) by[a.name][a.status]++;
        by[a.name].total++;
      });
      return Object.keys(by).map(function (k) { return by[k]; });
    },

    /** 해당 (수업, 날짜) 조합만 교체 — 지난 회차는 그대로 둔다 */
    api_saveAttendance: function (classId, date, list) {
      var d = (date || '').slice(0, 10) || SEED.today;
      var keep = get('attendance', []).filter(function (a) {
        return !(a.classId === classId && a.date === d);
      });
      (list || []).forEach(function (r) {
        keep.push({ classId: classId, name: r.name, date: d, status: r.status || '출' });
      });
      set('attendance', keep);
      return { ok: true, date: d, count: (list || []).length };
    },

    api_deleteAttendanceDate: function (classId, date) {
      var d = (date || '').slice(0, 10);
      set('attendance', get('attendance', []).filter(function (a) {
        return !(a.classId === classId && a.date === d);
      }));
      return { ok: true };
    },

    /* ── 교구 (내 것만) ── */
    api_equipment: function (userId) {
      return mine(get('equipment', []), userId).map(function (e) {
        return { name: e.name, agency: e.agency, fresh: e.fresh, used: e.used };
      });
    },

    api_saveEquipment: function (userId, list) {
      var others = get('equipment', []).filter(function (e) { return e.owner !== userId; });
      (list || []).forEach(function (r) {
        others.push({ owner: userId, name: r.name, agency: r.agency, fresh: r.fresh, used: r.used });
      });
      set('equipment', others);
      return { ok: true };
    },

    /* ── 스케줄 (내 것만) ── */
    api_schedules: function (userId) {
      return mine(get('schedules', []), userId).map(function (g) {
        return { name: g.name, items: g.items };
      });
    },

    api_saveSchedule: function (userId, groupName, no, videoIds) {
      var groups = get('schedules', []);
      var g = groups.filter(function (x) { return x.owner === userId && x.name === groupName; })[0];
      if (!g) { g = { owner: userId, name: groupName, items: [] }; groups.push(g); }
      var it = g.items.filter(function (x) { return Number(x.no) === Number(no); })[0];
      if (it) it.videoIds = videoIds || [];
      else g.items.push({ no: Number(no), videoIds: videoIds || [] });
      g.items.sort(function (a, b) { return a.no - b.no; });
      set('schedules', groups);
      return { ok: true };
    },

    api_deleteScheduleGroup: function (userId, groupName) {
      set('schedules', get('schedules', []).filter(function (g) {
        return !(g.owner === userId && g.name === groupName);
      }));
      return { ok: true };
    },

    /* ── 교재 ── */
    api_textbooks: function () { return SEED.textbooks; },

    /* ── 회원관리 (관리자 전용) ── */
    api_members: function (userId) {
      if (!isAdmin(userId)) return { ok: false, msg: '관리자만 볼 수 있습니다.' };
      var over = get('memberOverrides', {}) || {};
      var classes = get('classes', []), equip = get('equipment', []), scheds = get('schedules', []);
      var all = SEED.users.concat(get('newUsers', []));
      var list = all.map(function (u) {
        var o = over[u.id] || {};
        return {
          id: u.id, name: u.name, org: u.org, region: u.region,
          role: o.role || u.role,
          joined: u.joined || SEED.today,
          status: o.status || (get('withdrawn', []).indexOf(u.id) >= 0 ? '탈퇴' : '정상'),
          classCount: classes.filter(function (c) { return c.owner === u.id; }).length,
          equipCount: equip.filter(function (e) { return e.owner === u.id; }).length,
          schedCount: scheds.filter(function (s) { return s.owner === u.id; }).length
        };
      });
      return { ok: true, members: list, roles: ROLES };
    },

    api_setMemberRole: function (adminId, targetId, role) {
      if (!isAdmin(adminId)) return { ok: false, msg: '관리자만 변경할 수 있습니다.' };
      if (adminId === targetId) return { ok: false, msg: '자기 자신의 권한은 바꿀 수 없습니다.' };
      if (ROLES.indexOf(role) < 0) return { ok: false, msg: '알 수 없는 권한입니다.' };

      var over = get('memberOverrides', {}) || {};
      var all = SEED.users.concat(get('newUsers', []));
      var cur = function (u) { return (over[u.id] && over[u.id].role) || u.role; };
      var t = all.filter(function (u) { return u.id === targetId; })[0];
      if (!t) return { ok: false, msg: '회원을 찾을 수 없습니다.' };
      if (cur(t) === '관리자' && role !== '관리자') {
        var admins = all.filter(function (u) { return cur(u) === '관리자'; }).length;
        if (admins <= 1) return { ok: false, msg: '마지막 관리자는 권한을 낮출 수 없습니다.' };
      }
      over[targetId] = over[targetId] || {};
      over[targetId].role = role;
      set('memberOverrides', over);
      return { ok: true, role: role };
    },

    api_setMemberStatus: function (adminId, targetId, status) {
      if (!isAdmin(adminId)) return { ok: false, msg: '관리자만 변경할 수 있습니다.' };
      if (adminId === targetId) return { ok: false, msg: '자기 자신은 정지할 수 없습니다.' };
      var st = (status === '정상') ? '정상' : '정지';
      var over = get('memberOverrides', {}) || {};
      over[targetId] = over[targetId] || {};
      over[targetId].status = st;
      set('memberOverrides', over);
      return { ok: true, status: st };
    },

    api_resetMemberPw: function (adminId, targetId, newPw) {
      if (!isAdmin(adminId)) return { ok: false, msg: '관리자만 변경할 수 있습니다.' };
      if (!newPw || String(newPw).length < 4) return { ok: false, msg: '비밀번호는 4자 이상이어야 합니다.' };
      return sha256(newPw).then(function (h) {
        var over = get('memberOverrides', {}) || {};
        over[targetId] = over[targetId] || {};
        over[targetId].hash = h;
        set('memberOverrides', over);
        return { ok: true };
      });
    },

    /* ── 회원 ── */
    api_updateProfile: function (userId, obj) {
      var all = get('profiles', {}) || {};
      var p = all[userId] || {};
      if (obj.name) p.name = obj.name;
      if (obj.org !== undefined) p.org = obj.org;
      if (obj.region !== undefined) p.region = obj.region;
      all[userId] = p;
      set('profiles', all);
      return { ok: true, user: { id: userId, name: p.name, org: p.org, region: p.region } };
    },

    api_withdraw: function (userId, pw) {
      var all = SEED.users.concat(get('newUsers', []));
      var u = all.filter(function (x) { return x.id === userId; })[0];
      if (!u) return { ok: false, msg: '회원을 찾을 수 없습니다.' };
      return sha256(pw).then(function (h) {
        if (h !== null && h !== u.hash) return { ok: false, msg: '비밀번호가 올바르지 않습니다.' };
        var w = get('withdrawn', []);
        if (w.indexOf(userId) < 0) { w.push(userId); set('withdrawn', w); }
        return { ok: true };
      });
    },

    api_signup: function (obj) {
      if (!obj || !obj.id || !obj.pw || !obj.name) {
        return { ok: false, msg: '아이디·비밀번호·이름은 필수입니다.' };
      }
      var id = String(obj.id).trim();
      var all = SEED.users.concat(get('newUsers', []));
      if (all.some(function (x) { return x.id === id; })) {
        return { ok: false, msg: '이미 사용 중인 아이디입니다.' };
      }
      return sha256(obj.pw).then(function (h) {
        var list = get('newUsers', []);
        list.push({
          id: id, hash: h, name: obj.name,
          org: obj.org || '', region: obj.region || '', role: '교사'
        });
        set('newUsers', list);
        return { ok: true };
      });
    }
  };

  /* ══════════════ google.script.run 흉내 ══════════════ */
  function makeRunner() {
    var onOk = null, onErr = null;
    var runner = {
      withSuccessHandler: function (f) { onOk = f; return runner; },
      withFailureHandler: function (f) { onErr = f; return runner; }
    };
    Object.keys(API).forEach(function (name) {
      runner[name] = function () {
        var args = arguments;
        // 실제 서버 왕복처럼 비동기로 돌려준다
        setTimeout(function () {
          try {
            Promise.resolve(API[name].apply(null, args))
              .then(function (r) { if (onOk) onOk(r); })
              .catch(function (e) { if (onErr) onErr(e); });
          } catch (e) {
            if (onErr) onErr(e);
          }
        }, 60);
      };
    });
    return runner;
  }

  window.google = {
    script: {
      run: {
        withSuccessHandler: function (f) { return makeRunner().withSuccessHandler(f); },
        withFailureHandler: function (f) { return makeRunner().withFailureHandler(f); }
      }
    }
  };

  /* 데모 초기화용 (콘솔에서 sjReset() 호출) */
  window.sjReset = function () {
    Object.keys(localStorage)
      .filter(function (k) { return k.indexOf(NS) === 0; })
      .forEach(function (k) { localStorage.removeItem(k); });
    localStorage.removeItem('sj_user');
    location.reload();
  };
})();

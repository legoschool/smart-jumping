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

  /* 최초 진입 시 시드 주입 (시드 버전이 바뀌면 다시 주입) */
  if (get('ver') !== SEED.ver) {
    set('ver', SEED.ver);
    set('classes', SEED.classes);
    set('attendance', SEED.attendance);
    set('equipment', SEED.equipment);
    set('schedules', SEED.schedules);
    set('views', {});
    set('playlist', []);
    set('profile', null);
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

  function profile() {
    return get('profile', null) || {};
  }

  /* ══════════════ API 구현 ══════════════ */
  var API = {

    /** 기본 계정 + 이 브라우저에서 가입한 계정을 함께 본다 */
    api_login: function (id, pw) {
      id = String(id).trim();
      var all = SEED.users.concat(get('newUsers', []));
      var u = all.filter(function (x) { return x.id === id; })[0];
      if (!u) return Promise.resolve({ ok: false, msg: '존재하지 않는 아이디입니다.' });
      if (get('withdrawn', []).indexOf(id) >= 0) {
        return Promise.resolve({ ok: false, msg: '탈퇴한 계정입니다.' });
      }
      return sha256(pw).then(function (h) {
        if (h !== null && h !== u.hash) {
          return { ok: false, msg: '비밀번호가 올바르지 않습니다.' };
        }
        var p = profile();
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

    api_bootstrap: function () {
      var views = get('views', {});
      return {
        categories: SEED.categories,
        videos: SEED.videos.map(function (v) {
          return {
            id: v.id, c1: v.c1, c2: v.c2, title: v.title, yt: v.yt,
            dur: v.dur, views: (v.views || 0) + (views[v.id] || 0), date: v.date
          };
        }),
        playlist: get('playlist', []),
        appTitle: SEED.appTitle
      };
    },

    api_savePlaylist: function (userId, ids) {
      set('playlist', ids || []);
      return { ok: true, count: (ids || []).length };
    },

    api_addView: function (videoId) {
      var v = get('views', {});
      v[videoId] = (v[videoId] || 0) + 1;
      set('views', v);
      return { ok: true };
    },

    /* ── 수업관리 ── */
    api_classes: function () { return get('classes', []); },

    api_saveClass: function (userId, obj) {
      var rows = get('classes', []);
      if (obj.id) {
        var i = rows.findIndex(function (c) { return c.id === obj.id; });
        if (i < 0) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
        rows[i] = {
          id: obj.id, ym: obj.ym, region: obj.region, school: obj.school,
          grade: obj.grade, cls: obj.cls, cap: obj.cap, memo: obj.memo || ''
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
        id: id, ym: obj.ym, region: obj.region, school: obj.school,
        grade: obj.grade, cls: obj.cls, cap: obj.cap, memo: obj.memo || ''
      });
      set('classes', rows);
      return { ok: true, id: id };
    },

    api_deleteClass: function (classId) {
      set('classes', get('classes', []).filter(function (c) { return c.id !== classId; }));
      return { ok: true };
    },

    /* ── 출석부 ── */
    api_attendance: function (classId) {
      return get('attendance', []).filter(function (a) { return a.classId === classId; });
    },

    api_saveAttendance: function (classId, list) {
      var keep = get('attendance', []).filter(function (a) { return a.classId !== classId; });
      (list || []).forEach(function (r) {
        keep.push({ classId: classId, name: r.name, date: r.date || SEED.today, status: r.status || '출' });
      });
      set('attendance', keep);
      return { ok: true, count: (list || []).length };
    },

    /* ── 교구 ── */
    api_equipment: function () { return get('equipment', []); },

    api_saveEquipment: function (userId, list) {
      set('equipment', list || []);
      return { ok: true };
    },

    /* ── 스케줄 ── */
    api_schedules: function () { return get('schedules', []); },

    api_saveSchedule: function (userId, groupName, no, videoIds) {
      var groups = get('schedules', []);
      var g = groups.filter(function (x) { return x.name === groupName; })[0];
      if (!g) { g = { name: groupName, items: [] }; groups.push(g); }
      var it = g.items.filter(function (x) { return Number(x.no) === Number(no); })[0];
      if (it) it.videoIds = videoIds || [];
      else g.items.push({ no: Number(no), videoIds: videoIds || [] });
      g.items.sort(function (a, b) { return a.no - b.no; });
      set('schedules', groups);
      return { ok: true };
    },

    api_deleteScheduleGroup: function (userId, groupName) {
      set('schedules', get('schedules', []).filter(function (g) { return g.name !== groupName; }));
      return { ok: true };
    },

    /* ── 교재 ── */
    api_textbooks: function () { return SEED.textbooks; },

    /* ── 회원 ── */
    api_updateProfile: function (userId, obj) {
      var p = profile();
      if (obj.name) p.name = obj.name;
      if (obj.org !== undefined) p.org = obj.org;
      if (obj.region !== undefined) p.region = obj.region;
      set('profile', p);
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

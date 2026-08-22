/**
 * 02_API.gs  —  웹앱 진입점 + 프론트에서 google.script.run 으로 호출하는 API
 *
 *  프론트는 fetch 가 아니라 google.script.run 을 씁니다.
 *  → CORS 없음, 배포 URL 하드코딩 없음, 인증 자동.
 */

function doGet() {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle(APP.TITLE)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** index.html 안에서 <?!= include('css') ?> 로 부분 파일을 끼워 넣는다 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ═══════════════════════════════════════════
   인증
   ═══════════════════════════════════════════ */

function api_login(id, pw) {
  const users = readAll_(T.USERS);
  const hash = sha256_(pw);
  const u = users.filter(function (x) {
    return String(x['아이디']).trim() === String(id).trim();
  })[0];

  if (!u) return { ok: false, msg: '존재하지 않는 아이디입니다.' };
  if (String(u['상태']) !== '정상') return { ok: false, msg: '사용할 수 없는 계정입니다.' };
  if (String(u['비번해시']) !== hash) return { ok: false, msg: '비밀번호가 올바르지 않습니다.' };

  return {
    ok: true,
    user: {
      id: u['아이디'], name: u['이름'], org: u['소속'],
      region: u['지역'], role: u['권한']
    }
  };
}

function api_signup(obj) {
  return withLock_(function () {
    const users = readAll_(T.USERS);
    const dup = users.some(function (x) { return String(x['아이디']) === String(obj.id); });
    if (dup) return { ok: false, msg: '이미 사용 중인 아이디입니다.' };
    if (!obj.id || !obj.pw || !obj.name) return { ok: false, msg: '아이디·비밀번호·이름은 필수입니다.' };

    appendRows_(T.USERS, [{
      '아이디': obj.id, '비번해시': sha256_(obj.pw), '이름': obj.name,
      '소속': obj.org || '', '지역': obj.region || '', '권한': '교사',
      '가입일': today_(), '상태': '정상'
    }]);
    return { ok: true };
  });
}

function api_updateProfile(userId, obj) {
  return withLock_(function () {
    const sh = sheet_(T.USERS);
    const users = readAll_(T.USERS);
    const idx = users.findIndex(function (x) { return String(x['아이디']) === String(userId); });
    if (idx < 0) return { ok: false, msg: '회원을 찾을 수 없습니다.' };

    const row = idx + 2;
    if (obj.name) sh.getRange(row, 3).setValue(obj.name);
    if (obj.org !== undefined) sh.getRange(row, 4).setValue(obj.org);
    if (obj.region !== undefined) sh.getRange(row, 5).setValue(obj.region);
    if (obj.pw) sh.getRange(row, 2).setValue(sha256_(obj.pw));

    return { ok: true, user: { id: userId, name: obj.name, org: obj.org, region: obj.region } };
  });
}

function api_withdraw(userId, pw, reason, detail) {
  return withLock_(function () {
    const sh = sheet_(T.USERS);
    const users = readAll_(T.USERS);
    const idx = users.findIndex(function (x) { return String(x['아이디']) === String(userId); });
    if (idx < 0) return { ok: false, msg: '회원을 찾을 수 없습니다.' };
    if (String(users[idx]['비번해시']) !== sha256_(pw)) return { ok: false, msg: '비밀번호가 올바르지 않습니다.' };

    sh.getRange(idx + 2, 8).setValue('탈퇴 / ' + (reason || '') + ' / ' + (detail || '') + ' / ' + today_());
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   부트스트랩 (카테고리 + 영상 + 내 플레이리스트)
   ═══════════════════════════════════════════ */

function api_bootstrap(userId) {
  var payload = null;
  const cached = cache_().get('bootstrap');
  if (cached) {
    try { payload = JSON.parse(cached); } catch (e) { payload = null; }
  }

  if (!payload) {
    const cats = readAll_(T.CATEGORIES);
    const tree = {};
    const order = [];
    cats.forEach(function (r) {
      const c1 = String(r['대분류ID']);
      if (!tree[c1]) {
        tree[c1] = { id: c1, name: r['대분류명'], order: Number(r['대분류순서']) || 0, subs: [] };
        order.push(c1);
      }
      if (String(r['소분류ID']).trim()) {
        tree[c1].subs.push({
          id: String(r['소분류ID']), name: r['소분류명'],
          order: Number(r['소분류순서']) || 0, badge: String(r['N뱃지'] || '').trim()
        });
      }
    });
    const categories = order.map(function (k) { return tree[k]; })
      .sort(function (a, b) { return a.order - b.order; });
    categories.forEach(function (c) {
      c.subs.sort(function (a, b) { return a.order - b.order; });
    });

    const videos = readAll_(T.VIDEOS)
      .filter(function (v) { return String(v['노출여부']).toUpperCase() !== 'N'; })
      .map(function (v) {
        return {
          id: String(v['영상ID']), c1: String(v['대분류ID']), c2: String(v['소분류ID']),
          title: String(v['제목']), yt: String(v['youtube_id'] || '').trim(),
          dur: String(v['재생시간'] || ''), views: Number(v['조회수']) || 0,
          date: String(v['등록일'] || '')
        };
      });

    payload = { categories: categories, videos: videos };

    const json = JSON.stringify(payload);
    if (json.length < 95000) cache_().put('bootstrap', json, APP.CACHE_SEC);
  }

  payload.playlist = userId ? loadPlaylist_(userId) : [];
  payload.appTitle = APP.TITLE;
  return payload;
}

/* ═══════════════════════════════════════════
   플레이리스트 (영상담기)
   ═══════════════════════════════════════════ */

function loadPlaylist_(userId) {
  const rows = readAll_(T.PLAYLISTS);
  const r = rows.filter(function (x) { return String(x['소유자']) === String(userId); })[0];
  if (!r) return [];
  return String(r['담은영상ID목록'] || '').split(',').map(function (s) { return s.trim(); })
    .filter(function (s) { return s; });
}

function api_savePlaylist(userId, ids) {
  return withLock_(function () {
    const sh = sheet_(T.PLAYLISTS);
    const rows = readAll_(T.PLAYLISTS);
    const idx = rows.findIndex(function (x) { return String(x['소유자']) === String(userId); });
    const list = (ids || []).join(',');

    if (idx < 0) {
      appendRows_(T.PLAYLISTS, [{ '소유자': userId, '담은영상ID목록': list, '수정일': now_() }]);
    } else {
      sh.getRange(idx + 2, 2).setValue(list);
      sh.getRange(idx + 2, 3).setValue(now_());
    }
    return { ok: true, count: (ids || []).length };
  });
}

/** 조회수 증가 — 재생이 시작될 때 호출. 캐시는 건드리지 않고 시트만 누적. */
function api_addView(videoId) {
  try {
    return withLock_(function () {
      const sh = sheet_(T.VIDEOS);
      const rows = readAll_(T.VIDEOS);
      const idx = rows.findIndex(function (x) { return String(x['영상ID']) === String(videoId); });
      if (idx < 0) return { ok: false };
      const cell = sh.getRange(idx + 2, 7);
      cell.setValue((Number(cell.getValue()) || 0) + 1);
      return { ok: true };
    });
  } catch (e) {
    return { ok: false, msg: String(e) };
  }
}

/* ═══════════════════════════════════════════
   수업관리
   ═══════════════════════════════════════════ */

function api_classes(userId) {
  const rows = readAll_(T.CLASSES).filter(function (c) {
    return String(c['소유자']) === String(userId);
  });
  return rows.map(function (c) {
    return {
      id: String(c['수업ID']), ym: String(c['수업년월']), region: String(c['지역']),
      school: String(c['학교']), grade: c['학년'], cls: c['반'],
      cap: c['정원'], memo: String(c['메모'] || '')
    };
  });
}

function api_saveClass(userId, obj) {
  return withLock_(function () {
    const sh = sheet_(T.CLASSES);
    const rows = readAll_(T.CLASSES);

    if (obj.id) {
      const idx = rows.findIndex(function (x) { return String(x['수업ID']) === String(obj.id); });
      if (idx < 0) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
      sh.getRange(idx + 2, 3, 1, 7).setValues([[
        obj.ym, obj.region, obj.school, obj.grade, obj.cls, obj.cap, obj.memo || ''
      ]]);
      return { ok: true, id: obj.id };
    }

    var max = 0;
    rows.forEach(function (x) {
      var n = Number(String(x['수업ID']).replace(/\D/g, ''));
      if (n > max) max = n;
    });
    const newId = 'CL' + ('00' + (max + 1)).slice(-3);
    appendRows_(T.CLASSES, [{
      '수업ID': newId, '소유자': userId, '수업년월': obj.ym, '지역': obj.region,
      '학교': obj.school, '학년': obj.grade, '반': obj.cls, '정원': obj.cap, '메모': obj.memo || ''
    }]);
    return { ok: true, id: newId };
  });
}

function api_deleteClass(classId) {
  return withLock_(function () {
    const sh = sheet_(T.CLASSES);
    const rows = readAll_(T.CLASSES);
    const idx = rows.findIndex(function (x) { return String(x['수업ID']) === String(classId); });
    if (idx < 0) return { ok: false };
    sh.deleteRow(idx + 2);
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   출석부
   ═══════════════════════════════════════════ */

function api_attendance(classId) {
  return readAll_(T.ATTENDANCE)
    .filter(function (a) { return String(a['수업ID']) === String(classId); })
    .map(function (a) {
      return { classId: String(a['수업ID']), name: String(a['학생명']), date: String(a['날짜']), status: String(a['출결']) };
    });
}

function api_saveAttendance(classId, list) {
  return withLock_(function () {
    const all = readAll_(T.ATTENDANCE).filter(function (a) {
      return String(a['수업ID']) !== String(classId);
    });
    (list || []).forEach(function (r) {
      all.push({ '수업ID': classId, '학생명': r.name, '날짜': r.date || today_(), '출결': r.status || '출' });
    });
    replaceAll_(T.ATTENDANCE, all);
    return { ok: true, count: (list || []).length };
  });
}

/* ═══════════════════════════════════════════
   교구보유현황
   ═══════════════════════════════════════════ */

function api_equipment(userId) {
  return readAll_(T.EQUIPMENT)
    .filter(function (e) { return String(e['소유자']) === String(userId); })
    .map(function (e) {
      return {
        name: String(e['교구명']), agency: String(e['대리점명']),
        fresh: Number(e['새제품수량']) || 0, used: Number(e['중고제품수량']) || 0
      };
    });
}

function api_saveEquipment(userId, list) {
  return withLock_(function () {
    const others = readAll_(T.EQUIPMENT).filter(function (e) {
      return String(e['소유자']) !== String(userId);
    });
    (list || []).forEach(function (r) {
      others.push({
        '소유자': userId, '교구명': r.name, '대리점명': r.agency,
        '새제품수량': r.fresh, '중고제품수량': r.used, '수정일': now_()
      });
    });
    replaceAll_(T.EQUIPMENT, others);
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   프로그램 스케줄
   ═══════════════════════════════════════════ */

function api_schedules(userId) {
  const rows = readAll_(T.SCHEDULES).filter(function (s) {
    return String(s['소유자']) === String(userId);
  });
  const groups = {};
  rows.forEach(function (r) {
    const g = String(r['그룹명']);
    if (!groups[g]) groups[g] = { name: g, items: [] };
    groups[g].items.push({
      no: Number(r['차시']) || 0,
      videoIds: String(r['영상ID목록'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean)
    });
  });
  return Object.keys(groups).map(function (k) {
    groups[k].items.sort(function (a, b) { return a.no - b.no; });
    return groups[k];
  });
}

function api_saveSchedule(userId, groupName, no, videoIds) {
  return withLock_(function () {
    const all = readAll_(T.SCHEDULES);
    const idx = all.findIndex(function (s) {
      return String(s['소유자']) === String(userId) &&
             String(s['그룹명']) === String(groupName) &&
             Number(s['차시']) === Number(no);
    });
    const list = (videoIds || []).join(',');

    if (idx < 0) {
      appendRows_(T.SCHEDULES, [{ '소유자': userId, '그룹명': groupName, '차시': no, '영상ID목록': list }]);
    } else {
      sheet_(T.SCHEDULES).getRange(idx + 2, 4).setValue(list);
    }
    return { ok: true };
  });
}

function api_deleteScheduleGroup(userId, groupName) {
  return withLock_(function () {
    const keep = readAll_(T.SCHEDULES).filter(function (s) {
      return !(String(s['소유자']) === String(userId) && String(s['그룹명']) === String(groupName));
    });
    replaceAll_(T.SCHEDULES, keep);
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   온라인교재
   ═══════════════════════════════════════════ */

function api_textbooks() {
  return readAll_(T.TEXTBOOKS).map(function (b) {
    return {
      no: Number(b['권차']) || 0, title: String(b['제목']),
      cover: String(b['표지URL'] || ''), link: String(b['뷰어링크'] || ''),
      badge: String(b['뱃지'] || '')
    };
  }).sort(function (a, b) { return a.no - b.no; });
}

/* ═══════════════════════════════════════════
   관리
   ═══════════════════════════════════════════ */

/** 시트를 직접 수정한 뒤 즉시 반영하고 싶을 때 실행 */
function 캐시비우기() {
  clearCache_();
  Logger.log('캐시를 비웠습니다. 새로고침하면 최신 시트 내용이 보입니다.');
}

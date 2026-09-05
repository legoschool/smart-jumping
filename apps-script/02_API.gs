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
  payload.favorites = userId ? loadFavorites_(userId) : [];
  payload.appTitle = APP.TITLE;
  return payload;
}

/* ═══════════════════════════════════════════
   즐겨찾기
   ═══════════════════════════════════════════ */

function loadFavorites_(userId) {
  const r = readAll_(T.FAVORITES).filter(function (x) {
    return String(x['소유자']) === String(userId);
  })[0];
  if (!r) return [];
  return String(r['즐겨찾기영상ID목록'] || '').split(',')
    .map(function (s) { return s.trim(); }).filter(Boolean);
}

function api_saveFavorites(userId, ids) {
  return withLock_(function () {
    const sh = sheet_(T.FAVORITES);
    const rows = readAll_(T.FAVORITES);
    const idx = rows.findIndex(function (x) { return String(x['소유자']) === String(userId); });
    const list = (ids || []).join(',');

    if (idx < 0) {
      appendRows_(T.FAVORITES, [{ '소유자': userId, '즐겨찾기영상ID목록': list, '수정일': now_() }]);
    } else {
      sh.getRange(idx + 2, 2).setValue(list);
      sh.getRange(idx + 2, 3).setValue(now_());
    }
    return { ok: true, count: (ids || []).length };
  });
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

/** 사용자의 권한을 읽는다 */
function roleOf_(userId) {
  const u = readAll_(T.USERS).filter(function (x) {
    return String(x['아이디']) === String(userId);
  })[0];
  return u ? String(u['권한']) : '';
}

/**
 * 수업 목록.
 * 관리자는 모든 교사의 수업을 보고, 교사는 자기 수업만 본다.
 * (마이페이지의 교구·스케줄은 '내 것'이므로 관리자도 본인 것만 본다)
 */
function api_classes(userId) {
  const isAdmin = roleOf_(userId) === '관리자';
  const rows = readAll_(T.CLASSES).filter(function (c) {
    return isAdmin || String(c['소유자']) === String(userId);
  });
  return rows.map(function (c) {
    return {
      id: String(c['수업ID']), owner: String(c['소유자']),
      ym: String(c['수업년월']), region: String(c['지역']),
      school: String(c['학교']), grade: c['학년'], cls: c['반'],
      cap: c['정원'], memo: String(c['메모'] || ''),
      sched: String(c['스케줄그룹'] || '')
    };
  });
}

/**
 * 학급에 연결된 커리큘럼(차시 목록)을 가져온다.
 * 수업관리 → ▶수업 버튼에서 "3학년 2반 오늘 수업" 을 바로 여는 데 쓴다.
 */
function api_classCurriculum(classId, userId) {
  const cls = readAll_(T.CLASSES).filter(function (c) {
    return String(c['수업ID']) === String(classId);
  })[0];
  if (!cls) return { ok: false, msg: '수업을 찾을 수 없습니다.' };

  const group = String(cls['스케줄그룹'] || '').trim();
  if (!group) return { ok: true, group: '', items: [], className: classLabel_(cls) };

  // 스케줄은 학급 소유자의 것을 따른다 (관리자가 남의 수업을 열어도 원 소유자 커리큘럼)
  const owner = String(cls['소유자']);
  const items = readAll_(T.SCHEDULES)
    .filter(function (s) {
      return String(s['소유자']) === owner && String(s['그룹명']) === group;
    })
    .map(function (s) {
      return {
        no: Number(s['차시']) || 0,
        videoIds: String(s['영상ID목록'] || '').split(',')
          .map(function (x) { return x.trim(); }).filter(Boolean)
      };
    })
    .sort(function (a, b) { return a.no - b.no; });

  return { ok: true, group: group, items: items, className: classLabel_(cls) };
}

function classLabel_(c) {
  return String(c['학교']) + ' ' + c['학년'] + '-' + c['반'];
}

function api_saveClass(userId, obj) {
  return withLock_(function () {
    const sh = sheet_(T.CLASSES);
    const rows = readAll_(T.CLASSES);

    if (obj.id) {
      const idx = rows.findIndex(function (x) { return String(x['수업ID']) === String(obj.id); });
      if (idx < 0) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
      // 남의 수업은 관리자만 고칠 수 있다. 소유자 열(2번)은 건드리지 않는다.
      if (String(rows[idx]['소유자']) !== String(userId) && roleOf_(userId) !== '관리자') {
        return { ok: false, msg: '수정 권한이 없습니다.' };
      }
      // 값을 주지 않은 필드는 기존 값을 유지한다.
      // (예전에는 sched 를 빼고 부르면 커리큘럼 연결이 조용히 지워졌다)
      const keepMemo = (obj.memo === undefined) ? String(rows[idx]['메모'] || '') : obj.memo;
      const keepSched = (obj.sched === undefined) ? String(rows[idx]['스케줄그룹'] || '') : obj.sched;
      sh.getRange(idx + 2, 3, 1, 8).setValues([[
        obj.ym, obj.region, obj.school, obj.grade, obj.cls, obj.cap,
        keepMemo, keepSched
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
      '학교': obj.school, '학년': obj.grade, '반': obj.cls, '정원': obj.cap,
      '메모': obj.memo || '', '스케줄그룹': obj.sched || ''
    }]);
    return { ok: true, id: newId };
  });
}

function api_deleteClass(classId, userId) {
  return withLock_(function () {
    const sh = sheet_(T.CLASSES);
    const rows = readAll_(T.CLASSES);
    const idx = rows.findIndex(function (x) { return String(x['수업ID']) === String(classId); });
    if (idx < 0) return { ok: false, msg: '수업을 찾을 수 없습니다.' };
    if (userId && String(rows[idx]['소유자']) !== String(userId) && roleOf_(userId) !== '관리자') {
      return { ok: false, msg: '삭제 권한이 없습니다.' };
    }
    sh.deleteRow(idx + 2);
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   출석부
   ═══════════════════════════════════════════ */

/** 날짜 값을 'yyyy-MM-dd' 문자열로 통일 (시트가 Date 로 돌려줄 수 있다) */
function dateStr_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd');
  return String(v || '').trim().slice(0, 10);
}

/**
 * 출석부 조회.
 * date 를 주면 그 날짜만, 없으면 가장 최근 날짜를 돌려준다.
 * dates 에는 기록이 있는 모든 날짜가 최신순으로 담긴다.
 */
function api_attendance(classId, date) {
  const rows = readAll_(T.ATTENDANCE)
    .filter(function (a) { return String(a['수업ID']) === String(classId); })
    .map(function (a) {
      return {
        classId: String(a['수업ID']), name: String(a['학생명']),
        date: dateStr_(a['날짜']), status: String(a['출결'])
      };
    });

  const dates = [];
  rows.forEach(function (r) { if (r.date && dates.indexOf(r.date) < 0) dates.push(r.date); });
  dates.sort().reverse();

  const target = dateStr_(date) || dates[0] || today_();
  const list = rows.filter(function (r) { return r.date === target; });

  // 그 날짜에 기록이 없으면 가장 최근 회차의 학생 명단을 그대로 불러온다
  var roster = list;
  var isNew = false;
  if (!list.length && dates.length) {
    isNew = true;
    roster = rows.filter(function (r) { return r.date === dates[0]; })
                 .map(function (r) { return { classId: r.classId, name: r.name, date: target, status: '출' }; });
  }

  return { date: target, dates: dates, list: roster, isNew: isNew };
}

/** 그 학급의 출결 통계 (학생별 출/결/지/조 합계) */
function api_attendanceSummary(classId) {
  const rows = readAll_(T.ATTENDANCE)
    .filter(function (a) { return String(a['수업ID']) === String(classId); });
  const by = {};
  rows.forEach(function (a) {
    const nm = String(a['학생명']);
    if (!by[nm]) by[nm] = { name: nm, 출: 0, 결: 0, 지: 0, 조: 0, total: 0 };
    const st = String(a['출결']);
    if (by[nm][st] !== undefined) by[nm][st]++;
    by[nm].total++;
  });
  return Object.keys(by).map(function (k) { return by[k]; });
}

/**
 * 출석 저장 — 해당 (수업, 날짜) 조합만 교체한다.
 * 예전에는 그 반의 모든 날짜를 지우고 다시 써서 지난 기록이 사라졌다.
 */
function api_saveAttendance(classId, date, list) {
  return withLock_(function () {
    const d = dateStr_(date) || today_();
    const keep = readAll_(T.ATTENDANCE).filter(function (a) {
      return !(String(a['수업ID']) === String(classId) && dateStr_(a['날짜']) === d);
    });
    (list || []).forEach(function (r) {
      keep.push({ '수업ID': classId, '학생명': r.name, '날짜': d, '출결': r.status || '출' });
    });
    replaceAll_(T.ATTENDANCE, keep);
    return { ok: true, date: d, count: (list || []).length };
  });
}

/** 특정 날짜 회차 통째로 삭제 */
function api_deleteAttendanceDate(classId, date) {
  return withLock_(function () {
    const d = dateStr_(date);
    const keep = readAll_(T.ATTENDANCE).filter(function (a) {
      return !(String(a['수업ID']) === String(classId) && dateStr_(a['날짜']) === d);
    });
    replaceAll_(T.ATTENDANCE, keep);
    return { ok: true };
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
   내 출결 조회 (학생·학부모)
   ═══════════════════════════════════════════ */

/**
 * 로그인한 사람의 이름과 같은 학생명의 출결을 모아준다.
 * 출석부는 학생명(문자열)으로 기록되므로 계정 이름과 매칭한다.
 */
function api_myAttendance(userId) {
  const u = readAll_(T.USERS).filter(function (x) {
    return String(x['아이디']) === String(userId);
  })[0];
  if (!u) return { ok: false, msg: '회원을 찾을 수 없습니다.' };

  const myName = String(u['이름']).trim();
  const classes = readAll_(T.CLASSES);
  const clsById = {};
  classes.forEach(function (c) { clsById[String(c['수업ID'])] = c; });

  const mine = readAll_(T.ATTENDANCE).filter(function (a) {
    return String(a['학생명']).trim() === myName;
  });

  // 학급별로 묶는다
  const byClass = {};
  mine.forEach(function (a) {
    const cid = String(a['수업ID']);
    const c = clsById[cid];
    if (!byClass[cid]) {
      byClass[cid] = {
        classId: cid,
        className: c ? classLabel_(c) : cid,
        school: c ? String(c['학교']) : '',
        records: [], 출: 0, 결: 0, 지: 0, 조: 0, total: 0
      };
    }
    const st = String(a['출결']);
    byClass[cid].records.push({ date: dateStr_(a['날짜']), status: st });
    if (byClass[cid][st] !== undefined) byClass[cid][st]++;
    byClass[cid].total++;
  });

  const list = Object.keys(byClass).map(function (k) {
    byClass[k].records.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
    byClass[k].rate = byClass[k].total
      ? Math.round(byClass[k]['출'] / byClass[k].total * 100) : 0;
    return byClass[k];
  });

  return { ok: true, name: myName, classes: list };
}

/* ═══════════════════════════════════════════
   수업 리포트 (인쇄 · PDF)
   ═══════════════════════════════════════════ */

/** 학급 한 곳의 정보 + 커리큘럼 + 출결을 한 번에 모아준다 */
function api_classReport(classId, userId) {
  const c = readAll_(T.CLASSES).filter(function (x) {
    return String(x['수업ID']) === String(classId);
  })[0];
  if (!c) return { ok: false, msg: '수업을 찾을 수 없습니다.' };

  const isAdmin = roleOf_(userId) === '관리자';
  if (!isAdmin && String(c['소유자']) !== String(userId)) {
    return { ok: false, msg: '조회 권한이 없습니다.' };
  }

  const cur = api_classCurriculum(classId, userId);

  // 회차별 출결
  const att = readAll_(T.ATTENDANCE).filter(function (a) {
    return String(a['수업ID']) === String(classId);
  });
  const dates = [];
  att.forEach(function (a) {
    const d = dateStr_(a['날짜']);
    if (d && dates.indexOf(d) < 0) dates.push(d);
  });
  dates.sort();

  const names = [];
  att.forEach(function (a) {
    const n = String(a['학생명']);
    if (names.indexOf(n) < 0) names.push(n);
  });
  names.sort(function (a, b) { return a.localeCompare(b, 'ko'); });

  const grid = names.map(function (n) {
    const row = { name: n, cells: [], 출: 0, 결: 0, 지: 0, 조: 0 };
    dates.forEach(function (d) {
      const rec = att.filter(function (a) {
        return String(a['학생명']) === n && dateStr_(a['날짜']) === d;
      })[0];
      const st = rec ? String(rec['출결']) : '';
      row.cells.push(st);
      if (row[st] !== undefined) row[st]++;
    });
    row.total = dates.length;
    row.rate = dates.length ? Math.round(row['출'] / dates.length * 100) : 0;
    return row;
  });

  // 커리큘럼 영상 제목까지 붙여서 돌려준다
  const videos = readAll_(T.VIDEOS);
  const vTitle = {};
  videos.forEach(function (v) { vTitle[String(v['영상ID'])] = String(v['제목']); });
  const curItems = (cur.items || []).map(function (it) {
    return {
      no: it.no,
      videos: it.videoIds.map(function (id) { return vTitle[id] || id; })
    };
  });

  return {
    ok: true,
    printedAt: now_(),
    cls: {
      id: String(c['수업ID']), ym: String(c['수업년월']), region: String(c['지역']),
      school: String(c['학교']), grade: c['학년'], cls: c['반'], cap: c['정원'],
      owner: String(c['소유자']), memo: String(c['메모'] || '')
    },
    group: cur.group || '',
    curriculum: curItems,
    dates: dates,
    grid: grid
  };
}

/* ═══════════════════════════════════════════
   회원관리 (관리자 전용)
   ═══════════════════════════════════════════ */

const ROLES = ['관리자', '교사', '학생'];

/** 회원 목록 + 각자의 수업·교구 보유 수 */
function api_members(userId) {
  if (roleOf_(userId) !== '관리자') return { ok: false, msg: '관리자만 볼 수 있습니다.' };

  const classes = readAll_(T.CLASSES);
  const equip = readAll_(T.EQUIPMENT);
  const scheds = readAll_(T.SCHEDULES);

  const list = readAll_(T.USERS).map(function (u) {
    const id = String(u['아이디']);
    return {
      id: id, name: String(u['이름']), org: String(u['소속'] || ''),
      region: String(u['지역'] || ''), role: String(u['권한']),
      joined: dateStr_(u['가입일']), status: String(u['상태'] || '정상'),
      classCount: classes.filter(function (c) { return String(c['소유자']) === id; }).length,
      equipCount: equip.filter(function (e) { return String(e['소유자']) === id; }).length,
      schedCount: (function () {
        const g = {};
        scheds.forEach(function (s) {
          if (String(s['소유자']) === id) g[String(s['그룹명'])] = 1;
        });
        return Object.keys(g).length;
      })()
    };
  });
  return { ok: true, members: list, roles: ROLES };
}

/** 권한 변경 — 자기 자신은 바꿀 수 없다 (관리자가 스스로 잠기는 것 방지) */
function api_setMemberRole(adminId, targetId, role) {
  return withLock_(function () {
    if (roleOf_(adminId) !== '관리자') return { ok: false, msg: '관리자만 변경할 수 있습니다.' };
    if (String(adminId) === String(targetId)) return { ok: false, msg: '자기 자신의 권한은 바꿀 수 없습니다.' };
    if (ROLES.indexOf(role) < 0) return { ok: false, msg: '알 수 없는 권한입니다.' };

    const users = readAll_(T.USERS);
    const idx = users.findIndex(function (u) { return String(u['아이디']) === String(targetId); });
    if (idx < 0) return { ok: false, msg: '회원을 찾을 수 없습니다.' };

    // 마지막 관리자를 강등하면 아무도 관리할 수 없게 된다
    if (String(users[idx]['권한']) === '관리자' && role !== '관리자') {
      const admins = users.filter(function (u) { return String(u['권한']) === '관리자'; }).length;
      if (admins <= 1) return { ok: false, msg: '마지막 관리자는 권한을 낮출 수 없습니다.' };
    }
    sheet_(T.USERS).getRange(idx + 2, 6).setValue(role);
    return { ok: true, role: role };
  });
}

/** 계정 정지 / 복구 */
function api_setMemberStatus(adminId, targetId, status) {
  return withLock_(function () {
    if (roleOf_(adminId) !== '관리자') return { ok: false, msg: '관리자만 변경할 수 있습니다.' };
    if (String(adminId) === String(targetId)) return { ok: false, msg: '자기 자신은 정지할 수 없습니다.' };

    const users = readAll_(T.USERS);
    const idx = users.findIndex(function (u) { return String(u['아이디']) === String(targetId); });
    if (idx < 0) return { ok: false, msg: '회원을 찾을 수 없습니다.' };

    sheet_(T.USERS).getRange(idx + 2, 8).setValue(status === '정상' ? '정상' : '정지');
    return { ok: true, status: status === '정상' ? '정상' : '정지' };
  });
}

/** 관리자가 비밀번호를 초기화해 준다 */
function api_resetMemberPw(adminId, targetId, newPw) {
  return withLock_(function () {
    if (roleOf_(adminId) !== '관리자') return { ok: false, msg: '관리자만 변경할 수 있습니다.' };
    if (!newPw || String(newPw).length < 4) return { ok: false, msg: '비밀번호는 4자 이상이어야 합니다.' };

    const users = readAll_(T.USERS);
    const idx = users.findIndex(function (u) { return String(u['아이디']) === String(targetId); });
    if (idx < 0) return { ok: false, msg: '회원을 찾을 수 없습니다.' };

    sheet_(T.USERS).getRange(idx + 2, 2).setValue(sha256_(newPw));
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   영상 등록·관리

   교사가 사이트에서 유튜브 주소를 붙여 넣어 등록한다. 등록한 영상은 곧바로
   전체 라이브러리에 들어가 다른 선생님도 담아 쓸 수 있다.
   시트를 직접 여는 것은 이제 선택이다.

   권한
     학생   못 한다
     교사   등록. 자기가 올린 영상만 수정·삭제
     관리자 전체 영상 수정·삭제·숨김
   ═══════════════════════════════════════════ */

/** 주소든 ID든 11자 유튜브 ID 만 뽑아 낸다 */
function ytId_(input) {
  const s = String(input || '').trim();
  if (!s) return '';
  const m = s.match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : '';
}

/** 초 → 04:30 / 1:02:03 */
function mmss_(sec) {
  sec = Math.max(0, Math.round(Number(sec) || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  const p = function (n) { return ('0' + n).slice(-2); };
  return h ? (h + ':' + p(m) + ':' + p(s)) : (p(m) + ':' + p(s));
}

/** 영상을 등록할 수 있는 권한인가 */
function canAddVideo_(userId) {
  const r = roleOf_(userId);
  return r === '교사' || r === '관리자';
}

/** 그 영상을 고치거나 지울 수 있는가. 관리자는 전부, 교사는 자기가 올린 것만 */
function canEditVideo_(userId, row) {
  const r = roleOf_(userId);
  if (r === '관리자') return true;
  if (r !== '교사') return false;
  return String(row['등록자'] || '') === String(userId);
}

function nextVideoId_(rows) {
  let max = 0;
  rows.forEach(function (v) {
    const m = String(v['영상ID']).match(/^V(\d+)$/);
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'V' + ('000' + (max + 1)).slice(-4);
}

/**
 * 유튜브에서 제목·재생시간·퍼가기 허용 여부를 읽어 온다.
 * 등록 화면에서 주소를 붙여 넣는 순간 부른다. 호출 두 번(oEmbed + watch)이다.
 */
function api_ytLookup(userId, input) {
  if (!canAddVideo_(userId)) return { ok: false, msg: '교사 권한부터 영상을 등록할 수 있습니다.' };

  const id = ytId_(input);
  if (!id) return { ok: false, msg: '유튜브 주소를 알아보지 못했습니다. 주소 전체를 붙여 넣어 주세요.' };

  const dup = readAll_(T.VIDEOS).filter(function (v) {
    return String(v['youtube_id']).trim() === id;
  })[0];

  let title = '', dur = '', embed = true;
  try {
    const o = UrlFetchApp.fetch(
      'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=' + id),
      { muteHttpExceptions: true });
    if (o.getResponseCode() !== 200) {
      return { ok: false, msg: '유튜브에서 찾지 못했습니다. 비공개이거나 삭제된 영상입니다.' };
    }
    title = String(JSON.parse(o.getContentText()).title || '');
  } catch (e) {
    /* 권한이 없으면 여기서 걸린다. 편집기에서 권한확인() 을 한 번 실행하면 풀린다 */
    return { ok: false, msg: '유튜브에 연결하지 못했습니다. ' + e };
  }

  /* 재생시간과 퍼가기 여부는 watch 페이지에서 읽는다.
     구글 서버에서 그냥 부르면 동의 화면이 돌아와 값이 비는 일이 있어,
     동의 쿠키를 얹고 한 번 더 시도한다. 그래도 못 읽으면 등록은 그대로 두고
     재생시간만 비워 보낸다(선생님이 직접 적으면 된다). */
  const tries = [
    { url: 'https://www.youtube.com/watch?v=' + id + '&bpctr=9999999999&has_verified=1',
      headers: { 'Accept-Language': 'ko-KR,ko', 'Cookie': 'CONSENT=YES+cb; SOCS=CAI' } },
    { url: 'https://www.youtube.com/watch?v=' + id,
      headers: { 'Accept-Language': 'en-US,en' } }
  ];
  for (var i = 0; i < tries.length; i++) {
    try {
      const w = UrlFetchApp.fetch(tries[i].url,
        { muteHttpExceptions: true, followRedirects: true, headers: tries[i].headers });
      const html = w.getContentText();
      const ml = html.match(/"lengthSeconds":"(\d+)"/) || html.match(/"approxDurationMs":"(\d+)"/);
      if (ml) dur = mmss_(ml[0].indexOf('approx') >= 0 ? Number(ml[1]) / 1000 : ml[1]);
      const me = html.match(/"playableInEmbed":(true|false)/);
      if (me) embed = (me[1] === 'true');
      if (dur) break;
    } catch (e) { /* 다음 방법으로 */ }
  }

  return {
    ok: true, yt: id, title: title, dur: dur, embed: embed,
    note: dur ? '' : '재생시간을 읽지 못했습니다. 04:30 형식으로 직접 적어 주세요.',
    thumb: 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg',
    dupId: dup ? String(dup['영상ID']) : '',
    dupTitle: dup ? String(dup['제목']) : ''
  };
}

/** 영상 한 편 등록 */
function api_addVideo(userId, obj) {
  return withLock_(function () {
    if (!canAddVideo_(userId)) return { ok: false, msg: '교사 권한부터 영상을 등록할 수 있습니다.' };
    obj = obj || {};

    const yt = ytId_(obj.yt);
    if (!yt) return { ok: false, msg: '유튜브 주소를 다시 확인해 주세요.' };
    const title = String(obj.title || '').trim();
    if (!title) return { ok: false, msg: '제목을 넣어 주세요.' };
    const c1 = String(obj.c1 || '').trim(), c2 = String(obj.c2 || '').trim();
    if (!c1 || !c2) return { ok: false, msg: '영역과 세부 분류를 골라 주세요.' };

    const cats = readAll_(T.CATEGORIES);
    const okCat = cats.some(function (r) {
      return String(r['대분류ID']) === c1 && String(r['소분류ID']) === c2;
    });
    if (!okCat) return { ok: false, msg: '없는 분류입니다. 영역과 세부 분류를 다시 고르세요.' };

    const rows = readAll_(T.VIDEOS);
    if (rows.some(function (v) { return String(v['youtube_id']).trim() === yt; })) {
      return { ok: false, msg: '이미 등록된 영상입니다.' };
    }

    const id = nextVideoId_(rows);
    appendRows_(T.VIDEOS, [{
      '영상ID': id, '대분류ID': c1, '소분류ID': c2, '제목': title,
      'youtube_id': yt, '재생시간': String(obj.dur || '').trim(),
      '조회수': 0, '등록일': today_(), '노출여부': 'Y', '등록자': String(userId)
    }]);
    clearCache_();
    return { ok: true, id: id };
  });
}

/** 등록·관리 화면 목록. 관리자는 전체(숨김 포함), 교사는 자기가 올린 것 */
function api_myVideos(userId) {
  if (!canAddVideo_(userId)) return { ok: false, msg: '교사 권한부터 볼 수 있습니다.' };
  const isAdmin = roleOf_(userId) === '관리자';
  const list = readAll_(T.VIDEOS)
    .filter(function (v) { return isAdmin || String(v['등록자'] || '') === String(userId); })
    .map(function (v) {
      return {
        id: String(v['영상ID']), c1: String(v['대분류ID']), c2: String(v['소분류ID']),
        title: String(v['제목']), yt: String(v['youtube_id'] || '').trim(),
        dur: String(v['재생시간'] || ''), views: Number(v['조회수']) || 0,
        date: String(v['등록일'] || ''), by: String(v['등록자'] || ''),
        show: String(v['노출여부']).toUpperCase() !== 'N'
      };
    })
    .reverse();
  return { ok: true, videos: list, admin: isAdmin };
}

/** 제목·분류·재생시간·노출여부 수정 */
function api_updateVideo(userId, videoId, obj) {
  return withLock_(function () {
    obj = obj || {};
    const rows = readAll_(T.VIDEOS);
    const idx = rows.findIndex(function (v) { return String(v['영상ID']) === String(videoId); });
    if (idx < 0) return { ok: false, msg: '영상을 찾을 수 없습니다.' };
    if (!canEditVideo_(userId, rows[idx])) {
      return { ok: false, msg: '내가 등록한 영상만 고칠 수 있습니다. 관리자에게 요청하세요.' };
    }

    const cur = rows[idx];
    const title = obj.title === undefined ? String(cur['제목']) : String(obj.title).trim();
    if (!title) return { ok: false, msg: '제목은 비울 수 없습니다.' };
    const c1 = obj.c1 === undefined ? String(cur['대분류ID']) : String(obj.c1).trim();
    const c2 = obj.c2 === undefined ? String(cur['소분류ID']) : String(obj.c2).trim();
    const okCat = readAll_(T.CATEGORIES).some(function (r) {
      return String(r['대분류ID']) === c1 && String(r['소분류ID']) === c2;
    });
    if (!okCat) return { ok: false, msg: '없는 분류입니다.' };

    const show = obj.show === undefined ? String(cur['노출여부']) : (obj.show ? 'Y' : 'N');
    const dur = obj.dur === undefined ? String(cur['재생시간']) : String(obj.dur).trim();

    const sh = sheet_(T.VIDEOS), r = idx + 2;
    sh.getRange(r, 2).setValue(c1);
    sh.getRange(r, 3).setValue(c2);
    sh.getRange(r, 4).setValue(title);
    sh.getRange(r, 6).setValue(dur);
    sh.getRange(r, 9).setValue(show);
    clearCache_();
    return { ok: true };
  });
}

/** 영상 삭제. 담은 목록·즐겨찾기·커리큘럼에 남은 자취까지 지운다 */
function api_deleteVideo(userId, videoId) {
  return withLock_(function () {
    const rows = readAll_(T.VIDEOS);
    const idx = rows.findIndex(function (v) { return String(v['영상ID']) === String(videoId); });
    if (idx < 0) return { ok: false, msg: '영상을 찾을 수 없습니다.' };
    if (!canEditVideo_(userId, rows[idx])) {
      return { ok: false, msg: '내가 등록한 영상만 지울 수 있습니다. 관리자에게 요청하세요.' };
    }

    sheet_(T.VIDEOS).deleteRow(idx + 2);

    const drop = function (tab, col) {
      const list = readAll_(tab);
      let touched = false;
      list.forEach(function (row) {
        const ids = String(row[col] || '').split(',').map(function (x) { return x.trim(); });
        const left = ids.filter(function (x) { return x && x !== String(videoId); });
        if (left.length !== ids.filter(Boolean).length) { row[col] = left.join(','); touched = true; }
      });
      if (touched) replaceAll_(tab, list);
    };
    drop(T.PLAYLISTS, '담은영상ID목록');
    drop(T.FAVORITES, '즐겨찾기영상ID목록');
    drop(T.SCHEDULES, '영상ID목록');

    clearCache_();
    return { ok: true };
  });
}

/* ═══════════════════════════════════════════
   관리
   ═══════════════════════════════════════════ */

/**
 * 외부 요청(UrlFetchApp) 권한을 한 번 승인받기 위한 함수.
 *
 * 영상 등록은 유튜브에서 제목과 재생시간을 읽어 온다. 이 기능을 처음 올린 뒤에는
 * 편집기에서 이 함수를 한 번 실행해 권한 창을 승인해야 한다. 승인하지 않으면
 * 웹앱에서 '불러오기' 가 계속 실패한다.
 *
 * 실행 → 권한 검토 → 계정 선택 → 고급 → 이동 → 허용
 */
function 권한확인() {
  try {
    const r = UrlFetchApp.fetch(
      'https://www.youtube.com/oembed?format=json&url=' +
      encodeURIComponent('https://www.youtube.com/watch?v=2x4ECODdULE'),
      { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      Logger.log('외부 요청 권한 정상. 유튜브 응답을 받았습니다.\n'
        + JSON.parse(r.getContentText()).title);
    } else {
      Logger.log('유튜브가 ' + r.getResponseCode() + ' 로 답했습니다. 잠시 뒤 다시 실행해 보세요.');
    }
  } catch (e) {
    Logger.log('아직 권한이 없습니다: ' + e
      + '\n권한 검토 창이 뜨면 허용하고 다시 실행하세요.');
  }
}

/** 시트를 직접 수정한 뒤 즉시 반영하고 싶을 때 실행 */
function 캐시비우기() {
  clearCache_();
  Logger.log('캐시를 비웠습니다. 새로고침하면 최신 시트 내용이 보입니다.');
}

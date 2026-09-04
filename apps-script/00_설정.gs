/**
 * 미래형학교체육 '스마트점핑'(Smart-Jumping)
 * 00_설정.gs  —  전역 설정 / 공통 유틸
 */

const APP = {
  TITLE: "미래형학교체육 '스마트점핑'",
  SHORT: '스마트점핑',
  EN: 'Smart-Jumping',
  DB_NAME: '스마트점핑 DB',
  CACHE_SEC: 21600,      // 6시간
  PAGE_SIZE: 24
};

/** 시트 탭 이름 */
const T = {
  CATEGORIES: 'categories',
  VIDEOS: 'videos',
  USERS: 'users',
  CLASSES: 'classes',
  ATTENDANCE: 'attendance',
  EQUIPMENT: 'equipment',
  SCHEDULES: 'schedules',
  TEXTBOOKS: 'textbooks',
  PLAYLISTS: 'playlists',
  FAVORITES: 'favorites'
};

/** 각 탭의 헤더 정의 */
const HEADERS = {
  categories: ['대분류ID', '대분류명', '대분류순서', '소분류ID', '소분류명', '소분류순서', 'N뱃지'],
  videos:     ['영상ID', '대분류ID', '소분류ID', '제목', 'youtube_id', '재생시간', '조회수', '등록일', '노출여부', '등록자'],
  users:      ['아이디', '비번해시', '이름', '소속', '지역', '권한', '가입일', '상태'],
  classes:    ['수업ID', '소유자', '수업년월', '지역', '학교', '학년', '반', '정원', '메모', '스케줄그룹'],
  attendance: ['수업ID', '학생명', '날짜', '출결'],
  equipment:  ['소유자', '교구명', '대리점명', '새제품수량', '중고제품수량', '수정일'],
  schedules:  ['소유자', '그룹명', '차시', '영상ID목록'],
  textbooks:  ['권차', '제목', '표지URL', '뷰어링크', '뱃지'],
  playlists:  ['소유자', '담은영상ID목록', '수정일'],
  favorites:  ['소유자', '즐겨찾기영상ID목록', '수정일']
};

/* ─────────────────────────────────────────────
   스프레드시트 접근

   ▶ 쓰던 시트에서 확장 프로그램 → Apps Script 로 연 스크립트라면
     이 값을 비워 둡니다. 그 시트를 알아서 찾아 채웁니다.

   ▶ script.google.com 에서 따로 만든 스크립트라서 시트를 지정해야 할 때만
     아래에 시트 ID 를 넣습니다. (시트 URL 의 /d/ 와 /edit 사이 문자열)
     둘 다 비어 있으면 새 시트를 만듭니다.

     이 저장소는 공개입니다. 시트 ID 를 여기 적으면 주소가 함께 공개됩니다.
     파일 → 프로젝트 속성 → 스크립트 속성에 SHEET_ID 로 넣으면 저장소에 남지 않습니다.
   ───────────────────────────────────────────── */

const TARGET_SHEET_ID = '';

function props_() {
  return PropertiesService.getScriptProperties();
}

/** 시트에 바인딩된 스크립트(확장 프로그램 → Apps Script)로 열렸는지 */
function boundSs_() {
  try { return SpreadsheetApp.getActiveSpreadsheet(); } catch (e) { return null; }
}

function getSheetId_() {
  const bound = boundSs_();
  if (bound) return bound.getId();
  if (TARGET_SHEET_ID) return TARGET_SHEET_ID;
  const id = props_().getProperty('SHEET_ID');
  if (!id) throw new Error('DB가 아직 없습니다. 01_초기설정.gs 의 초기설정_실행() 을 먼저 실행하세요.');
  return id;
}

function ss_() {
  return SpreadsheetApp.openById(getSheetId_());
}

function sheet_(name) {
  const sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('시트 탭이 없습니다: ' + name);
  return sh;
}

/* ─────────────────────────────────────────────
   행 <-> 객체 변환
   ───────────────────────────────────────────── */

/** 탭 전체를 객체 배열로 읽는다 */
function readAll_(name) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last < 2) return [];
  const width = HEADERS[name].length;
  const values = sh.getRange(2, 1, last - 1, width).getValues();
  const keys = HEADERS[name];
  return values
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      const o = {};
      for (var i = 0; i < keys.length; i++) o[keys[i]] = r[i];
      return o;
    });
}

/** 객체 배열을 행 배열로 변환 */
function toRows_(name, objs) {
  const keys = HEADERS[name];
  return objs.map(function (o) {
    return keys.map(function (k) { return (o[k] === undefined || o[k] === null) ? '' : o[k]; });
  });
}

/** 탭 끝에 여러 행 추가 */
function appendRows_(name, objs) {
  if (!objs.length) return;
  const sh = sheet_(name);
  const rows = toRows_(name, objs);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, HEADERS[name].length).setValues(rows);
}

/** 탭 데이터 전체 교체 (헤더 유지) */
function replaceAll_(name, objs) {
  const sh = sheet_(name);
  const last = sh.getLastRow();
  if (last > 1) sh.getRange(2, 1, last - 1, HEADERS[name].length).clearContent();
  appendRows_(name, objs);
}

/* ─────────────────────────────────────────────
   기타 유틸
   ───────────────────────────────────────────── */

function sha256_(text) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text), Utilities.Charset.UTF_8);
  return raw.map(function (b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('');
}

function today_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
}

function now_() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd HH:mm:ss');
}

function cache_() {
  return CacheService.getScriptCache();
}

function clearCache_() {
  cache_().removeAll(['bootstrap', 'videos']);
}

/** 동시 쓰기 잠금 */
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); }
  finally { lock.releaseLock(); }
}

/* 생성된 시드 블록을 끼워 01_초기설정.gs 완성본을 쓴다 */
const fs = require('fs');
const path = require('path');
const DIR = path.resolve(__dirname, '..', 'apps-script');
const block = fs.readFileSync(__dirname + '/data/seed-block.txt', 'utf8').trim();

const head = `/**
 * 01_초기설정.gs  —  구글 시트 DB 자동 생성 + 실데이터 주입
 *
 *  ▶ 사용법: Apps Script 편집기에서 초기설정_실행() 을 한 번만 실행하세요.
 *    실행 로그에 생성된 스프레드시트 URL 이 찍힙니다.
 *
 *  ※ VIDEO_DATA 의 영상은 모두 실제 유튜브 공개 영상입니다.
 *    oEmbed 로 생존 여부를, watch 페이지의 playableInEmbed 로 임베드 허용 여부를
 *    전수 확인했고, 재생시간도 실제 값입니다.
 */

function 초기설정_실행() {
  const existing = props_().getProperty('SHEET_ID');
  var ss;

  if (existing) {
    ss = SpreadsheetApp.openById(existing);
    Logger.log('기존 DB를 재사용합니다: ' + ss.getUrl());
  } else {
    ss = SpreadsheetApp.create(APP.DB_NAME);
    props_().setProperty('SHEET_ID', ss.getId());
    Logger.log('새 DB를 만들었습니다: ' + ss.getUrl());
  }

  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.clear();
    var head = HEADERS[name];
    sh.getRange(1, 1, 1, head.length).setValues([head])
      .setFontWeight('bold')
      .setBackground('#4338ca')
      .setFontColor('#ffffff');
    sh.setFrozenRows(1);
    sh.autoResizeColumns(1, head.length);
  });

  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  seedCategories_();
  seedVideos_();
  seedUsers_();
  seedClasses_();
  seedAttendance_();
  seedEquipment_();
  seedSchedules_();
  seedTextbooks_();

  clearCache_();

  Logger.log('──────────────────────────────');
  Logger.log('초기설정 완료');
  Logger.log('DB URL : ' + ss.getUrl());
  Logger.log('로그인 : teacher / 1234   (관리자)');
  Logger.log('         test    / 1234   (교사)');
  Logger.log('         teststu / 1234   (학생)');
  Logger.log('──────────────────────────────');
  return ss.getUrl();
}

/** DB를 완전히 비우고 다시 만들고 싶을 때 */
function 초기설정_리셋() {
  props_().deleteProperty('SHEET_ID');
  clearCache_();
  Logger.log('SHEET_ID 를 해제했습니다. 초기설정_실행() 을 다시 실행하면 새 DB가 만들어집니다.');
}

/* ═══════════════════════════════════════════
   카테고리 + 실제 영상 데이터
   VIDEO_DATA 열: [영상ID, 대분류, 소분류, 제목, youtube_id, 재생시간, 조회수]
   ═══════════════════════════════════════════ */

`;

const tail = `
function seedCategories_() {
  const rows = [];
  CAT_TREE.forEach(function (c) {
    c[3].forEach(function (s) {
      rows.push({
        '대분류ID': c[0], '대분류명': c[1], '대분류순서': c[2],
        '소분류ID': s[0], '소분류명': s[1], '소분류순서': s[2], 'N뱃지': s[3]
      });
    });
  });
  replaceAll_(T.CATEGORIES, rows);
}

function seedVideos_() {
  const rows = VIDEO_DATA.map(function (v) {
    return {
      '영상ID': v[0], '대분류ID': v[1], '소분류ID': v[2], '제목': v[3],
      'youtube_id': v[4], '재생시간': v[5], '조회수': v[6],
      '등록일': today_(), '노출여부': 'Y'
    };
  });
  replaceAll_(T.VIDEOS, rows);
  Logger.log('영상 ' + rows.length + '건 생성 (전부 실제 유튜브 영상)');
}

/* ═══════════════════════════════════════════
   회원 / 수업 / 출석 / 교구 / 스케줄 / 교재
   ═══════════════════════════════════════════ */

function seedUsers_() {
  replaceAll_(T.USERS, [
    { '아이디': 'teacher', '비번해시': sha256_('1234'), '이름': '테스트', '소속': '스마트점핑 본부',
      '지역': '울산광역시 북구', '권한': '관리자', '가입일': today_(), '상태': '정상' },
    { '아이디': 'test', '비번해시': sha256_('1234'), '이름': '교사', '소속': '옥동초등학교',
      '지역': '울산광역시 남구', '권한': '교사', '가입일': today_(), '상태': '정상' },
    { '아이디': 'teststu', '비번해시': sha256_('1234'), '이름': '학생', '소속': '강동초등학교 3학년 2반',
      '지역': '울산광역시 북구', '권한': '학생', '가입일': today_(), '상태': '정상' }
  ]);
}

function seedClasses_() {
  const rows = [];
  // 마지막 값이 소유자 — 관리자(teacher)와 교사(test)에 나눠 담아
  // '관리자는 전체, 교사는 내 것만' 이 화면에서 바로 보이게 한다
  const spec = [
    ['울산광역시 북구', '강동초등학교', 1, 3, 8, 'teacher'],
    ['울산광역시 북구', '강동초등학교', 2, 1, 12, 'teacher'],
    ['울산광역시 북구', '강동초등학교', 3, 2, 15, 'teacher'],
    ['울산광역시 남구', '옥동초등학교', 4, 1, 20, 'test'],
    ['부산광역시 해운대구', '해운대초등학교', 5, 4, 18, 'test'],
    ['서울특별시 강남구', '대치초등학교', 6, 2, 22, 'test']
  ];
  spec.forEach(function (s, i) {
    rows.push({
      '수업ID': 'CL' + ('00' + (i + 1)).slice(-3),
      '소유자': s[5],
      '수업년월': '2026-0' + (7 + (i % 2)),
      '지역': s[0], '학교': s[1], '학년': s[2], '반': s[3], '정원': s[4],
      '메모': ''
    });
  });
  replaceAll_(T.CLASSES, rows);
}

function seedAttendance_() {
  const names = ['김민준', '이서연', '박지호', '최수아', '정예준', '강하윤', '조은우', '윤채원'];
  const rows = [];
  names.forEach(function (nm, i) {
    rows.push({ '수업ID': 'CL001', '학생명': nm, '날짜': today_(), '출결': i === 3 ? '결' : '출' });
  });
  replaceAll_(T.ATTENDANCE, rows);
}

function seedEquipment_() {
  replaceAll_(T.EQUIPMENT, [
    { '소유자': 'teacher', '교구명': '스마트점핑 로프 (표준형)', '대리점명': '울산대리점',
      '새제품수량': 20, '중고제품수량': 5, '수정일': now_() },
    { '소유자': 'teacher', '교구명': '스마트점핑 매트', '대리점명': '울산대리점',
      '새제품수량': 12, '중고제품수량': 3, '수정일': now_() },
    { '소유자': 'test', '교구명': '스마트점핑 로프 (학급용)', '대리점명': '울산대리점',
      '새제품수량': 30, '중고제품수량': 2, '수정일': now_() }
  ]);
}

/**
 * 시드 스케줄. 영상ID 는 VIDEO_DATA 순서에 맞춰 자동으로 고른다.
 * (영상 목록이 바뀌어도 없는 ID 를 가리키지 않도록)
 */
function seedSchedules_() {
  function pickBySub(subId, n) {
    return VIDEO_DATA.filter(function (v) { return v[2] === subId; })
                     .slice(0, n).map(function (v) { return v[0]; }).join(',');
  }
  replaceAll_(T.SCHEDULES, [
    // 1차시: 명상 → 준비운동 → 줄넘기 기초
    { '소유자': 'teacher', '그룹명': '1학기 기본과정', '차시': 1,
      '영상ID목록': [pickBySub('S13', 1), pickBySub('S31', 1), pickBySub('S41', 1)].join(',') },
    // 2차시: 타이머 → 타바타 → 음악줄넘기
    { '소유자': 'teacher', '그룹명': '1학기 기본과정', '차시': 2,
      '영상ID목록': [pickBySub('S21', 1), pickBySub('S32', 1), pickBySub('S45', 1)].join(',') },
    // 교사용: 몸풀기 → 기초체력 → 정리운동
    { '소유자': 'test', '그룹명': '체력왕 도전', '차시': 1,
      '영상ID목록': [pickBySub('S31', 1), pickBySub('S33', 1), pickBySub('S35', 1)].join(',') }
  ]);
}

function seedTextbooks_() {
  const rows = [];
  for (var i = 1; i <= 12; i++) {
    rows.push({
      '권차': i,
      '제목': '스마트점핑 ' + ('0' + i).slice(-2) + '권',
      '표지URL': '',
      '뷰어링크': '',
      '뱃지': i === 1 ? '특호' : ''
    });
  }
  replaceAll_(T.TEXTBOOKS, rows);
}
`;

fs.writeFileSync(DIR + '/01_초기설정.gs', head + block + '\n' + tail, 'utf8');
console.log('01_초기설정.gs 갱신 완료');

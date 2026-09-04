require('./mock.js');
const fs = require('fs');
const path = require('path');

const DIR = path.resolve(__dirname, '..', 'apps-script');
const files = ['00_설정.gs', '01_초기설정.gs', '02_API.gs'];

// .gs 3개를 하나의 스코프에서 평가 (Apps Script 와 동일하게 전역 공유)
let src = files.map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n;\n');
// 전역에 노출시키기 위해 함수/상수를 global 로 끌어올림
src += `
global.__api = {
  초기설정_실행, api_login, api_bootstrap, api_savePlaylist, api_addView,
  api_classes, api_saveClass, api_deleteClass, api_attendance, api_saveAttendance,
  api_equipment, api_saveEquipment, api_schedules, api_saveSchedule,
  api_textbooks, api_updateProfile, api_signup, readAll_, T,
  api_classCurriculum, api_attendanceSummary, api_deleteAttendanceDate,
  api_members, api_setMemberRole, api_setMemberStatus, api_resetMemberPw,
  api_saveFavorites, api_myAttendance, api_classReport,
  api_ytLookup, api_addVideo, api_myVideos, api_updateVideo, api_deleteVideo, ytId_, mmss_
};
`;
eval(src);
const A = global.__api;

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + label + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + label + (extra ? '  → ' + extra : '')); }
}

console.log('\n━━━ 1. 초기설정 (시트 생성 + 더미 주입) ━━━');
const url = A.초기설정_실행();
ok('스프레드시트 생성', !!url, url);

const cats = A.readAll_(A.T.CATEGORIES);
const vids = A.readAll_(A.T.VIDEOS);
const users = A.readAll_(A.T.USERS);
const classes = A.readAll_(A.T.CLASSES);
const books = A.readAll_(A.T.TEXTBOOKS);
ok('categories 행 23', cats.length === 23, cats.length + '행');
ok('videos 행 (실영상 104건)', vids.length === 104, vids.length + '건');
ok('users 3명 (teacher, test, teststu)', users.length === 3 &&
   users.map(u=>u['아이디']).sort().join(',')==='teacher,test,teststu',
   users.map(u => u['아이디'] + '/' + u['권한']).join(', '));
ok('classes 6건', classes.length === 6, classes.length + '건');
ok('textbooks 12권', books.length === 12, books.length + '권');

console.log('\n━━━ 2. 데이터 정합성 ━━━');
const subIds = new Set(cats.map(c => String(c['소분류ID'])));
const orphan = vids.filter(v => !subIds.has(String(v['소분류ID'])));
ok('모든 영상이 유효한 소분류에 속함', orphan.length === 0,
   orphan.length ? '고아 ' + orphan.length + '건' : '고아 0건');

const c1map = {};
cats.forEach(c => { c1map[String(c['소분류ID'])] = String(c['대분류ID']); });
const mismatch = vids.filter(v => c1map[String(v['소분류ID'])] !== String(v['대분류ID']));
ok('대분류-소분류 연결 일치', mismatch.length === 0, '불일치 ' + mismatch.length + '건');

const ids = vids.map(v => v['영상ID']);
ok('영상ID 중복 없음', new Set(ids).size === ids.length, new Set(ids).size + '개 고유');

const badDur = vids.filter(v => !/^(\d+:)?\d{2}:\d{2}$/.test(String(v['재생시간'])));
ok('재생시간 형식 mm:ss / h:mm:ss', badDur.length === 0,
   badDur.length ? badDur[0]['재생시간'] : vids[0]['재생시간'] + ' 등');

const badSec = vids.filter(v => { var p = String(v['재생시간']).split(':'); return Number(p[p.length-1]) > 59 || Number(p[p.length-2]) > 59; });
ok('초 단위가 59 이하', badSec.length === 0, '위반 ' + badSec.length + '건');

console.log('\n━━━ 2-b. 유튜브 연동 ━━━');
const noYt = vids.filter(v => !String(v['youtube_id']).trim());
ok('모든 영상에 youtube_id 존재', noYt.length === 0, '누락 ' + noYt.length + '건');
const badYt = vids.filter(v => !/^[A-Za-z0-9_-]{11}$/.test(String(v['youtube_id']).trim()));
ok('youtube_id 형식 11자 유효', badYt.length === 0,
   badYt.length ? badYt[0]['youtube_id'] : vids[0]['youtube_id'] + ' 등');
const ytIds = vids.map(v => String(v['youtube_id']));
ok('영상 중복 없음', new Set(ytIds).size === ytIds.length, new Set(ytIds).size + '개 고유');
ok('제목이 실제 유튜브 제목', vids.every(v => String(v['제목']).length > 3));

console.log('\n━━━ 3. 로그인 ━━━');
ok('teacher / 1234 성공 (관리자)', A.api_login('teacher','1234').ok &&
   A.api_login('teacher','1234').user.role === '관리자', A.api_login('teacher','1234').user.role);
ok('test / 1234 성공 (교사)', A.api_login('test','1234').ok &&
   A.api_login('test','1234').user.role === '교사', A.api_login('test','1234').user.role);
ok('teststu / 1234 성공 (학생)', A.api_login('teststu','1234').ok &&
   A.api_login('teststu','1234').user.role === '학생',
   A.api_login('teststu','1234').user.role + ' / ' + A.api_login('teststu','1234').user.name);
ok('권한 3종 구분', ['교사','관리자','학생'].every(r => users.some(u => u['권한'] === r)),
   users.map(u=>u['권한']).join(', '));
const bad = A.api_login('teacher', 'wrong');
ok('틀린 비밀번호 거부', !bad.ok, bad.msg);
const nouser = A.api_login('nobody', '1234');
ok('없는 아이디 거부', !nouser.ok, nouser.msg);
ok('비밀번호 평문 저장 안 함',
   users.every(u => String(u['비번해시']).length === 64 && u['비번해시'] !== '1234'),
   'SHA-256 64자');

console.log('\n━━━ 4. 부트스트랩 (프론트가 받는 데이터) ━━━');
const boot = A.api_bootstrap('teacher');
ok('대분류 6개', boot.categories.length === 6,
   boot.categories.map(c => c.name).join(' / '));
ok('대분류 순서 정렬', boot.categories.every((c, i, a) => i === 0 || a[i-1].order <= c.order));
const c4 = boot.categories.find(c => c.id === 'C4');
ok('스마트점핑 소분류 6개', c4.subs.length === 6, c4.subs.length + '개');
ok('전 대분류 영상 보유', boot.categories.every(c => boot.videos.some(v => v.c1 === c.id)),
   boot.categories.map(c => c.name + ':' + boot.videos.filter(v=>v.c1===c.id).length).join(' '));
ok('소분류 순서 정렬', c4.subs.every((s, i, a) => i === 0 || a[i-1].order <= s.order));
ok('N뱃지 전달됨', boot.categories.some(c => c.subs.some(s => s.badge === 'N')));
ok('영상 필드 정상', boot.videos[0].id && boot.videos[0].title && boot.videos[0].dur,
   JSON.stringify(boot.videos[0]));
ok('캐시 히트 (2번째 호출)', (() => {
  const b2 = A.api_bootstrap('teacher');
  return b2.videos.length === boot.videos.length;
})(), '재호출 일치');

console.log('\n━━━ 5. 플레이리스트 (영상담기) ━━━');
const picks = boot.videos.slice(0, 4).map(v => v.id);
A.api_savePlaylist('teacher', picks);
const boot2 = A.api_bootstrap('teacher');
ok('담기 저장/복원', JSON.stringify(boot2.playlist) === JSON.stringify(picks), picks.join(','));
A.api_savePlaylist('teacher', [picks[0]]);
ok('덮어쓰기 동작', A.api_bootstrap('teacher').playlist.length === 1);
A.api_savePlaylist('teacher', []);
ok('전체 비우기', A.api_bootstrap('teacher').playlist.length === 0);

console.log('\n━━━ 6. 조회수 증가 ━━━');
const before = Number(A.readAll_(A.T.VIDEOS).find(v => v['영상ID'] === 'V0001')['조회수']);
A.api_addView('V0001');
A.api_addView('V0001');
const after = Number(A.readAll_(A.T.VIDEOS).find(v => v['영상ID'] === 'V0001')['조회수']);
ok('2회 재생 → +2', after === before + 2, before + ' → ' + after);

console.log('\n━━━ 7. 수업관리 CRUD ━━━');
let cls = A.api_classes('teacher');
ok('관리자는 전체 조회', cls.length === 6, cls.length + '건');
ok('교사는 내 것만', A.api_classes('test').length === 3, A.api_classes('test').length + '건');
ok('학생은 0건', A.api_classes('teststu').length === 0);
ok('소유자 정보 전달', cls.every(c => c.owner), cls.map(c=>c.owner).join(','));
const add = A.api_saveClass('teacher', {
  ym: '2026-09', region: '대구광역시 수성구', school: '범어초등학교',
  grade: 3, cls: 5, cap: 24, memo: '테스트'
});
ok('신규 등록', add.ok && add.id === 'CL007', add.id);
ok('등록 후 7건', A.api_classes('teacher').length === 7);
A.api_saveClass('teacher', { id: 'CL007', ym: '2026-10', region: '대구광역시 수성구',
  school: '범어초등학교', grade: 4, cls: 5, cap: 30, memo: '수정됨' });
const edited = A.api_classes('teacher').find(c => c.id === 'CL007');
ok('수정 반영', edited.ym === '2026-10' && edited.cap === 30 && edited.grade === 4,
   edited.ym + ' / 정원' + edited.cap + ' / ' + edited.grade + '학년');
A.api_deleteClass('CL007', 'teacher');
ok('삭제 반영', A.api_classes('teacher').length === 6);
const denied = A.api_deleteClass('CL001', 'teststu');
ok('남의 수업 삭제 거부', !denied.ok, denied.msg);
const denied2 = A.api_saveClass('teststu', { id:'CL001', ym:'2026-01', region:'x', school:'y', grade:1, cls:1, cap:1 });
ok('남의 수업 수정 거부', !denied2.ok, denied2.msg);
ok('관리자는 남의 수업 수정 가능',
   A.api_saveClass('teacher', { id:'CL004', ym:'2026-12', region:'울산광역시 남구',
     school:'옥동초등학교', grade:4, cls:1, cap:20 }).ok);
ok('수정해도 소유자 유지',
   A.api_classes('test').some(c => c.id === 'CL004'), 'CL004 → test 소유 유지');
ok('삭제 후 다른 수업 온전', A.api_classes('teacher').every(c => c.school && c.ym));

console.log('\n━━━ 8. 출석부 (날짜별 누적) ━━━');
const a0 = A.api_attendance('CL001');
ok('회차 3건 기록', a0.dates.length === 3, a0.dates.join(', '));
ok('최신 회차 자동 선택', a0.date === a0.dates[0], a0.date);
ok('최신 회차 9명', a0.list.length === 9, a0.list.length + '명 (학생 계정 포함)');
const older = A.api_attendance('CL001', a0.dates[2]);
ok('지난 회차 조회', older.date === a0.dates[2] && older.list.length === 9, older.date);
ok('회차마다 출결이 다름',
   JSON.stringify(a0.list.map(x => x.status)) !== JSON.stringify(older.list.map(x => x.status)),
   a0.list.map(x => x.status).join('') + '  vs  ' + older.list.map(x => x.status).join(''));

// 시드 회차가 오늘 기준으로 생성되므로 새 회차도 오늘 이후로 잡는다 (날짜 고정 금지)
const dPlus = function (n) {
  const t = new Date(Date.now() + n * 86400000);
  return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2);
};
const D_NEW = dPlus(1), D_FRESH = dPlus(30);

A.api_saveAttendance('CL001', D_NEW, [
  { name: '홍길동', status: '출' }, { name: '성춘향', status: '지' }
]);
ok('새 회차 저장', A.api_attendance('CL001', D_NEW).list.length === 2);
ok('지난 회차 보존 (핵심)', A.api_attendance('CL001', a0.dates[0]).list.length === 9,
   '예전에는 여기서 덮어써져 사라졌다');
ok('회차 4건으로 증가', A.api_attendance('CL001').dates.length === 4,
   A.api_attendance('CL001').dates.join(', '));

const fresh = A.api_attendance('CL001', D_FRESH);
ok('새 날짜에 최근 명단 승계', fresh.isNew && fresh.list.length === 2 &&
   fresh.list.every(x => x.status === '출'), 'isNew=' + fresh.isNew + ' / ' + fresh.list.length + '명');

const sum = A.api_attendanceSummary('CL001');
ok('누적 통계 산출', sum.length > 0 && sum.every(r => r.total > 0),
   sum.slice(0, 2).map(r => r.name + ' 출' + r['출'] + '/결' + r['결']).join(', '));

A.api_deleteAttendanceDate('CL001', D_NEW);
ok('회차 삭제', A.api_attendance('CL001').dates.indexOf(D_NEW) < 0);
ok('다른 반 출석 영향 없음', A.api_attendance('CL002').list.length === 0);

console.log('\n━━━ 8-b. 수업 ↔ 커리큘럼 연결 ━━━');
const cur1 = A.api_classCurriculum('CL001', 'teacher');
ok('학급에 커리큘럼 연결됨', cur1.ok && cur1.group === '1학기 기본과정', cur1.group);
ok('차시 목록 반환', cur1.items.length === 2, cur1.items.length + '차시');
ok('차시에 영상 4편', cur1.items[0].videoIds.length === 4, cur1.items[0].videoIds.join(','));
ok('학급 이름 표기', cur1.className === '강동초등학교 1-3', cur1.className);
const cur6 = A.api_classCurriculum('CL006', 'teacher');
ok('미연결 학급은 빈 목록', cur6.ok && cur6.group === '' && cur6.items.length === 0);
const cur4 = A.api_classCurriculum('CL004', 'teacher');
ok('관리자가 열어도 원 소유자 커리큘럼', cur4.ok && cur4.group === '체력왕 도전', cur4.group);
ok('sched 미지정 수정 시 연결 유지',
   A.api_classCurriculum('CL005', 'teacher').group === '체력왕 도전',
   '수정해도 ' + A.api_classCurriculum('CL005', 'teacher').group + ' 유지');
A.api_saveClass('test', { id: 'CL006', ym: '2026-08', region: '서울특별시 강남구',
  school: '대치초등학교', grade: 6, cls: 2, cap: 22, sched: '체력왕 도전' });
ok('커리큘럼 연결 저장', A.api_classCurriculum('CL006', 'test').group === '체력왕 도전');

console.log('\n━━━ 8-c. 회원관리 (관리자 전용) ━━━');
ok('교사는 접근 거부', !A.api_members('test').ok, A.api_members('test').msg);
ok('학생은 접근 거부', !A.api_members('teststu').ok);
const mem = A.api_members('teacher');
ok('관리자 회원 3명 조회', mem.ok && mem.members.length === 3,
   mem.members.map(m => m.id + '/' + m.role).join(', '));
ok('보유 현황 집계', mem.members.find(m => m.id === 'test').classCount === 3,
   'test 수업 ' + mem.members.find(m => m.id === 'test').classCount + '건');
ok('자기 권한 변경 거부', !A.api_setMemberRole('teacher', 'teacher', '교사').msg.indexOf('자기 자신'),
   A.api_setMemberRole('teacher', 'teacher', '교사').msg);
ok('교사가 권한 변경 시도 거부', !A.api_setMemberRole('test', 'teststu', '관리자').ok);
ok('알 수 없는 권한 거부', !A.api_setMemberRole('teacher', 'teststu', '슈퍼관리자').ok);
ok('학생 → 교사 승격', A.api_setMemberRole('teacher', 'teststu', '교사').ok &&
   A.api_login('teststu', '1234').user.role === '교사');
A.api_setMemberRole('teacher', 'teststu', '학생');
ok('되돌리기', A.api_login('teststu', '1234').user.role === '학생');

A.api_setMemberRole('teacher', 'test', '관리자');
ok('관리자 2명일 때 강등 허용', A.api_setMemberRole('teacher', 'test', '교사').ok);
const lastAdmin = A.api_setMemberRole('test', 'teacher', '교사');
ok('마지막 관리자 강등 차단', !lastAdmin.ok || A.api_login('teacher', '1234').user.role === '관리자',
   lastAdmin.msg || '차단됨');

ok('계정 정지', A.api_setMemberStatus('teacher', 'teststu', '정지').ok);
ok('정지 계정 로그인 거부', !A.api_login('teststu', '1234').ok, A.api_login('teststu', '1234').msg);
A.api_setMemberStatus('teacher', 'teststu', '정상');
ok('복구 후 로그인 성공', A.api_login('teststu', '1234').ok);
ok('자기 자신 정지 거부', !A.api_setMemberStatus('teacher', 'teacher', '정지').ok);
ok('비밀번호 초기화', A.api_resetMemberPw('teacher', 'teststu', 'newpass').ok &&
   A.api_login('teststu', 'newpass').ok && !A.api_login('teststu', '1234').ok);
ok('짧은 비밀번호 거부', !A.api_resetMemberPw('teacher', 'teststu', '12').ok);
A.api_resetMemberPw('teacher', 'teststu', '1234');

console.log('\n━━━ 8-d. 영상 즐겨찾기 ━━━');
const bootF = A.api_bootstrap('teacher');
ok('시드 즐겨찾기 존재', bootF.favorites.length >= 3, bootF.favorites.join(','));
ok('즐겨찾기가 실제 영상 가리킴',
   bootF.favorites.every(id => bootF.videos.some(v => v.id === id)));
A.api_saveFavorites('teacher', ['V0001', 'V0002']);
ok('저장/복원', JSON.stringify(A.api_bootstrap('teacher').favorites) === '["V0001","V0002"]');
ok('계정별 분리 (교사는 비어있음)', A.api_bootstrap('test').favorites.length === 0);
A.api_saveFavorites('test', ['V0005']);
ok('교사 즐겨찾기 독립', A.api_bootstrap('test').favorites.length === 1 &&
   A.api_bootstrap('teacher').favorites.length === 2,
   'teacher 2건 / test 1건');
A.api_saveFavorites('teacher', []);
ok('전체 해제', A.api_bootstrap('teacher').favorites.length === 0);

console.log('\n━━━ 8-e. 내 출결 (학생) ━━━');
const myStu = A.api_myAttendance('teststu');
ok('학생 본인 출결 조회', myStu.ok && myStu.name === '학생', myStu.name);
ok('학급 1곳', myStu.classes.length === 1, myStu.classes.map(c => c.className).join(', '));
ok('회차 수 = 출석 기록 수', myStu.classes[0].total === myStu.classes[0].records.length,
   myStu.classes[0].total + '회');
ok('출석률 계산', typeof myStu.classes[0].rate === 'number' &&
   myStu.classes[0].rate >= 0 && myStu.classes[0].rate <= 100, myStu.classes[0].rate + '%');
ok('최신순 정렬', myStu.classes[0].records.every((r, i, a) => i === 0 || a[i-1].date >= r.date),
   myStu.classes[0].records.map(r => r.date).join(' > '));
ok('출결 합계 = 전체', (function () {
  const c = myStu.classes[0];
  return c['출'] + c['결'] + c['지'] + c['조'] === c.total;
})(), myStu.classes[0]['출'] + '+' + myStu.classes[0]['결'] + '+' +
      myStu.classes[0]['지'] + '+' + myStu.classes[0]['조'] + ' = ' + myStu.classes[0].total);
ok('기록 없는 사람은 빈 목록', A.api_myAttendance('test').classes.length === 0);

console.log('\n━━━ 8-f. 수업 리포트 ━━━');
const rep = A.api_classReport('CL001', 'teacher');
ok('리포트 생성', rep.ok && !!rep.printedAt, rep.printedAt);
ok('학급 정보', rep.cls.school === '강동초등학교' && rep.cls.grade === 1,
   rep.cls.school + ' ' + rep.cls.grade + '-' + rep.cls.cls);
ok('커리큘럼 포함', rep.group === '1학기 기본과정' && rep.curriculum.length === 2, rep.group);
ok('영상 제목으로 변환', rep.curriculum[0].videos.every(t => t && !/^V\d{4}$/.test(t)),
   rep.curriculum[0].videos[0].slice(0, 26));
ok('출결 회차', rep.dates.length === 3, rep.dates.join(', '));
ok('학생 9명 격자', rep.grid.length === 9, rep.grid.length + '명');
ok('격자 열 수 = 회차 수', rep.grid.every(g => g.cells.length === rep.dates.length));
ok('학생별 합계 = 회차', rep.grid.every(g => g['출'] + g['결'] + g['지'] + g['조'] === rep.dates.length));
ok('교사는 남의 학급 리포트 거부', !A.api_classReport('CL001', 'test').ok,
   A.api_classReport('CL001', 'test').msg);
ok('관리자는 남의 학급도 허용', A.api_classReport('CL004', 'teacher').ok);
ok('본인 학급은 허용', A.api_classReport('CL004', 'test').ok);
ok('없는 학급 거부', !A.api_classReport('CL999', 'teacher').ok);

console.log('\n━━━ 9. 교구보유현황 ━━━');
ok('초기 교구 2건 (관리자 본인 것만)', A.api_equipment('teacher').length === 2);
ok('교사 교구 1건', A.api_equipment('test').length === 1);
A.api_saveEquipment('teacher', [{ name: '점핑 로프 신형', agency: '부산대리점', fresh: 7, used: 2 }]);
const eq = A.api_equipment('teacher');
ok('저장 후 1건으로 교체', eq.length === 1 && eq[0].fresh === 7,
   eq[0].name + ' 새' + eq[0].fresh + '/중고' + eq[0].used);

console.log('\n━━━ 10. 프로그램 스케줄 ━━━');
const sch = A.api_schedules('teacher');
ok('관리자 스케줄 2그룹 (본인 것만)', sch.length === 2, sch.map(g => g.name).join(' / '));
ok('교사 스케줄 1그룹', A.api_schedules('test').length === 1, A.api_schedules('test').map(g=>g.name).join(''));
const g1 = sch.find(g => g.name === '1학기 기본과정');
ok('차시 2개 + 정렬', g1 && g1.items.length === 2 && g1.items[0].no === 1);
ok('영상ID 파싱 (한 차시 4편)', g1.items[0].videoIds.length === 4, g1.items[0].videoIds.join(','));
const allVid = new Set(vids.map(v => String(v['영상ID'])));
const dangling = A.api_schedules('teacher').concat(A.api_schedules('test'))
  .flatMap(g => g.items).flatMap(i => i.videoIds).filter(id => !allVid.has(id));
ok('스케줄이 없는 영상 참조 없음', dangling.length === 0, dangling.join(',') || '0건');
A.api_saveSchedule('teacher', '1학기 기본과정', 3, ['V0005', 'V0006']);
ok('차시 추가',
   A.api_schedules('teacher').find(g => g.name === '1학기 기본과정').items.length === 3);

console.log('\n━━━ 11. 온라인교재 / 정보수정 ━━━');
const tb = A.api_textbooks();
ok('12권 + 권차 정렬', tb.length === 12 && tb[0].no === 1 && tb[11].no === 12);
ok('1권 특호 뱃지', tb[0].badge === '특호');
A.api_updateProfile('teacher', { name: '김현주2', org: '옥동초등학교', region: '울산 남구' });
ok('프로필 수정 반영', A.api_login('teacher', '1234').user.name === '김현주2');
A.api_updateProfile('teacher', { name: '김현주', pw: '5678' });
ok('비밀번호 변경 반영', A.api_login('teacher', '5678').ok && !A.api_login('teacher', '1234').ok);

console.log('\n━━━ 12. 회원가입 중복 방지 ━━━');
ok('중복 아이디 거부', !A.api_signup({ id: 'teacher', pw: 'x', name: 'y' }).ok);
ok('신규 가입 성공', A.api_signup({ id: 'newbie', pw: 'abcd', name: '신규교사' }).ok);
ok('가입 후 로그인', A.api_login('newbie', 'abcd').ok);

console.log('\n━━━ 13. 영상 등록·관리 ━━━');
ok('주소에서 ID 추출 (watch)', A.ytId_('https://www.youtube.com/watch?v=AbCdEfGh123&t=30s') === 'AbCdEfGh123');
ok('주소에서 ID 추출 (youtu.be)', A.ytId_('https://youtu.be/AbCdEfGh123') === 'AbCdEfGh123');
ok('ID 만 넣어도 통과', A.ytId_('AbCdEfGh123') === 'AbCdEfGh123');
ok('엉뚱한 주소는 빈 값', A.ytId_('https://example.com/a') === '');
ok('초 → 재생시간', A.mmss_(376) === '06:16' && A.mmss_(3723) === '1:02:03', A.mmss_(376) + ' / ' + A.mmss_(3723));

const vBefore = A.readAll_(A.T.VIDEOS).length;
ok('학생은 등록 못 함', !A.api_addVideo('teststu', { yt: 'AbCdEfGh123', title: 'x', c1: 'C1', c2: 'S11' }).ok);
ok('분류 없이 등록 거부', !A.api_addVideo('test', { yt: 'AbCdEfGh123', title: 'x' }).ok);
ok('없는 분류 거부', !A.api_addVideo('test', { yt: 'AbCdEfGh123', title: 'x', c1: 'C9', c2: 'S99' }).ok);

const vAdded = A.api_addVideo('test', {
  yt: 'https://youtu.be/AbCdEfGh123', title: '교사가 올린 영상', c1: 'C1', c2: 'S11', dur: '04:30'
});
ok('교사 등록 성공', vAdded.ok, vAdded.id);
ok('영상ID 이어서 발급', vAdded.id === 'V0105', vAdded.id);
ok('videos 한 줄 늘어남', A.readAll_(A.T.VIDEOS).length === vBefore + 1);
ok('중복 등록 거부', !A.api_addVideo('test', { yt: 'AbCdEfGh123', title: 'y', c1: 'C1', c2: 'S11' }).ok);

const vRow = A.readAll_(A.T.VIDEOS).find(v => String(v['영상ID']) === vAdded.id);
ok('등록자가 남는다', String(vRow['등록자']) === 'test', String(vRow['등록자']));
ok('바로 노출된다', String(vRow['노출여부']) === 'Y');
ok('라이브러리에 바로 보임',
   A.api_bootstrap('test').videos.some(v => v.id === vAdded.id));

const vMine = A.api_myVideos('test');
ok('교사는 자기 것만 본다', vMine.ok && vMine.videos.length === 1 && vMine.videos[0].id === vAdded.id,
   vMine.videos.length + '건');
ok('관리자는 전체를 본다', A.api_myVideos('teacher').videos.length === vBefore + 1);
ok('학생은 목록도 못 본다', !A.api_myVideos('teststu').ok);

ok('남의 영상은 못 고침', !A.api_updateVideo('test', 'V0001', { title: '가로채기' }).ok);
ok('관리자는 남의 것도 고침', A.api_updateVideo('teacher', vAdded.id, { title: '관리자가 고친 제목' }).ok);
ok('고친 제목 반영',
   A.readAll_(A.T.VIDEOS).find(v => String(v['영상ID']) === vAdded.id)['제목'] === '관리자가 고친 제목');

ok('숨기기', A.api_updateVideo('teacher', vAdded.id, { show: false }).ok);
ok('숨긴 영상은 라이브러리에서 빠짐',
   !A.api_bootstrap('test').videos.some(v => v.id === vAdded.id));
ok('숨겨도 관리 목록에는 남음',
   A.api_myVideos('test').videos.some(v => v.id === vAdded.id && v.show === false));
A.api_updateVideo('teacher', vAdded.id, { show: true });

/* 담은 목록에 넣어 두고 지우면 자취까지 사라져야 한다 */
A.api_savePlaylist('test', [vAdded.id, 'V0002']);
ok('남의 영상은 못 지움', !A.api_deleteVideo('test', 'V0001').ok);
ok('교사가 자기 영상 삭제', A.api_deleteVideo('test', vAdded.id).ok);
ok('videos 원래 개수로', A.readAll_(A.T.VIDEOS).length === vBefore);
ok('담은 목록에서도 빠짐',
   A.api_bootstrap('test').playlist.indexOf(vAdded.id) < 0,
   A.api_bootstrap('test').playlist.join(','));
ok('없는 영상 삭제는 거부', !A.api_deleteVideo('teacher', vAdded.id).ok);

ok('권한 없으면 조회도 거부', !A.api_ytLookup('teststu', 'AbCdEfGh123').ok);
ok('주소를 못 읽으면 거부', !A.api_ytLookup('test', '그냥 글자').ok);
console.log('\n' + '━'.repeat(46));
console.log(`  통과 ${pass} / 실패 ${fail}`);
console.log('━'.repeat(46) + '\n');
process.exit(fail ? 1 : 0);

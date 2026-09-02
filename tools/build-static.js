/* GitHub Pages 용 단일 파일 정적 빌드 (index.html) */
require('./mock.js');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const AS = path.join(ROOT, 'apps-script');
const R = f => fs.readFileSync(f, 'utf8');

/* 1) 백엔드를 돌려 실제 데이터 확보 */
let src = ['00_설정.gs', '01_초기설정.gs', '02_API.gs']
  .map(f => R(path.join(AS, f))).join('\n;\n');
src += `\nglobal.__x = { 초기설정_실행, api_bootstrap, api_classes, api_attendance,
  api_equipment, api_schedules, api_textbooks, readAll_, T };\n`;
eval(src);
const A = global.__x;
A.초기설정_실행();

const boot = A.api_bootstrap('teacher');
const users = A.readAll_(A.T.USERS).map(u => ({
  id: String(u['아이디']), hash: String(u['비번해시']), name: String(u['이름']),
  org: String(u['소속']), region: String(u['지역']), role: String(u['권한'])
}));

const DATA = {
  // 시드 내용이나 저장 구조가 바뀌면 값이 달라져야 방문자 브라우저가 다시 받는다
  // s6 = 콘텐츠 우선(게스트) + SVG 아이콘
  // s7 = 출석 회차 날짜를 방문 시점 기준으로 밀어 넣음
  ver: 'sj-s7-' + boot.videos.length + '-' + boot.categories.length + '-' +
       users.map(function (u) { return u.id + ':' + u.name + ':' + u.role; }).join('|'),
  appTitle: "미래형학교체육 '스마트점핑'(Smart-Jumping)",
  today: new Date().toISOString().slice(0, 10),
  categories: boot.categories,
  videos: boot.videos,
  users: users,
  // 시트 원본을 그대로 읽어 소유자를 보존한다
  classes: A.readAll_(A.T.CLASSES).map(function (c) {
    return {
      id: String(c['수업ID']), owner: String(c['소유자']), ym: String(c['수업년월']),
      region: String(c['지역']), school: String(c['학교']), grade: c['학년'],
      cls: c['반'], cap: c['정원'], memo: String(c['메모'] || ''),
      sched: String(c['스케줄그룹'] || '')
    };
  }),
  attendance: A.readAll_(A.T.ATTENDANCE).map(function (a) {
    return { classId: String(a['수업ID']), name: String(a['학생명']),
             date: String(a['날짜']), status: String(a['출결']) };
  }),
  equipment: A.readAll_(A.T.EQUIPMENT).map(function (e) {
    return { owner: String(e['소유자']), name: String(e['교구명']), agency: String(e['대리점명']),
             fresh: Number(e['새제품수량']) || 0, used: Number(e['중고제품수량']) || 0 };
  }),
  schedules: (function () {
    var g = {};
    A.readAll_(A.T.SCHEDULES).forEach(function (r) {
      var key = String(r['소유자']) + '||' + String(r['그룹명']);
      if (!g[key]) g[key] = { owner: String(r['소유자']), name: String(r['그룹명']), items: [] };
      g[key].items.push({
        no: Number(r['차시']) || 0,
        videoIds: String(r['영상ID목록'] || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean)
      });
    });
    return Object.keys(g).map(function (k) {
      g[k].items.sort(function (a, b) { return a.no - b.no; });
      return g[k];
    });
  })(),
  textbooks: A.api_textbooks(),
  favorites: (function () {
    var m = {};
    A.readAll_(A.T.FAVORITES).forEach(function (f) {
      m[String(f['소유자'])] = String(f['즐겨찾기영상ID목록'] || '')
        .split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    });
    return m;
  })()
};

/* 2) 프론트 조립 — replace 치환은 반드시 함수형 ($$ 보호) */
const css = R(path.join(AS, 'css.html'));
const chars = R(path.join(AS, 'chars.html'));
const js = R(path.join(AS, 'js.html'));
const localBackend = R(path.join(ROOT, 'web', 'local-backend.js'));

const banner = `
<!--
  미래형학교체육 '스마트점핑' (Smart-Jumping)
  ─────────────────────────────────────────────
  이 파일은 GitHub Pages 용 정적 데모입니다.
  프론트 코드(app.js)는 Apps Script 판과 100% 동일하며,
  백엔드만 구글 시트 → localStorage 로 바꿔 끼웠습니다.
  구글 시트 연동 풀스택 판은 저장소의 apps-script/ 폴더를 보세요.
-->`;

const demoNote = `
<script>
  window.SJ_DATA = ${JSON.stringify(DATA)};
</script>
<script>
${localBackend}
</script>`;

let html = R(path.join(AS, 'index.html'))
  .replace("<?!= include('css'); ?>", () => css)
  .replace("<?!= include('chars'); ?>", () => chars)
  .replace("<?!= include('js'); ?>", () => demoNote + js)
  .replace('<!DOCTYPE html>', () => '<!DOCTYPE html>' + banner);

/* 정적판 표시 배지 + 저장소 링크 (원래 체험계정 안내는 그대로 남긴다) */
html = html.replace(
  '<p class="login-hint">',
  () => '<p class="login-hint" style="background:#fff7ed;color:#c2410c">' +
        '데모 사이트 · 데이터는 이 브라우저에만 저장됩니다<br>' +
        '<a href="https://github.com/legoschool/smart-jumping" target="_blank" rel="noopener" ' +
        'style="color:#c2410c;text-decoration:underline">구글 시트 연동판 소스 보기</a></p>' +
        '<p class="login-hint" style="margin-top:8px">'
);

/* 3) 검증 */
const checks = [
  ['$$ 헬퍼 보존', /var \$\$ = function/.test(html)],
  ['SJ_DATA 주입', /window\.SJ_DATA = \{/.test(html)],
  ['local-backend 주입', /google = \{/.test(html)],
  ['include 태그 잔존 없음', !/<\?!=/.test(html)],
  ['영상 데이터 포함', html.indexOf('2x4ECODdULE') > 0],
  ['수업에 커리큘럼 연결 포함', DATA.classes.some(function (c) { return c.sched; })],
  ['출석 회차 3건 이상', new Set(DATA.attendance.map(function (a) { return a.date; })).size >= 3],
  ['회원 권한 3종', ['관리자','교사','학생'].every(function (r) { return DATA.users.some(function (u) { return u.role === r; }); })],
  ['즐겨찾기 시드', Object.keys(DATA.favorites).length > 0 && DATA.favorites.teacher && DATA.favorites.teacher.length >= 3],
  ['학생 계정이 출석부에 있음', DATA.attendance.some(function (a) { return a.name === '학생'; })],
  ['로그인 게이트 없음(앱이 기본 노출)', /<div id="app" class="app">/.test(html)],
  ['SVG 아이콘 사용', (html.match(/class="nav-ico" viewBox/g) || []).length >= 5],
  ['안내 캐릭터 · 히어로 포스터 인라인', (html.match(/data:image\/webp;base64,/g) || []).length === 13],
  ['대표 콘텐츠 영상 연결', html.indexOf('assets/hero/lesson.mp4') > 0]
];
let bad = 0;
checks.forEach(([n, v]) => { console.log((v ? '  ✅ ' : '  ❌ ') + n); if (!v) bad++; });
if (bad) process.exit(1);

const OUT = path.join(ROOT, 'index.html');
fs.writeFileSync(OUT, html, 'utf8');
fs.writeFileSync(path.join(ROOT, '.nojekyll'), '', 'utf8');

console.log('\n생성: ' + OUT);
console.log('크기: ' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0) + ' KB');
console.log('영상 ' + DATA.videos.length + '건 / 대분류 ' + DATA.categories.length + '개');

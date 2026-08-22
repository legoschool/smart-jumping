/* 01_초기설정.gs 안의 CAT_TREE + VIDEO_DATA 블록만 교체한다.
   파일 전체를 다시 쓰면 손으로 고친 부분(TARGET_SHEET_ID, 계정, 소유자 등)이 날아간다. */
const fs = require('fs');
const P = require('path').resolve(__dirname, '..', 'apps-script', '01_초기설정.gs');

const block = fs.readFileSync(__dirname + '/data/seed-block.txt', 'utf8').trim();
let s = fs.readFileSync(P, 'utf8');
const before = s;

const startMark = 'const CAT_TREE = [';
const endMark = '\nfunction seedCategories_() {';
const i = s.indexOf(startMark);
const j = s.indexOf(endMark);
if (i < 0 || j < 0 || j < i) {
  console.error('❌ 교체 지점을 찾지 못했습니다.');
  process.exit(1);
}

s = s.slice(0, i) + block + '\n' + s.slice(j);

// ── 교체 후 무결성 확인: 손으로 고친 것들이 살아있는가
const must = [
  ['TARGET_SHEET_ID 유지', /TARGET_SHEET_ID/],
  ['boundSs_ 분기 유지', /boundSs_\(\)/],
  ['teacher=관리자 유지', /'아이디': 'teacher'[\s\S]{0,140}'권한': '관리자'/],
  ['test=교사 유지', /'아이디': 'test'[\s\S]{0,140}'권한': '교사'/],
  ['teststu=학생 유지', /'아이디': 'teststu'[\s\S]{0,150}'권한': '학생'/],
  ['수업 소유자 분리 유지', /'teacher'\],\s*\n\s*\['울산광역시 남구'[\s\S]{0,60}'test'\]/],
  ['교구 3건 유지', /'교구명': '스마트점핑 로프 \(학급용\)'/],
  ['CAT_TREE 주입', /const CAT_TREE = \[/],
  ['VIDEO_DATA 주입', /const VIDEO_DATA = \[/]
];
let bad = 0;
must.forEach(([n, re]) => {
  const ok = re.test(s);
  console.log((ok ? '  ✅ ' : '  ❌ ') + n);
  if (!ok) bad++;
});
if (bad) { console.error('\n무결성 실패 — 파일을 쓰지 않았습니다.'); process.exit(1); }

// 스케줄이 존재하는 영상 ID 를 가리키는지
const vids = new Set([...s.matchAll(/\['(V\d{4})',/g)].map(m => m[1]));
const schedRefs = [...s.matchAll(/'영상ID목록': '([^']+)'/g)]
  .flatMap(m => m[1].split(',').map(x => x.trim())).filter(Boolean);
const dangling = schedRefs.filter(id => !vids.has(id));
console.log(dangling.length ? '  ❌ 스케줄이 없는 영상 참조: ' + dangling.join(',')
                            : '  ✅ 스케줄 영상 참조 정상 (' + schedRefs.length + '개)');
if (dangling.length) process.exit(1);

fs.writeFileSync(P, s, 'utf8');
console.log('\n영상 ' + vids.size + '건으로 갱신 (변경됨: ' + (s !== before) + ')');

/* 9개 탭이 모두 채워진 XLSX 생성 — 구글 시트에 그대로 가져오기 위한 파일 */
require('./mock.js');
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const DIR = path.resolve(__dirname, '..', 'apps-script');
let src = ['00_설정.gs', '01_초기설정.gs', '02_API.gs']
  .map(f => fs.readFileSync(path.join(DIR, f), 'utf8')).join('\n;\n');
src += `\nglobal.__x = { 초기설정_실행, readAll_, HEADERS, T };\n`;
eval(src);
const A = global.__x;

A.초기설정_실행();

// 탭 목록은 스키마(HEADERS)에서 그대로 가져온다 — 탭이 늘어도 자동 반영
const TABS = Object.keys(A.HEADERS);

const wb = XLSX.utils.book_new();

TABS.forEach(name => {
  const headers = A.HEADERS[name];
  const rows = A.readAll_(name);
  const aoa = [headers].concat(rows.map(r => headers.map(h => {
    const v = r[h];
    return (v === undefined || v === null) ? '' : v;
  })));
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 열 너비
  ws['!cols'] = headers.map(h => {
    if (h === '제목') return { wch: 58 };
    if (h === 'youtube_id') return { wch: 14 };
    if (h === '비번해시') return { wch: 22 };
    if (h === '영상ID목록') return { wch: 26 };
    if (h === '소분류명' || h === '대분류명' || h === '교구명') return { wch: 24 };
    if (h === '학교' || h === '지역' || h === '소속') return { wch: 18 };
    return { wch: 12 };
  });
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  XLSX.utils.book_append_sheet(wb, ws, name);
});

const out = path.resolve(__dirname, '..', '스마트점핑_DB.xlsx');
XLSX.writeFile(wb, out);

// 검증
const back = XLSX.readFile(out);
console.log('생성: ' + out);
console.log('탭 ' + back.SheetNames.length + '개: ' + back.SheetNames.join(', '));
TABS.forEach(t => {
  const ws = back.Sheets[t];
  const json = XLSX.utils.sheet_to_json(ws);
  console.log('  ' + t.padEnd(12) + json.length + '행');
});
const vids = XLSX.utils.sheet_to_json(back.Sheets['videos']);
const noYt = vids.filter(v => !String(v['youtube_id'] || '').trim());
console.log('\n영상 ' + vids.length + '건 / youtube_id 누락 ' + noYt.length + '건');
console.log('예시: ' + vids[0]['제목'] + ' → ' + vids[0]['youtube_id'] + ' (' + vids[0]['재생시간'] + ')');

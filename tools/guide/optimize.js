/* 캡처 원본(raw/*.png, 2배율) → 가이드북에 실을 WebP.
   가로 1400px 로 줄이면 A4 에 184mm 폭으로 앉혀도 인쇄 해상도가 남는다.
   sharp 가 필요하다 (npm i -D sharp). */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'raw');
const OUT = path.join(__dirname, 'shots');

/* 세로로 긴 캡처(사이드바 등)는 가로를 줄이면 글자가 뭉갠다 — 세로를 기준으로 잡는다 */
const MAXW = 1400, MAXH = 1800;

(async () => {
  if (!fs.existsSync(RAW)) {
    console.error('raw/ 가 없습니다. 먼저 node tools/guide/capture.js 를 돌리세요.');
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });
  const files = fs.readdirSync(RAW).filter(f => f.endsWith('.png')).sort();
  let before = 0, after = 0;

  for (const f of files) {
    const src = path.join(RAW, f);
    const meta = await sharp(src).metadata();
    const scale = Math.min(1, MAXW / meta.width, MAXH / meta.height);
    const w = Math.round(meta.width * scale);
    const dst = path.join(OUT, f.replace(/\.png$/, '.webp'));
    await sharp(src).resize({ width: w }).webp({ quality: 74, effort: 6 }).toFile(dst);
    before += fs.statSync(src).size;
    after += fs.statSync(dst).size;
    console.log('  ' + f.padEnd(24) + meta.width + '×' + meta.height + ' → ' + w + 'px  '
      + (fs.statSync(dst).size / 1024).toFixed(0) + 'KB');
  }
  console.log('\n' + files.length + '장  ' + (before / 1024 / 1024).toFixed(1) + 'MB → '
    + (after / 1024).toFixed(0) + 'KB');
})();

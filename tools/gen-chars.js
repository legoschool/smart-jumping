/* assets/char/*.webp → apps-script/chars.html (base64 인라인 CSS)
   ─────────────────────────────────────────────────────────────
   안내 캐릭터 이미지를 CSS 클래스로 굽는다. 데모(단일 index.html)와
   Apps Script 판이 같은 파일을 공유하므로, 상대경로 대신 data URI 로 넣는다.

   포즈를 바꾸거나 이미지를 교체했으면
     node tools/prep-char.js   (원본 PNG → 배경 제거 · WebP, sharp 필요)
     node tools/gen-chars.js   (WebP → chars.html)
     npm run build
   순서로 돌린다. */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'char');
const OUT = path.join(ROOT, 'apps-script', 'chars.html');

/* WebP 헤더에서 크기를 읽는다 (VP8 / VP8L / VP8X) */
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') {
    return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  }
  if (fourcc === 'VP8 ') {
    return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  }
  if (fourcc === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
}

const files = fs.readdirSync(SRC).filter(f => f.endsWith('.webp')).sort();
if (!files.length) { console.error('assets/char 에 webp 가 없습니다.'); process.exit(1); }

const rules = [];
let bytes = 0;

files.forEach(function (f) {
  const buf = fs.readFileSync(path.join(SRC, f));
  const size = webpSize(buf);
  if (!size) { console.error('크기를 못 읽음: ' + f); process.exit(1); }
  bytes += buf.length;

  const isFace = f.endsWith('-face.webp');
  const key = f.replace(/(-face)?\.webp$/, '');
  const cls = (isFace ? '.chf-' : '.ch-') + key;
  const uri = 'data:image/webp;base64,' + buf.toString('base64');

  rules.push(cls + '{' +
    (isFace ? '' : 'aspect-ratio:' + size.w + '/' + size.h + ';') +
    'background-image:url("' + uri + '")}');
});

/* 메인 히어로 영상의 포스터 — 영상이 오기 전/못 올 때 이 그림이 자리를 지킨다 */
const POSTER = path.join(ROOT, 'assets', 'hero', 'poster.webp');
if (fs.existsSync(POSTER)) {
  const buf = fs.readFileSync(POSTER);
  bytes += buf.length;
  rules.push('.mh-poster{background-image:url("data:image/webp;base64,' +
    buf.toString('base64') + '")}');
  console.log('포스터 포함: assets/hero/poster.webp');
}

const html =
`<!--
  안내 캐릭터 — 자동 생성 파일입니다. 직접 고치지 마세요.
  원본 : assets/char/*.webp   생성 : node tools/gen-chars.js
  ${files.length}개 이미지 · 원본 ${(bytes / 1024).toFixed(0)}KB
-->
<style>
/* 전신 — height 만 주면 aspect-ratio 로 폭이 따라온다 */
.ch{
  display:inline-block; flex:0 0 auto; vertical-align:bottom;
  background-repeat:no-repeat; background-position:center bottom; background-size:contain;
}
/* 얼굴 — 원형 아바타 */
.chf{
  display:inline-block; flex:0 0 auto; border-radius:50%;
  background-repeat:no-repeat; background-position:center; background-size:cover;
  background-color:#fff;
}
${rules.join('\n')}
</style>
`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('생성: ' + OUT);
console.log(files.length + '개 · ' + (Buffer.byteLength(html, 'utf8') / 1024).toFixed(0) + 'KB');

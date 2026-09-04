/* 가이드북 빌드 — template.html 의 자리표시자에 스크린샷을 data URI 로 박아
   그림까지 통째로 든 단일 HTML 을 만든다. 서버 없이 파일 하나로 열린다. */
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../..');
const WEB = path.join(HERE, 'shots');
const CHAR = path.join(ROOT, 'assets/char');
const DST = path.join(ROOT, '안내자료', '스마트점핑 운영 가이드북.html');

let s = fs.readFileSync(path.join(HERE, 'template.html'), 'utf8');

/* 7장에서 프로그램스케줄 그림이 6-2 와 겹친다 — 그림 대신 참조로 바꾼다 */
const dupFig =
`      <figure>
        <div class="shot"><img src="__IMG_27B__" alt="프로그램스케줄"></div>
        <figcaption><b>프로그램스케줄</b> <span class="role t">교사</span> — 커리큘럼 그룹과 차시를 관리합니다.</figcaption>
      </figure>`;
const replFig =
`      <figure>
        <div class="shot" style="display:flex;align-items:center;justify-content:center;padding:26px;line-height:1.7">
          <span style="font-size:13.5px;color:var(--slate);text-align:center">
            <b style="color:var(--ink)">프로그램스케줄</b> <span class="role t">교사</span><br>
            커리큘럼 그룹과 차시를 관리합니다.<br>
            <a href="#s6-2">→ 6-2 커리큘럼 만들고 연결하기</a>
          </span>
        </div>
      </figure>`;
if (s.includes(dupFig)) { s = s.replace(dupFig, replFig); console.log('· 7장 중복 그림 → 참조로 교체'); }
else console.error('⚠ 중복 그림 블록을 못 찾음 — 확인 필요');

const uri = (file) => {
  const buf = fs.readFileSync(file);
  return 'data:image/webp;base64,' + buf.toString('base64');
};

/* WebP 헤더에서 크기를 읽는다 (VP8 / VP8L / VP8X) — tools/gen-chars.js 와 같은 방식 */
function webpSize(buf) {
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') return { w: buf.readUIntLE(24, 3) + 1, h: buf.readUIntLE(27, 3) + 1 };
  if (fourcc === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (fourcc === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
  }
  return null;
}

/* 인쇄용 폭 상한 — 그림 높이가 A4 본문에서 MAXH 를 넘지 않도록 비율로 역산한다.
   콜아웃이 .shot 기준 % 로 찍히므로 .shot 이 그림을 정확히 감싸야 한다. */
const MAXH = 200, COLW = 184;   /* mm */
const stamped = [];
function stampWidth(html, key) {
  const marker = 'src="' + key + '"';
  if (!html.includes(marker)) return html;
  const dim = webpSize(fs.readFileSync(fileFor(key)));
  if (!dim) return html;
  const pw = Math.round(MAXH * dim.w / dim.h);
  if (pw >= COLW) return html;                 /* 가로로 넓은 그림은 손댈 필요가 없다 */
  let n = 0, at = html.indexOf(marker);
  while (at > 0) {
    const open = html.lastIndexOf('<div class="shot', at);
    /* 바로 앞 .shot 이 정말 이 그림을 감싸는지 — 사이에 </div> 가 있으면 남의 것이다 */
    if (open >= 0 && html.slice(open, at).includes('</div>')) { at = html.indexOf(marker, at + 1); continue; }
    const gt = open < 0 ? -1 : html.indexOf('>', open);
    if (open < 0 || gt < 0 || gt > at || html.slice(open, gt).includes('style=')) {
      at = html.indexOf(marker, at + 1); continue;   /* 이미 표시했거나 짝이 아닌 경우 */
    }
    html = html.slice(0, gt) + ' style="--pw:' + pw + 'mm"' + html.slice(gt);
    n++;
    at = html.indexOf(marker, gt + 24);
  }
  if (n) stamped.push(key.replace(/_/g, '') + ' ' + pw + 'mm×' + n);
  return html;
}

const map = {
  __IMG_CHAR__: path.join(CHAR, 'hi.webp'),
  __IMG_FACE__: path.join(CHAR, 'good-face.webp'),
  __IMG_VFORM__: '35-video-form', __IMG_VLIST__: '36-video-list',
  __IMG_VADMIN__: '37-video-admin',
  __IMG_SHEET_V__: 'sheet-videos', __IMG_SHEET_C__: 'sheet-categories',
  __IMG_YT1__: 'yt-1-account-menu', __IMG_YT2__: 'yt-2-create-menu',
  __IMG_YT3__: 'yt-3-upload-modal', __IMG_YT4__: 'yt-4-file-pick',
  __IMG_YT5__: 'yt-5-details', __IMG_YT6__: 'yt-6-audience',
  __IMG_YT7__: 'yt-7-review', __IMG_YT8__: 'yt-8-visibility',
  __IMG_YT9__: 'yt-9-copy-link',
  __IMG_01__: '01-first-screen', __IMG_03__: '03-login-modal', __IMG_04__: '04-signup-modal',
  __IMG_10__: '10-sidebar-teacher', __IMG_11__: '11-library-teacher',
  __IMG_12__: '12-gnb', __IMG_13__: '13-chips', __IMG_14B__: '14b-sort',
  __IMG_15__: '15b-card-hover', __IMG_16__: '16-picked-cards', __IMG_18__: '18-cart-modal',
  __IMG_19__: '19-player', __IMG_20__: '20-favorites',
  __IMG_21__: '21-classes', __IMG_22__: '22-class-form', __IMG_23__: '23-attendance',
  __IMG_24__: '24-report', __IMG_25__: '25-profile', __IMG_26__: '26-equipment',
  __IMG_27__: '27-schedule', __IMG_28__: '28-withdraw', __IMG_29__: '29-textbook',
  __IMG_30__: '30-sidebar-admin', __IMG_31__: '31-members', __IMG_32__: '32-classes-admin',
  __IMG_33__: '33-sidebar-student', __IMG_34__: '34-myatt'
};

const fileFor = (key) => {
  const val = map[key];
  return val.includes('/') || val.includes('\\') ? val : path.join(WEB, val + '.webp');
};

let missing = [];
for (const [key, val] of Object.entries(map)) {
  const file = fileFor(key);
  if (!fs.existsSync(file)) { missing.push(key + ' → ' + file); continue; }
  if (!s.includes(key)) { console.log('  (미사용) ' + key); continue; }
  s = stampWidth(s, key);
  s = s.split(key).join(uri(file));
}
if (missing.length) { console.error('✗ 파일 없음:\n  ' + missing.join('\n  ')); process.exit(1); }

const left = s.match(/__IMG_[A-Z0-9]+__/g);
if (left) { console.error('✗ 치환 안 된 자리표시자: ' + [...new Set(left)].join(', ')); process.exit(1); }

console.log('· 인쇄 폭 상한 ' + stamped.length + '종: ' + (stamped.join(', ') || '없음'));
fs.mkdirSync(path.dirname(DST), { recursive: true });
fs.writeFileSync(DST, s, 'utf8');
console.log('생성: ' + path.basename(DST) + '  '
  + (Buffer.byteLength(s, 'utf8') / 1024 / 1024).toFixed(2) + 'MB');

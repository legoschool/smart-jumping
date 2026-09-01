/* 여자 아이 캐릭터 PNG → 배경 제거 + 트림 + 리사이즈 + WebP
   원본은 알파가 없고 배경이 거의 흰색(249~255)이라 테두리에서 flood fill 로 걷어낸다. */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '여자 아이 캐릭터');   // 원본 PNG 폴더
const OUT = path.resolve(__dirname, '..', 'assets', 'char');
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  ['fight', 'KakaoTalk_20260901_145641111.png'],     // 두 주먹 — 화이팅
  ['good',  'KakaoTalk_20260901_145641111_01.png'],  // 엄지척
  ['hi',    'KakaoTalk_20260901_145641111_02.png'],  // 손 흔들기
  ['point', 'KakaoTalk_20260901_145641111_03.png'],  // 검지 위 + 손바닥
  ['calm',  'KakaoTalk_20260901_145641111_04.png'],  // 두 손 모으고
  ['five',  'KakaoTalk_20260901_145641111_05.png']   // 검지 + 손바닥 앞
];

const BG_MIN = 236;   // 이 이상으로 밝고
const BG_NEU = 9;     // 이 정도로 무채색이면 배경 후보

async function run() {
  for (const [name, file] of FILES) {
    const src = path.join(SRC, file);
    const { data, info } = await sharp(src).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const W = info.width, H = info.height;

    const isBgCand = new Uint8Array(W * H);
    for (let i = 0, p = 0; p < W * H; p++, i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const mn = Math.min(r, g, b), mx = Math.max(r, g, b);
      isBgCand[p] = (mn >= BG_MIN && mx - mn <= BG_NEU) ? 1 : 0;
    }

    /* 테두리에서 시작하는 flood fill — 신발 속 흰색은 연결이 끊겨 살아남는다 */
    const bg = new Uint8Array(W * H);
    const stack = [];
    const push = p => { if (!bg[p] && isBgCand[p]) { bg[p] = 1; stack.push(p); } };
    for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p - x) / W;
      if (x > 0) push(p - 1);
      if (x < W - 1) push(p + 1);
      if (y > 0) push(p - W);
      if (y < H - 1) push(p + W);
    }

    /* 마스크 = 물체. 1px 침식해서 흰 테두리 후광을 없앤다 */
    const mask = new Uint8Array(W * H);
    for (let p = 0; p < W * H; p++) mask[p] = bg[p] ? 0 : 255;
    const eroded = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = y * W + x;
        if (!mask[p]) { eroded[p] = 0; continue; }
        const n = (x > 0 && !mask[p - 1]) || (x < W - 1 && !mask[p + 1]) ||
                  (y > 0 && !mask[p - W]) || (y < H - 1 && !mask[p + W]);
        eroded[p] = n ? 0 : 255;
      }
    }

    /* 경계를 살짝 흐려 안티에일리어싱.
       ※ sharp 는 1채널 raw 를 흐린 뒤 3채널로 돌려주므로 실제 채널 수로 stride 를 잡는다 */
    const blurred = await sharp(Buffer.from(eroded), { raw: { width: W, height: H, channels: 1 } })
      .blur(0.8).raw().toBuffer({ resolveWithObject: true });
    const st = blurred.info.channels;
    const alpha = blurred.data;

    for (let p = 0, i = 3; p < W * H; p++, i += 4) data[i] = alpha[p * st];

    /* 내용 경계 상자 */
    let x0 = W, y0 = H, x1 = -1, y1 = -1;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (data[(y * W + x) * 4 + 3] > 12) {
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
    }
    const pad = 6;
    x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
    x1 = Math.min(W - 1, x1 + pad); y1 = Math.min(H - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1;

    const base = sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } })
      .extract({ left: x0, top: y0, width: cw, height: ch });

    /* 전신 — 폭 300 */
    const full = await base.clone().resize({ height: 620 })
      .webp({ quality: 76, alphaQuality: 88, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT, name + '.webp'), full);

    /* 얼굴 — 머리 위쪽 10% 구간의 무게중심을 잡아 정사각으로 자른다
       (포즈마다 손을 드는 방향이 달라 bbox 한가운데가 머리가 아니다) */
    let sx = 0, sn = 0;
    const headBand = Math.round(ch * 0.10);
    for (let y = y0; y < y0 + headBand; y++) {
      for (let x = x0; x <= x1; x++) {
        if (data[(y * W + x) * 4 + 3] > 100) { sx += x; sn++; }
      }
    }
    const headCx = sn ? Math.round(sx / sn) : Math.round(x0 + cw / 2);
    const fSide = Math.round(ch * 0.23);
    const fx = Math.max(0, Math.min(W - fSide, Math.round(headCx - fSide / 2)));
    const fy = Math.max(0, Math.round(y0 - fSide * 0.06));
    const face = await sharp(Buffer.from(data), { raw: { width: W, height: H, channels: 4 } })
      .extract({
        left: fx, top: fy,
        width: Math.min(fSide, W - fx),
        height: Math.min(fSide, H - fy)
      })
      .resize({ width: 128, height: 128 })
      .webp({ quality: 84, alphaQuality: 92, effort: 6 }).toBuffer();
    fs.writeFileSync(path.join(OUT, name + '-face.webp'), face);

    console.log(name.padEnd(6),
      'bbox', cw + 'x' + ch,
      '| full', (full.length / 1024).toFixed(1) + 'KB',
      '| face', (face.length / 1024).toFixed(1) + 'KB');
  }
  const total = fs.readdirSync(OUT).reduce((a, f) => a + fs.statSync(path.join(OUT, f)).size, 0);
  console.log('\n합계 ' + (total / 1024).toFixed(0) + 'KB (base64 ≈ ' + (total * 1.37 / 1024).toFixed(0) + 'KB)');
}
run();

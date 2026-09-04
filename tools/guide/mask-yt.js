/* 1장 유튜브 업로드 캡처에서 계정 정보를 가린다.
   원본(사용설명서/20260904_220054_N.png)은 손대지 않고, 가린 사본을 raw/ 에 만든다.
   raw/ 를 다시 만들 때마다 원본에서 새로 굽기 때문에 두 번 돌려도 겹쳐 흐려지지 않는다.
   좌표는 원본 픽셀 기준이다. 캡처를 새로 받으면 좌표부터 다시 재야 한다. */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const ROOT = path.resolve(HERE, '../..');
const SRC = path.join(ROOT, '사용설명서');
const OUT = path.join(HERE, 'raw');

/* [x, y, 폭, 높이] — 원본 픽셀 */
const JOBS = [
  { src: '20260904_220054_1.png', dst: 'yt-1-account-menu.png', sigma: 16, box: [
    [2424, 149, 90, 90],                      /* 오른쪽 위 프로필 사진 */
    [1955, 188, 490, 124]                     /* 메뉴 맨 위 계정 이름과 핸들 */
  ] },
  { src: '20260904_220054_2.png', dst: 'yt-2-create-menu.png', sigma: 18, box: [
    [75, 18, 350, 40],                        /* 탭 제목의 채널 이름 */
    [448, 243, 1700, 316],                    /* 채널 배너 그림. 오른쪽 만들기 메뉴가 이 위에
                                                 떠 있으므로 x 2150 앞에서 끊는다 */
    [725, 592, 632, 74],                      /* 채널 이름 */
    [448, 590, 256, 258],                     /* 채널 프로필 사진 */
    [2427, 149, 90, 90]                       /* 오른쪽 위 프로필 사진 */
  ] },
  { src: '20260904_220054_3.png', dst: 'yt-3-upload-modal.png', sigma: 16, box: [
    [100, 232, 224, 212],                     /* 왼쪽 프로필 사진 */
    [86, 492, 250, 34],                       /* 왼쪽 채널 이름 */
    [2427, 77, 90, 90]                        /* 오른쪽 위 프로필 사진 */
  ] },
  { src: '20260904_220054_4.png', dst: 'yt-4-file-pick.png', sigma: 16, box: [
    [368, 991, 566, 44],                      /* 파일 이름 (구글 미트 코드가 들어 있다) */
    [2412, 65, 90, 90]                        /* 오른쪽 위 프로필 사진 */
  ] },
  { src: '20260904_220054_5.png', dst: 'yt-5-details.png', sigma: 9, box: [
    [735, 470, 282, 38],                      /* 동영상 링크 */
    [735, 536, 328, 36]                       /* 파일 이름 */
  ] },
  { src: '20260904_220054_6.png', dst: 'yt-6-audience.png', sigma: 8, box: [] },
  { src: '20260904_220054_7.png', dst: 'yt-7-review.png', sigma: 8, box: [] },
  { src: '20260904_220054_8.png', dst: 'yt-8-visibility.png', sigma: 8, box: [] },
  { src: '20260904_220054_9.png', dst: 'yt-9-copy-link.png', sigma: 16, box: [
    [62, 96, 156, 152]                        /* 왼쪽 프로필 사진 */
  ] }
];

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  let masked = 0;
  for (const j of JOBS) {
    const src = path.join(SRC, j.src);
    if (!fs.existsSync(src)) { console.error('✗ 원본 없음: ' + j.src); process.exit(1); }
    const { width, height } = await sharp(src).metadata();
    const overlays = [];
    for (const [left, top, w, h] of j.box) {
      if (left + w > width || top + h > height) {
        console.error('✗ ' + j.dst + ' 의 영역이 그림 밖으로 나갑니다: ' + [left, top, w, h].join(','));
        process.exit(1);
      }
      overlays.push({
        input: await sharp(src).extract({ left, top, width: w, height: h })
          .blur(j.sigma).toBuffer(),
        left, top
      });
    }
    await sharp(src).composite(overlays).toFile(path.join(OUT, j.dst));
    masked += overlays.length;
    console.log('  ✓ ' + j.dst.padEnd(24) + width + '×' + height
      + '  가린 곳 ' + overlays.length + '군데');
  }
  console.log('\n' + JOBS.length + '장, 모두 ' + masked + '군데를 가렸습니다.'
    + '\nnode tools/guide/optimize.js 로 WebP 를 다시 구우세요.');
})();

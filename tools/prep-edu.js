/* 선생님이 보내 주신 안내 도안 PNG → 웹용 WebP
   원본은 장당 1.6~2MB 라 그대로 쓰면 첫 화면이 무겁다.
   긴 변을 1400px 로 줄이고 WebP 로 다시 구워 장당 100~200KB 로 맞춘다. */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '..', '스마트 점핑 추가자료');
const OUT = path.resolve(__dirname, '..', 'assets', 'edu');
fs.mkdirSync(OUT, { recursive: true });

const FILES = [
  // [내보낼 이름, 원본 파일, 긴 변 px, 품질]
  ['effect', 'KakaoTalk_20260909_084254066.png',    1400, 82],  // 참여집단 vs 비교집단 — 효과
  ['rhythm', 'KakaoTalk_20260909_084308920.png',    1400, 82],  // 음악 박자·리듬 3단계
  ['step3',  'KakaoTalk_20260909_084308920_01.png', 1400, 82],  // 3단계 과정
  ['step7',  'KakaoTalk_20260909_084308920_02.png', 1500, 82],  // 7단계 스마트 신체활동 과정
  ['mat',    'KakaoTalk_20260909_084308920_03.png', 1100, 84],  // 발판 + 스피커 대표 그림
  ['cover',  'KakaoTalk_20260909_084254066_01.png',  916, 86],  // 가이드북 표지 그래프
  ['aspect', 'KakaoTalk_20260910_171904541.png',    1400, 82],  // 효과 세 측면 — 생리·운동기능·교육
  ['room',   'KakaoTalk_20260910_171904541_01.png', 1400, 82]   // 교실 발판 위 — 1~5번 자리
];

async function run() {
  for (const [name, file, w, q] of FILES) {
    const src = path.join(SRC, file);
    if (!fs.existsSync(src)) { console.log('  ⚠ 원본 없음: ' + file); continue; }

    const dst = path.join(OUT, name + '.webp');
    await sharp(src).resize({ width: w, withoutEnlargement: true }).webp({ quality: q }).toFile(dst);

    const before = fs.statSync(src).size / 1024;
    const after = fs.statSync(dst).size / 1024;
    const m = await sharp(dst).metadata();
    console.log('  ' + name.padEnd(7) + m.width + 'x' + m.height +
      '  ' + before.toFixed(0) + 'KB → ' + after.toFixed(0) + 'KB');
  }
  console.log('\n생성: ' + OUT);
}

run().catch(function (e) { console.error(e); process.exit(1); });

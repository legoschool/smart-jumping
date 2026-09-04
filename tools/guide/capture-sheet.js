/* 가이드북에 실을 구글 시트 화면 캡처.
   시트 주소는 저장소에 적지 않는다(공개 저장소라 주소가 함께 공개된다).
   돌릴 때 인자나 환경변수로 준다.

     node tools/guide/capture-sheet.js "https://docs.google.com/spreadsheets/d/…/edit"
     SHEET_URL=… node tools/guide/capture-sheet.js

   보기 권한만 있어도 찍힌다. 다만 오른쪽 위에 '보기 전용' 과 로그인 단추가 붙으므로
   그 자리는 잘라 낸다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || process.env.SHEET_URL;
const OUT = path.join(__dirname, 'raw');
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!URL) {
  console.error('시트 주소를 주세요.\n  node tools/guide/capture-sheet.js "https://docs.google.com/spreadsheets/d/…/edit"');
  process.exit(1);
}

/* 오른쪽 위에 붙는 참여자 프로필 사진을 가린다. 1440×900 · 2배율 기준 좌표 */
const FACES = [2190, 24, 252, 84];   /* [x, y, 폭, 높이] */
async function maskFaces(buf, dst) {
  const sharp = require('sharp');
  const [left, top, width, height] = FACES;
  const patch = await sharp(buf).extract({ left, top, width, height }).blur(18).toBuffer();
  await sharp(buf).composite([{ input: patch, left, top }]).toFile(dst);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--lang=ko-KR']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(7000);

  /* 탭 이름으로 자리를 찾아 진짜 마우스로 누른다.
     DOM 의 click() 은 시트 편집기가 받지 않는다. */
  async function openTab(name) {
    const box = await page.evaluate((n) => {
      const t = [...document.querySelectorAll('.docs-sheet-tab-name')]
        .find(e => e.textContent.trim() === n);
      if (!t) return null;
      const r = (t.closest('.docs-sheet-tab') || t).getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, name);
    if (!box) { console.log('⚠ 탭을 못 찾음: ' + name); return false; }
    await page.mouse.click(box.x, box.y);
    await sleep(3000);
    return true;
  }

  /* 안내 배너가 떠 있으면 지운다 */
  async function tidy() {
    await page.evaluate(() => {
      document.querySelectorAll('.docs-butterbar-container, .jfk-butterBar, [role="alert"]')
        .forEach(e => { e.style.display = 'none'; });
    });
    await sleep(400);
  }

  for (const [tab, file] of [['videos', 'sheet-videos.png'], ['categories', 'sheet-categories.png']]) {
    await openTab(tab);
    await tidy();
    const now = await page.evaluate(() => {
      const a = document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name');
      return a ? a.textContent.trim() : '?';
    });
    if (now !== tab) console.log('⚠ ' + tab + ' 로 안 옮겨졌습니다 (지금 ' + now + ')');
    const shot = await page.screenshot();
    await maskFaces(shot, path.join(OUT, file));
    console.log('  ✓ ' + file + '  (탭: ' + now + ')');
  }
  await browser.close();
  console.log('\n오른쪽 위 참여자 사진은 가려서 저장했습니다.');
})();

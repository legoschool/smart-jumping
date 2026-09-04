/* 운영판(Apps Script 웹앱)에서만 찍을 수 있는 화면.
   데모는 브라우저가 유튜브 재생시간을 읽지 못해 '직접 적어 주세요' 안내가 붙는다.
   운영판은 서버가 읽어 채우므로 그 안내가 없다. 등록 화면은 여기서 찍는다.

     node tools/guide/capture-live.js "https://script.google.com/macros/s/…/exec"
     LIVE_URL=… node tools/guide/capture-live.js

   주소는 저장소에 적지 않는다. 읽기만 하고 아무것도 등록하지 않는다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const URL = process.argv[2] || process.env.LIVE_URL;
const SAMPLE = process.env.SAMPLE_YT || 'https://www.youtube.com/watch?v=9bZkp7q19f0';
const OUT = path.join(__dirname, 'raw');
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!URL) {
  console.error('웹앱 주소를 주세요.\n  node tools/guide/capture-live.js "https://script.google.com/macros/s/…/exec"');
  process.exit(1);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 90000 });
  await sleep(8000);

  /* 앱은 샌드박스 iframe 안에서 돈다 — window.S 가 있는 프레임을 찾는다 */
  let app = null;
  for (const f of page.frames()) {
    const ok = await f.evaluate(() => !!(window.S && window.S.loaded)).catch(() => false);
    if (ok) { app = f; break; }
  }
  if (!app) { console.error('✗ 앱 프레임을 찾지 못했습니다'); await browser.close(); process.exit(1); }

  await app.evaluate(() => {
    const b = [...document.querySelectorAll('button,a')].find(e => e.textContent.trim() === '로그인');
    if (b) b.click();
  });
  await sleep(900);
  await app.evaluate(() => {
    document.getElementById('loginId').value = 'test';
    document.getElementById('loginPw').value = '1234';
    document.getElementById('loginBtn').click();
  });
  await sleep(4000);

  await app.evaluate(() => { location.hash = '#/videos'; });
  await sleep(1500);
  await app.evaluate((url) => {
    document.getElementById('vUrl').value = url;
    document.getElementById('vLookup').click();
  }, SAMPLE);
  await app.waitForFunction(() => {
    const p = document.querySelector('#vPrev');
    return p && !p.hidden;
  }, { timeout: 30000 }).catch(() => {});
  await sleep(900);

  const el = await app.$('.vreg');
  if (!el) { console.error('✗ 등록 상자를 찾지 못했습니다'); await browser.close(); process.exit(1); }
  const file = path.join(OUT, '35-video-form.png');
  await el.screenshot({ path: file });
  console.log('  ✓ 35-video-form  (' + (fs.statSync(file).size / 1024).toFixed(0) + 'KB)');
  console.log('\n등록 단추는 누르지 않았습니다. 시트에 아무것도 쓰지 않았습니다.');
  await browser.close();
})();

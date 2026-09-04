/* 보완 캡처 — 리포트는 모달 안 .report-preview 에 그려진다.
   더불어 가이드북에 필요한 근접 컷 몇 장을 추가로 찍는다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8790/';
const OUT = path.join(__dirname, 'raw');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const fail = [];
  async function ready() {
    await page.waitForFunction(() => window.S && window.S.loaded === true, { timeout: 20000 });
    await sleep(500);
    await page.evaluate(() => { const v = document.getElementById('mhVid'); if (v) { try { v.pause(); v.currentTime = 20; } catch (e) {} } });
    await sleep(300);
  }
  async function shot(name, sel) {
    const file = path.join(OUT, name + '.png');
    try {
      if (sel) {
        const el = await page.$(sel);
        if (!el) throw new Error('요소 없음: ' + sel);
        await el.screenshot({ path: file });
      } else await page.screenshot({ path: file });
      log('  ✓ ' + name + '  (' + (fs.statSync(file).size / 1024).toFixed(0) + 'KB)');
    } catch (e) { log('  ✗ ' + name + ' — ' + e.message); fail.push(name); }
  }
  async function login(id) {
    await page.evaluate(async uid => {
      const r = await new Promise((res, rej) =>
        google.script.run.withSuccessHandler(res).withFailureHandler(rej).api_login(uid, '1234'));
      localStorage.setItem('sj_user', JSON.stringify(r.user));
    }, id);
    await page.reload({ waitUntil: 'networkidle2' });
    await ready();
  }
  async function go(h) { await page.evaluate(x => { location.hash = x; }, h); await sleep(900); }

  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await ready();
  await login('test');

  log('\n▶ 수업 리포트 (모달 미리보기)');
  await go('#/classes');
  await page.evaluate(() => { const b = document.querySelector('[data-rep]'); if (b) b.click(); });
  await page.waitForFunction(() => document.querySelector('.report-preview .rep'), { timeout: 15000 }).catch(() => {});
  await sleep(900);
  await shot('24-report', '.report-preview');
  await shot('24b-report-modal', '.modal-box');
  await page.evaluate(() => { const x = document.querySelector('#modalX'); if (x) x.click(); });
  await sleep(400);

  log('\n▶ 근접 컷');
  await go('#/library');
  await sleep(600);
  /* 카드 위 컨트롤이 hover 에서만 보이는 것이 있어 강제 노출 */
  await page.evaluate(() => {
    const c = document.querySelector('.vcard');
    if (c) { const p = c.querySelector('.vthumb-play'); if (p) p.style.opacity = '1'; }
  });
  await sleep(300);
  await shot('15b-card-hover', '.vcard');

  await page.evaluate(() => { const s = document.querySelector('#sortSel'); if (s) s.focus(); });
  await sleep(200);
  await shot('14b-sort', '.list-tools');

  log('\n▶ 커리큘럼 편집 상태');
  await go('#/mypage/schedule');
  await sleep(900);
  await shot('27c-schedule-panel', '.panel');

  log('\n▶ 학급 커리큘럼 연결 열');
  await go('#/classes');
  await sleep(900);
  await shot('21c-classes-table', '.panel');

  await browser.close();
  log('\n실패 ' + fail.length + '건' + (fail.length ? ': ' + fail.join(', ') : ''));
})();

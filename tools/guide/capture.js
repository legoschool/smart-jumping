/* 가이드북용 화면 캡처 — 설치된 Chrome 을 Puppeteer 로 몰아 실제 상태를 찍는다.
   로그인은 앱 자신의 api_login 을 호출해 세션을 만든다 (앱이 하는 것과 같은 방식). */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8790/';
const OUT = path.join(__dirname, 'raw');
fs.mkdirSync(OUT, { recursive: true });

const log = (...a) => console.log(...a);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  const done = [];
  const fail = [];

  /** 앱이 완전히 뜰 때까지 */
  async function ready() {
    await page.waitForFunction(() => window.S && window.S.loaded === true, { timeout: 20000 });
    await sleep(500);
    /* 히어로 영상은 프레임이 매번 달라 캡처가 흔들린다 — 고정한다 */
    await page.evaluate(() => {
      const v = document.getElementById('mhVid');
      if (v) { try { v.pause(); v.currentTime = 20; } catch (e) {} }
    });
    await sleep(400);
  }

  async function go(hash) {
    await page.evaluate(h => { location.hash = h; }, hash);
    await sleep(900);
  }

  async function open(url) {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    await ready();
  }

  async function login(id) {
    await page.evaluate(async (uid) => {
      const r = await new Promise((res, rej) =>
        google.script.run.withSuccessHandler(res).withFailureHandler(rej).api_login(uid, '1234'));
      if (!r || !r.ok) throw new Error('로그인 실패: ' + uid + ' ' + (r && r.msg));
      localStorage.setItem('sj_user', JSON.stringify(r.user));
    }, id);
    await page.reload({ waitUntil: 'networkidle2' });
    await ready();
  }

  async function logout() {
    await page.evaluate(() => { try { localStorage.removeItem('sj_user'); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle2' });
    await ready();
  }

  /** name: 파일명, opts: {sel} 요소만, {full} 전체 페이지, 기본은 뷰포트 */
  async function shot(name, opts = {}) {
    const file = path.join(OUT, name + '.png');
    try {
      if (opts.sel) {
        const el = await page.$(opts.sel);
        if (!el) throw new Error('요소 없음: ' + opts.sel);
        await el.screenshot({ path: file });
      } else {
        await page.screenshot({ path: file, fullPage: !!opts.full });
      }
      const kb = (fs.statSync(file).size / 1024).toFixed(0);
      log('  ✓ ' + name + '  (' + kb + 'KB)');
      done.push(name);
    } catch (e) {
      log('  ✗ ' + name + ' — ' + e.message);
      fail.push(name + ': ' + e.message);
    }
  }

  async function step(label, fn) {
    log('\n▶ ' + label);
    try { await fn(); } catch (e) { log('  ✗ 단계 실패 — ' + e.message); fail.push(label + ': ' + e.message); }
  }

  /* ─────────── 게스트 ─────────── */
  await step('게스트 · 첫 화면', async () => {
    await open(BASE);
    await logout();
    await shot('01-first-screen');
    await shot('01b-first-screen-full', { full: true });
    await shot('02-hero', { sel: '.mh' });
  });

  await step('게스트 · 로그인 / 회원가입', async () => {
    await page.evaluate(() => openAuth(false));
    await sleep(600);
    await shot('03-login-modal');
    await page.evaluate(() => openAuth(true));
    await sleep(600);
    await shot('04-signup-modal');
    await page.evaluate(() => closeModal && closeModal());
    await page.evaluate(() => { const x = document.querySelector('#authX, .modal-x'); if (x) x.click(); });
    await sleep(400);
  });

  await step('게스트 · 사용법 화면', async () => {
    await open(BASE + '#/guide');
    await shot('05-guide-hero', { sel: '.g-hero' });
    await shot('06-guide-hub', { sel: '.g-hub' });
    await shot('07-guide-steps', { sel: '.g-steps' });
    await shot('08-tutorial-step1', { sel: '.tut' });
    /* 네 단계를 골라 완성 화면까지 */
    await page.evaluate(async () => {
      for (let i = 0; i < 4; i++) {
        const b = document.querySelector('.tut-opt');
        if (b) b.click();
        await new Promise(r => setTimeout(r, 350));
      }
    });
    await sleep(1200);
    await shot('09-tutorial-done', { sel: '.tut' });
  });

  /* ─────────── 교사 ─────────── */
  await step('교사 · 로그인 후 기본', async () => {
    await open(BASE);
    await login('test');
    await shot('10-sidebar-teacher', { sel: '.sidebar' });
    await shot('11-library-teacher');
  });

  await step('교사 · 라이브러리 요소', async () => {
    await go('#/library');
    await shot('12-gnb', { sel: '.gnb' });
    await shot('13-chips', { sel: '.chips' });
    await shot('14-list-tools', { sel: '.list-head' });
    await shot('15-card', { sel: '.vcard' });
  });

  await step('교사 · 담기 → 영상담기 모달', async () => {
    await page.evaluate(() => {
      document.querySelectorAll('#grid .vpick input').forEach((cb, i) => {
        if (i < 3 && !cb.checked) cb.click();
      });
    });
    await sleep(700);
    await shot('16-picked-cards');
    await shot('17-fab', { sel: '#fabCart' });
    await page.evaluate(() => openCartModal());
    await sleep(900);
    await shot('18-cart-modal');
    await page.evaluate(() => { const x = document.querySelector('#modalX'); if (x) x.click(); });
    await sleep(400);
  });

  await step('교사 · 수업 플레이어', async () => {
    await page.evaluate(() => openPlayer(S.cart.slice(0, 3)));
    await sleep(3500);
    await shot('19-player');
    await page.evaluate(() => closePlayer());
    await sleep(600);
  });

  await step('교사 · 즐겨찾기', async () => {
    await page.evaluate(() => {
      const b = document.querySelector('#grid .vfav');
      if (b) b.click();
    });
    await sleep(600);
    await page.evaluate(() => { const a = document.querySelector('.gnb-fav'); if (a) a.click(); });
    await sleep(900);
    await shot('20-favorites');
  });

  await step('교사 · 수업관리', async () => {
    await go('#/classes');
    await shot('21-classes');
    await shot('21b-classes-full', { full: true });
    await page.evaluate(() => { const b = document.querySelector('#clsAdd'); if (b) b.click(); });
    await sleep(900);
    await shot('22-class-form');
    await page.evaluate(() => { const x = document.querySelector('#modalX'); if (x) x.click(); });
    await sleep(500);
  });

  await step('교사 · 출석부', async () => {
    await go('#/classes');
    await page.evaluate(() => { const b = document.querySelector('[data-att]'); if (b) b.click(); });
    await sleep(1300);
    await shot('23-attendance');
    await page.evaluate(() => { const x = document.querySelector('#modalX'); if (x) x.click(); });
    await sleep(500);
  });

  await step('교사 · 수업 리포트', async () => {
    await go('#/classes');
    await page.evaluate(() => { const b = document.querySelector('[data-rep]'); if (b) b.click(); });
    await sleep(1500);
    /* 리포트는 인쇄 전용 영역에 그려진다 — 캡처를 위해 잠시 보이게 한다 */
    await page.evaluate(() => {
      const pa = document.getElementById('printArea');
      if (pa) { pa.hidden = false; pa.style.cssText = 'display:block;background:#fff;padding:24px'; }
      document.querySelector('.app').style.display = 'none';
      document.body.style.background = '#fff';
    });
    await sleep(700);
    await shot('24-report', { sel: '#printArea' });
    await page.reload({ waitUntil: 'networkidle2' });
    await ready();
  });

  await step('교사 · 마이페이지', async () => {
    await go('#/mypage/info');      await shot('25-profile');
    await go('#/mypage/equipment'); await shot('26-equipment');
    await go('#/mypage/schedule');  await shot('27-schedule');
    await shot('27b-schedule-full', { full: true });
    await go('#/mypage/withdraw');  await shot('28-withdraw');
  });

  await step('교사 · 온라인교재', async () => {
    await go('#/textbook');
    await shot('29-textbook');
  });

  /* ─────────── 관리자 ─────────── */
  await step('관리자 · 회원관리', async () => {
    await open(BASE);
    await login('teacher');
    await shot('30-sidebar-admin', { sel: '.sidebar' });
    await go('#/members');
    await shot('31-members');
    await shot('31b-members-full', { full: true });
    await go('#/classes');
    await shot('32-classes-admin');
  });

  /* ─────────── 학생 ─────────── */
  await step('학생 · 메뉴와 내 출결', async () => {
    await open(BASE);
    await login('teststu');
    await shot('33-sidebar-student', { sel: '.sidebar' });
    await go('#/myatt');
    await shot('34-myatt');
  });

  await browser.close();

  log('\n────────────────────────');
  log('성공 ' + done.length + '건 / 실패 ' + fail.length + '건');
  if (fail.length) fail.forEach(f => log('  · ' + f));
  fs.writeFileSync(path.join(__dirname, 'capture-report.json'),
    JSON.stringify({ done, fail }, null, 2), 'utf8');
})();

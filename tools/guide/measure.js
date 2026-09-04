/* 콜아웃 좌표 재측정 — 컨테이너가 아니라 '실제로 가리키려는 그 요소'를 잡는다.
   그리고 게스트 화면과 교사 화면을 각각 그 상태에서 잰다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const BASE = 'http://localhost:8790/';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  async function ready() {
    await page.waitForFunction(() => window.S && window.S.loaded === true, { timeout: 20000 });
    await sleep(600);
    await page.evaluate(() => { const v = document.getElementById('mhVid'); if (v) { try { v.pause(); v.currentTime = 20; } catch (e) {} } });
    await sleep(300);
  }
  async function login(id) {
    await page.evaluate(async uid => {
      const r = await new Promise((res, rej) =>
        google.script.run.withSuccessHandler(res).withFailureHandler(rej).api_login(uid, '1234'));
      localStorage.setItem('sj_user', JSON.stringify(r.user));
    }, id);
    await page.reload({ waitUntil: 'networkidle2' }); await ready();
  }
  async function logout() {
    await page.evaluate(() => { try { localStorage.removeItem('sj_user'); } catch (e) {} });
    await page.reload({ waitUntil: 'networkidle2' }); await ready();
  }

  /* 요소 중심점을 뷰포트(또는 root) 기준 % 로 */
  const centers = (sels, rootSel) => page.evaluate((sels, rootSel) => {
    const R = rootSel ? document.querySelector(rootSel).getBoundingClientRect()
                      : { left: 0, top: 0, width: innerWidth, height: innerHeight };
    const out = {};
    for (const [k, sel] of Object.entries(sels)) {
      const el = document.querySelector(sel);
      if (!el) { out[k] = null; continue; }
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) { out[k] = null; continue; }
      out[k] = {
        cx: +((((r.left + r.width / 2) - R.left) / R.width) * 100).toFixed(1),
        cy: +((((r.top + r.height / 2) - R.top) / R.height) * 100).toFixed(1),
        visible: (r.top - R.top) < R.height && (r.bottom - R.top) > 0
      };
    }
    return out;
  }, sels, rootSel);

  const out = {};

  /* ── 게스트 첫 화면 (01-first-screen) ── */
  await page.goto(BASE, { waitUntil: 'networkidle2' }); await ready();
  await logout();
  out.guestFirst = await centers({
    brand: '.brand',
    loginBtn: '#btnLogin',
    gnbFirst: '.gnb-nav a:nth-child(1)',
    gnbNav: '.gnb-nav',
    searchInput: '#q',
    firstChip: '.chips .chip:nth-child(1)',
    lastChip: '.chips .chip:last-child',
    firstCard: '#grid .vcard:nth-child(1)',
    firstCardThumb: '#grid .vcard:nth-child(1) .vthumb',
    heroTitle: '.mh h2',
    soundBtn: '#mhSound'
  });

  /* ── 교사 라이브러리 (11-library-teacher) ── */
  await login('test');
  out.teacherLibrary = await centers({
    brand: '.brand',
    startBtn: '#btnStartClass',
    navLibrary: '.side-nav [data-nav="library"]',
    gnbNav: '.gnb-nav',
    gnbFav: '.gnb-fav',
    clock: '.gnb-clock',
    searchInput: '#q',
    firstChip: '.chips .chip:nth-child(1)',
    sortSel: '#sortSel',
    pickAll: '#pickAll',
    firstCard: '#grid .vcard:nth-child(1)',
    fab: '#fabCart'
  });

  /* ── 사이드바 (10-sidebar-teacher, 사이드바 기준) ── */
  out.sidebar = await centers({
    brand: '.brand', name: '.user-name', role: '.user-role',
    start: '#btnStartClass', logout: '#btnLogout',
    navLibrary: '[data-nav="library"]', navGuide: '[data-nav="guide"]',
    navClasses: '[data-nav="classes"]', navMyatt: '[data-nav="myatt"]',
    navMypage: '#navMypage', navTextbook: '[data-nav="textbook"]'
  }, '.sidebar');

  /* ── 카드 (15b-card-hover, 카드 기준) ── */
  out.card = await centers({
    pick: '.vpick', fav: '.vfav', thumb: '.vthumb',
    views: '.vthumb-views', dur: '.vthumb-meta',
    title: '.vcard-title', pathLine: '.vcard-path'
  }, '#grid .vcard:nth-child(1)');

  /* ── 상단 가로줄 (12-gnb, gnb 기준) ── */
  out.gnb = await centers({
    first: '.gnb-nav a:nth-child(1)', fav: '.gnb-fav', favCnt: '#favCnt', clock: '.gnb-clock'
  }, '.gnb');

  /* ── 수업관리 (21-classes) ── */
  await page.evaluate(() => { location.hash = '#/classes'; });
  await sleep(1200);
  out.classes = await centers({
    period: '.toolbar-l select', search: '.toolbar-r input', addBtn: '#clsAdd',
    schedTag: 'tbody tr:nth-child(1) .sched-tag, tbody tr:nth-child(1) .sched-none',
    btnPlay: 'tbody tr:nth-child(1) .ico-play',
    btnAtt: 'tbody tr:nth-child(1) .ico-att',
    btnRep: 'tbody tr:nth-child(1) .ico-rep',
    btnEdit: 'tbody tr:nth-child(1) .ico-edit'
  });

  await browser.close();
  fs.writeFileSync(path.join(__dirname, 'centers.json'), JSON.stringify(out, null, 2), 'utf8');
  for (const [g, items] of Object.entries(out)) {
    console.log('[' + g + ']');
    for (const [k, v] of Object.entries(items))
      console.log('  ' + k.padEnd(14) + (v ? v.cx + '% , ' + v.cy + '%' + (v.visible ? '' : '  (화면 밖)') : 'null'));
  }
})();

/* 가이드북 HTML → A4 PDF. 인쇄용 CSS(@media print)가 그대로 적용된다.
   그림이 base64 로 박혀 있어 file:// 로 열어도 그림이 다 나온다. */
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '../..');
const SRC = path.join(ROOT, '안내자료', '스마트점핑 운영 가이드북.html');
const DST = path.join(ROOT, '안내자료', '스마트점핑 운영 가이드북.pdf');

(async () => {
  if (!fs.existsSync(SRC)) {
    console.error('먼저 node tools/guide/build.js 를 돌리세요.');
    process.exit(1);
  }
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.goto('file:///' + SRC.replace(/\\/g, '/'), { waitUntil: 'networkidle0', timeout: 120000 });
  await page.emulateMediaType('print');
  await new Promise(r => setTimeout(r, 2500));   /* 웹폰트가 앉을 시간 */

  await page.pdf({
    path: DST, format: 'A4', printBackground: true,
    margin: { top: '15mm', bottom: '15mm', left: '13mm', right: '13mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font-size:8px;color:#8a93a6;padding:0 13mm;display:flex;' +
      'justify-content:space-between;font-family:Malgun Gothic,sans-serif">' +
      '<span>스마트점핑 운영 가이드북</span><span class="pageNumber"></span></div>'
  });
  await browser.close();

  const buf = fs.readFileSync(DST).toString('latin1');
  const pages = (buf.match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log('생성: ' + path.basename(DST) + '  '
    + (fs.statSync(DST).size / 1024 / 1024).toFixed(2) + 'MB  ' + pages + '쪽');
})();

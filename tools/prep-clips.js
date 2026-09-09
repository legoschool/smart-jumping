/* 참조 영상 2편의 대표 프레임을 뽑아 포스터(WebP)로 굽는다.
   ffmpeg 이 없는 환경이라 설치된 크롬에 영상을 물려 캔버스로 한 장 그린다. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'clips');
const PORT = 8791;

/* [파일, 잘라낼 초] — 아이들 표정이 살아 있는 지점 */
const SHOTS = [['clip1.mp4', 24], ['clip2.mp4', 22]];

function serve() {
  return new Promise(function (ok) {
    const s = http.createServer(function (req, res) {
      const url = decodeURIComponent(req.url);
      /* 빈 페이지도 같은 오리진에서 줘야 캔버스가 오염되지 않는다 */
      if (url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end('<!doctype html><meta charset="utf-8"><title>frame</title>');
      }
      const f = path.join(DIR, url.replace(/^\//, ''));
      if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'video/mp4' });
      fs.createReadStream(f).pipe(res);
    });
    s.listen(PORT, function () { ok(s); });
  });
}

(async function () {
  const server = await serve();
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://localhost:' + PORT + '/');

  for (const [file, at] of SHOTS) {
    const dataUrl = await page.evaluate(async function (args) {
      const v = document.createElement('video');
      v.src = args.src; v.muted = true; v.playsInline = true;
      document.body.appendChild(v);
      await new Promise(function (ok, no) {
        v.addEventListener('loadeddata', ok, { once: true });
        v.addEventListener('error', function () { no(new Error('load fail')); }, { once: true });
      });
      v.currentTime = args.at;
      await new Promise(function (ok) { v.addEventListener('seeked', ok, { once: true }); });
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      return c.toDataURL('image/png');
    }, { src: '/' + file, at: at });

    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const out = path.join(DIR, file.replace('.mp4', '.webp'));
    await sharp(png).resize({ width: 960 }).webp({ quality: 80 }).toFile(out);
    console.log('  ' + path.basename(out) + '  ' + (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
  }

  await browser.close();
  server.close();
})().catch(function (e) { console.error(e); process.exit(1); });

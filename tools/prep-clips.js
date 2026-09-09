/* 선생님이 보내 주신 영상을 사이트용으로 옮기고 포스터를 굽는다.
   원본은 저장소에 올리지 않으므로(.gitignore) 여기서 assets/ 로 복사까지 한다.
   ffmpeg 이 없는 환경이라 포스터는 설치된 크롬에 영상을 물려 캔버스로 뜬다. */
const fs = require('fs');
const path = require('path');
const http = require('http');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '스마트 점핑 추가자료');
const PORT = 8791;

/* [넣을 폴더, 내보낼 이름, 원본 파일, 포스터를 뜰 초]
   소개 영상 2편은 나레이션이 있는 긴 것, scene 5편은 10초짜리 장면 영상이다. */
const JOBS = [
  ['clips',  'clip1',  '스마트점핑 참조영상1.mp4',              6],
  ['clips',  'clip2',  '스마트점핑 참조영상2.mp4',              5],
  ['scenes', 'scene1', 'KakaoTalk_20260909_132800070.mp4',     3],
  ['scenes', 'scene2', 'KakaoTalk_20260909_132805261.mp4',     3],
  ['scenes', 'scene3', 'KakaoTalk_20260909_133115618.mp4',     3],
  ['scenes', 'scene4', 'KakaoTalk_20260909_133120394.mp4',     3],
  ['scenes', 'scene5', 'KakaoTalk_20260909_133125305.mp4',     3]
];

/* 1) 원본을 assets/ 로 복사 */
const todo = [];
for (const [dir, name, file, at] of JOBS) {
  const from = path.join(SRC, file);
  const outDir = path.join(ROOT, 'assets', dir);
  fs.mkdirSync(outDir, { recursive: true });
  const to = path.join(outDir, name + '.mp4');

  if (!fs.existsSync(from)) {
    // 원본이 없어도 이미 옮겨 둔 것이 있으면 포스터만 다시 굽는다
    if (fs.existsSync(to)) { todo.push([dir, name, at]); continue; }
    console.log('  ⚠ 원본 없음: ' + file);
    continue;
  }
  fs.copyFileSync(from, to);
  todo.push([dir, name, at]);
}

/* 2) 포스터 프레임 */
const server = http.createServer(function (req, res) {
  const url = decodeURIComponent(req.url);
  /* 빈 페이지도 같은 오리진에서 줘야 캔버스가 오염되지 않는다 */
  if (url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<!doctype html><meta charset="utf-8"><title>frame</title>');
  }
  const f = path.join(ROOT, 'assets', url.replace(/^\//, ''));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': 'video/mp4' });
  fs.createReadStream(f).pipe(res);
});

server.listen(PORT, async function () {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('http://localhost:' + PORT + '/');

  for (const [dir, name, at] of todo) {
    /* seek 만으로는 프레임이 안 바뀌는 영상이 있어, 재생시켜 놓고 그 시각에 그린다 */
    const dataUrl = await page.evaluate(async function (a) {
      const v = document.createElement('video');
      v.src = a.src; v.muted = true; v.preload = 'auto';
      document.body.appendChild(v);
      await new Promise(function (ok, no) {
        v.addEventListener('canplaythrough', ok, { once: true });
        v.addEventListener('error', function () { no(new Error('load fail')); }, { once: true });
        setTimeout(ok, 15000);
      });
      v.play();
      await new Promise(function (ok) { setTimeout(ok, a.at * 1000); });
      v.pause();
      const c = document.createElement('canvas');
      c.width = v.videoWidth; c.height = v.videoHeight;
      c.getContext('2d').drawImage(v, 0, 0);
      v.remove();
      return c.toDataURL('image/png');
    }, { src: '/' + dir + '/' + name + '.mp4', at: at });

    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const out = path.join(ROOT, 'assets', dir, name + '.webp');
    await sharp(png).resize({ width: 960 }).webp({ quality: 80 }).toFile(out);

    const mp4 = fs.statSync(path.join(ROOT, 'assets', dir, name + '.mp4')).size / 1048576;
    console.log('  ' + (dir + '/' + name).padEnd(16) +
      mp4.toFixed(1) + 'MB  포스터 ' + (fs.statSync(out).size / 1024).toFixed(0) + 'KB');
  }

  await browser.close();
  server.close();
});

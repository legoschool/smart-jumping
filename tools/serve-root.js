/* 로컬 정적 서버 (8790) — 빌드 결과를 눈으로 볼 때만 쓴다.
   히어로 영상 때문에 Range 요청(부분 전송)까지 처리한다. GitHub Pages 와 같은 동작. */
const http = require('http'), fs = require('fs'), p = require('path');
const ROOT = p.resolve(__dirname, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};

http.createServer((q, s) => {
  const f = p.join(ROOT, q.url === '/' ? 'index.html' : decodeURIComponent(q.url.split('?')[0]));
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { s.writeHead(404); s.end('404'); return; }
    const type = MIME[p.extname(f).toLowerCase()] || 'application/octet-stream';
    const range = q.headers.range;

    if (range) {
      const m = /bytes=(\d*)-(\d*)/.exec(range);
      const start = m && m[1] ? parseInt(m[1], 10) : 0;
      const end = m && m[2] ? parseInt(m[2], 10) : st.size - 1;
      if (start >= st.size) {
        s.writeHead(416, { 'Content-Range': 'bytes */' + st.size }); s.end(); return;
      }
      s.writeHead(206, {
        'Content-Type': type,
        'Content-Range': 'bytes ' + start + '-' + end + '/' + st.size,
        'Accept-Ranges': 'bytes',
        'Content-Length': end - start + 1
      });
      fs.createReadStream(f, { start, end }).pipe(s);
      return;
    }

    s.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': st.size });
    fs.createReadStream(f).pipe(s);
  });
}).listen(8790, () => console.log('http://localhost:8790'));

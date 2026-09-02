/**
 * 104편의 maxresdefault 존재 여부를 전수 확인해서,
 * 없는 영상의 youtube_id 목록을 apps-script/js.html 의 NO_MAXRES 에 구워 넣는다.
 *
 * 이걸 해두면 프론트가 처음부터 hqdefault 를 요청하므로
 * 카드가 보일 때마다 나던 404(콘솔 에러)가 사라진다. 폴백 코드는 안전망으로 남긴다.
 *
 * 영상 목록을 바꾼 뒤 한 번 돌리고 `npm run build` 를 하면 된다.
 */
const https = require('https'), fs = require('fs');

const SETUP = 'apps-script/01_초기설정.gs';
const JS = 'apps-script/js.html';

const setup = fs.readFileSync(SETUP, 'utf8');
const ids = [...new Set([...setup.matchAll(/'([A-Za-z0-9_-]{11})',\s*'\d{1,2}:\d{2}(?::\d{2})?'/g)]
  .map(m => m[1]))];

if (ids.length < 50) { console.error('영상 ID 를 ' + ids.length + '건밖에 못 읽었습니다. 중단.'); process.exit(1); }

function head(u) {
  return new Promise(r => {
    const q = https.request(u, { method: 'HEAD', timeout: 12000 }, s => { r(s.statusCode); q.destroy(); });
    q.on('error', () => r(0)); q.on('timeout', () => { q.destroy(); r(0); }); q.end();
  });
}

(async () => {
  const bad = [], unknown = [];
  for (let i = 0; i < ids.length; i += 8) {
    const b = ids.slice(i, i + 8);
    const rs = await Promise.all(b.map(id => head('https://i.ytimg.com/vi/' + id + '/maxresdefault.jpg')));
    rs.forEach((c, k) => { if (c === 404) bad.push(b[k]); else if (c !== 200) unknown.push(b[k]); });
  }
  console.log('총 ' + ids.length + '건');
  console.log('  maxresdefault 있음 : ' + (ids.length - bad.length - unknown.length));
  console.log('  없음 (hqdefault 로 직행) : ' + bad.length);
  if (unknown.length) console.log('  응답 못 받음 : ' + unknown.length + ' — ' + unknown.join(', '));

  const block = 'var NO_MAXRES = {' + bad.sort().map(id => "'" + id + "':1").join(', ') + '};';
  const js = fs.readFileSync(JS, 'utf8');
  const re = /var NO_MAXRES = \{[^}]*\};/;
  if (!re.test(js)) { console.error('js.html 에서 NO_MAXRES 자리를 못 찾았습니다.'); process.exit(1); }
  fs.writeFileSync(JS, js.replace(re, () => block), 'utf8');
  console.log('js.html 의 NO_MAXRES 를 ' + bad.length + '건으로 갱신했습니다.');
})();

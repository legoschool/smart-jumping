/* 검증된 영상의 재생시간 + 임베드 허용 여부를 수집한다 */
const https = require('https');
const fs = require('fs');

const VERIFIED = JSON.parse(fs.readFileSync(__dirname + '/data/yt-verified.json', 'utf8'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function fetchWatch(id) {
  return new Promise(resolve => {
    const req = https.get('https://www.youtube.com/watch?v=' + id, {
      timeout: 25000,
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' }
    }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        const len = (body.match(/"lengthSeconds":"(\d+)"/) || [])[1];
        const emb = /"playableInEmbed":true/.test(body);
        const embFalse = /"playableInEmbed":false/.test(body);
        resolve({ id, secs: len ? Number(len) : null, embed: emb ? true : (embFalse ? false : null) });
      });
    });
    req.on('error', () => resolve({ id, secs: null, embed: null }));
    req.on('timeout', () => { req.destroy(); resolve({ id, secs: null, embed: null }); });
  });
}

function fmt(s) {
  if (!s) return '';
  const m = Math.floor(s / 60), sec = s % 60;
  return ('0' + m).slice(-2) + ':' + ('0' + sec).slice(-2);
}

(async () => {
  const ids = [...new Set(Object.values(VERIFIED).flat().map(v => v.yt))];
  console.log('재생시간·임베드 조회 ' + ids.length + '개\n');

  const meta = {};
  for (let i = 0; i < ids.length; i += 4) {
    const batch = ids.slice(i, i + 4);
    const rs = await Promise.all(batch.map(fetchWatch));
    rs.forEach(r => {
      meta[r.id] = r;
      const mark = r.embed === false ? '🚫 임베드불가' : (r.embed === true ? '✅' : '❔');
      console.log('  ' + mark + ' ' + r.id + '  ' + (fmt(r.secs) || '--:--'));
    });
  }

  // 임베드 불가 영상은 제외
  const out = {};
  let dropped = [];
  Object.keys(VERIFIED).forEach(sub => {
    VERIFIED[sub].forEach(v => {
      const m = meta[v.yt] || {};
      if (m.embed === false) { dropped.push(v.yt + ' / ' + v.title.slice(0, 40)); return; }
      if (!out[sub]) out[sub] = [];
      out[sub].push({ yt: v.yt, title: v.title, author: v.author, dur: fmt(m.secs), secs: m.secs || 0 });
    });
  });

  const total = Object.values(out).flat().length;
  console.log('\n──────────────────────────────');
  console.log('임베드 가능 ' + total + '건 / 제외 ' + dropped.length + '건');
  dropped.forEach(d => console.log('  제외: ' + d));
  const noDur = Object.values(out).flat().filter(v => !v.dur);
  console.log('재생시간 미확보: ' + noDur.length + '건');
  console.log('──────────────────────────────');

  fs.writeFileSync(__dirname + '/data/yt-final.json', JSON.stringify(out, null, 2), 'utf8');
  Object.keys(out).forEach(k => console.log('  ' + k + ': ' + out[k].length + '건'));
  console.log('\n저장: yt-final.json');
})();

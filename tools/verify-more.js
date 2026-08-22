/* 추가 후보를 oEmbed + playableInEmbed + lengthSeconds 로 전수 검증 */
const https = require('https');
const fs = require('fs');

const NEW = {
  // ── C1 명상
  S11: ['H8DIbAhJ8fg'],
  S13: ['nIICI7cSSUM', '8H44pw20-74', 'uVlUn_c1Xew', 'LjQ0HhOLkuk', 'WVBh1C-bRbo'],
  // ── C2 타이머
  S21: ['pZnefFq4aDk', 'w0OHKiIV44E'],
  S22: ['fJMgbAw_sAI', '-bobh50VdbA', 'KEwM1DMZoo8', 'PiU0fht2ENE',
        '1RZd1U8uGR8', 'Zgn93PpZUg8', 'LE0RWymF1Vc', 'uPSoj0_OW9A'],
  // ── C3 준비운동
  S31: ['_bqes3Cw5ug'],
  S35: ['d3MtqJSDO90', 'X8t6C07BJ80', 'mdvTr_xhiH8', '9GawCESbFFk', '4TwQwVFLi4Q', 'YXzPcEATOPg'],
  S36: ['z149ha1sCbQ', 'Gr9qZrju9Pk', '36Gc0L7X-_M', 'mOHgNUGpZLE',
        'gYQhS1ioY0o', 'juCbUO6zpL0', 'A2X7o51KwuI', 'gBsXje_teyg'],
  // ── C4 스마트점핑
  S47: ['wWEsWFTJCnk', 'IZmhDR-_9J8', '-hDMjJr9Smc', '6PvI3f7jZfE',
        'SNC04hlGt6Y', '23hTV_VXKNE', 'aYRIfdsH0u8'],
  // ── C5 비트 트레이닝
  S53: ['GKkixovHHro', 'YDFWIe-ibz8'],
  // ── C6 Killing Time Zone
  S62: ['DKA9vzuKFio', '0FLsBYtNPkg'],
  S63: ['4FR8-GOwlWs', '7gjp3gdZE2U', 'JJRoMT3SiEg', 'zRJj-JwMpcc'],
  S64: ['fGXR6m8sCCY']
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

function oembed(id) {
  return new Promise(resolve => {
    const url = 'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D' + encodeURIComponent(id) + '&format=json';
    const req = https.get(url, { timeout: 15000 }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ id, ok: false, code: res.statusCode });
        try { const j = JSON.parse(b); resolve({ id, ok: true, title: j.title, author: j.author_name }); }
        catch (e) { resolve({ id, ok: false, code: 'parse' }); }
      });
    });
    req.on('error', () => resolve({ id, ok: false, code: 'err' }));
    req.on('timeout', () => { req.destroy(); resolve({ id, ok: false, code: 'timeout' }); });
  });
}

function watch(id) {
  return new Promise(resolve => {
    const req = https.get('https://www.youtube.com/watch?v=' + encodeURIComponent(id),
      { timeout: 25000, headers: { 'User-Agent': UA, 'Accept-Language': 'ko-KR,ko;q=0.9' } }, res => {
      let b = '';
      res.on('data', d => b += d);
      res.on('end', () => {
        const len = (b.match(/"lengthSeconds":"(\d+)"/) || [])[1];
        const embed = /"playableInEmbed":true/.test(b) ? true
                    : (/"playableInEmbed":false/.test(b) ? false : null);
        resolve({ id, secs: len ? Number(len) : null, embed });
      });
    });
    req.on('error', () => resolve({ id, secs: null, embed: null }));
    req.on('timeout', () => { req.destroy(); resolve({ id, secs: null, embed: null }); });
  });
}

function fmt(s) {
  if (!s) return '';
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => ('0' + n).slice(-2);
  return h ? h + ':' + p(m) + ':' + p(sec) : p(m) + ':' + p(sec);
}

(async () => {
  const pairs = [];
  Object.keys(NEW).forEach(sub => NEW[sub].forEach(id => pairs.push({ sub, id })));
  const ids = [...new Set(pairs.map(p => p.id))];
  console.log('추가 후보 ' + ids.length + '건 검증\n');

  const meta = {};
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const oe = await Promise.all(batch.map(oembed));
    const wa = await Promise.all(batch.map(watch));
    batch.forEach((id, k) => {
      const o = oe[k], w = wa[k];
      const alive = o.ok;
      const emb = w.embed !== false;
      const ok = alive && emb && w.secs;
      meta[id] = { ok, title: o.title, secs: w.secs, embed: w.embed };
      var mark = ok ? '✅' : (!alive ? '❌ 없음' : (!emb ? '🚫 임베드불가' : '⚠️ 시간없음'));
      console.log('  ' + mark + ' ' + id.padEnd(13) + ' ' + fmt(w.secs).padEnd(8) +
                  (o.ok ? o.title.slice(0, 46) : 'HTTP ' + o.code));
    });
  }

  const out = {};
  let added = 0, dropped = [];
  pairs.forEach(p => {
    const m = meta[p.id];
    if (!m || !m.ok) { if (!dropped.includes(p.id)) dropped.push(p.id); return; }
    if (!out[p.sub]) out[p.sub] = [];
    if (out[p.sub].some(v => v.yt === p.id)) return;
    out[p.sub].push({ yt: p.id, title: m.title, dur: fmt(m.secs), secs: m.secs });
    added++;
  });

  console.log('\n──────────────────────────────');
  console.log('통과 ' + added + ' / 후보 ' + ids.length + '   탈락 ' + dropped.length);
  if (dropped.length) console.log('탈락: ' + dropped.join(', '));
  console.log('──────────────────────────────');
  Object.keys(out).forEach(k => console.log('  ' + k + ': ' + out[k].length + '건'));
  fs.writeFileSync(__dirname + '/data/yt-more.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('\n저장: yt-more.json');
})();

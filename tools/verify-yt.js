/* 후보 유튜브 ID 를 oEmbed 로 전수 검증하고 실제 제목을 가져온다 */
const https = require('https');
const fs = require('fs');

const CANDIDATES = {
  // 명상
  S11: ['2x4ECODdULE', 'bG4e-HnlJTE', 'RJO2qgqVol0', 'dZewQEbQQM0'],
  S12: ['tNao3xp5yjM'],
  S13: ['2x4ECODdULE'],
  // 시간타이머
  S21: ['119KVJumA1M', 'mIYObGZ1I_w'],
  S22: ['qIiMFZ88NDI', 'Byzwstv74Xw', '0fZC2y5pCck', 'ec3vEdyG8oI', 'CXV_DqsWSPU', '3dJ4wFqQzz4'],
  // 준비운동 | 타바타
  S31: ['hMCvvDHB46o', 'ZmUj-E9A44E', 'PFJe9i9UbZ4', '2lru6IsOQ6Y', 'erMfzZ5_or8', '8qf727092l4'],
  S32: ['G9p1ZehAAnI', 'BL8kwdj-XWU', 'RFFWIbUcBXo', 'BxElnlkcfts', 'ta-Uq_prRT8'],
  S33: ['EPXeswXkJDg', '4deNtH6p2U0', 'esPoIcFC_T4'],
  S34: ['AytACfar2AI', '2oN6SFl85VY', 'zguPP2ymhH0'],
  // 스마트점핑 (줄넘기)
  S41: ['zPGci2cL6j4', 'Mdc7kmOKuMU', '_yWerNDS2AQ', 'nDvxGWOUNk4'],
  S42: ['XdQRqIR-x64', 'P6RU0NUgu8E', 'DnUmpP-_Chk', 'zrPszwVKjJE'],
  S43: ['gT9Y9FBb1ic', 'DwYFyXlwM40', 'G_jCU_oL8AE', 'l9chx0Z7qBw'],
  S44: ['jmm8k9OmK1Y', 'XA3xY1WCvn8'],
  S45: ['adt2JguLrAo', 'i6gF_5J4fek'],
  S47: ['dw31Gdfj7oY', '_EkTLdKEOy4', 'FiVBh8pv78Y', 'OP8fuogWSlQ', 'IpSoCdLsIMA', 'DFT4-ro_iIM', 'mfpamFUdivE', '5Hll_yymS2w'],
  S4D: ['HHmor6wmxMo'],
  // Killing Time Zone
  S62: ['Ln9mCebyeNk', 'dcsAhWu8D1E', 'f9PuBMgLtpA', 'L73dXfVsLKc', 'D8vF6CXRhgc'],
  S65: ['nA9I1iv_E8w']
};

function oembed(id) {
  return new Promise(resolve => {
    const url = 'https://www.youtube.com/oembed?url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3D' + id + '&format=json';
    const req = https.get(url, { timeout: 15000 }, res => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve({ id, ok: false, code: res.statusCode });
        try {
          const j = JSON.parse(body);
          resolve({ id, ok: true, title: j.title, author: j.author_name, thumb: j.thumbnail_url });
        } catch (e) { resolve({ id, ok: false, code: 'parse' }); }
      });
    });
    req.on('error', e => resolve({ id, ok: false, code: e.code || 'err' }));
    req.on('timeout', () => { req.destroy(); resolve({ id, ok: false, code: 'timeout' }); });
  });
}

(async () => {
  const all = [];
  Object.keys(CANDIDATES).forEach(sub => CANDIDATES[sub].forEach(id => all.push({ sub, id })));

  // 중복 ID 는 한 번만 조회
  const uniq = [...new Set(all.map(a => a.id))];
  console.log('검증 대상 ' + uniq.length + '개 (배치 6개씩)\n');

  const info = {};
  for (let i = 0; i < uniq.length; i += 6) {
    const batch = uniq.slice(i, i + 6);
    const rs = await Promise.all(batch.map(oembed));
    rs.forEach(r => {
      info[r.id] = r;
      console.log((r.ok ? '  ✅ ' : '  ❌ ') + r.id + '  ' + (r.ok ? r.title.slice(0, 58) : 'HTTP ' + r.code));
    });
  }

  const okIds = Object.values(info).filter(r => r.ok);
  console.log('\n──────────────────────────────');
  console.log('통과 ' + okIds.length + ' / ' + uniq.length);
  console.log('──────────────────────────────');

  // 소분류별로 살아있는 것만 모아 저장
  const out = {};
  all.forEach(a => {
    if (!info[a.id] || !info[a.id].ok) return;
    if (!out[a.sub]) out[a.sub] = [];
    if (out[a.sub].some(v => v.yt === a.id)) return;
    out[a.sub].push({ yt: a.id, title: info[a.id].title, author: info[a.id].author });
  });

  fs.writeFileSync(__dirname + '/data/yt-verified.json', JSON.stringify(out, null, 2), 'utf8');
  console.log('\n소분류별 배정:');
  Object.keys(out).forEach(k => console.log('  ' + k + ': ' + out[k].length + '건'));
  console.log('\n저장: yt-verified.json');
})();

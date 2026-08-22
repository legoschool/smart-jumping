/* 기존 59 + 추가 45 를 합쳐 01_초기설정.gs 의 시드 블록을 생성
   ※ 소분류 배치는 영상 ID 를 직접 적어 관리한다 (파일 키에 의존하지 않음) */
const fs = require('fs');
const A = JSON.parse(fs.readFileSync(__dirname + '/data/yt-final.json', 'utf8'));
const B = JSON.parse(fs.readFileSync(__dirname + '/data/yt-more.json', 'utf8'));

const M = {};
[A, B].forEach(src => Object.values(src).flat().forEach(v => { M[v.yt] = v; }));

const TREE = [
  ['C1', '명상', [
    ['S11', '호흡 명상', '', ['2x4ECODdULE','bG4e-HnlJTE','RJO2qgqVol0','dZewQEbQQM0','H8DIbAhJ8fg']],
    ['S12', '마음챙김 명상', '', ['tNao3xp5yjM','uVlUn_c1Xew']],
    ['S13', '어린이 명상', 'N', ['nIICI7cSSUM','8H44pw20-74','LjQ0HhOLkuk','WVBh1C-bRbo']]
  ]],
  ['C2', '시간타이머', [
    ['S21', '휴식영상 타이머', '', ['119KVJumA1M','mIYObGZ1I_w','pZnefFq4aDk','w0OHKiIV44E']],
    ['S22', '카운터 타이머', 'N', ['qIiMFZ88NDI','Byzwstv74Xw','0fZC2y5pCck','ec3vEdyG8oI',
        'CXV_DqsWSPU','3dJ4wFqQzz4','fJMgbAw_sAI','-bobh50VdbA','KEwM1DMZoo8','PiU0fht2ENE',
        '1RZd1U8uGR8','Zgn93PpZUg8','LE0RWymF1Vc','uPSoj0_OW9A']]
  ]],
  ['C3', '준비운동 | 타바타', [
    ['S31', '몸풀기 & 스트레칭', '', ['hMCvvDHB46o','ZmUj-E9A44E','PFJe9i9UbZ4','2lru6IsOQ6Y',
        'erMfzZ5_or8','8qf727092l4','_bqes3Cw5ug']],
    ['S32', '타바타 & 기초체력', '', ['G9p1ZehAAnI','BL8kwdj-XWU','RFFWIbUcBXo','BxElnlkcfts','ta-Uq_prRT8']],
    ['S33', '기초체력 추천 조합', '', ['EPXeswXkJDg','4deNtH6p2U0','esPoIcFC_T4']],
    ['S34', '점핑 근력운동', '', ['AytACfar2AI','2oN6SFl85VY','zguPP2ymhH0']],
    ['S35', '정리운동 · 쿨다운', 'N', ['d3MtqJSDO90','X8t6C07BJ80','mdvTr_xhiH8','9GawCESbFFk',
        '4TwQwVFLi4Q','YXzPcEATOPg']],
    ['S36', '레크리에이션 놀이', 'N', ['z149ha1sCbQ','Gr9qZrju9Pk','36Gc0L7X-_M','mOHgNUGpZLE',
        'gYQhS1ioY0o','juCbUO6zpL0','A2X7o51KwuI','gBsXje_teyg']]
  ]],
  ['C4', '스마트점핑', [
    ['S41', '급수 친구들 1단계 [브로빗]', '', ['zPGci2cL6j4','Mdc7kmOKuMU','_yWerNDS2AQ','nDvxGWOUNk4']],
    ['S42', '급수 친구들 2단계 [월라비]', '', ['XdQRqIR-x64','P6RU0NUgu8E','DnUmpP-_Chk','zrPszwVKjJE']],
    ['S43', '급수 친구들 3단계 [이글]', '', ['gT9Y9FBb1ic','DwYFyXlwM40','G_jCU_oL8AE','l9chx0Z7qBw']],
    ['S44', '쌩쌩이 · 2단뛰기', '', ['jmm8k9OmK1Y','XA3xY1WCvn8','adt2JguLrAo','i6gF_5J4fek']],
    ['S45', '음악줄넘기', 'N', ['-hDMjJr9Smc','aYRIfdsH0u8','SNC04hlGt6Y','23hTV_VXKNE',
        '6PvI3f7jZfE','wWEsWFTJCnk']],
    ['S46', '[지도자 필수교육]', '', ['HHmor6wmxMo']]
  ]],
  ['C5', '비트 트레이닝', [
    ['S51', '동요 율동', '', ['dw31Gdfj7oY','FiVBh8pv78Y','OP8fuogWSlQ','mfpamFUdivE']],
    ['S52', '체조 메들리', '', ['_EkTLdKEOy4','DFT4-ro_iIM','5Hll_yymS2w']],
    ['S53', 'K-POP 키즈댄스', 'N', ['GKkixovHHro','YDFWIe-ibz8']]
  ]],
  ['C6', 'Killing Time Zone', [
    ['S61', '나라별 국기맞추기', '', ['Ln9mCebyeNk','f9PuBMgLtpA','L73dXfVsLKc','D8vF6CXRhgc']],
    ['S62', '숨은그림 · 틀린그림 찾기', 'N', ['nA9I1iv_E8w','DKA9vzuKFio','0FLsBYtNPkg']],
    ['S63', '넌센스 퀴즈', 'N', ['4FR8-GOwlWs','7gjp3gdZE2U','JJRoMT3SiEg','zRJj-JwMpcc']]
  ]]
];

function fmtDur(s) {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const p = n => ('0' + n).slice(-2);
  return h ? h + ':' + p(m) + ':' + p(sec) : p(m) + ':' + p(sec);
}
const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

let cat = 'const CAT_TREE = [\n';
TREE.forEach(([c1, name, subs], i) => {
  cat += `  ['${c1}', ${q(name)}, ${i + 1}, [\n`;
  subs.forEach(([s, sn, badge], j) => {
    cat += `    ['${s}', ${q(sn)}, ${j + 1}, ${q(badge)}],\n`;
  });
  cat = cat.replace(/,\n$/, '\n') + '  ]],\n';
});
cat = cat.replace(/,\n$/, '\n') + '];\n';

let n = 0, missing = [], seen = new Set(), dupes = [];
let vid = 'const VIDEO_DATA = [\n';
TREE.forEach(([c1, , subs]) => {
  subs.forEach(([s, , , ids]) => {
    ids.forEach(id => {
      if (!M[id]) { missing.push(id); return; }
      if (seen.has(id)) { dupes.push(id); return; }
      seen.add(id); n++;
      const views = 120 + ((n * 971) % 9400);
      vid += `  ['V${('000' + n).slice(-4)}', '${c1}', '${s}', ${q(M[id].title)}, '${id}', '${fmtDur(M[id].secs)}', ${views}],\n`;
    });
  });
});
vid = vid.replace(/,\n$/, '\n') + '];\n';

if (missing.length) { console.error('❌ 메타 없음: ' + missing.join(', ')); process.exit(1); }
if (dupes.length) console.log('⚠️ 중복 제거: ' + dupes.join(', '));

// 검증: 검증 통과 목록에 없는 ID 가 섞이지 않았는지
const verified = new Set(Object.keys(M));
const unverified = [...seen].filter(id => !verified.has(id));
if (unverified.length) { console.error('❌ 미검증 ID: ' + unverified.join(', ')); process.exit(1); }

fs.writeFileSync(__dirname + '/data/seed-block.txt', cat + '\n' + vid, 'utf8');
console.log('영상 ' + n + '건 / 대분류 ' + TREE.length + ' / 소분류 ' + TREE.reduce((a,t)=>a+t[2].length,0));
TREE.forEach(([c1, name, subs]) => {
  const cnt = subs.reduce((a, s) => a + s[3].length, 0);
  console.log('  ' + name.padEnd(20) + String(cnt).padStart(3) + '건  (' + subs.length + '분류)');
});
console.log('\n미사용(검증했으나 배치 안 됨): ' +
  ([...verified].filter(id => !seen.has(id)).join(', ') || '없음'));

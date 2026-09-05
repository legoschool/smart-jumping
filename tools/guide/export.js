/* 운영 가이드북 HTML → 마크다운(.md) + 워드(.docx)
   완성본 HTML 을 헤드리스 크롬으로 열어 문단·표·그림을 구조로 뽑은 뒤
   두 형식으로 굽는다. 그림은 base64 로 박혀 있으므로 꺼내서 PNG 로 바꾼다
   (워드는 WebP 를 못 읽는다).

     npm run guide:export

   먼저 npm run serve 로 8790 을 띄워 두어야 한다. */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const ROOT = path.resolve(__dirname, '../..');
const NAME = '스마트점핑 운영 가이드북';
const OUT = path.join(ROOT, '안내자료');
const IMGDIR = path.join(OUT, NAME + ' 그림');
const SRC = 'http://localhost:8790/' + encodeURIComponent('안내자료') + '/' + encodeURIComponent(NAME + '.html');

/* ── 아주 작은 ZIP 작성기 (docx 는 zip 이다) ── */
function zip(files) {
  const chunks = [], central = [];
  let offset = 0;
  const dos = (d) => {
    const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xffff;
    const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;
    return { t, dt };
  };
  const now = dos(new Date());
  for (const f of files) {
    const name = Buffer.from(f.name, 'utf8');
    const raw = Buffer.isBuffer(f.data) ? f.data : Buffer.from(f.data, 'utf8');
    const deflated = f.store ? raw : zlib.deflateRawSync(raw, { level: 9 });
    const crc = crc32(raw);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(f.store ? 0 : 8, 8);
    lh.writeUInt16LE(now.t, 10); lh.writeUInt16LE(now.dt, 12);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(deflated.length, 18); lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(name.length, 26);
    chunks.push(lh, name, deflated);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(f.store ? 0 : 8, 10); ch.writeUInt16LE(now.t, 12); ch.writeUInt16LE(now.dt, 14);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(deflated.length, 20); ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, name);
    offset += lh.length + name.length + deflated.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...chunks, cd, end]);
}
let TBL = null;
function crc32(buf) {
  if (!TBL) {
    TBL = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      TBL[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = TBL[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* ── 문서 조각 → docx XML ── */
const EMU = 9525;                     /* 1px = 9525 EMU */
const MAXW = 5900000;                 /* 본문 폭 약 15.5cm */

function runsXml(runs, base) {
  return runs.map(function (r) {
    const b = (r.bold || (base && base.bold)) ? '<w:b/>' : '';
    const sz = base && base.sz ? '<w:sz w:val="' + base.sz + '"/><w:szCs w:val="' + base.sz + '"/>' : '';
    const col = base && base.color ? '<w:color w:val="' + base.color + '"/>' : '';
    const fnt = r.code ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/>' : '';
    return '<w:r><w:rPr>' + fnt + b + sz + col + '</w:rPr><w:t xml:space="preserve">' +
      esc(r.text) + '</w:t></w:r>';
  }).join('');
}
function para(runs, opt) {
  opt = opt || {};
  const spacing = '<w:spacing w:before="' + (opt.before || 60) + '" w:after="' + (opt.after || 60) + '"/>';
  const jc = opt.center ? '<w:jc w:val="center"/>' : '';
  const shd = opt.shade ? '<w:shd w:val="clear" w:fill="' + opt.shade + '"/>' : '';
  const bdr = opt.border
    ? '<w:pBdr><w:left w:val="single" w:sz="18" w:space="6" w:color="' + opt.border + '"/></w:pBdr>' : '';
  const ind = opt.indent ? '<w:ind w:left="' + opt.indent + '"/>' : '';
  return '<w:p><w:pPr>' + spacing + jc + shd + bdr + ind + '</w:pPr>' + runsXml(runs, opt) + '</w:p>';
}
function tableXml(rows) {
  const cols = Math.max.apply(null, rows.map(function (r) { return r.length; }));
  const w = Math.floor(9350 / cols);
  const grid = '<w:tblGrid>' + new Array(cols).fill('<w:gridCol w:w="' + w + '"/>').join('') + '</w:tblGrid>';
  const body = rows.map(function (row, ri) {
    const cells = [];
    for (let i = 0; i < cols; i++) {
      const runs = row[i] || [{ text: '' }];
      cells.push('<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' +
        (ri === 0 ? '<w:shd w:val="clear" w:fill="EEF2FF"/>' : '') + '</w:tcPr>' +
        para(runs, { sz: 18, bold: ri === 0, before: 30, after: 30 }) + '</w:tc>');
    }
    return '<w:tr>' + cells.join('') + '</w:tr>';
  }).join('');
  return '<w:tbl><w:tblPr><w:tblW w:w="9350" w:type="dxa"/>' +
    '<w:tblBorders>' + ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) {
      return '<w:' + s + ' w:val="single" w:sz="4" w:color="C9D3E5"/>';
    }).join('') + '</w:tblBorders></w:tblPr>' + grid + body + '</w:tbl>';
}
function imageXml(id, wPx, hPx) {
  let cx = wPx * EMU, cy = hPx * EMU;
  if (cx > MAXW) { cy = Math.round(cy * MAXW / cx); cx = MAXW; }
  return '<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="120" w:after="60"/></w:pPr><w:r><w:drawing>' +
    '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
    '<wp:extent cx="' + cx + '" cy="' + cy + '"/><wp:docPr id="' + id + '" name="그림' + id + '"/>' +
    '<a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData ' +
    'uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic ' +
    'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr>' +
    '<pic:cNvPr id="' + id + '" name="그림' + id + '"/><pic:cNvPicPr/></pic:nvPicPr>' +
    '<pic:blipFill><a:blip r:embed="rId' + (100 + id) + '"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>' +
    '<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + cx + '" cy="' + cy + '"/></a:xfrm>' +
    '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic>' +
    '</wp:inline></w:drawing></w:r></w:p>';
}

/* ── 마크다운 ── */
const mdRuns = (runs) => runs.map(function (r) {
  let t = r.text;
  if (r.code) t = '`' + t + '`';
  else if (r.bold && t.trim()) t = '**' + t.trim() + '**';
  return t;
}).join('').replace(/\s+/g, ' ').trim();

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.goto(SRC, { waitUntil: 'networkidle0', timeout: 120000 });

  const blocks = await page.evaluate(() => {
    const out = [];
    const runs = (el) => {
      const r = [];
      const walk = (n, bold, code) => {
        if (n.nodeType === 3) { if (n.nodeValue.trim()) r.push({ text: n.nodeValue.replace(/\s+/g, ' '), bold: bold, code: code }); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName.toLowerCase();
        if (tag === 'br') { r.push({ text: '\n' }); return; }
        const b = bold || tag === 'b' || tag === 'strong' || n.classList.contains('lbl');
        const c = code || tag === 'code' || tag === 'kbd';
        n.childNodes.forEach(function (x) { walk(x, b, c); });
      };
      walk(el, false, false);
      return r.length ? r : [{ text: el.textContent.replace(/\s+/g, ' ').trim() }];
    };
    const push = (t, o) => out.push(Object.assign({ t: t }, o));

    const cover = document.querySelector('.cover');
    push('title', { runs: runs(cover.querySelector('h1')) });
    push('sub', { runs: runs(cover.querySelector('.eyebrow')) });
    push('p', { runs: runs(cover.querySelector('.lead')) });
    const foot = cover.querySelector('.cover-foot');
    if (foot) push('note', { label: '사이트', runs: runs(foot) });

    const walkNode = (el) => {
      const tag = el.tagName.toLowerCase();
      if (tag === 'h2') return push('h2', { runs: runs(el) });
      if (tag === 'h3') return push('h3', { runs: runs(el) });
      if (tag === 'h4') return push('h4', { runs: runs(el) });
      if (tag === 'p') return push('p', { runs: runs(el) });
      if (tag === 'table') {
        const rows = [...el.querySelectorAll('tr')].map(tr =>
          [...tr.children].map(td => runs(td)));
        return push('table', { rows: rows });
      }
      if (tag === 'ol' || tag === 'ul') {
        return push('list', {
          ordered: tag === 'ol',
          items: [...el.children].map(li => runs(li))
        });
      }
      if (tag === 'figure') {
        el.querySelectorAll('img').forEach(img => push('img', { src: img.src, alt: img.alt }));
        const legend = el.querySelector('ol.legend');
        if (legend) push('list', { ordered: true, items: [...legend.children].map(li => runs(li)) });
        const cap = el.querySelector('figcaption');
        if (cap) push('cap', { runs: runs(cap) });
        return;
      }
      if (el.classList.contains('note')) {
        const lbl = el.querySelector('.lbl');
        const clone = el.cloneNode(true);
        const l2 = clone.querySelector('.lbl'); if (l2) l2.remove();
        return push('note', {
          label: lbl ? lbl.textContent.trim() : '',
          warn: el.classList.contains('warn'), tip: el.classList.contains('tip'),
          runs: runs(clone)
        });
      }
      if (el.classList.contains('flow')) return push('p', {
        runs: [{ text: [...el.querySelectorAll('b')].map(x => x.textContent.trim()).join('  ›  ') }]
      });
      if (tag === 'div' && (el.classList.contains('two') || el.classList.contains('three'))) {
        return el.querySelectorAll('img').forEach(img => push('img', { src: img.src, alt: img.alt }));
      }
      [...el.children].forEach(walkNode);
    };
    document.querySelectorAll('main > section').forEach(sec => [...sec.children].forEach(walkNode));
    return out;
  });
  await browser.close();
  console.log('· 조각 ' + blocks.length + '개를 뽑았습니다');

  /* 그림을 PNG 로 꺼낸다 */
  fs.mkdirSync(IMGDIR, { recursive: true });
  fs.readdirSync(IMGDIR).forEach(f => fs.unlinkSync(path.join(IMGDIR, f)));
  const media = [];
  let n = 0;
  for (const b of blocks) {
    if (b.t !== 'img') continue;
    n++;
    const base64 = b.src.split(',')[1];
    const png = await sharp(Buffer.from(base64, 'base64')).png().toBuffer();
    const meta = await sharp(png).metadata();
    const file = '그림' + String(n).padStart(2, '0') + '.png';
    fs.writeFileSync(path.join(IMGDIR, file), png);
    b.id = n; b.file = file; b.w = meta.width; b.h = meta.height;
    media.push({ id: n, data: png });
  }
  console.log('· 그림 ' + n + '장을 PNG 로 꺼냈습니다');

  /* ── 마크다운 ── */
  const md = [];
  for (const b of blocks) {
    if (b.t === 'title') md.push('# ' + mdRuns(b.runs).replace(/\*\*/g, ''));
    else if (b.t === 'sub') md.push('> ' + mdRuns(b.runs));
    else if (b.t === 'h2') md.push('\n## ' + mdRuns(b.runs));
    else if (b.t === 'h3') md.push('\n### ' + mdRuns(b.runs));
    else if (b.t === 'h4') md.push('\n#### ' + mdRuns(b.runs));
    else if (b.t === 'p') md.push(mdRuns(b.runs));
    else if (b.t === 'cap') md.push('*' + mdRuns(b.runs) + '*');
    else if (b.t === 'note') md.push('> **' + (b.label || '알아둘 것') + '** ' + mdRuns(b.runs));
    else if (b.t === 'list') md.push(b.items.map((it, i) =>
      (b.ordered ? (i + 1) + '. ' : '- ') + mdRuns(it)).join('\n'));
    else if (b.t === 'img') md.push('![' + (b.alt || '') + '](' + encodeURI(NAME + ' 그림/' + b.file) + ')');
    else if (b.t === 'table') {
      const rows = b.rows.map(r => '| ' + r.map(mdRuns).join(' | ') + ' |');
      const sep = '| ' + b.rows[0].map(() => '---').join(' | ') + ' |';
      md.push(rows[0], sep, ...rows.slice(1));
    }
    md.push('');
  }
  fs.writeFileSync(path.join(OUT, NAME + '.md'), md.join('\n').replace(/\n{3,}/g, '\n\n'), 'utf8');
  console.log('생성: ' + NAME + '.md');

  /* ── docx ── */
  const body = [];
  for (const b of blocks) {
    if (b.t === 'title') body.push(para(b.runs, { sz: 64, bold: true, before: 0, after: 120 }));
    else if (b.t === 'sub') body.push(para(b.runs, { sz: 20, color: '2B8FD6', before: 0, after: 240 }));
    else if (b.t === 'h2') body.push(para(b.runs, { sz: 40, bold: true, before: 400, after: 140 }));
    else if (b.t === 'h3') body.push(para(b.runs, { sz: 28, bold: true, before: 280, after: 100 }));
    else if (b.t === 'h4') body.push(para(b.runs, { sz: 24, bold: true, before: 200, after: 80 }));
    else if (b.t === 'p') body.push(para(b.runs, { sz: 20 }));
    else if (b.t === 'cap') body.push(para(b.runs, { sz: 18, color: '8494AD', center: true }));
    else if (b.t === 'note') body.push(para(
      [{ text: (b.label || '알아둘 것') + '  ', bold: true }].concat(b.runs),
      { sz: 19, shade: b.warn ? 'FDECEC' : (b.tip ? 'EAF7F0' : 'F2F6FC'),
        border: b.warn ? 'D9342B' : (b.tip ? '1A8F60' : '4F46E5'), indent: 120 }));
    else if (b.t === 'list') b.items.forEach((it, i) => body.push(para(
      [{ text: (b.ordered ? (i + 1) + '. ' : '· '), bold: true }].concat(it),
      { sz: 20, indent: 220, before: 30, after: 30 })));
    else if (b.t === 'img') body.push(imageXml(b.id, b.w, b.h));
    else if (b.t === 'table') body.push(tableXml(b.rows), para([{ text: '' }], { sz: 8 }));
  }

  const rels = media.map(m =>
    '<Relationship Id="rId' + (100 + m.id) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/img' + m.id + '.png"/>').join('');
  const doc =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ' +
    'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing">' +
    '<w:body>' + body.join('') +
    '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="720" w:footer="720"/>' +
    '</w:sectPr></w:body></w:document>';

  const files = [
    { name: '[Content_Types].xml', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
      '</Types>' },
    { name: '_rels/.rels', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>' },
    { name: 'word/_rels/document.xml.rels', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      rels + '</Relationships>' },
    { name: 'word/styles.xml', data:
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="맑은 고딕" w:eastAsia="맑은 고딕" w:hAnsi="맑은 고딕"/>' +
      '<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>' },
    { name: 'word/document.xml', data: doc }
  ];
  media.forEach(m => files.push({ name: 'word/media/img' + m.id + '.png', data: m.data }));

  const buf = zip(files);
  fs.writeFileSync(path.join(OUT, NAME + '.docx'), buf);
  console.log('생성: ' + NAME + '.docx  ' + (buf.length / 1024 / 1024).toFixed(2) + 'MB');
})();

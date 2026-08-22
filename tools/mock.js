/* Apps Script 런타임을 흉내 내는 최소 목(mock) */
const crypto = require('crypto');

function makeSheet(name) {
  return {
    _name: name,
    _d: [],                                  // 2차원 배열
    getName() { return this._name; },
    clear() { this._d = []; return this; },
    getLastRow() {
      let last = 0;
      this._d.forEach((row, i) => {
        if (row && row.some(c => c !== '' && c !== null && c !== undefined)) last = i + 1;
      });
      return last;
    },
    getLastColumn() { return Math.max(0, ...this._d.map(r => (r ? r.length : 0))); },
    setFrozenRows() { return this; },
    autoResizeColumns() { return this; },
    deleteRow(r) { this._d.splice(r - 1, 1); return this; },
    getRange(r, c, nr, nc) {
      nr = nr || 1; nc = nc || 1;
      const sh = this;
      const R = {
        setValues(vals) {
          for (let i = 0; i < nr; i++) {
            if (!sh._d[r - 1 + i]) sh._d[r - 1 + i] = [];
            for (let j = 0; j < nc; j++) sh._d[r - 1 + i][c - 1 + j] = vals[i][j];
          }
          return R;
        },
        getValues() {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = [];
            for (let j = 0; j < nc; j++) {
              const v = sh._d[r - 1 + i] ? sh._d[r - 1 + i][c - 1 + j] : '';
              row.push(v === undefined || v === null ? '' : v);
            }
            out.push(row);
          }
          return out;
        },
        setValue(v) { return R.setValues([[v]]); },
        getValue() { return R.getValues()[0][0]; },
        clearContent() {
          for (let i = 0; i < nr; i++) {
            if (!sh._d[r - 1 + i]) continue;
            for (let j = 0; j < nc; j++) sh._d[r - 1 + i][c - 1 + j] = '';
          }
          return R;
        },
        setFontWeight() { return R; },
        setBackground() { return R; },
        setFontColor() { return R; }
      };
      return R;
    }
  };
}

const STORE = {};
function makeSS(id, name) {
  const ss = {
    _id: id, _name: name, _sheets: [makeSheet('Sheet1')],
    getId() { return this._id; },
    getUrl() { return 'https://docs.google.com/spreadsheets/d/' + this._id; },
    getName() { return this._name; },
    getSheets() { return this._sheets; },
    getSheetByName(n) { return this._sheets.find(s => s._name === n) || null; },
    insertSheet(n) { const s = makeSheet(n); this._sheets.push(s); return s; },
    deleteSheet(s) { this._sheets = this._sheets.filter(x => x !== s); }
  };
  STORE[id] = ss;
  return ss;
}

let seq = 0;
global.SpreadsheetApp = {
  create(name) { return makeSS('SHEET_' + (++seq), name); },
  openById(id) {
    // 실제 구글 시트가 이미 존재하는 상황을 흉내 낸다
    if (!STORE[id]) makeSS(id, '스마트 점핑');
    return STORE[id];
  },
  // 바인딩되지 않은 독립 스크립트를 흉내 (getActiveSpreadsheet 는 null)
  getActiveSpreadsheet() { return null; }
};

const PROPS = {};
global.PropertiesService = {
  getScriptProperties() {
    return {
      getProperty: k => (k in PROPS ? PROPS[k] : null),
      setProperty: (k, v) => { PROPS[k] = v; },
      deleteProperty: k => { delete PROPS[k]; }
    };
  }
};

global.Utilities = {
  DigestAlgorithm: { SHA_256: 'SHA-256' },
  Charset: { UTF_8: 'utf8' },
  computeDigest(alg, text) {
    const buf = crypto.createHash('sha256').update(String(text), 'utf8').digest();
    return Array.from(buf).map(b => (b > 127 ? b - 256 : b));
  },
  formatDate(d, tz, fmt) {
    const p = n => ('0' + n).slice(-2);
    return fmt
      .replace('yyyy', d.getFullYear())
      .replace('MM', p(d.getMonth() + 1))
      .replace('dd', p(d.getDate()))
      .replace('HH', p(d.getHours()))
      .replace('mm', p(d.getMinutes()))
      .replace('ss', p(d.getSeconds()));
  }
};

const LOGS = [];
global.Logger = { log: m => LOGS.push(String(m)) };
global.__LOGS = LOGS;

const CACHE = {};
global.CacheService = {
  getScriptCache() {
    return {
      get: k => (k in CACHE ? CACHE[k] : null),
      put: (k, v) => { CACHE[k] = v; },
      removeAll: ks => ks.forEach(k => delete CACHE[k])
    };
  }
};

global.LockService = {
  getScriptLock() { return { waitLock() {}, releaseLock() {} }; }
};

global.HtmlService = {
  createTemplateFromFile: () => ({ evaluate: () => ({ setTitle: () => ({ addMetaTag: () => ({ setXFrameOptionsMode: () => ({}) }) }) }) }),
  createHtmlOutputFromFile: () => ({ getContent: () => '' }),
  XFrameOptionsMode: { ALLOWALL: 1 }
};

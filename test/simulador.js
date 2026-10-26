// Simulación mínima de Google Sheets / Apps Script para probar Codigo.gs con Node.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function colANum(letras) { return letras.split('').reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0); }
function a1(ref) {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(ref);
  const f = +m[2], c = colANum(m[1]);
  return m[3] ? [f, c, +m[4] - f + 1, colANum(m[3]) - c + 1] : [f, c, 1, 1];
}

class Hoja {
  constructor(nombre) { this.nombre = nombre; this.celdas = []; this.links = {}; }
  getName() { return this.nombre; }
  get(f, c) { return (this.celdas[f - 1] || [])[c - 1] ?? ''; }
  set(f, c, v) { (this.celdas[f - 1] = this.celdas[f - 1] || [])[c - 1] = v; }
  getLastRow() {
    for (let f = this.celdas.length; f > 0; f--) if ((this.celdas[f - 1] || []).some(v => v !== '' && v !== undefined)) return f; // FALSE de una casilla cuenta, como en Sheets
    return 0;
  }
  getLastColumn() { return Math.max(0, ...this.celdas.map(r => (r || []).length)); }
  getRange(f, c, nf, nc) {
    if (typeof f === 'string') [f, c, nf, nc] = a1(f);
    return new Rango(this, f, c, nf || 1, nc || 1);
  }
  deleteRow(f) { this.celdas.splice(f - 1, 1); }
  clear() { this.celdas = []; this.links = {}; return this; }
  setFrozenRows() { return this; }
  setColumnWidth() { return this; }
  autoResizeColumns() { return this; }
  valores() { return this.celdas.map(r => Array.from(r || [], v => v ?? '')); }
}

class Rango {
  constructor(h, f, c, nf, nc) { Object.assign(this, { h, f, c, nf, nc }); }
  getValue() { return this.h.get(this.f, this.c); }
  getValues() {
    return Array.from({ length: this.nf }, (_, i) => Array.from({ length: this.nc }, (_, j) => this.h.get(this.f + i, this.c + j)));
  }
  setValue(v) { this.h.set(this.f, this.c, v); return this; }
  setValues(vs) {
    if (vs.length !== this.nf || vs.some(r => r.length !== this.nc)) throw new Error('Tamaño de setValues incorrecto');
    vs.forEach((r, i) => r.forEach((v, j) => this.h.set(this.f + i, this.c + j, v)));
    return this;
  }
  setRichTextValues(vs) {
    vs.forEach((r, i) => r.forEach((v, j) => { this.h.set(this.f + i, this.c + j, v.text); this.h.links[(this.f + i) + ',' + (this.c + j)] = v.url; }));
    return this;
  }
  insertCheckboxes() {
    for (let i = 0; i < this.nf; i++) for (let j = 0; j < this.nc; j++) {
      if (this.h.get(this.f + i, this.c + j) === '') this.h.set(this.f + i, this.c + j, false);
    }
    return this;
  }
}
for (const m of ['setNumberFormat', 'setFontWeight', 'setFontSize', 'setFontStyle', 'setBackground', 'setBackgrounds']) {
  Rango.prototype[m] = function () { return this; };
}

class Libro {
  constructor() { this.hojas = [new Hoja('Hoja 1')]; }
  getId() { return 'LIBRO123'; }
  getSpreadsheetTimeZone() { return 'America/Montevideo'; }
  getSheetByName(n) { return this.hojas.find(h => h.nombre === n) || null; }
  insertSheet(n) { const h = new Hoja(n); this.hojas.push(h); return h; }
  getSheets() { return this.hojas.slice(); }
  deleteSheet(h) { this.hojas = this.hojas.filter(x => x !== h); }
}

function pad(n) { return String(n).padStart(2, '0'); }

function crearEntorno(opciones = {}) {
  const libro = new Libro();
  const dialogos = [];
  const respuestasUi = opciones.respuestasUi || [];
  const props = {};
  const cache = {};
  const creados = [];
  const ctx = {
    console,
    SpreadsheetApp: {
      create: (nombre) => {
        const h = new Hoja('Hoja 1');
        h.setName = (n) => { h.nombre = n; return h; };
        const id = 'NUEVO' + creados.length;
        creados.push({ nombre, hoja: h, id });
        return { getId: () => id, getSheets: () => [h] };
      },
      getActiveSpreadsheet: () => libro,
      openById: () => libro,
      newRichTextValue() {
        const v = { text: '', url: null };
        const b = { setText(t) { v.text = t; return b; }, setLinkUrl(u) { v.url = u; return b; }, build: () => v };
        return b;
      },
      getUi: () => ({
        ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
        Button: { YES: 'YES', NO: 'NO' },
        alert: (...a) => { dialogos.push(a); return respuestasUi.shift() || 'YES'; },
        showModalDialog: (html, titulo) => dialogos.push([titulo, html.contenido]),
        createMenu: () => { const m = { addItem: () => m, addSeparator: () => m, addToUi: () => m }; return m; }
      })
    },
    HtmlService: {
      createHtmlOutput: (contenido) => { const o = { contenido, setWidth: () => o, setHeight: () => o, setTitle: () => o }; return o; }
    },
    ContentService: {
      MimeType: { JSON: 'JSON', JAVASCRIPT: 'JAVASCRIPT' },
      createTextOutput: (texto) => { const o = { texto, setMimeType: () => o }; return o; }
    },
    PropertiesService: { getScriptProperties: () => ({ setProperty: (k, v) => { props[k] = v; }, getProperty: (k) => props[k] }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    DriveApp: {
      createFolder: (n) => ({ getUrl: () => 'https://drive.google.com/carpeta/' + encodeURIComponent(n) }),
      getFileById: () => ({ moveTo() {} })
    },
    CacheService: { getScriptCache: () => ({ get: (k) => cache[k] ?? null, put: (k, v) => { cache[k] = v; } }) },
    Utilities: {
      formatDate: (d, tz, f) => {
        const s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        if (f === 'dd-MM HH.mm') return pad(d.getDate()) + '-' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + '.' + pad(d.getMinutes());
        if (f !== 'yyyy-MM-dd') throw new Error('formato no simulado: ' + f);
        return s;
      },
      getUuid: () => require('crypto').randomUUID()
    }
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Codigo.gs'), 'utf8'), ctx, { filename: 'Codigo.gs' });
  return { ctx, libro, dialogos, creados, hoja: (n) => libro.getSheetByName(n) };
}

module.exports = { crearEntorno };

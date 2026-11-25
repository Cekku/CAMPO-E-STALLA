// DOMParser minimo per le prove in Node (nel browser c'è quello vero): legge XML ben formato, come le fatture
// elettroniche, con quello che usa js/conti/fatture-parse.js: documentElement, childNodes, nodeType, nodeName,
// localName, textContent, getElementsByTagName. Un XML rotto dà un documento con <parsererror>, come Firefox.
// Niente librerie: le prove girano anche su GitHub senza npm install.

class Testo {
  constructor(t) { this.nodeType = 3; this.nodeName = '#text'; this.textContent = t; this.childNodes = []; }
}
class Elemento {
  constructor(nome, attributi = {}) {
    this.nodeType = 1; this.nodeName = this.tagName = nome; this.localName = nome.split(':').pop();
    this.attributi = attributi; this.childNodes = [];
  }
  get textContent() { return this.childNodes.map(n => n.textContent).join(''); }
  getAttribute(n) { return n in this.attributi ? this.attributi[n] : null; }
  getElementsByTagName(nome) {
    const out = [];
    const giro = el => { for (const n of el.childNodes) if (n.nodeType === 1) { if (nome === '*' || n.nodeName === nome) out.push(n); giro(n); } };
    giro(this); return out;
  }
}
class Documento {
  constructor(radice) { this.nodeType = 9; this.documentElement = radice; this.childNodes = [radice]; }
  getElementsByTagName(nome) { const r = this.documentElement; return [...(nome === '*' || r.nodeName === nome ? [r] : []), ...r.getElementsByTagName(nome)]; }
}

const ENT = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function entita(s) {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);|&/g, (m, e) => {
    if (!e) throw new Error('& senza entità');
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (!(e in ENT)) throw new Error('entità sconosciuta &' + e + ';');
    return ENT[e];
  });
}

function analizza(txt) {
  txt = txt.replace(/^﻿/, '');
  const pila = []; let radice = null, i = 0;
  const NOME = /[A-Za-z_][\w.:-]*/y;
  while (i < txt.length) {
    if (txt[i] !== '<') {
      const j = txt.indexOf('<', i); const pezzo = txt.slice(i, j < 0 ? txt.length : j);
      if (pila.length) pila[pila.length - 1].childNodes.push(new Testo(entita(pezzo)));
      else if (pezzo.trim()) throw new Error('testo fuori dalla radice');
      i = j < 0 ? txt.length : j; continue;
    }
    if (txt.startsWith('<?', i)) { const j = txt.indexOf('?>', i); if (j < 0) throw new Error('<? non chiuso'); i = j + 2; continue; }
    if (txt.startsWith('<!--', i)) { const j = txt.indexOf('-->', i); if (j < 0) throw new Error('commento non chiuso'); i = j + 3; continue; }
    if (txt.startsWith('<![CDATA[', i)) {
      const j = txt.indexOf(']]>', i); if (j < 0 || !pila.length) throw new Error('CDATA non valido');
      pila[pila.length - 1].childNodes.push(new Testo(txt.slice(i + 9, j))); i = j + 3; continue;
    }
    if (txt.startsWith('<!', i)) { const j = txt.indexOf('>', i); if (j < 0) throw new Error('<! non chiuso'); i = j + 1; continue; }
    if (txt[i + 1] === '/') {
      NOME.lastIndex = i + 2; const m = NOME.exec(txt); const j = txt.indexOf('>', i);
      const el = pila.pop();
      if (!m || !el || el.nodeName !== m[0] || j < 0 || txt.slice(NOME.lastIndex, j).trim()) throw new Error('chiusura sbagliata vicino a ' + txt.slice(i, i + 30));
      i = j + 1; continue;
    }
    NOME.lastIndex = i + 1; const m = NOME.exec(txt); if (!m) throw new Error('nome mancante');
    let k = NOME.lastIndex; const attr = {};
    const ATTR = /\s+([A-Za-z_][\w.:-]*)\s*=\s*("([^"]*)"|'([^']*)')/y;
    for (;;) { ATTR.lastIndex = k; const a = ATTR.exec(txt); if (!a) break; attr[a[1]] = entita(a[3] ?? a[4]); k = ATTR.lastIndex; }
    const fine = /\s*(\/?)>/y; fine.lastIndex = k; const f = fine.exec(txt); if (!f) throw new Error('etichetta non chiusa: ' + m[0]);
    const el = new Elemento(m[0], attr);
    if (pila.length) pila[pila.length - 1].childNodes.push(el);
    else if (radice) throw new Error('due radici'); else radice = el;
    if (!f[1]) pila.push(el);
    i = fine.lastIndex;
  }
  if (pila.length) throw new Error('etichetta non chiusa: ' + pila[pila.length - 1].nodeName);
  if (!radice) throw new Error('documento vuoto');
  return radice;
}

export class DOMParser {
  parseFromString(txt) {
    try { return new Documento(analizza(String(txt))); }
    catch (e) { const el = new Elemento('parsererror'); el.childNodes.push(new Testo(e.message)); return new Documento(el); }
  }
}

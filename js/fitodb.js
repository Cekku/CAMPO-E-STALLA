// Banca dati dei prodotti fitosanitari del Ministero della Salute: arriva da sola con l'app (data/fitosanitari.json,
// con il numero dell'ultima etichetta) oppure da un file open data CSV caricato dall'utente.
// Resta solo su questo dispositivo: serve a compilare le schede prodotto e a segnalare prodotti revocati o scaduti.
import { bus } from './state.js';
import { today } from './util.js';

const DBN = 'ces-fito';
let db = null; const mem = new Map(); export const fitoMeta = { n: 0, at: null, ready: false };

function open() {
  return new Promise((res, rej) => { const r = indexedDB.open(DBN, 1); r.onupgradeneeded = () => { r.result.createObjectStore('p', { keyPath: 'nReg' }); r.result.createObjectStore('meta'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export async function initFito() {
  try {
    db = await open();
    const t = db.transaction(['p', 'meta'], 'readonly');
    const [all, at] = await Promise.all([req(t.objectStore('p').getAll()), req(t.objectStore('meta').get('at'))]);
    all.forEach(x => mem.set(normReg(x.nReg), x)); fitoMeta.n = mem.size; fitoMeta.at = at || null;
    fitoMeta.versione = (await req(db.transaction('meta', 'readonly').objectStore('meta').get('versione'))) || '';
  } catch (e) { console.warn('banca dati fitofarmaci non disponibile', e); }
  fitoMeta.ready = true; bus.render();
  autoFito();
}

// Elenco già pronto pubblicato con l'app (data/fitosanitari.json, fatto da strumenti/fitosanitari/scarica_fitosanitari.py):
// si carica da solo quando è più nuovo di quello sul dispositivo.
async function autoFito() {
  if (!db || !navigator.onLine) return;
  const oggi = today(); let k = null;
  try { k = localStorage.getItem('ces.fito.ctl'); } catch (e) { }
  if (k === oggi && fitoMeta.n) return; // al massimo un controllo al giorno
  try {
    if (await req(db.transaction('meta', 'readonly').objectStore('meta').get('spento'))) return; // tolta a mano: non torna da sola
    try { localStorage.setItem('ces.fito.ctl', oggi); } catch (e) { }
    const r = await fetch('data/fitosanitari.json', { cache: 'no-cache' }); if (!r.ok) return;
    const j = await r.json(); if (!j || !Array.isArray(j.prodotti) || !j.prodotti.length) return;
    // stessa versione, o elenco del dispositivo di un giorno più recente (es. CSV caricato a mano): resta quello.
    // Un elenco rifatto lo stesso giorno (più etichette) si carica.
    const v = String(fitoMeta.versione || ''), a = String(j.aggiornato || '');
    if (v && (v === a || v.slice(0, 10) > a.slice(0, 10))) return;
    const T = today();
    await salva(j.prodotti.map(x => Object.assign(x, { revocato: fuori(x, T) })), j.aggiornato);
  } catch (e) { console.warn('aggiornamento della banca dati fitofarmaci non riuscito', e); }
}
const fuori = (x, T) => /revoc|sospes|non autorizz|ritirat|scadut/i.test(x.stato || '') || (!!x.scadenza && x.scadenza < T) ? 1 : 0;
async function salva(list, versione) {
  if (!db) db = await open();
  await new Promise((res, rej) => {
    const t = db.transaction(['p', 'meta'], 'readwrite'); const st = t.objectStore('p'); st.clear(); list.forEach(x => st.put(x));
    const m = t.objectStore('meta'); m.put(new Date().toISOString(), 'at'); m.put(versione, 'versione'); m.delete('spento');
    t.oncomplete = res; t.onerror = () => rej(t.error);
  });
  mem.clear(); indice = null; list.forEach(x => mem.set(normReg(x.nReg), x)); fitoMeta.n = mem.size; fitoMeta.at = new Date().toISOString(); fitoMeta.versione = versione; bus.render();
}
// Ultima etichetta autorizzata sul sito del Ministero (PDF)
export const etichettaUrl = x => x && x.etichetta && x.etichetta.id ? 'https://www.fitosanitari.salute.gov.it/fitosanitariws_new/EtichettaServlet?id=' + encodeURIComponent(x.etichetta.id) : '';

const normReg = s => { const d = String(s || '').replace(/\D/g, ''); return d ? d.replace(/^0+/, '') || '0' : ''; };
export function fitoLookup(nReg) { const k = normReg(nReg); return k ? mem.get(k) || null : null; }
export function fitoSearch(q, max = 30) {
  const n = String(q || '').toLowerCase().trim(); if (n.length < 2) return [];
  const reg = normReg(n); const out = [];
  for (const x of mem.values()) {
    if ((reg && (normReg(x.nReg) === reg || (reg.length >= 3 && normReg(x.nReg).startsWith(reg)))) || x.nome.toLowerCase().includes(n) || (x.sostanze || '').toLowerCase().includes(n)) { out.push(x); if (out.length >= 300) break; }
  }
  return out.sort((a, b) => (a.revocato - b.revocato) || (a.nome.toLowerCase().startsWith(n) ? -1 : 0) - (b.nome.toLowerCase().startsWith(n) ? -1 : 0) || a.nome.localeCompare(b.nome)).slice(0, max);
}

// Lettura CSV con separatore ; o , e campi tra virgolette
export function parseCSV(text) {
  const first = text.split(/\r?\n/, 1)[0] || '';
  const sep = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : (first.includes('\t') ? '\t' : ',');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === sep) { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x.trim() !== '')) rows.push(row); row = []; }
    else cur += ch;
  }
  row.push(cur); if (row.some(x => x.trim() !== '')) rows.push(row);
  return rows;
}
export function decode(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, ''); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
// Date in formato gg/mm/aaaa, aaaa-mm-gg o aaaammgg
export function isoDate(s) {
  s = String(s || '').trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/))) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return y + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return m[1] + '-' + m[2] + '-' + m[3];
  return '';
}

export async function importFito(file) {
  const rows = parseCSV(decode(await file.arrayBuffer()));
  if (rows.length < 2) throw new Error('Il file è vuoto o non è un CSV.');
  const H = rows[0].map(h => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim());
  const col = (...res) => { for (const re of res) { const i = H.findIndex(h => re.test(h)); if (i >= 0) return i; } return -1; };
  const iReg = col(/numero.?reg|n.?reg|registraz.*num|^registrazione$/, /registraz/);
  const iNome = col(/^prodotto$|nome.?prodotto|denominazione.?prodotto|prodotto.?fitosanitario|^denominazione$/, /prodotto/);
  const iImp = col(/impresa|titolare|ditta|societa/);
  const iScad = col(/scadenza/);
  const iStato = col(/stato/);
  const iSost = col(/sostanz/);
  const iAtt = col(/attivita/);
  const iForm = col(/formulazion/);
  const iData = col(/data.?reg/);
  if (iReg < 0 || iNome < 0) throw new Error('Non trovo le colonne "numero di registrazione" e "prodotto": usa il file CSV dei prodotti fitosanitari del Ministero.');
  const T = today(); const by = new Map();
  for (const r of rows.slice(1)) {
    const reg = normReg(r[iReg]); if (!reg) continue;
    const x = by.get(reg) || { nReg: String(r[iReg]).trim(), nome: String(r[iNome] || '').trim(), impresa: iImp >= 0 ? String(r[iImp] || '').trim() : '', scadenza: iScad >= 0 ? isoDate(r[iScad]) : '', stato: iStato >= 0 ? String(r[iStato] || '').trim() : '', sostanze: '', attivita: iAtt >= 0 ? String(r[iAtt] || '').trim() : '', formulazione: iForm >= 0 ? String(r[iForm] || '').trim() : '', dataReg: iData >= 0 ? isoDate(r[iData]) : '' };
    if (iSost >= 0) { const s = String(r[iSost] || '').trim(); if (s && !x.sostanze.toLowerCase().split(', ').includes(s.toLowerCase())) x.sostanze = x.sostanze ? x.sostanze + ', ' + s : s; }
    by.set(reg, x);
  }
  const list = [...by.values()].map(x => { const v = fitoLookup(x.nReg); return Object.assign(x, { revocato: fuori(x, T) }, v && v.etichetta ? { etichetta: v.etichetta } : {}); });
  if (!list.length) throw new Error('Nessun prodotto trovato nel file.');
  await salva(list, T);
  return list.length;
}
export async function clearFito() {
  if (!db) return; await new Promise(res => { const t = db.transaction(['p', 'meta'], 'readwrite'); t.objectStore('p').clear(); t.objectStore('meta').clear(); t.objectStore('meta').put(true, 'spento'); t.oncomplete = res; });
  mem.clear(); indice = null; fitoMeta.n = 0; fitoMeta.at = null; fitoMeta.versione = ''; bus.render();
}

// Abbinamento per nome di un prodotto del magazzino (spesso il nome viene dalla riga di una fattura,
// es. "MICROTHIOL DISPERSS KG 10 - SACCO") a un prodotto della banca dati. Un prodotto della banca dati è candidato
// se tutte le parole del suo nome sono nel nome del prodotto (in qualsiasi ordine). Vince il nome più lungo, anche se
// revocato; a pari lunghezza l'unico ancora autorizzato. Se il nome più lungo è di più prodotti diversi
// (stesso nome, ditte diverse) non si abbina niente: meglio nessun abbinamento che uno sbagliato.
const parole = s => String(s || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
const CONF = new Set('KG G GR L LT LITRI ML CC CONF CONFEZIONE PZ X SACCO SACCHI TANICA TANICHE FL FLACONE BOTTIGLIA BARATTOLO SECCHIO FUSTO BIDONE CF NR N DA'.split(' '));
let indice = null; // si rifà a ogni cambio della banca dati (salva, clearFito)
const senzaConf = t => t.filter(w => !/^\d/.test(w) && !CONF.has(w)).join(' ').length;
function indiceNomi() {
  if (indice) return indice;
  indice = new Map();
  for (const x of mem.values()) {
    const t = [...new Set(parole(x.nome))]; if (!t.length) continue; const c = { t, x, len: t.join(' ').length, sig: senzaConf(t) };
    t.forEach(w => { const l = indice.get(w) || []; l.push(c); indice.set(w, l); });
  }
  return indice;
}
export function fitoAbbina(nome) {
  const P = new Set(parole(nome)); if (!P.size || !mem.size) return null;
  const idx = indiceNomi(), visti = new Set(), cand = [];
  for (const w of P) for (const c of idx.get(w) || []) { if (visti.has(c)) continue; visti.add(c); if (c.t.every(v => P.has(v))) cand.push(c); }
  // nomi corti ("RAME", "LUMAX") solo se sono tutto il nome, tolti numeri e confezioni ("LUMAX KG 5")
  // (numeri e confezioni non contano: "CF 125" o "TOP 90" non bastano a dire che è quel prodotto)
  const tutto = senzaConf([...P]);
  const ok = cand.filter(c => c.sig >= 6 || (c.sig > 0 && c.sig === tutto)); if (!ok.length) return null;
  // vince il nome più lungo anche se revocato (una giacenza vecchia non prende il numero di un altro prodotto);
  // a pari lunghezza l'unico ancora autorizzato, altrimenti nessuno
  const best = Math.max(...ok.map(c => c.len)); let hit = ok.filter(c => c.len === best);
  if (hit.length > 1) hit = hit.filter(c => !c.x.revocato);
  return hit.length === 1 ? hit[0].x : null;
}

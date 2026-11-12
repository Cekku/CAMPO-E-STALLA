// Conti → In sospeso: tutte le cose aperte in un posto solo (fatture da classificare o da verificare, fatture mancanti,
// documenti senza originale, pagamenti delle fatture non trovati in banca, personale, conto economico incompleto,
// dati tecnici mancanti). Solo lettura: dove l'app può sistemare da sola prepara una proposta con prima e dopo,
// che si applica solo dopo la conferma del titolare.
import { S } from '../state.js';
import * as store from '../store.js';
import { N, today } from '../util.js';
import { fatture, righe, cfg, anniFatture, anniBilancio, calc, bilancio, datiTecnici, plvAnno, DA_CLASSIFICARE } from './dati.js';
import { elenchi, confronta } from './elenco.js';
import { statoPagamento } from './banca.js';
import { anomalie } from './paghe.js';
import { proposte as proposteSistema } from './sistema.js';
import { calcolaCe } from './bilancino-parse.js';
import { CE } from './schema.js';
import { perFile } from './originali.js';

const r2 = v => Math.round(v * 100) / 100;
const ok = f => String(f.controllo || '').startsWith('OK');
const meseDi = d => String(d || '').slice(0, 7);

/* ---------------- conti del bilancino che sembrano alimenti ma sono su un'altra riga ---------------- */
// Riga 30 del conto economico = "Mangimi e foraggi acquistati"
export const RIGA_ALIMENTI = 30;
const SEMBRA_ALIMENTO = /ZOOTECN|MANGIM|FORAGG|FIENO|PAGLI|INSILAT|MATERIE\s+PRIME|MAT\.?\s*PRIME|INTEGRAT|NUCLE[OI]|MINERAL|ALIMENT[AI]\s+(ZOOT|BESTIAM|ANIMAL|PER)|ALIMENTI\b|SOIA|FARIN|POLP[AE]|CRUSC|SOSTITUT\w*\s+DEL\s+LATTE|LATTE\s+IN\s+POLVERE|ERBA\s+MEDICA|CEREALI\s+PER/;
const NON_ALIMENTO = /ACQUA|ENERG|ELETTR|CARBUR|GASOL|ASSICUR|NOLEGG|RIMANENZ|VARIAZION|RICAVI|VENDIT|PRESTAZ|SERVIZ|TRASPORT|MANUTENZ/;
export const nomeRiga = r => (CE.find(x => x.row === r && x.l) || {}).l || (r == null ? 'nessuna voce' : 'riga ' + r);
/** [{ conto, descrizione, importo, riga, criterio, anno }] per l'anno y. */
export function contiAlimenti(y) {
  const b = bilancio(y); if (!b || !b.bilancino || !b.bilancino.dati) return [];
  const { conti } = calcolaCe(b.bilancino.dati, cfg().contiUtente || {});
  const per = new Map();
  for (const c of conti) {
    if (c.sezione !== 'COSTI' || c.riga === RIGA_ALIMENTI || !(N(c.importo) > 0)) continue;
    const d = String(c.descrizione || '').toUpperCase();
    if (!SEMBRA_ALIMENTO.test(d) || NON_ALIMENTO.test(d)) continue;
    const k = c.chiave + '|' + c.riga; const x = per.get(k) || { conto: c.chiave, codice: c.conto, descrizione: c.descrizione, importo: 0, riga: c.riga, criterio: c.criterio, anno: y };
    x.importo = r2(x.importo + N(c.importo)); per.set(k, x);
  }
  return [...per.values()].sort((a, b) => b.importo - a.importo);
}
/** Sposta i conti (o i singoli dettagli, chiave "conto|dettaglio") sulla riga degli alimenti e ricalcola i bilancini. */
export async function applicaAlimenti(codici) {
  if (!codici.length) return 0;
  const cu = Object.assign({}, cfg().contiUtente || {}); codici.forEach(c => { cu[c] = RIGA_ALIMENTI; });
  await store.put('econfig', 'cfg', Object.assign({}, cfg(), { contiUtente: cu }));
  const { riabbinaBilancino } = await import('./importa.js');
  for (const y of anniBilancio()) await riabbinaBilancino(y);
  return codici.length;
}

/* ---------------- pagamenti delle fatture non trovati nei movimenti della banca ---------------- */
/** Mesi coperti dai movimenti della banca caricati (estratti conto, contabili, pagamenti abbinati). */
export function mesiBanca() {
  const m = new Set();
  S.pagamenti.forEach(p => { if (p.fonte && p.data) m.add(meseDi(p.data)); });
  S.econfig.forEach(x => { if (x.tipo === 'banca' && x.data) m.add(meseDi(x.data)); });
  S.fatture.forEach(f => (f.pagamentiBanca || []).forEach(p => { if (p.data) m.add(meseDi(p.data)); }));
  m.delete(''); return m;
}
/** Fatture che dovevano passare dalla banca in un mese di cui hai caricato i movimenti, ma non sono abbinate a nessun movimento. */
export function nonAbbinate() {
  const mesi = mesiBanca(); if (!mesi.size) return { mesi, righe: [] };
  const ultimo = [...mesi].sort().pop();
  const out = [];
  for (const f of S.fatture) {
    if (!(Math.abs(N(f.totale)) > 0) || N(f.totale) < 0 || /MP01|contant/i.test(f.pagamento || '')) continue;
    const st = statoPagamento(f); if (st.stato === 'pagata') continue;
    const atteso = meseDi(f.scadenza && f.scadenza >= (f.data || '') ? f.scadenza : f.data);
    if (!mesi.has(atteso) || atteso >= ultimo) continue; // il mese dopo l'ultimo estratto potrebbe ancora arrivare
    out.push({ f, residuo: st.residuo, stato: st.stato, atteso });
  }
  return { mesi, righe: out.sort((a, b) => (a.f.data || '').localeCompare(b.f.data || '')) };
}

/* ---------------- tutto quello che è in sospeso ---------------- */
/** Gruppi di voci: [{ id, titolo, icn, voci: [{ liv: 'err'|'warn'|'info', t, s, n, go: { sub, f, v, anno } }] }] */
export function sospesi() {
  const G = [];
  const add = (id, titolo, icn, voci) => { const v = voci.filter(Boolean); if (v.length) G.push({ id, titolo, icn, voci: v }); };
  const oggi = today(); const annoOggi = +oggi.slice(0, 4);
  const anni = [...new Set([...anniFatture(), ...anniBilancio()])].filter(y => y && y <= annoOggi).sort((a, b) => b - a);
  const fs = fatture(); const rs = righe();

  // fatture
  const voF = [];
  const pSis = proposteSistema();
  if (pSis.n) voF.push({ liv: 'err', t: pSis.n === 1 ? '1 correzione da approvare nelle fatture salvate' : `${pSis.n} correzioni da approvare nelle fatture salvate`, s: 'Righe finite per errore in "Animali domestici" e autofatture fra le vendite: prima e dopo, poi conferma.', n: pSis.n, go: { sub: 'sistema' } });
  for (const y of anni) {
    const dc = rs.filter(r => r.anno === y && r.categoria === DA_CLASSIFICARE); const dv = fs.filter(f => f.anno === y && !ok(f));
    if (dc.length) voF.push({ liv: 'warn', t: `${y}: ${dc.length === 1 ? '1 riga' : dc.length + ' righe'} "Da classificare"`, s: `${eur(dc.reduce((t, r) => t + N(r.importo), 0))} contano come spese varie finché non scegli la categoria.`, n: dc.length, go: { sub: 'fatture', f: 'cf_stato', v: 'daclass', anno: y } });
    if (dv.length) voF.push({ liv: 'warn', t: `${y}: ${dv.length === 1 ? '1 fattura' : dv.length + ' fatture'} da verificare`, s: 'La somma delle righe non torna con l\'imponibile: di solito una fattura PDF letta male. Apri l\'originale o carica l\'XML.', n: dv.length, go: { sub: 'fatture', f: 'cf_stato', v: 'verifica', anno: y } });
  }
  add('fatture', 'Fatture', 'receipt', voF);

  // fatture mancanti (elenco annuale contro fatture caricate)
  const voM = []; const nonConfr = [];
  for (const el of elenchi()) {
    const car = fs.filter(f => f.tipo === el.tipo && f.anno === el.anno).length;
    const nome = el.tipo === 'Vendita' ? 'emesse' : 'ricevute', uno = el.tipo === 'Vendita' ? '1 fattura emessa' : '1 fattura ricevuta';
    if (!car) { nonConfr.push(`${nome} ${el.anno} (${el.righe.length})`); continue; }
    const C = confronta(el, fs).conta;
    if (C.manca) voM.push({ liv: 'err', t: `${el.anno}: ${C.manca === 1 ? uno : C.manca + ' fatture ' + nome} da caricare`, s: `Sono nell'elenco ma non fra le fatture caricate (${eur(C.mancaEuro)}). La pagina le cerca anche nell'archivio del PC.`, n: C.manca, go: { sub: 'mancanti', f: 'cm_tipo', v: el.tipo, anno: el.anno, f2: 'cm_stato', v2: 'manca' } });
    if (C.diversa) voM.push({ liv: 'warn', t: `${el.anno}: ${C.diversa === 1 ? uno : C.diversa + ' fatture ' + nome} da controllare`, s: 'Importo o data diversi dall\'elenco: la pagina spiega perché per ognuna.', n: C.diversa, go: { sub: 'mancanti', f: 'cm_tipo', v: el.tipo, anno: el.anno, f2: 'cm_stato', v2: 'diversa' } });
    if (C.inPiu) voM.push({ liv: 'info', t: `${el.anno}: ${C.inPiu === 1 ? uno : C.inPiu + ' fatture ' + nome} non nell'elenco`, s: 'Caricate ma non nell\'elenco: doppioni, numeri scritti diversi o fatture arrivate dopo.', n: C.inPiu, go: { sub: 'mancanti', f: 'cm_tipo', v: el.tipo, anno: el.anno, f2: 'cm_stato', v2: 'inpiu' } });
  }
  if (nonConfr.length) voM.push({ liv: 'info', t: `Elenchi senza fatture caricate: ${nonConfr.length}`, s: `Fatture ${nonConfr.join(', ')}: per quegli anni non hai caricato le fatture, quindi l'elenco non si può confrontare. Non sono da cercare una per una: se ti serve il confronto, carica lo ZIP dell'anno dal cassetto fiscale.`, n: nonConfr.length, go: { sub: 'mancanti' } });
  add('mancanti', 'Fatture mancanti', 'scan-search', voM);

  // documenti originali
  const senza = perFile().filter(g => !g.imp);
  if (senza.length) add('documenti', 'Documenti originali', 'file-text', [{ liv: 'info', t: `${senza.length === 1 ? '1 documento caricato' : senza.length + ' documenti caricati'} senza originale`, s: 'Caricati prima della 1.35: l\'app ha letto i dati ma non ha tenuto il file. Si possono collegare all\'archivio del PC.', n: senza.length, go: { sub: 'documenti' } }]);

  // banca
  const NA = nonAbbinate();
  const nA = NA.righe.filter(x => x.f.tipo === 'Acquisto'), nV = NA.righe.filter(x => x.f.tipo === 'Vendita');
  const voB = [];
  if (!NA.mesi.size) voB.push({ liv: 'info', t: 'Nessun estratto conto caricato', s: 'Senza i movimenti della banca l\'app non può dire quali fatture hai pagato o incassato.', n: 0, go: { sub: 'importa' } });
  if (nA.length) voB.push({ liv: 'warn', t: `${nA.length === 1 ? '1 fattura ricevuta' : nA.length + ' fatture ricevute'} senza pagamento in banca`, s: `${eur(nA.reduce((t, x) => t + x.residuo, 0))} da pagare in mesi di cui hai caricato l'estratto conto (${fmtMesi(NA.mesi)}). Pagate in contanti, con assegno, compensate o con un movimento non abbinato.`, n: nA.length, go: { sub: 'sospesi', el: 'ss-banca' } });
  if (nV.length) voB.push({ liv: 'warn', t: `${nV.length === 1 ? '1 fattura emessa' : nV.length + ' fatture emesse'} senza incasso in banca`, s: `${eur(nV.reduce((t, x) => t + x.residuo, 0))} da incassare in mesi coperti dagli estratti conto.`, n: nV.length, go: { sub: 'sospesi', el: 'ss-banca' } });
  add('banca', 'Pagamenti delle fatture', 'landmark', voB);

  // personale
  const ign = new Set(cfg().pagheIgnora || []); let an = anomalie().filter(a => !ign.has(a.testo));
  // senza nessun pagamento caricato ogni stipendio risulta "non pagato" e ogni F24 "non registrato": un solo avviso
  const daPag = S.pagamenti.length ? [] : an.filter(a => /non pagato|non registrat/i.test(a.testo));
  if (daPag.length) an = an.filter(a => !daPag.includes(a));
  const nStip = daPag.filter(a => /non pagato/i.test(a.testo)).length, nVers = daPag.length - nStip;
  const aE = an.filter(a => a.liv === 'err'), aW = an.filter(a => a.liv !== 'err');
  add('personale', 'Personale', 'users', [
    daPag.length && { liv: 'warn', t: 'Pagamenti del personale non ancora caricati', s: `Per questo ${nStip ? (nStip === 1 ? '1 stipendio risulta non pagato' : nStip + ' stipendi risultano non pagati') : ''}${nStip && nVers ? ' e ' : ''}${nVers ? (nVers === 1 ? '1 versamento (F24, INPS, fondo) non registrato' : nVers + ' versamenti (F24, INPS, fondo) non registrati') : ''}. Non sono irregolarità vere: carica le contabili dei bonifici o gli estratti conto e l'app li controlla.`, n: daPag.length, go: { sub: 'pagamenti' } },
    aE.length && { liv: 'err', t: `${aE.length === 1 ? '1 irregolarità' : aE.length + ' irregolarità'} sul personale`, s: aE[0].testo, n: aE.length, go: { sub: 'verifica' } },
    aW.length && { liv: 'warn', t: `${aW.length === 1 ? '1 avviso' : aW.length + ' avvisi'} sul personale`, s: aW[0].testo, n: aW.length, go: { sub: 'verifica' } },
  ]);

  // conto economico e bilancio
  const voC = [];
  for (const y of anni.slice(0, 4)) {
    const C = calc(y), ce = C.ce || {}; const ha = fs.some(f => f.anno === y);
    if (!C.has.ce) { if (ha && y < annoOggi) voC.push({ liv: 'warn', t: `${y}: conto economico vuoto`, s: 'Carica il bilancino o il bilancio di fine anno del commercialista.', n: 1, go: { sub: 'ce', anno: y } }); continue; }
    if (N(ce[62]) < 1) voC.push({ liv: y === annoOggi ? 'info' : 'warn', t: `${y}: conto economico senza ammortamenti${y === annoOggi ? " (anno in corso)" : ''}`, s: 'Il bilancino è la situazione dei conti prima delle scritture di chiusura del commercialista, dove si mettono gli ammortamenti: utile, IOFC e prezzo di pareggio vengono migliori del vero. Carica il bilancio definitivo o scrivi gli ammortamenti nel conto economico.', n: 1, go: { sub: 'ce', anno: y } });
    const fa = (plvAnno(y) || {}).alimAcq;
    if (fa && N(ce[30]) < fa * 0.7) { const ca = contiAlimenti(y); voC.push({ liv: 'err', t: `${y}: alimenti acquistati molto più bassi delle fatture`, s: `${eur(N(ce[30]))} nel conto economico contro ${eur(fa)} nelle fatture di mangimi, materie prime, integratori e foraggi.${ca.length ? ` ${ca.length === 1 ? '1 conto del bilancino sembra' : ca.length + ' conti del bilancino sembrano'} di alimenti ma ${ca.length === 1 ? 'è abbinato' : 'sono abbinati'} a un'altra voce: proposta qui sotto.` : ' Controlla in Conto economico come sono abbinati i conti del bilancino.'}`, n: 1, go: ca.length ? { sub: 'sospesi', el: 'ss-alim' } : { sub: 'ce', anno: y } }); }
    if (!C.has.sp && y < annoOggi) voC.push({ liv: 'info', t: `${y}: stato patrimoniale vuoto`, s: 'Servono i debiti, i crediti e i beni a fine anno per gli indici di solidità (debito sulla PLV, posizione finanziaria per vacca).', n: 1, go: { sub: 'sp', anno: y } });
    const ivaScad = oggi > `${y + 1}-04-30`;
    if (ha && ivaScad && !(bilancio(y) || {}).iva) voC.push({ liv: 'info', t: `${y}: dichiarazione IVA non caricata`, s: `È il Modello IVA ${y + 1}: serve per controllare le fatture con i totali dichiarati.`, n: 1, go: { sub: 'importa' } });
  }
  add('bilancio', 'Conto economico e bilancio', 'scale', voC);

  // dati tecnici
  const voT = [];
  for (const y of anni.slice(0, 3)) {
    if (!fs.some(f => f.anno === y) && !calc(y).has.ce) continue;
    const v = datiTecnici(y).val; const manca = [];
    if (!v.ula) manca.push('unità di lavoro (ULA)'); if (!v.vacche) manca.push('vacche'); if (!v.latte_prod && !v.latte_ven) manca.push('litri di latte'); if (!v.sau) manca.push('superficie (SAU)');
    if (manca.length) voT.push({ liv: manca.includes('vacche') || manca.includes('unità di lavoro (ULA)') ? 'warn' : 'info', t: `${y}: mancano ${manca.join(', ')}`, s: 'Senza questi numeri gli indici per vacca, per litro e per persona restano vuoti. Si scrivono nei dati tecnici dell\'Analisi della stalla.', n: manca.length, go: { sub: 'analisi', anno: y } });
  }
  add('tecnici', 'Dati tecnici', 'cow', voT);
  return G;
}
const eur = v => Math.round(N(v)).toLocaleString('it-IT') + ' €';
const NOMI_MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
export function fmtMesi(mesi) {
  const L = [...mesi].sort(); if (!L.length) return '';
  const da = L[0], a = L[L.length - 1]; const t = m => NOMI_MESI[+m.slice(5, 7) - 1] + ' ' + m.slice(0, 4);
  return L.length === 1 ? t(da) : `${L.length} mesi fra ${t(da)} e ${t(a)}`;
}
/** Numero di cose aperte (err + warn), per la Panoramica. */
export const quanteAperte = () => sospesi().reduce((t, g) => t + g.voci.filter(v => v.liv !== 'info').length, 0);

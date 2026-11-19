// Dubbi di paghe, pagamenti e fatture per la lista "Da controllare" del Centro automatico (1.63).
// Un dato non sicuro non si salva mai da solo: qui c'è la proposta pronta, da confermare con un tocco.
// Contratto: { id, area: 'personale' | 'conti', testo, proposta, conferma(), scarta(), apri? }
//   conferma() applica la proposta; scarta() la ricorda come scartata (econfig dz-…) e non la ripropone più.
//   In più (facoltativi): alternative: [{ testo, conferma() }] per scegliere l'altra possibilità, dettagli: [[voce, prima, dopo]].
// I dubbi si ricalcolano ogni volta dai dati: conferma e scarta rileggono i dati prima di scrivere.
import { S } from '../state.js';
import * as store from '../store.js';
import { N } from '../util.js';
import * as P from './paghe.js';
import { scarta as ricordaScarto, scartato } from './scarti.js';
import { NOTE_CREDITO } from './fatture-parse.js';

const eu = v => Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const fd = d => String(d || '').split('-').reverse().join('/');
const fonte = p => (p.fonte && p.fonte !== 'a mano' ? p.fonte : 'scritto a mano');
// apre una scheda dell'app con un'azione data-act (come un pulsante)
const azione = (act, dati = {}) => () => {
  if (typeof document === 'undefined') return;
  const b = document.createElement('button'); b.hidden = true; b.dataset.act = act; for (const [k, v] of Object.entries(dati)) b.dataset[k] = v;
  document.body.appendChild(b); b.click(); b.remove();
};
const conScarto = (id, area, testo, prima) => async () => { if (prima) await prima(); await ricordaScarto(id, area, testo); };
async function aggiornaPagamento(pid, campi) {
  const p = S.pagamenti.find(x => x.id === pid); if (!p) return false;
  const { id, ...data } = p; await store.put('pagamenti', id, Object.assign(data, campi)); return true;
}
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };

/** Dubbi del personale: pagamenti forse doppi, cedolini in attesa, abbinamenti dei pagamenti agli stipendi non sicuri. */
export function dubbiPaghe() {
  if (!S.paghe.length && !S.pagamenti.length) return [];
  const out = [];
  // 1) lo stesso pagamento registrato due volte? (stessa data, dipendente e importo, da documenti diversi)
  for (const d of P.analizzaDoppi().dubbi) {
    const { tieni: a, via: b } = d; const chi = (d.dip && P.nomeDi(d.dip)) || b.beneficiario || P.TIPI_PAG[b.tipo] || '';
    out.push({
      id: d.id, area: 'personale',
      testo: `Lo stesso pagamento registrato due volte? ${chi}: ${eu(N(a.importo))} il ${fd(a.data)}, da ${fonte(a)} e da ${fonte(b)}.`,
      proposta: `È lo stesso pagamento: tieni quello da ${fonte(a)} e togli quello da ${fonte(b)}`,
      conferma: () => P.unisciPagamenti(a.id, b.id),
      scarta: conScarto(d.id, 'personale', 'due pagamenti veri'),
      apri: azione('c-pPag', { id: b.id }),
      alternative: [{ testo: 'Sono due pagamenti veri: tienili tutti e due', conferma: conScarto(d.id, 'personale', 'due pagamenti veri') }],
    });
  }
  // 2) cedolini arrivati ma non salvati
  for (const a of P.cedoliniInAttesa()) {
    const c = a.cedolino || {}; const vecchio = a.vecchio && S.paghe.find(x => x.id === a.vecchio);
    const mese = /^\d{4}-\d{2}$/.test(a.periodo || '') ? P.nomeMese(a.periodo) : '';
    const nome = P.nomeDi(a.dip) || c.nome || '';
    const id = 'pg-ced-' + a.id + '-' + hash([c.netto, c.lordo, c.file, a.caricato].join('|'));
    if (scartato(id)) continue;
    const problemi = (a.problemi || []).join('; ');
    const tieniNuovo = () => P.confermaCedolino(a.id), tieniVecchio = () => P.scartaCedolino(a.id);
    if (vecchio) {
      const nuovoOk = !(a.problemi || []).length;
      const dettagli = [['Netto', eu(vecchio.netto), eu(c.netto)], ['Lordo', eu(vecchio.lordo), eu(c.lordo)], ['Ore', String(vecchio.ore ?? '—'), String(c.ore ?? '—')], ['File', vecchio.file || '—', c.file || a.file || '—']];
      out.push({
        id, area: 'personale',
        testo: `Due cedolini diversi di ${nome} per ${mese}: quello salvato ha netto ${eu(vecchio.netto)}, quello arrivato ${eu(c.netto)}${nuovoOk ? '' : ` (e non passa i controlli: ${problemi})`}.`,
        proposta: nuovoOk ? 'Tieni quello arrivato adesso (rifatto dal consulente)' : 'Tieni quello già salvato',
        conferma: nuovoOk ? tieniNuovo : tieniVecchio,
        scarta: conScarto(id, 'personale', 'cedolino in attesa', tieniVecchio),
        alternative: [nuovoOk ? { testo: 'Tieni quello già salvato', conferma: tieniVecchio } : { testo: 'Tieni quello arrivato adesso', conferma: tieniNuovo }],
        dettagli,
      });
    } else {
      out.push({
        id, area: 'personale',
        testo: `Cedolino di ${nome}, ${mese}: non l'ho salvato perché non passa i controlli (${problemi || 'da verificare'}). Netto letto ${eu(c.netto)}.`,
        proposta: 'Salvalo lo stesso (l\'ho controllato sul PDF)',
        conferma: tieniNuovo,
        scarta: conScarto(id, 'personale', 'cedolino non salvato', tieniVecchio),
      });
    }
  }
  // 3) pagamenti abbinati agli stipendi in modo non sicuro (solo le scadenze dell'anno in corso)
  for (const d of P.dubbiAbbinamento()) {
    const id = `pg-abb-${d.pid}-${hash(d.firma)}`; if (scartato(id)) continue;
    const nome = P.nomeDi(d.dip); const testa = `Pagamento di ${eu(d.importo)} a ${nome} del ${fd(d.data)}`;
    const unMese = d.mesi.length === 1;
    const fissa = periodo => () => aggiornaPagamento(d.pid, { comp: periodo });
    const vaBene = () => aggiornaPagamento(d.pid, { abbOk: d.firma });
    const base = { id, area: 'personale', scarta: conScarto(id, 'personale', testa), apri: azione('c-pPag', { id: d.pid }) };
    if (d.tipo === 'mese') {
      const altri = d.cand.filter(x => x !== d.scelta);
      out.push(Object.assign(base, {
        testo: `${testa}: la causale dice ${P.nomeMese(d.scelta).split(' ')[0].toLowerCase()} senza l'anno, può essere ${d.cand.map(P.nomeMese).join(' o ')}.`,
        proposta: `È lo stipendio di ${P.nomeMese(d.scelta)}`, conferma: fissa(d.scelta),
        alternative: altri.map(x => ({ testo: `È lo stipendio di ${P.nomeMese(x)}`, conferma: fissa(x) })),
      }));
    } else if (d.tipo === 'eccedenza') {
      out.push(Object.assign(base, {
        testo: `${testa}: ${eu(d.eccedenza)} in più di quanto dovuto, messi su ${P.nomeMese(d.periodo)}${unMese ? '' : ` (il resto su ${d.mesi.slice(0, -1).map(m => P.nomeMese(m.periodo)).join(', ')})`}.`,
        proposta: unMese ? `Lascialo su ${P.nomeMese(d.periodo)} (pagato in più)` : 'Va bene così',
        conferma: unMese ? fissa(d.periodo) : vaBene,
      }));
    } else {
      out.push(Object.assign(base, {
        testo: `${testa}: messo su ${d.mesi.map(m => P.nomeMese(m.periodo)).join(', ')}, ma ${P.nomeMese(d.periodo)} resta pagato in parte (mancano ${eu(d.residuo)}).`,
        proposta: unMese ? `È una parte dello stipendio di ${P.nomeMese(d.periodo)}` : 'Va bene così',
        conferma: unMese ? fissa(d.periodo) : vaBene,
      }));
    }
  }
  return out;
}

// gira il segno di una fattura salvata (importi, IVA, totale, righe)
const giraSegno = f => {
  const { id, ...data } = f; const neg = v => (v == null ? v : -v);
  return { id, data: Object.assign(data, { imponibile: neg(data.imponibile), iva: neg(data.iva), totale: neg(data.totale), ...(data.ritenuta ? { ritenuta: neg(data.ritenuta) } : {}), ...(data.aggiustamento ? { aggiustamento: neg(data.aggiustamento) } : {}), righe: (data.righe || []).map(r => Object.assign({}, r, { importo: neg(r.importo), quantita: r.quantita == null ? r.quantita : neg(r.quantita) })), segnoOk: true }) };
};
const somma = rs => (rs || []).reduce((t, r) => t + N(r.importo), 0);
/** Dubbi delle fatture: segno delle note di credito, righe di segno opposto al totale, pagamenti della banca segnati due volte. */
export function dubbiFatture() {
  const out = []; const annoOk = +new Date().getFullYear() - 1;
  for (const f of S.fatture) {
    if (f.segnoOk) continue;
    const nome = `${f.tipo === 'Vendita' ? 'Fattura emessa' : 'Fattura'} n. ${f.numero || '?'} del ${fd(f.data)} (${f.controparte || ''})`;
    const nota = NOTE_CREDITO.has(f.tipoDoc); const imp = N(f.imponibile) || N(f.totale); const sr = somma(f.righe);
    const base = (id, testo, proposta, conferma) => { if (!scartato(id)) out.push({ id, area: 'conti', testo, proposta, conferma, scarta: conScarto(id, 'conti', testo), apri: azione('c-fatt', { id: f.id }) }); };
    if (nota && imp > 0.005) {
      base(`ft-segno-${f.id}`, `${nome.replace(/^Fattura/, 'Nota di credito')}: gli importi sono positivi, ma una nota di credito toglie (deve essere negativa).`, 'Gira il segno (importi negativi)', async () => { const x = S.fatture.find(y => y.id === f.id); if (!x || x.segnoOk || !((N(x.imponibile) || N(x.totale)) > 0.005)) return false; const g = giraSegno(x); await store.put('fatture', g.id, g.data); });
    } else if (!nota && imp < -0.005 && N(f.totale) < 0) {
      base(`ft-nc-${f.id}`, `${nome}: tutti gli importi sono negativi. È una nota di credito?`, 'Sì, è una nota di credito', async () => { const x = S.fatture.find(y => y.id === f.id); if (!x || x.segnoOk) return false; const { id, ...data } = x; await store.put('fatture', id, Object.assign(data, { tipoDoc: 'TD04', segnoOk: true })); });
    } else if ((f.righe || []).length && Math.abs(sr) > 0.005 && Math.abs(imp) > 0.005 && Math.sign(sr) !== Math.sign(imp)) {
      base(`ft-righe-${f.id}`, `${nome}: le righe (${eu(sr)}) hanno il segno opposto al totale (${eu(imp)}).`, 'Gira il segno delle righe', async () => { const x = S.fatture.find(y => y.id === f.id); if (!x || x.segnoOk) return false; const sx = somma(x.righe), ix = N(x.imponibile) || N(x.totale); if (!(Math.abs(sx) > 0.005 && Math.abs(ix) > 0.005 && Math.sign(sx) !== Math.sign(ix))) return false; const { id, ...data } = x; await store.put('fatture', id, Object.assign(data, { righe: (data.righe || []).map(r => Object.assign({}, r, { importo: -N(r.importo), quantita: r.quantita == null ? r.quantita : -r.quantita })), segnoOk: true })); });
    } else if (nota && f.fonte && !['xml', 'excel'].includes(f.fonte) && +String(f.data || '').slice(0, 4) >= annoOk) {
      // nota di credito riconosciuta dal testo di un PDF (le parole "nota di credito" possono stare anche in una fattura)
      base(`ft-pdfnc-${f.id}`, `${nome.replace(/^Fattura/, 'Nota di credito')} letta da un PDF: è davvero una nota di credito?`, 'Sì, è una nota di credito', async () => { const x = S.fatture.find(y => y.id === f.id); if (!x) return; const { id, ...data } = x; await store.put('fatture', id, Object.assign(data, { segnoOk: true })); });
    }
  }
  // lo stesso movimento della banca segnato due volte sulla stessa fattura? (movimenti diversi, stessa data e importo)
  for (const d of P.analizzaDoppi().fatDubbi) {
    out.push({
      id: d.id, area: 'conti',
      testo: `Fattura n. ${d.f.numero || '?'} (${d.f.controparte || ''}): due pagamenti uguali di ${eu(Math.abs(N(d.a.importo)))} il ${fd(d.a.data)}.`,
      proposta: 'È lo stesso pagamento: tienine uno', conferma: () => P.togliPagamentoFattura(d.f.id, d.b),
      scarta: conScarto(d.id, 'conti', 'due pagamenti veri della fattura'), apri: azione('c-fatt', { id: d.f.id }),
      alternative: [{ testo: 'Sono due pagamenti veri', conferma: conScarto(d.id, 'conti', 'due pagamenti veri della fattura') }],
    });
  }
  return out;
}

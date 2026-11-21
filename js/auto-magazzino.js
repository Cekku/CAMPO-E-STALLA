// Centro automatico: magazzino dalle fatture d'acquisto (1.66.0; prima era in automazioni-agganci.js con lo stesso id).
// Le righe sicure (prodotto certo, quantità sicura) entrano da sole; le altre sono dubbi con la proposta pronta:
// prodotto che c'è con la quantità convertita, oppure "crea il prodotto nuovo e caricalo"; resi e correzioni di prezzo delle note di credito.
// Il riconoscimento è in js/magriconosci.js, il salvataggio in js/magfatture.js.
import { S } from './state.js';
import { nf, fd, eur } from './util.js';
import { registra } from './automazioni.js';
import { contiVisibili } from './views/conti.js';
import * as MF from './magfatture.js';
import { importoNetto } from './magriconosci.js';

const pagMag = { area: 'campagna', tab: 'magazzino', sub: 'fatture' };
const qu = (q, u) => `${nf(q, 3)} ${u || ''}`.trim();
const quante = (n, uno, tanti) => n === 1 ? '1 ' + uno : n + ' ' + tanti;
/** Carico d'origine di una correzione: «prodotto» del gg/mm/aa (fatt. N). */
function descOrig(k) {
  const m = S.movimenti.find(y => y.fattRiga === k && y.tipo === 'Carico'); const p = m && S.prodotti.find(y => y.id === m.prodottoId);
  const f = S.fatture.find(y => y.id === String(k).slice(0, String(k).lastIndexOf(':')));
  return `${p ? '«' + p.nome + '»' : 'della riga'}${m ? ' del ' + fd(m.data) : ''}${f && f.numero ? ' (fatt. ' + f.numero + ')' : ''}`;
}
const conAlt = (d, alt) => (alt.length ? Object.assign(d, { alternative: alt.slice(0, 3) }) : d);

function dubbio(x) {
  const r = x.r; const p = x.proposto;
  const testo = [String(r.descrizione || 'Riga di fattura').slice(0, 120), r.controparte || '', fd(x.data), `${nf(r.quantita, 2)} ${r.um || ''}`.trim(), eur(importoNetto(r), 2)].filter(Boolean).join(' · ') + (x.tipo !== 'carico' ? ' · nota di credito' : '');
  const base = { id: 'mf:' + x.k, area: 'magazzino', testo, scarta: () => MF.togli(x.k, true), apri: pagMag };
  const perche = x.motivo ? ` — ${x.motivo}` : '';
  const alt = [];
  if (x.tipo === 'prezzo') {
    const imp = eur(Math.abs(importoNetto(r)), 2);
    for (const k of x.origini.slice(1)) alt.push({ testo: 'Correggi il carico ' + descOrig(k), conferma: () => MF.abbina(x.k, { origine: k }) });
    if (x.origine) return conAlt(Object.assign(base, { proposta: `Togliere ${imp} dal prezzo del carico ${descOrig(x.origine)}${perche}`, conferma: () => MF.abbina(x.k, { origine: x.origine }) }), alt);
    return Object.assign(base, { proposta: `Correzione di prezzo di ${imp}${perche}: apri e scegli il carico, o scarta` });
  }
  if (x.tipo === 'reso') {
    if (x.origine) alt.push({ testo: 'È solo una correzione del prezzo', conferma: () => MF.abbina(x.k, { tipo: 'prezzo', origine: x.origine }) });
    if (p && x.qProp > 0) return conAlt(Object.assign(base, { proposta: `Scaricare ${qu(x.qProp, p.unita)} di «${p.nome}» come reso al fornitore${perche}`, conferma: () => MF.abbina(x.k, { pid: p.id, q: x.qProp, ricorda: true }) }), alt);
    return conAlt(Object.assign(base, { proposta: `Reso${perche || ' da controllare'}: apri e scegli il prodotto` }), alt);
  }
  for (const a of x.alt) if (a.q > 0) alt.push({ testo: `È «${a.p.nome}» (${qu(a.q, a.p.unita)})`, conferma: () => MF.abbina(x.k, { pid: a.p.id, q: a.q, ricorda: true }) });
  const nv = x.nuovo && x.nuovo.q > 0 ? { testo: `Crea «${x.nuovo.nome}» e caricalo`, conferma: () => MF.abbina(x.k, { nuovo: x.nuovo, q: x.nuovo.q, ricorda: true }) } : null;
  if (p && x.qProp > 0) {
    if (nv) alt.unshift(nv);
    return conAlt(Object.assign(base, { proposta: `Caricare ${qu(x.qProp, p.unita)} come «${p.nome}» e riconoscerlo da solo nelle prossime fatture${perche}`, conferma: () => MF.abbina(x.k, { pid: p.id, q: x.qProp, ricorda: true }) }), alt);
  }
  if (nv) return conAlt(Object.assign(base, { proposta: `Creare il prodotto nuovo «${x.nuovo.nome}» nella categoria ${x.nuovo.categoria} (${x.nuovo.unita}) e caricare ${qu(x.nuovo.q, x.nuovo.unita)}${perche}`, conferma: nv.conferma }), alt);
  return conAlt(Object.assign(base, { proposta: (p ? `Forse «${p.nome}»` : 'Da abbinare') + (perche || '') + ': apri e scegli il prodotto' }), alt);
}

registra({
  id: 'mag-fatture', nome: 'Magazzino dalle fatture', area: 'magazzino', soloTitolare: true,
  descr: 'Mangimi, foraggi, farmaci, prodotti per la mungitura, ricambi, lubrificanti, sementi, concimi, fitofarmaci e gasolio comprati: le righe riconosciute con certezza entrano da sole, le altre vanno da controllare con la proposta pronta',
  raccolte: ['movimenti', 'prodotti', 'econfig'], segui: () => [S.fatture, S.prodotti, MF.stato()],
  propri: (c, id) => (c === 'movimenti' && id.startsWith('mf-')) || (c === 'econfig' && id === MF.ID) || c === 'prodotti',
  async pronta() {
    if (!contiVisibili() || !S.fatture.length) return 'Nessuna fattura caricata.';
    if (MF.occupato()) return 'Stai abbinando una riga a mano: riprova fra poco.';
    await MF.pulisciSeServe();   // sistemazione dei carichi della 1.59.0, fuori dal diario: annullando non tornano i prezzi
    return true;
  },
  async esegui() {
    const n = await MF.caricaPronte(); const E = MF.elenco();
    const note = [n ? (n === 1 ? 'Caricata in magazzino 1 riga di fattura' : `Caricate in magazzino ${n} righe di fattura`) : 'nessuna riga sicura nuova',
      E.daFare.length ? quante(E.daFare.length, 'da controllare', 'da controllare') : '', E.doppie.length ? quante(E.doppie.length, 'riga di una copia della stessa fattura lasciata fuori', 'righe di copie della stessa fattura lasciate fuori') : ''].filter(Boolean).join(', ');
    return { salvati: n, note };
  },
  dubbi() {
    if (!contiVisibili() || !S.fatture.length) return [];
    return MF.elenco().daFare.map(dubbio);
  },
  // un carico annullato dal giro non torna: la riga va fra le "non caricare" (si rimette a mano nella pagina Da fatture);
  // annullando una conferma la riga torna fra quelle da fare e il prodotto dimentica quello che aveva imparato da lei (anche se è
  // cambiato dopo e il motore non l'ha rimesso com'era). Lo stesso per le correzioni di prezzo (stanno in econfig).
  // Annullando uno scarto la riga torna fra i dubbi. Alla fine rimette il segno alle righe il cui carico è rimasto (cambiato dopo il giro).
  async annullato(riga, tolti) {
    if (riga.motivo === 'scarta') {
      const k = String(riga.dubbio || '').replace(/^mf:/, ''); if (k && (MF.stato().fatti || {})[k] === 'no') await MF.togli(k, false);
      return;
    }
    const conferma = riga.motivo === 'conferma';
    for (const t of tolti) {
      if (t.c === 'movimenti' && t.rec && t.rec.fattRiga) {
        await MF.togli(t.rec.fattRiga, !conferma);
        // il prodotto dimentica solo quello che ha imparato in questa conferma (la versione di prima è nel diario; senza, non si tocca)
        const prima = conferma && (riga.scritti || []).find(s => s.c === 'prodotti' && s.id === t.rec.prodottoId);
        if (prima && prima.p) await MF.dimentica(t.rec.prodottoId, t.rec.fattRiga, prima.p);
      }
      if (t.c === 'econfig' && t.id === MF.ID && t.rec) {
        const ora = MF.stato().fatti || {};
        for (const [k, v] of Object.entries(t.rec.fatti || {})) if (String(v).startsWith('r>') && ora[k] !== v) await MF.togli(k, !conferma);
      }
    }
    await MF.risegna();
  },
});

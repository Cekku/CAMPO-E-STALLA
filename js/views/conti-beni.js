// Conti → Bilancio → Beni e ammortamenti (dalla 1.38.0): registro dei beni con le quote calcolate dall'app,
// proposte dalle fatture di investimento. Calcoli in conti/beni.js; le quote entrano nel conto economico da calc() di dati.js.
import { S, UI } from '../state.js';
import { esc, nf, fd, N, okD, today } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm, openForm } from '../ui.js';
import { tabella, bottoniExport, fmtVal } from '../conti/tabelle.js';
import { calc, fatture } from '../conti/dati.js';
import * as B from '../conti/beni.js';

const ST = { scelte: new Map(), tutte: false };
const e0 = v => fmtVal(v, 'eur');
const kpi = (l, v, s, cls = '') => `<div class="kpi static"><span class="k-l">${esc(l)}</span><span class="k-v sm ${cls}">${v}</span><span class="k-s">${s}</span></div>`;
const catOpts = sel => B.ORDINE.map(k => `<option value="${k}"${k === sel ? ' selected' : ''}>${esc(B.CATEGORIE[k].nome)}</option>`).join('');
const scelta = p => { let s = ST.scelte.get(p.fid); if (!s) { s = { on: false, cat: p.cat, anni: p.anni, nome: p.nome }; ST.scelte.set(p.fid, s); } return s; };

export function vBeni() {
  const y = UI.anno; const L = B.beni(); const R = B.annoRegistro(y); const C = calc(y); const P = B.proposte();
  const intro = `<div class="note-box">${ic('info')}<span>Senza il bilancio di fine anno del commercialista gli ammortamenti si calcolano qui. Segna le stalle, gli impianti, le macchine e il bestiame comprati: l'app divide il costo per gli anni di vita, a partire dal mese dell'acquisto, e mette la quota di ogni anno nel conto economico, nei centri di costo e nella salute dell'azienda. Se carichi un conto economico che ha già gli ammortamenti, vale quello del commercialista. Sono numeri per capire i costi veri dell'azienda, non per le tasse.</span></div>`;
  let stato = '';
  if (C.amm && C.amm.registro && C.amm.ce) stato = `<div class="note-box ok">${ic('check')}<span>Nel conto economico del ${y} gli ammortamenti arrivano da questo registro: <b>${esc(e0(C.amm.tot))}</b>.</span></div>`;
  else if (C.amm && C.amm.registro === false) stato = `<div class="note-box">${ic('info')}<span>Il conto economico del ${y} ha già gli ammortamenti del commercialista (${esc(e0(C.ce[62]))}): per quell'anno il registro serve solo da confronto.${R.tot ? ` Il registro darebbe ${esc(e0(R.tot))}.` : ''}</span></div>`;
  else if (!L.length) stato = `<div class="note-box warn">${ic('triangle-alert')}<span>Il registro è vuoto: il conto economico del ${y} è senza ammortamenti e utile, margini e prezzo di pareggio vengono migliori del vero.</span></div>`;
  const tot = L.reduce((t, b) => t + N(b.costo), 0);
  const netto = R.righe.reduce((t, x) => t + x.q.netto, 0);
  const kp = L.length ? `<div class="kpis">${kpi('Beni nel registro', String(L.length), R.n === L.length ? 'tutti in uso nel ' + y : R.n + ' in uso nel ' + y)}${kpi('Ammortamenti ' + y, e0(R.tot), y === new Date().getFullYear() ? 'fino a questo mese' : 'quota dell\'anno')}${kpi('Costo dei beni', e0(tot), 'senza IVA')}${kpi('Valore rimasto', e0(netto), 'a fine ' + y)}</div>` : '';
  const az = `<div class="toolbar"><span class="muted small">Valori del ${y}</span><span class="sp"></span><button class="btn sm primary" data-act="c-beNuovo">${ic('plus')}Nuovo bene</button></div>`;
  return intro + stato + kp + az + proposteCard(P) + registroCard(L, y) + anniCard();
}

function proposteCard(P) {
  if (!P.length) return '';
  const vis = ST.tutte ? P : P.slice(0, 40);
  const n = P.filter(p => scelta(p).on).length;
  const righe = vis.map(p => {
    const s = scelta(p);
    return `<tr><td class="t"><input type="checkbox" data-act="c-beSel" data-fid="${esc(p.fid)}"${s.on ? ' checked' : ''} aria-label="Aggiungi al registro"></td>
      <td class="t">${okD(p.data) ? fd(p.data) : '—'}</td>
      <td class="t"><button class="lnk" data-act="c-fatt" data-id="${esc(p.fid)}">${esc(p.controparte || 'Fattura')}${p.numero ? ' n. ' + esc(p.numero) : ''}</button><br><input class="cell-in wide" data-act="c-beNome" data-fid="${esc(p.fid)}" value="${esc(s.nome)}" aria-label="Nome del bene">${p.nota === 'piccolo' ? '<br><span class="muted small">Sotto 516 €: di solito si mette tutto nell\'anno</span>' : ''}</td>
      <td class="n">${esc(e0(p.importo))}</td>
      <td class="t"><select class="cell-in" data-act="c-beCat" data-fid="${esc(p.fid)}">${catOpts(s.cat)}</select></td>
      <td class="n"><input class="cell-in" inputmode="decimal" data-act="c-beAnni" data-fid="${esc(p.fid)}" value="${esc(String(s.anni || ''))}" aria-label="Anni di vita" style="width:4.5em"></td></tr>`;
  }).join('');
  return `<section class="card"><div class="card-h"><h2>${ic('receipt')}Investimenti nelle fatture da mettere nel registro</h2></div>
    <p class="muted small">Righe delle fatture di acquisto segnate come investimento (centro "Investimento") e non ancora nel registro, una per fattura. Controlla nome, tipo di bene e anni di vita, spunta quelle giuste e aggiungile. Se il bilancino del commercialista mette già un acquisto fra i costi dell'anno, non aggiungerlo qui: si conterebbe due volte.</p>
    <div class="tablewrap etab"><table><thead><tr><th class="t" style="width:2em"></th><th class="t">Data</th><th class="t">Fattura e nome del bene</th><th class="n">Importo</th><th class="t">Tipo di bene</th><th class="n">Anni</th></tr></thead><tbody>${righe}</tbody></table></div>
    ${P.length > vis.length ? `<p><button class="btn sm ghost" data-act="c-beTutte">Mostra tutte (${P.length})</button></p>` : ''}
    <div class="factions"><button class="btn sm ghost" data-act="c-beSelTutte">${n === vis.length ? 'Togli le spunte' : 'Spunta tutte'}</button><span class="sp"></span><button class="btn sm ghost" data-act="c-beScarta"${n ? '' : ' disabled'}>Non sono beni</button><button class="btn sm primary" data-act="c-beAggiungi"${n ? '' : ' disabled'}>${ic('plus')}Aggiungi ${n === 1 ? '1 bene' : n + ' beni'}</button></div></section>`;
}

function registroCard(L, y) {
  if (!L.length) return '';
  const rows = L.map(b => {
    const q = B.quote(b, y); const c = B.CATEGORIE[b.cat] || B.CATEGORIE.macchine;
    const st = b.fine && b.fine.slice(0, 4) <= String(y) ? 'Venduto o eliminato' : !c.ce ? 'Non si ammortizza' : q.finito ? 'Finito' : b.data > `${y}-12-31` ? 'Dopo il ' + y : 'In ammortamento';
    return { id: b.id, nome: b.nome || '—', cat: c.nome, data: b.data, costo: N(b.costo), anni: N(b.anni) || c.anni || null, quota: q.quota, fondo: q.fondo, netto: q.netto, stato: st };
  }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));
  const t = { nome: 'Totale', costo: rows.reduce((s, r) => s + r.costo, 0), quota: rows.reduce((s, r) => s + r.quota, 0), fondo: rows.reduce((s, r) => s + r.fondo, 0), netto: rows.reduce((s, r) => s + r.netto, 0) };
  return `<section class="card"><div class="card-h"><h2>${ic('tractor')}Registro dei beni</h2>${bottoniExport(['beni'], 'Registro dei beni ' + y)}</div>
    <p class="muted small">Tocca un bene per cambiarlo: costo, data, anni di vita, oppure la data in cui l'hai venduto o eliminato.</p>
    ${tabella('beni', { title: 'Registro dei beni ' + y, sheet: 'Beni ' + y, rows, tot: t, rowAttr: r => `data-act="c-beApri" data-id="${esc(r.id)}" class="clk"`, freeze: 1, cols: [
      { k: 'nome', h: 'Bene', fmt: 'text' }, { k: 'cat', h: 'Tipo', fmt: 'text' }, { k: 'data', h: 'Dal', fmt: 'date' }, { k: 'costo', h: 'Costo', fmt: 'eur' }, { k: 'anni', h: 'Anni', fmt: 'n' },
      { k: 'quota', h: 'Quota ' + y, fmt: 'eur' }, { k: 'fondo', h: 'Già ammortizzato', fmt: 'eur' }, { k: 'netto', h: 'Valore rimasto', fmt: 'eur' }, { k: 'stato', h: 'Stato', fmt: 'text' }] })}</section>`;
}

function anniCard() {
  const anni = B.anniRegistro(UI.anno); if (!B.beni().length) return '';
  const rows = anni.map(y => { const R = B.annoRegistro(y); const C = calc(y); return { anno: String(y), r63: N(R.ce[63]), r64: N(R.ce[64]), r65: N(R.ce[65]), r66: N(R.ce[66]), tot: R.tot, ce: C.amm && C.amm.registro === false ? N(C.ce[62]) : null, usato: C.amm && C.amm.registro && C.amm.ce ? (C.has.ce ? 'dal registro' : 'manca il conto economico') : C.amm && C.amm.registro === false ? 'del commercialista' : '—' }; });
  return `<section class="card"><div class="card-h"><h2>${ic('calendar')}Ammortamenti anno per anno</h2>${bottoniExport(['beniAnni'], 'Ammortamenti per anno')}</div>
    ${tabella('beniAnni', { title: 'Ammortamenti per anno', sheet: 'Per anno', rows, sort: false, cols: [
      { k: 'anno', h: 'Anno', fmt: 'text' }, { k: 'r64', h: 'Fabbricati e impianti', fmt: 'eur' }, { k: 'r65', h: 'Macchine e automezzi', fmt: 'eur' }, { k: 'r66', h: 'Bestiame e colture', fmt: 'eur' }, { k: 'r63', h: 'Spese pluriennali', fmt: 'eur' },
      { k: 'tot', h: 'Totale registro', fmt: 'eur' }, { k: 'ce', h: 'Del commercialista', fmt: 'eur' }, { k: 'usato', h: 'Nel conto economico', fmt: 'text' }] })}</section>`;
}

/* ---------------- modulo ---------------- */
function durateHint(cat) { const d = B.DURATE.filter(x => x[0] === cat).map(x => `${x[1]} ${x[2]} anni`); const c = B.CATEGORIE[cat]; return c ? (c.ce ? `Per esempio ${c.esempi}. ` : '') + (d.length ? 'Di solito: ' + d.join(', ') + '.' : c.anni ? `Di solito ${c.anni} anni.` : 'I terreni non si ammortizzano.') : ''; }
function formBene(b) {
  const nuovo = !b; const v = b ? Object.assign({}, b) : { cat: 'macchine', anni: B.CATEGORIE.macchine.anni, data: today(), residuo: 0 };
  const fatt = b && (b.fatture || []).length ? b.fatture.map(x => { const f = fatture().find(z => z.id === x.fid); return f ? `<button type="button" class="lnk" data-act="c-fatt" data-id="${esc(f.id)}">${esc(f.controparte || 'Fattura')}${f.numero ? ' n. ' + esc(f.numero) : ''} del ${fd(f.data)}</button>` : 'fattura non più presente'; }).join(', ') : '';
  openForm({
    title: nuovo ? 'Nuovo bene' : b.nome || 'Bene', saveLabel: nuovo ? 'Aggiungi' : 'Salva',
    values: v,
    fields: [
      { k: 'nome', l: 'Bene', req: true, ph: 'Carro miscelatore, nuova stalla, 10 manze…' },
      { k: 'cat', l: 'Tipo di bene', t: 'select', blank: false, opts: B.ORDINE.map(k => [k, B.CATEGORIE[k].nome]) },
      { k: 'data', l: 'Comprato o in uso dal', t: 'date', req: true, half: true },
      { k: 'costo', l: 'Costo', t: 'number', unit: '€', req: true, half: true, hint: 'Senza IVA, compreso il trasporto e il montaggio. Togli gli eventuali contributi a fondo perduto.' },
      { k: 'anni', l: 'Anni di vita', t: 'number', unit: 'anni', half: true, hint: durateHint(v.cat) },
      { k: 'residuo', l: 'Valore alla fine', t: 'number', unit: '€', half: true, hint: 'Quanto vale quando è finito (di solito 0).' },
      { k: 'fine', l: 'Venduto o eliminato il', t: 'date', half: true, hint: 'Da quel mese non conta più.' },
      { k: 'mezzo', l: 'Mezzo collegato', t: 'select', half: true, opts: S.mezzi.map(m => [m.id, m.nome]), show: vv => ['macchine', 'automezzi'].includes(vv.cat) },
      { k: 'note', l: 'Note', t: 'textarea' },
      { k: 'info', t: 'box' },
    ],
    onChange: (k, vv) => {
      if (k === 'cat') { const c = B.CATEGORIE[vv.cat]; const inp = document.querySelector('#frm [name=anni]'); if (inp && c && (!inp.value || B.ORDINE.some(x => String(B.CATEGORIE[x].anni) === inp.value))) inp.value = c.anni || ''; const h = document.getElementById('h_anni'); if (h) h.textContent = durateHint(vv.cat); }
      const el = document.getElementById('box_info'); if (!el) return;
      const prova = Object.assign({}, vv, { anni: vv.anni || (B.CATEGORIE[vv.cat] || {}).anni });
      const c = B.CATEGORIE[vv.cat] || {};
      const q = N(prova.anni) && N(vv.costo) && c.ce ? (N(vv.costo) - N(vv.residuo)) / N(prova.anni) : 0;
      el.innerHTML = (q ? `<div class="note-box">${ic('calculator')}<span>Quota di un anno intero: <b>${esc(e0(q))}</b>${okD(vv.data) && +vv.data.slice(5, 7) > 1 ? `; il primo anno conta da ${esc(['', 'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'][+vv.data.slice(5, 7)])}: ${esc(e0(q * (13 - +vv.data.slice(5, 7)) / 12))}` : ''}.</span></div>` : '') + (fatt ? `<p class="muted small">Dalla fattura: ${fatt}</p>` : '');
    },
    validate: vv => (N(vv.costo) <= 0 ? 'Scrivi il costo' : vv.fine && vv.fine < vv.data ? 'La data di vendita viene prima di quella di acquisto' : N(vv.residuo) > N(vv.costo) ? 'Il valore alla fine è più alto del costo' : null),
    onSave: async vv => {
      const o = Object.assign(b ? JSON.parse(JSON.stringify(b)) : { id: B.nuovoId(), creato: today(), fatture: [] }, { nome: vv.nome, cat: vv.cat, data: vv.data, costo: N(vv.costo), anni: vv.anni ? N(vv.anni) : (B.CATEGORIE[vv.cat] || {}).anni, residuo: N(vv.residuo), fine: vv.fine || null, mezzo: vv.mezzo || null, note: vv.note || '' });
      await B.salva(o);
    },
    onDelete: b ? async () => { await B.togli(b.id); } : null,
    done: nuovo ? 'Bene aggiunto: la quota entra nel conto economico' : 'Bene salvato',
  });
}

/* ---------------- azioni ---------------- */
export async function beniAct(a, b, d, rerender) {
  switch (a) {
    case 'c-beNuovo': return formBene(null);
    case 'c-beApri': { const x = B.bene(d.id); if (x) formBene(x); return; }
    case 'c-beTutte': ST.tutte = true; return rerender();
    case 'c-beSelTutte': { const P = B.proposte(); const vis = ST.tutte ? P : P.slice(0, 40); const tutte = vis.every(p => scelta(p).on); vis.forEach(p => { scelta(p).on = !tutte; }); return rerender(); }
    case 'c-beAggiungi': {
      const sel = B.proposte().filter(p => scelta(p).on).map(p => { const s = scelta(p); return Object.assign({}, p, { cat: s.cat, anni: N(s.anni) || B.CATEGORIE[s.cat].anni, nome: s.nome || p.nome }); });
      if (!sel.length) return; b.disabled = true;
      try { const n = await B.creaDaProposte(sel); sel.forEach(p => ST.scelte.delete(p.fid)); toast(n === 1 ? '1 bene aggiunto al registro' : `${n} beni aggiunti al registro`); } catch (e) { toast(e.message, 'err'); b.disabled = false; }
      return;
    }
    case 'c-beScarta': {
      const fids = B.proposte().filter(p => scelta(p).on).map(p => p.fid); if (!fids.length) return;
      return arm(b, `Conferma: ${fids.length === 1 ? '1 fattura' : fids.length + ' fatture'} fuori`, async () => { await B.scarta(fids); fids.forEach(f => ST.scelte.delete(f)); toast('Non le propongo più come beni'); });
    }
  }
}
export function beniChange(t, rerender) {
  const a = t.dataset.act; const p = B.proposte().find(x => x.fid === t.dataset.fid); if (!p) return;
  const s = scelta(p);
  if (a === 'c-beSel') { s.on = t.checked; return rerender(); }
  if (a === 'c-beCat') { const vecchio = B.CATEGORIE[s.cat]; if (!N(s.anni) || (vecchio && N(s.anni) === vecchio.anni)) s.anni = B.CATEGORIE[t.value].anni; s.cat = t.value; s.on = true; return rerender(); }
  if (a === 'c-beAnni') { const v = parseFloat(String(t.value).replace(',', '.')); s.anni = isFinite(v) && v > 0 ? v : null; s.on = true; return; }
  if (a === 'c-beNome') { s.nome = t.value.trim(); s.on = true; return; }
}

// Pagina "Report del mese" (js/report.js): scelta del mese, controllo di completezza, sezioni con numeri e tabelle,
// istantanea salvata (non cambia più) o dati di adesso, esportazione in Excel, CSV e stampa/PDF. reportCard() = riquadro
// della dashboard con l'ultimo report. Azioni rp-* (rpAct, chiamata da app.js).
import { S, UI, COLS, bus } from '../state.js';
import { esc, nf, fd, today } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm } from '../ui.js';
import * as store from '../store.js';
import * as R from '../report.js';
import { tabella, registro, esporta, stampa, fmtVal } from '../conti/tabelle.js';
import { contiVisibili } from './conti.js';
import { vai, numeroDubbi } from '../automazioni.js';

const meseOra = () => today().slice(0, 7);
const mese = () => { const m = UI.f.rp_m; return R.okM(m) && m <= meseOra() ? m : R.meseChiuso(); };
const conConti = () => contiVisibili() && !UI.f.rp_senzaConti;
const Maiusc = s => s.charAt(0).toUpperCase() + s.slice(1);
const ora = iso => { const d = new Date(iso); return isNaN(d) ? '' : fd(iso.slice(0, 10)) + ' alle ' + d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }); };

// il report di adesso si ricalcola solo quando cambiano i dati, il mese o la scelta dei Conti
let cache = null;
function adesso(m, cc) {
  const deps = [m, cc, numeroDubbi(), ...COLS.map(c => S[c])];
  if (cache && cache.deps.every((x, i) => x === deps[i])) return cache.v;
  const v = R.prepara(m, { conti: cc }); cache = { deps, v }; return v;
}
/** Quello che mostra la pagina: l'istantanea salvata (se c'è e non si chiedono i dati di adesso) o i dati di adesso. */
function scelto() {
  const m = mese(), cc = conConti();
  if (UI.f.rp_visto !== m) { UI.f.rp_visto = m; UI.f.rp_live = false; }   // cambiando mese (anche dalla tendina) si torna al report salvato
  const ist = R.istantanea(m, cc);
  // il titolare con "Con i Conti" e solo l'istantanea senza Conti: la mostra, ma dice che i Conti non ci sono
  if (ist && !UI.f.rp_live) return { m, cc, ist, rep: ist.rep };
  return { m, cc, ist, rep: adesso(m, cc) };
}

/* ---------------- pezzi ---------------- */
const num = f => f && f !== 'text' && f !== 'date';
function valore(k) {
  if (k.v === null || k.v === undefined || k.v === '') return k.testo ? `<span class="k-t">${esc(k.testo)}</span>` : '—';
  if (typeof k.v !== 'number') return esc(k.v);
  if (k.f === 'eur') return nf(Math.round(k.v), 0) + '<small>€</small>';
  if (k.f === 'eur2') return k.v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '<small>€</small>';
  if (k.f === 'eur3') return k.v.toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  return nf(k.v, k.f === 'n1' ? 1 : k.f === 'n2' ? 2 : 0);
}
const testoValore = k => (k.v === null || k.v === undefined || k.v === '' ? k.testo || '—' : typeof k.v !== 'number' ? String(k.v) : k.f === 'eur' ? nf(Math.round(k.v), 0) + ' €' : k.f === 'eur2' ? fmtVal(k.v, 'eur2') : k.f === 'eur3' ? fmtVal(k.v, 'eur3') : nf(k.v, k.f === 'n1' ? 1 : k.f === 'n2' ? 2 : 0)) + (k.u && k.v !== null && k.v !== undefined ? ' ' + k.u : '');
function cmp(k) {
  if (k.d === null || k.d === undefined) return '';
  const a = Math.abs(k.d); if (a < 0.5) return `<span class="k-cmp"><span class="d">=</span>${esc(k.dl || '')}</span>`;
  const bene = k.peggio === 'su' ? k.d < 0 : k.peggio === 'giu' ? k.d > 0 : null;
  return `<span class="k-cmp"><span class="d${bene === null ? '' : bene ? ' ok' : ' bad'}">${k.d > 0 ? '▲' : '▼'} ${nf(a, a < 10 ? 1 : 0)}%</span>su ${esc(k.dl || '')}</span>`;
}
const kpiHtml = k => `<div class="kpi"><span class="k-l">${esc(k.l)}</span><span class="k-v">${valore(k)}${k.u && k.v !== null && k.v !== undefined ? `<small>${esc(k.u)}</small>` : ''}</span>${cmp(k)}${k.s ? `<span class="k-s">${esc(k.s)}</span>` : ''}</div>`;
const idTab = (s, t) => 'rp-' + s.id + '-' + t.id;

function controlliHtml(rep, ist) {
  const C = rep.controlli || []; const ko = C.filter(x => !x.ok);
  return `<section class="card rp-ctl"><div class="card-h"><h2>${ic('list-checks')}È tutto completo?</h2>${ko.length ? `<span class="chip warn num">${ko.length} da sistemare</span>` : `<span class="chip ok">tutto a posto</span>`}</div>
  ${ist && !UI.f.rp_live ? `<p class="muted small rp-nota">Com'era il ${esc(ora(ist.quando || rep.quando))}, quando è stato salvato il report.</p>` : ''}
  <div class="list flat">${C.map(x => `<div class="row rp-c ${x.ok ? 'ok' : 'ko'}">${ic(x.ok ? 'circle-check' : 'triangle-alert')}<span class="r-main"><b>${esc(x.testo)}</b>${x.dett ? `<span>${esc(x.dett)}</span>` : ''}</span>${!x.ok && x.go ? `<button class="btn sm" data-act="rp-vai" data-go="${esc(JSON.stringify(x.go))}">Sistema</button>` : ''}</div>`).join('')}</div></section>`;
}
function sezioneHtml(s, m) {
  const tabs = (s.tabelle || []).filter(t => t.rows && t.rows.length);
  const vuota = !tabs.length && !(s.kpi || []).some(k => k.v);
  return `<section class="card rp-sez" id="rp-${esc(s.id)}"><div class="card-h"><h2>${ic(s.icona || 'file-text')}${esc(s.titolo)}</h2>${s.riservata ? `<span class="chip">${ic('shield-check')}solo titolare</span>` : ''}</div>
  ${(s.kpi || []).length ? `<div class="kpis rp-k">${s.kpi.map(kpiHtml).join('')}</div>` : ''}
  ${(s.note || []).map(n => `<p class="muted small rp-nota">${esc(n)}</p>`).join('')}
  ${vuota ? `<p class="muted rp-nota">Niente da segnare ${esc(R.diMese(m))}.</p>` : ''}
  ${tabs.map(t => `<h3 class="rp-th">${esc(t.title)}</h3>${tabella(idTab(s, t), { title: t.title, sheet: t.sheet, sub: Maiusc(R.nomeMese(m)), cols: t.cols, rows: t.rows, tot: t.tot, note: t.note })}${t.note ? `<p class="muted small rp-nota">${esc(t.note)}</p>` : ''}`).join('')}</section>`;
}
function statoHtml(m, ist, rep, cc) {
  const lett = store.soloLettura(); const chiuso = m < meseOra();
  const b = (act, icn, t, cls = 'ghost') => lett ? '' : `<button class="btn sm ${cls}" data-act="${act}">${ic(icn)}${esc(t)}</button>`;
  if (ist && !UI.f.rp_live) {
    const senza = cc && !rep.conti;
    return `<div class="au-st ok">${ic('shield-check')}<span><b>Report salvato il ${esc(ora(ist.quando || rep.quando))}${ist.come === 'automatico' ? ' dal Centro automatico' : ist.come === 'confermato' ? ' (confermato nel Centro automatico)' : ''}</b><small>Resta così anche se i dati cambiano dopo.${senza ? ' È la copia senza i Conti: tocca "Rifai il report" per aggiungerli.' : ''}</small></span></div>
    <div class="rp-azioni"><button class="btn sm ghost" data-act="rp-live">${ic('refresh-cw')}Guarda i dati di adesso</button>${b('rp-rifai', 'check', 'Rifai il report')}</div>`;
  }
  if (ist) return `<div class="au-st warn">${ic('refresh-cw')}<span><b>Stai guardando i dati di adesso</b><small>Il report salvato il ${esc(ora(ist.quando))} può essere diverso.</small></span></div>
    <div class="rp-azioni"><button class="btn sm" data-act="rp-live">${ic('shield-check')}Torna al report salvato</button>${b('rp-rifai', 'check', 'Rifai il report con questi dati')}</div>`;
  if (!chiuso) return `<div class="au-st">${ic('calendar-range')}<span><b>Il mese non è ancora finito</b><small>I numeri arrivano fino a oggi. Il primo del mese dopo il Centro automatico salva il report da solo.</small></span></div>`;
  return `<div class="au-st">${ic('refresh-cw')}<span><b>Report non ancora salvato</b><small>Questi sono i dati di adesso. Il Centro automatico lo salva da solo quando è completo, oppure salvalo tu.</small></span></div>
    <div class="rp-azioni">${b('rp-salva', 'check', 'Salva il report', '')}</div>`;
}

/* ---------------- pagina ---------------- */
export function render() {
  const { m, cc, ist, rep } = scelto();
  const salvati = new Set(R.mesiSalvati());
  const mesi = []; for (let x = meseOra(), i = 0; i < 25; i++, x = R.mesePrima(x)) mesi.push(x);
  salvati.forEach(x => { if (!mesi.includes(x)) mesi.push(x); }); mesi.sort().reverse();
  if (!mesi.includes(m)) mesi.unshift(m);
  for (const k of [...registro.keys()]) if (k.startsWith('rp-')) registro.delete(k);   // le tabelle del mese visto prima non si esportano
  const html = `<div class="rp">
  <section class="card rp-top">
    <div class="rp-bar">
      <button class="btn sm ghost" data-act="rp-prima" aria-label="Mese prima">${ic('chevron-left')}</button>
      <select id="rpMese" data-filter="rp_m" aria-label="Mese del report">${mesi.map(x => `<option value="${x}"${x === m ? ' selected' : ''}>${esc(Maiusc(R.nomeMese(x)))}${salvati.has(x) ? ' · salvato' : ''}</option>`).join('')}</select>
      <button class="btn sm ghost" data-act="rp-dopo" aria-label="Mese dopo"${m >= meseOra() ? ' disabled' : ''}>${ic('chevron-right')}</button>
      ${contiVisibili() ? `<button class="chip rp-cc${cc ? ' on' : ''}" data-act="rp-conti" aria-pressed="${cc}">${ic('wallet')}Con i Conti</button>` : ''}
    </div>
    ${statoHtml(m, ist, rep, cc)}
    <div class="exp-btns"><button class="btn sm ghost" data-act="rp-exp" data-fmt="xlsx">${ic('file-spreadsheet')}Excel</button><button class="btn sm ghost" data-act="rp-exp" data-fmt="csv">${ic('file-down')}CSV</button><button class="btn sm ghost" data-act="rp-exp" data-fmt="print">${ic('printer')}Stampa / PDF</button></div>
  </section>
  ${controlliHtml(rep, ist)}
  ${(rep.sezioni || []).length ? rep.sezioni.map(s => sezioneHtml(s, m)).join('') : `<section class="card"><p class="muted rp-nota">Non ci sono dati per ${esc(R.nomeMese(m))}.</p></section>`}
  </div>`;
  return { title: 'Report del mese', html };
}

/* ---------------- esportazione ---------------- */
function riepilogo(rep) {
  const rows = [{ _sez: 'Controllo di completezza' }];
  for (const x of rep.controlli || []) rows.push({ voce: x.testo, valore: x.ok ? 'a posto' : 'da sistemare', nota: x.dett || '' });
  for (const s of rep.sezioni || []) { rows.push({ _sez: s.titolo }); for (const k of s.kpi || []) rows.push({ voce: k.l, valore: testoValore(k), nota: [k.s, k.d !== null && k.d !== undefined ? (k.d > 0 ? '+' : '') + nf(k.d, 1) + '% su ' + (k.dl || '') : ''].filter(Boolean).join(' · ') }); for (const n of s.note || []) rows.push({ voce: '', valore: '', nota: n }); }
  return { title: 'Riepilogo ' + R.nomeMese(rep.mese), sheet: 'Riepilogo', sub: (rep.conti ? 'Con i Conti' : 'Senza i Conti') + ' · dati al ' + fd(rep.finoAl || rep.mese + '-01'), cols: [{ k: 'voce', h: 'Voce' }, { k: 'valore', h: 'Valore' }, { k: 'nota', h: 'Note' }], rows };
}
function corpoStampa(rep, ist) {
  const td = (c, r) => { const v = r[c.k]; return `<td class="${num(c.fmt) ? 'n' : ''}">${esc(fmtVal(v, c.fmt))}</td>`; };
  const tHtml = t => `<h3>${esc(t.title)}</h3><table><thead><tr>${t.cols.map(c => `<th class="${num(c.fmt) ? 'n' : ''}">${esc(c.h)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${t.cols.map(c => td(c, r)).join('')}</tr>`).join('')}${t.tot ? `<tr class="tot">${t.cols.map(c => td(c, t.tot)).join('')}</tr>` : ''}</tbody></table>${t.note ? `<p class="nota">${esc(t.note)}</p>` : ''}`;
  const css = `<style>h3{font-size:11px;color:#1E4D3A;margin:10px 0 3px;break-after:avoid}.kp{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 8px}.kp div{border:0.5px solid #C9D3CE;border-radius:3px;padding:4px 8px;min-width:130px;break-inside:avoid}.kp b{display:block;font-size:13px}.kp small{color:#6B7A72;display:block}.ctl td.ok{color:#1E4D3A}.ctl td.ko{color:#A3330F;font-weight:700}.info{color:#6B7A72;margin:0 0 6px}h2{border-bottom:1px solid #1E4D3A;padding-bottom:2px}</style>`;
  const info = ist && !UI.f.rp_live ? 'Report salvato il ' + ora(ist.quando || rep.quando) + ': resta così anche se i dati cambiano.' : 'Dati di adesso (' + ora(rep.quando) + ').';
  const ctl = `<h2>Controllo di completezza</h2><table class="ctl"><tbody>${(rep.controlli || []).map(x => `<tr><td class="${x.ok ? 'ok' : 'ko'}">${x.ok ? 'A posto' : 'Da sistemare'}</td><td>${esc(x.testo)}</td><td>${esc(x.dett || '')}</td></tr>`).join('')}</tbody></table>`;
  const sez = (rep.sezioni || []).map(s => `<h2>${esc(s.titolo)}</h2>${(s.kpi || []).length ? `<div class="kp">${s.kpi.map(k => `<div>${esc(k.l)}<b>${esc(testoValore(k))}</b>${k.s ? `<small>${esc(k.s)}</small>` : ''}${k.d !== null && k.d !== undefined ? `<small>${k.d > 0 ? '+' : ''}${esc(nf(k.d, 1))}% su ${esc(k.dl || '')}</small>` : ''}</div>`).join('')}</div>` : ''}${(s.note || []).map(n => `<p class="nota">${esc(n)}</p>`).join('')}${(s.tabelle || []).filter(t => t.rows && t.rows.length).map(tHtml).join('')}`).join('');
  return css + `<p class="info">${esc(info)}${rep.conti ? '' : ' Senza i Conti.'}</p>` + ctl + sez;
}
async function esportaReport(fmt) {
  const { m, ist, rep } = scelto();
  const nome = 'Report ' + R.nomeMese(m);
  if (fmt === 'print') return stampa(Maiusc(nome), corpoStampa(rep, ist));
  registro.set('rp-riepilogo', riepilogo(rep));
  const ids = ['rp-riepilogo'];
  for (const s of rep.sezioni || []) for (const t of s.tabelle || []) if (t.rows && t.rows.length) { const id = idTab(s, t); if (!registro.has(id)) registro.set(id, { title: t.title, sheet: t.sheet, sub: Maiusc(R.nomeMese(m)), cols: t.cols, rows: t.rows, tot: t.tot, note: t.note }); ids.push(id); }
  await esporta(ids, nome, fmt);
}

/* ---------------- azioni ---------------- */
export async function rpAct(a, b, d) {
  const m = mese();
  switch (a) {
    case 'rp-prima': UI.f.rp_m = R.mesePrima(m); UI.f.rp_live = false; return bus.render();
    case 'rp-dopo': if (m < meseOra()) { UI.f.rp_m = R.meseDopo(m); UI.f.rp_live = false; } return bus.render();
    case 'rp-conti': UI.f.rp_senzaConti = !UI.f.rp_senzaConti; return bus.render();
    case 'rp-live': UI.f.rp_live = !UI.f.rp_live; return bus.render();
    case 'rp-salva': b.disabled = true; try { await R.salva(m); UI.f.rp_live = false; toast('Report ' + R.diMese(m) + ' salvato'); } catch (e) { b.disabled = false; throw e; } return bus.render();
    case 'rp-rifai': return arm(b, 'Sicuro? Rifai il report', async () => { b.disabled = true; try { await R.salva(m); UI.f.rp_live = false; toast('Report ' + R.diMese(m) + ' rifatto con i dati di adesso'); } catch (e) { b.disabled = false; toast(e.message || 'Non riuscito', 'err'); } bus.render(); });
    case 'rp-vai': { const g = JSON.parse(d.go || '{}'); if (g.anno) UI.anno = +g.anno; if (g.f) UI.f[g.f] = g.v; return vai({ area: g.area, tab: g.tab, sub: g.sub }); }
    case 'rp-apri': if (R.okM(d.m)) UI.f.rp_m = d.m; UI.f.rp_live = false; return vai({ tab: 'report' });
    case 'rp-exp': return esportaReport(d.fmt);
  }
}

/* ---------------- riquadro della dashboard ---------------- */
/** L'ultimo report salvato (o, se non c'è ancora, quello del mese finito): mese, completezza e tre numeri. */
export function reportCard() {
  // solo la copia senza Conti (config 'rp-'): la dashboard si guarda anche con altre persone vicino
  const mc = R.meseChiuso(); const u = R.mesiSalvati().map(x => R.istantanea(x, false)).find(Boolean) || null;
  const conDati = S.capi.length || S.operazioni.length || S.latte.length || S.prodotti.length || S.fatture.length;
  if (!u && !conDati) return '';
  const head = (t, m) => `<div class="card-h"><h2>${ic('calendar-range')}${esc(t)}</h2><button class="btn sm ghost" data-act="rp-apri" data-m="${m}">Apri</button></div>`;
  if (!u) return `<section class="card rp-card">${head('Report del mese', mc)}<div class="au-st">${ic('refresh-cw')}<span><b>Il report ${esc(R.diMese(mc))} non è ancora salvato</b><small>Lo salva il Centro automatico quando i dati del mese sono completi. Puoi già guardarlo.</small></span></div></section>`;
  const rep = u.rep || {}; const ko = (rep.controlli || []).filter(x => !x.ok);
  const pref = ['stalla', 'campagna', 'magazzino'];
  const K = []; for (const id of pref) { const s = (rep.sezioni || []).find(x => x.id === id); const k = s && (s.kpi || []).find(x => x.v); if (k && K.length < 3) K.push(Object.assign({}, k, { l: s.titolo + ' · ' + k.l, d: null, s: '' })); }
  return `<section class="card rp-card">${head('Report ' + Maiusc(R.nomeMese(u.mese)), u.mese)}
  <div class="au-st${ko.length ? ' warn' : ' ok'}">${ic(ko.length ? 'triangle-alert' : 'circle-check')}<span><b>${ko.length ? 'Salvato con ' + ko.length + (ko.length === 1 ? ' cosa da sistemare' : ' cose da sistemare') : 'Completo'}</b><small>${esc(ko.length ? ko.map(x => x.testo).slice(0, 2).join(' · ') : 'Salvato il ' + ora(u.quando || rep.quando))}</small></span></div>
  ${K.length ? `<div class="kpis rp-k">${K.map(kpiHtml).join('')}</div>` : ''}
  ${u.mese < mc ? `<p class="muted small rp-nota">Il report ${esc(R.diMese(mc))} non è ancora salvato: <button class="btn-link" data-act="rp-apri" data-m="${mc}">guardalo</button>.</p>` : ''}</section>`;
}

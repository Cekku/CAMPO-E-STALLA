// Azoto e nitrati: azoto della stalla, azoto distribuito per campo, limiti e valori di riferimento
import { S, UI } from '../state.js';
import { esc, nf, N } from '../util.js';
import { ic } from '../icons.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import { nitConfig, bilancioCampi, azotoStalla, coltureMas, LIMITI, CAPI_DEF, MAS_DEF } from '../nitrati.js';
import * as store from '../store.js';

const lv = s => s === 'Oltre il limite' ? 'bad' : s === 'Vicino al limite' || s === 'Manca la superficie' ? 'warn' : s === 'Nel limite' ? 'ok' : '';

export function render() {
  const Y = UI.anno, cfg = nitConfig(), st = azotoStalla(Y, cfg), rows = bilancioCampi(Y, cfg);
  const sub = UI.sub && UI.sub.nitrati === 'valori' ? 'valori' : 'bilancio';
  const tabs = `<div class="tabs" role="tablist"><button role="tab" data-act="sub" data-sec="nitrati" data-sub="bilancio" aria-selected="${sub === 'bilancio'}">Bilancio ${Y}</button><button role="tab" data-act="sub" data-sec="nitrati" data-sub="valori" aria-selected="${sub === 'valori'}">Valori di riferimento</button></div>`;
  if (sub === 'valori') return { title: 'Azoto e nitrati', html: tabs + valori(cfg) };

  const oltre = st.carico > st.limite;
  const kpis = `<div class="kpis">
    <div class="kpi"><span class="k-l">${ic('milk')}Azoto della stalla</span><span class="k-v">${nf(st.prodotto, 0)}<small>kg N/anno</small></span><span class="k-s">con i capi presenti oggi</span></div>
    <div class="kpi"><span class="k-l">${ic('sprout')}Carico per ettaro</span><span class="k-v">${nf(st.carico, 0)}<small>kg N/ha</small></span><span class="k-s ${oltre ? 'neg' : ''}">limite ${st.limite} (${st.zona === 'ZVN' ? 'zona vulnerabile' : 'zona ordinaria'}) su ${nf(st.sau, 1)} ha</span></div>
    <div class="kpi"><span class="k-l">${ic('map')}Ettari che servono</span><span class="k-v">${nf(st.haMinimi, 1)}<small>ha</small></span><span class="k-s">per spandere tutto l'azoto della stalla</span></div>
    <div class="kpi"><span class="k-l">${ic('droplets')}Effluenti sparsi nel ${Y}</span><span class="k-v">${nf(st.distribuitoHa, 0)}<small>kg N/ha</small></span><span class="k-s">${nf(st.distribuito, 0)} kg N registrati nelle concimazioni</span></div>
  </div>`;

  const nBad = rows.filter(r => r.stato === 'Oltre il limite').length, nWarn = rows.filter(r => r.stato === 'Vicino al limite').length;
  const al = [];
  if (oltre) al.push(['bad', 'Troppo azoto della stalla per la superficie', `Il limite è ${st.limite} kg/ha: servono almeno ${nf(st.haMinimi, 1)} ha, ne hai ${nf(st.sau, 1)}.`]);
  if (nBad) al.push(['bad', nBad === 1 ? 'Un campo oltre il massimo' : nBad + ' campi oltre il massimo', 'Hanno ricevuto più azoto efficiente di quanto ammesso per la coltura.']);
  if (nWarn) al.push(['warn', nWarn === 1 ? 'Un campo vicino al massimo' : nWarn + ' campi vicini al massimo', 'Hanno già usato più del 90% del massimo per la coltura.']);
  const avviso = al.length ? `<section class="card"><div class="alerts">${al.map(([l, t, x]) => `<div class="alert ${l}"><span class="a-ic">${ic('triangle-alert')}</span><span class="a-tx"><b>${esc(t)}</b><span>${esc(x)}</span></span></div>`).join('')}</div></section>` : '';

  const tot = rows.reduce((t, r) => ({ ha: t.ha + r._ha, n: t.n + r.nTot }), { ha: 0, n: 0 });
  const tCampi = tabella('nit_campi', {
    title: 'Azoto per campo ' + Y, sub: 'Massimi per coltura: valori indicativi da controllare con il tecnico',
    cols: [
      { k: 'nome', h: 'Campo', html: r => `<button class="lnk" data-act="open" data-type="campo" data-id="${r.id}">${esc(r.nome)}</button>` },
      { k: 'coltura', h: 'Coltura' },
      { k: 'ha', h: 'Ettari', fmt: 'num2' },
      { k: 'nTot', h: 'Azoto totale (kg)', fmt: 'num1' },
      { k: 'nEffHa', h: 'Azoto efficiente (kg/ha)', fmt: 'num1' },
      { k: 'nZooHa', h: 'Da effluenti (kg/ha)', fmt: 'num1' },
      { k: 'mas', h: 'Massimo (kg/ha)', fmt: 'num' },
      { k: 'quota', h: 'Usato del massimo', fmt: 'pct' },
      { k: 'pHa', h: 'P₂O₅ (kg/ha)', fmt: 'num1' },
      { k: 'kHa', h: 'K₂O (kg/ha)', fmt: 'num1' },
      { k: 'stato', h: 'Stato', html: r => r.stato === '—' ? '—' : `<span class="chip ${lv(r.stato)}">${esc(r.stato)}</span>` },
    ],
    rows, tot: { nome: 'Totale', ha: Math.round(tot.ha * 100) / 100, nTot: Math.round(tot.n * 10) / 10 },
  });
  const tStalla = tabella('nit_stalla', {
    title: 'Azoto prodotto dalla stalla', sub: 'Capi presenti oggi × azoto al campo per capo',
    cols: [{ k: 'stato', h: 'Capi' }, { k: 'capi', h: 'Numero', fmt: 'int' }, { k: 'kg', h: 'kg N per capo all\'anno', fmt: 'num' }, { k: 'tot', h: 'kg N all\'anno', fmt: 'num' }],
    rows: st.righe, tot: { stato: 'Totale', capi: st.righe.reduce((s, r) => s + r.capi, 0), tot: Math.round(st.prodotto) },
  });

  const vuoto = !rows.some(r => r.nOp) ? `<p class="muted small">Nessuna concimazione con azoto nel ${Y}. Per contare l'azoto, registra le concimazioni con un prodotto di magazzino di categoria <b>Concime</b> (con il titolo N-P-K) o <b>Effluente</b> (liquame, letame, digestato, con i kg di azoto per m³ o per t).</p>` : '';
  return { title: 'Azoto e nitrati', html: tabs + kpis + avviso + `
    <section class="card"><div class="card-h"><h2>${ic('sprout')}Azoto per campo</h2>${bottoniExport(['nit_campi', 'nit_stalla'], 'Bilancio azoto ' + Y)}</div>${vuoto}${tCampi}
    <p class="muted small">Azoto efficiente = azoto dei concimi + azoto degli effluenti per la loro efficienza. I massimi per coltura e i valori della stalla sono indicativi: controllali con il tecnico o con il regolamento regionale e correggili in "Valori di riferimento".</p></section>
    <section class="card"><div class="card-h"><h2>${ic('milk')}Azoto della stalla</h2></div>${tStalla}</section>` };
}

function valori(cfg) {
  const num = (id, l, v) => `<label class="fld half"><span class="flabel">${esc(l)}</span><div class="inwrap"><input id="${id}" type="number" inputmode="decimal" min="0" step="1" value="${esc(v ?? '')}"></div></label>`;
  return `<form class="card" data-form-act="nitrati">
    <div class="card-h"><h2>${ic('settings')}Valori di riferimento</h2></div>
    <p class="muted small">Valori di partenza indicativi presi dalle norme nazionali. Fai controllare al tecnico quelli giusti per la tua zona e correggili qui: valgono per tutta l'azienda.</p>
    <div class="fgrid"><label class="fld"><span class="flabel">Zona dell'azienda</span><div class="inwrap"><select id="nit_zona"><option value="ZVN"${cfg.zona === 'ZVN' ? ' selected' : ''}>Zona vulnerabile ai nitrati (limite ${LIMITI.ZVN} kg N/ha)</option><option value="Ordinaria"${cfg.zona === 'Ordinaria' ? ' selected' : ''}>Zona ordinaria (limite ${LIMITI.Ordinaria} kg N/ha)</option></select></div></label></div>
    <h3>Azoto al campo per capo all'anno (kg)</h3>
    <div class="fgrid">${Object.keys(CAPI_DEF).map((k, i) => num('nit_c' + i, k, cfg.capi[k])).join('')}</div>
    <h3>Massimo di azoto efficiente per coltura (kg/ha all'anno)</h3>
    <div class="fgrid">${coltureMas().map((k, i) => num('nit_m' + i, k, cfg.mas[k])).join('')}</div>
    <div class="btns"><button class="btn primary" type="submit">${ic('check')}Salva</button><button class="btn ghost" type="button" data-act="nitReset">Rimetti i valori di partenza</button></div>
  </form>`;
}

// Salvataggio del modulo (chiamato da app.js, submit data-form-act="nitrati")
export async function salvaNitrati($) {
  const val = id => { const e = $('#' + id); return e && e.value !== '' ? N(e.value) : null; };
  const capi = {}; Object.keys(CAPI_DEF).forEach((k, i) => { const v = val('nit_c' + i); if (v !== null) capi[k] = v; });
  const mas = {}; coltureMas().forEach((k, i) => { const v = val('nit_m' + i); if (v !== null) mas[k] = v; });
  const old = S.config.find(x => x.id === 'nitrati') || {};
  await store.put('config', 'nitrati', Object.assign({}, old, { zona: $('#nit_zona').value, capi, mas }));
}
export async function resetNitrati() { await store.put('config', 'nitrati', { zona: nitConfig().zona, capi: Object.assign({}, CAPI_DEF), mas: Object.assign({}, MAS_DEF) }); }

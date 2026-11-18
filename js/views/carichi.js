// Pesate del raccolto: ogni carico che arriva dal campo, totali per coltura e per campo, resa per ettaro
import { S, UI, get } from '../state.js';
import { esc, nf, N, yearOf } from '../util.js';
import { ic } from '../icons.js';
import { campoHa, cropOf } from '../domain.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import { empty, newBtn } from '../ui.js';

const r1 = x => Math.round(x * 10) / 10;
const dove = c => { const s = get('silos', c.siloId); return s ? s.nome : (c.destinazione || ''); };

export function render() {
  const Y = UI.anno, tutti = S.carichi.filter(c => yearOf(c.data) === Y);
  const nuova = newBtn('carichi', 'Nuova pesata', '', 'primary');
  if (!tutti.length) return { title: 'Pesate del raccolto', html: `<section class="card">${empty('scale', 'Nessuna pesata nel ' + Y, 'Registra ogni carico che arriva dal campo: peso, campo, trincea o silo e documento. Avrai i totali e la resa per ettaro.', nuova)}</section>` };

  const colDi = c => { const campo = get('campi', c.campoId); return (campo && cropOf(campo, Y)) || 'Senza coltura'; };
  const colonne = [...new Set(tutti.map(colDi))].sort((a, b) => a.localeCompare(b, 'it'));
  const f = colonne.includes(UI.f.kcol) ? UI.f.kcol : '';
  const lista = tutti.filter(c => !f || colDi(c) === f);

  // per campo
  const perCampo = new Map();
  lista.forEach(c => {
    const campo = get('campi', c.campoId); const k = c.campoId || '-';
    const r = perCampo.get(k) || { id: c.campoId, nome: campo ? campo.nome : '(campo eliminato)', coltura: colDi(c), ha: campo ? campoHa(campo) : 0, n: 0, kg: 0, um: 0, nUm: 0 };
    r.n++; r.kg += N(c.netto); if (N(c.umidita) > 0) { r.um += N(c.umidita); r.nUm++; }
    perCampo.set(k, r);
  });
  const rCampo = [...perCampo.values()].map(r => ({ id: r.id, nome: r.nome, coltura: r.coltura, ha: r.ha, carichi: r.n, t: r1(r.kg / 1000), resa: r.ha > 0 ? r1(r.kg / 1000 / r.ha) : null, um: r.nUm ? r1(r.um / r.nUm) : null })).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));

  // per coltura e prodotto
  const perCol = new Map();
  lista.forEach(c => {
    const col = colDi(c), prod = c.prodottoRaccolto || '—', k = col + '|' + prod;
    const r = perCol.get(k) || { coltura: col, prodotto: prod, campi: new Set(), n: 0, kg: 0 };
    r.campi.add(c.campoId); r.n++; r.kg += N(c.netto); perCol.set(k, r);
  });
  const haDi = ids => [...ids].reduce((s, id) => s + (get('campi', id) ? campoHa(get('campi', id)) : 0), 0);
  const rCol = [...perCol.values()].map(r => { const ha = haDi(r.campi); return { coltura: r.coltura, prodotto: r.prodotto, campi: r.campi.size, ha, carichi: r.n, t: r1(r.kg / 1000), resa: ha > 0 ? r1(r.kg / 1000 / ha) : null }; }).sort((a, b) => a.coltura.localeCompare(b.coltura, 'it') || a.prodotto.localeCompare(b.prodotto, 'it'));

  const kgTot = lista.reduce((s, c) => s + N(c.netto), 0), haTot = rCampo.reduce((s, r) => s + r.ha, 0);
  const kpis = `<div class="kpis">
    <div class="kpi"><span class="k-l">${ic('scale')}Raccolto pesato</span><span class="k-v">${nf(kgTot / 1000, 1)}<small>t nette</small></span><span class="k-s">nel ${Y}</span></div>
    <div class="kpi"><span class="k-l">${ic('truck')}Carichi</span><span class="k-v">${lista.length}</span><span class="k-s">pesate registrate</span></div>
    <div class="kpi"><span class="k-l">${ic('map')}Ettari raccolti</span><span class="k-v">${nf(haTot, 1)}<small>ha</small></span><span class="k-s">campi con almeno una pesata</span></div>
    <div class="kpi"><span class="k-l">${ic('sprout')}Resa media</span><span class="k-v">${haTot > 0 ? nf(kgTot / 1000 / haTot, 1) : '—'}<small>t/ha</small></span><span class="k-s">tonnellate nette per ettaro</span></div>
  </div>`;

  const barra = `<div class="toolbar">${nuova}<select class="inp" data-filter="kcol" aria-label="Coltura"><option value="">Tutte le colture</option>${colonne.map(c => `<option${c === f ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></div>`;

  const tCol = tabella('kar_col', {
    title: 'Pesate per coltura ' + Y,
    cols: [{ k: 'coltura', h: 'Coltura' }, { k: 'prodotto', h: 'Prodotto' }, { k: 'campi', h: 'Campi', fmt: 'int' }, { k: 'ha', h: 'Ettari', fmt: 'num2' }, { k: 'carichi', h: 'Carichi', fmt: 'int' }, { k: 't', h: 'Tonnellate', fmt: 'num1' }, { k: 'resa', h: 't/ha', fmt: 'num1' }],
    rows: rCol,
  });
  const tCampo = tabella('kar_campo', {
    title: 'Pesate per campo ' + Y,
    cols: [
      { k: 'nome', h: 'Campo', html: r => r.id && get('campi', r.id) ? `<button class="lnk" data-act="open" data-type="campo" data-id="${r.id}">${esc(r.nome)}</button>` : esc(r.nome) },
      { k: 'coltura', h: 'Coltura' }, { k: 'ha', h: 'Ettari', fmt: 'num2' }, { k: 'carichi', h: 'Carichi', fmt: 'int' }, { k: 't', h: 'Tonnellate', fmt: 'num1' }, { k: 'resa', h: 't/ha', fmt: 'num1' }, { k: 'um', h: 'Umidità media %', fmt: 'num1' },
    ],
    rows: rCampo,
  });
  const righe = [...lista].sort((a, b) => String(b.data).localeCompare(String(a.data))).map(c => {
    const campo = get('campi', c.campoId);
    return { id: c.id, data: c.data, campo: campo ? campo.nome : '', prodotto: c.prodottoRaccolto || '', lordo: c.lordo === undefined || c.lordo === null || c.lordo === '' ? null : N(c.lordo), tara: c.tara === undefined || c.tara === null || c.tara === '' ? null : N(c.tara), netto: N(c.netto), umidita: N(c.umidita) > 0 ? N(c.umidita) : null, dove: dove(c), documento: c.documento || '', trasportatore: c.trasportatore || '', targa: c.targa || '' };
  });
  const tLista = tabella('kar_lista', {
    title: 'Tutte le pesate ' + Y,
    cols: [{ k: 'data', h: 'Data', fmt: 'date' }, { k: 'campo', h: 'Campo' }, { k: 'prodotto', h: 'Prodotto' }, { k: 'lordo', h: 'Lordo kg', fmt: 'num' }, { k: 'tara', h: 'Tara kg', fmt: 'num' }, { k: 'netto', h: 'Netto kg', fmt: 'num' }, { k: 'umidita', h: 'Umidità %', fmt: 'num1' }, { k: 'dove', h: 'Dove va' }, { k: 'documento', h: 'Documento' }, { k: 'trasportatore', h: 'Trasportatore' }, { k: 'targa', h: 'Targa' }],
    rows: righe, tot: { data: 'Totale', netto: Math.round(kgTot) },
    rowAttr: r => `data-act="edit" data-form="carichi" data-id="${r.id}" role="button" tabindex="0"`,
  });

  return { title: 'Pesate del raccolto', html: kpis + barra + `
    <section class="card"><div class="card-h"><h2>${ic('wheat')}Per coltura</h2>${bottoniExport(['kar_col', 'kar_campo', 'kar_lista'], 'Pesate del raccolto ' + Y)}</div>${tCol}</section>
    <section class="card"><div class="card-h"><h2>${ic('sprout')}Per campo</h2></div>${tCampo}</section>
    <section class="card"><div class="card-h"><h2>${ic('scale')}Tutte le pesate</h2></div>${tLista}</section>` };
}

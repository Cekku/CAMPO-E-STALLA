// Piano Colturale Grafico (AGEA / organismi pagatori): shapefile degli appezzamenti dichiarati con coltura e varietà.
// Gli appezzamenti si associano ai campi già disegnati che si sovrappongono, gli altri diventano campi nuovi.
import { S } from './state.js';
import { esc, nf, N } from './util.js';
import { ic } from './icons.js';
import { areaHa, insidePoint, pointInGeom } from './geo.js';
import { COLTURE, cropColorName } from './domain.js';
import { cropMatch } from './checks.js';
import * as store from './store.js';
import { openSheet, closeSheet, toast } from './ui.js';

const pick = (p, ...keys) => { for (const k of keys) { const f = Object.keys(p).find(x => x.toUpperCase() === k); if (f && p[f] !== null && p[f] !== undefined && String(p[f]).trim() !== '') return String(p[f]).trim(); } return ''; };
export const isPCG = p => !!p && Object.keys(p).some(k => /^(COD_COLT|DESC_COLT|DESC_COLTU|ID_APPEZ|SUP_APPEZ|ANNO_CAMP)$/i.test(k));

const title = s => s.toLowerCase().replace(/(^|[\s(/-])([a-zàèéìòù])/g, (m, a, b) => a + b.toUpperCase());
export function cropName(desc) {
  const d = String(desc || '').trim(); if (!d) return '';
  const n = d.toLowerCase();
  if (/mais|granoturco/.test(n) && /insil|trinc|ceros|foragg|pastone/.test(n)) return 'Mais trinciato';
  if (/mais|granoturco/.test(n)) return 'Mais da granella';
  if (/riposo|maggese|non coltiv/.test(n)) return 'Riposo';
  const exact = COLTURE.find(c => n.includes(c.toLowerCase())); if (exact) return exact;
  const fam = COLTURE.find(c => c !== 'Riposo' && cropMatch(d, c)); if (fam) return fam;
  return title(d);
}

export function pcgImport(items) {
  // un appezzamento può arrivare diviso in più poligoni: li unisco
  const groups = new Map();
  items.forEach(it => {
    const p = it.props || {};
    const anno = +pick(p, 'ANNO_CAMP', 'ANNO', 'CAMPAGNA') || new Date().getFullYear();
    const key = [anno, pick(p, 'ISTAT_COMU', 'COD_COMUNE'), pick(p, 'SEZI_CENS'), pick(p, 'NUME_FOGL', 'FOGLIO'), pick(p, 'ID_APPEZ', 'CODI_ISOL') || Math.random()].join('|');
    const g = groups.get(key) || { anno, props: p, polys: [] };
    (it.geom.type === 'Polygon' ? [it.geom.coordinates] : it.geom.coordinates).forEach(c => g.polys.push(c));
    groups.set(key, g);
  });
  const apps = [...groups.values()].map(g => {
    const p = g.props; const geom = g.polys.length === 1 ? { type: 'Polygon', coordinates: g.polys[0] } : { type: 'MultiPolygon', coordinates: g.polys };
    const desc = pick(p, 'DESC_COLT', 'DESC_COLTU', 'COLTURA', 'DESC_PROD');
    return {
      anno: g.anno, geom, ha: Math.round(areaHa(geom) * 10000) / 10000, coltura: cropName(desc), descOrig: desc, codColt: pick(p, 'COD_COLT'),
      varieta: title(pick(p, 'DESC_VAR', 'VARIETA')), destinazione: title(pick(p, 'DESC_DEST', 'DESC_USO')), foglio: pick(p, 'NUME_FOGL', 'FOGLIO'), app: pick(p, 'ID_APPEZ'), isola: pick(p, 'CODI_ISOL'),
      istat: pick(p, 'ISTAT_COMU', 'COD_COMUNE'), bio: /^(s|1|y|true)/i.test(pick(p, 'FLAG_BIO')),
    };
  }).filter(a => a.ha > 0);
  if (!apps.length) { toast('Nel piano colturale non ci sono appezzamenti con superficie.', 'err'); return; }
  const match = a => { const pt = insidePoint(a.geom); return S.campi.find(c => c.geom && (pointInGeom(pt, c.geom) || pointInGeom(insidePoint(c.geom), a.geom))) || null; };
  apps.forEach(a => { a.campo = match(a); });
  const anni = [...new Set(apps.map(a => a.anno))].sort();
  const crops = new Map(); apps.forEach(a => crops.set(a.coltura || 'Senza coltura', (crops.get(a.coltura || 'Senza coltura') || 0) + a.ha));
  const tot = apps.reduce((t, a) => t + a.ha, 0), nMatch = apps.filter(a => a.campo).length;
  const body = openSheet('Piano colturale grafico', `<div class="pcg">
    <div class="kpis three"><div class="kpi static"><span class="k-l">Campagna</span><span class="k-v">${anni.join(', ')}</span></div><div class="kpi static"><span class="k-l">Appezzamenti</span><span class="k-v">${apps.length}</span><span class="k-s">${nf(tot, 2)} ha</span></div><div class="kpi static"><span class="k-l">Già in mappa</span><span class="k-v">${nMatch}</span><span class="k-s">si sovrappongono a campi esistenti</span></div></div>
    <div class="crop-legend">${[...crops.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span><i style="background:${cropColorName(k === 'Senza coltura' ? '' : k)}"></i>${esc(k)} <em>${nf(v, 2)} ha</em></span>`).join('')}</div>
    <div class="seg wide" role="radiogroup"><label><input type="radio" name="pcgMode" value="match" checked><span>Aggiorna i campi esistenti e crea gli altri</span></label><label><input type="radio" name="pcgMode" value="new"><span>Crea tutti come campi nuovi</span></label></div>
    <div class="list flat pcg-list">${apps.slice(0, 200).map(a => `<div class="row static"><span class="r-icon" style="color:${cropColorName(a.coltura)}">${ic('sprout')}</span><span class="r-main"><b>${esc(a.coltura || 'Senza coltura')}${a.varieta ? ' · ' + esc(a.varieta) : ''}</b><span>${a.foglio ? 'Fg. ' + esc(a.foglio) + ' · ' : ''}${a.app ? 'app. ' + esc(a.app) + ' · ' : ''}${a.campo ? 'va su <b>' + esc(a.campo.nome) + '</b>' : 'nuovo campo'}${a.descOrig && a.descOrig.toLowerCase() !== (a.coltura || '').toLowerCase() ? ' · ' + esc(a.descOrig) : ''}</span></span><span class="chip ha num">${nf(a.ha, 2)} ha</span></div>`).join('')}</div>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" id="pcgGo">${ic('file-up')}Importa</button></div></div>`, { wide: true });
  body.querySelector('#pcgGo').onclick = async e => {
    e.target.disabled = true;
    const mode = (body.querySelector('input[name=pcgMode]:checked') || {}).value || 'match';
    const Y = new Date().getFullYear(); let upd = 0, nuovi = 0;
    for (const a of apps) {
      const entry = { anno: a.anno, coltura: a.coltura, varieta: a.varieta, destinazione: a.destinazione, pcg: true };
      const c = mode === 'match' && a.campo ? S.campi.find(x => x.id === a.campo.id) : null;
      if (c) {
        const list = (Array.isArray(c.colture) ? c.colture : []).filter(x => +x.anno !== a.anno); list.push(entry);
        const u = Object.assign({}, c, { colture: list.sort((x, y) => y.anno - x.anno), pcgId: a.app || c.pcgId || '' });
        if (a.anno === Y) { u.coltura = a.coltura; u.varieta = a.varieta; }
        if (!c.catasto && a.foglio) u.catasto = 'Fg. ' + a.foglio;
        await store.put('campi', c.id, u); upd++;
      } else {
        const nome = (a.foglio ? 'Fg. ' + a.foglio : 'Appezzamento') + (a.app ? ' · ' + a.app : '') + (a.coltura ? ' · ' + a.coltura : '');
        await store.put('campi', null, { nome, geom: a.geom, superficie: a.ha, coltura: a.anno === Y ? a.coltura : '', varieta: a.anno === Y ? a.varieta : '', colture: [entry], irriguo: 'No', conduzione: 'Proprietà', catasto: a.foglio ? 'Fg. ' + a.foglio : '', comuneIstat: a.istat, pcgId: a.app || '' });
        nuovi++;
      }
    }
    closeSheet(); toast(`Piano colturale importato: ${upd} campi aggiornati, ${nuovi} nuovi`);
    document.dispatchEvent(new CustomEvent('ces:fit'));
  };
}

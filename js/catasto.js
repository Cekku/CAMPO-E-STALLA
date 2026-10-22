// Catasto dell'Agenzia delle Entrate: ricerca di una particella per comune, foglio e numero, particella toccata sulla mappa,
// geometria della particella (WFS) per creare o ampliare un campo.
// I servizi dell'Agenzia non permettono le richieste dirette dal browser (niente CORS): passano da un piccolo
// "collegamento" (proxy) dell'utente: una funzione Supabase o un Cloudflare Worker (vedi LEGGIMI e cartella supabase/functions/catasto).
// Il WFS accetta solo richieste per riquadro (BBOX): per cercare foglio e particella si trova prima il riquadro del comune,
// poi i fogli del comune, poi le particelle del foglio, e si filtra per numero.
import { cloudConfig } from './store.js';
import { lsGet, lsSet } from './util.js';

export const WFS = 'https://wfs.cartografia.agenziaentrate.gov.it/inspire/wfs/owfs01.php';
export const WMS = 'https://wms.cartografia.agenziaentrate.gov.it/inspire/wms/ows01.php';

/* ---------------- collegamento ---------------- */
export const cfgCatasto = () => lsGet('ces.catasto', {}) || {};
export function salvaCfgCatasto(o) { lsSet('ces.catasto', Object.assign({}, cfgCatasto(), o)); STATO.ok = null; }
/** Indirizzo del collegamento: quello scritto nelle impostazioni, altrimenti la funzione "catasto" del progetto Supabase. */
export function collegamento() {
  const c = cfgCatasto(); if (c.url) return { url: c.url.replace(/\/$/, ''), headers: {} , tipo: 'personale' };
  const sb = cloudConfig(); if (sb && sb.url) return { url: sb.url.replace(/\/$/, '') + '/functions/v1/catasto', headers: { Authorization: 'Bearer ' + sb.key, apikey: sb.key }, tipo: 'supabase' };
  return null;
}
const STATO = { ok: null };
export class ErroreCatasto extends Error { constructor(msg, code) { super(msg); this.code = code; } }

async function scarica(target, { timeout = 60000 } = {}) {
  const tentativi = [];
  const col = collegamento();
  if (col) tentativi.push(() => fetch(`${col.url}?u=${encodeURIComponent(target)}`, { headers: col.headers }));
  tentativi.push(() => fetch(target)); // se un giorno il servizio permetterà le richieste dirette
  let ultimo = null;
  for (const t of tentativi) {
    const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await Promise.race([t(), new Promise((_, rej) => ctl.signal.addEventListener('abort', () => rej(new ErroreCatasto('Il servizio catastale non risponde (tempo scaduto). Riprova tra poco.', 'TIMEOUT'))))]);
      clearTimeout(tm);
      if (!r.ok) { ultimo = ultimo || new ErroreCatasto(col ? `Il collegamento al catasto ha risposto con errore ${r.status}: controlla l'indirizzo in La mia azienda → Catasto.` : `Il servizio catastale ha risposto con errore ${r.status}.`, 'HTTP'); continue; }
      const txt = await r.text(); STATO.ok = true; return txt;
    } catch (e) { clearTimeout(tm); ultimo = ultimo || e; } // vale il primo errore (del collegamento): la richiesta diretta, senza CORS, fallisce sempre e lo nasconderebbe
  }
  STATO.ok = false;
  if (!col) throw new ErroreCatasto('Per cercare le particelle serve il collegamento al catasto: impostalo in La mia azienda → Catasto (5 minuti, una volta sola).', 'NO_PROXY');
  throw ultimo && ultimo.code ? ultimo : new ErroreCatasto('Il collegamento al catasto non risponde: controlla l\'indirizzo in La mia azienda → Catasto.', 'PROXY');
}
export async function provaCollegamento() {
  const t = await scarica(`${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetCapabilities`, { timeout: 30000 });
  if (!/WFS_Capabilities|FeatureTypeList/i.test(t)) throw new ErroreCatasto('Il collegamento risponde, ma non con il servizio del catasto.', 'PROXY');
  return true;
}

/* ---------------- riferimenti catastali ---------------- */
// "G949_002400.123": codice del comune (+ sezione), foglio a 4 cifre, allegato, sviluppo, particella
export function leggiRif(ref) {
  const m = String(ref || '').trim().match(/^([A-Z]\d{3})([A-Z]?)_(\d{4})(\S)(\S)(?:\.(.+))?$/i); if (!m) return null;
  const all = m[4] === '0' ? '' : m[4].toUpperCase(), svi = m[5] === '0' ? '' : m[5].toUpperCase();
  return { codice: m[1].toUpperCase(), sezione: (m[2] || '').toUpperCase(), foglio: String(parseInt(m[3], 10)), allegato: all, sviluppo: svi, foglioTxt: `${parseInt(m[3], 10)}${all}${svi ? '_' + svi : ''}`, particella: m[6] != null ? m[6] : null, foglioRef: `${m[1].toUpperCase()}${(m[2] || '').toUpperCase()}_${m[3]}${m[4]}${m[5]}`, ref: String(ref).trim().toUpperCase() };
}
export function rifFoglio(codice, foglio, sezione = '') {
  const m = String(foglio).trim().toUpperCase().match(/^(\d+)([A-Z]?)(?:_?([A-Z]))?$/);
  const n = m ? m[1] : String(foglio).trim(), all = m && m[2] ? m[2] : '0', svi = m && m[3] ? m[3] : '0';
  return `${codice.toUpperCase()}${(sezione || '').toUpperCase()}_${n.padStart(4, '0')}${all}${svi}`;
}
const normPart = p => { const s = String(p || '').trim().toUpperCase(); return /^\d+$/.test(s) ? String(parseInt(s, 10)) : s; };
export const testoCatasto = r => `Fg. ${r.foglioTxt || r.foglio} mapp. ${r.particella}`;

/* ---------------- GML del WFS ---------------- */
const dec = s => String(s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
function posList(t) {
  const n = t.trim().split(/\s+/).map(Number); const out = [];
  // EPSG:6706 come URN: ordine latitudine, longitudine (in Italia la latitudine è sempre la più grande)
  const latPrima = n.length >= 2 && n[0] > n[1];
  for (let i = 0; i + 1 < n.length; i += 2) out.push(latPrima ? [n[i + 1], n[i]] : [n[i], n[i + 1]]);
  return out;
}
function geometria(chunk) {
  const polys = []; const re = /<gml:Polygon[^>]*>([\s\S]*?)<\/gml:Polygon>/g; let m;
  while ((m = re.exec(chunk))) {
    const b = m[1]; const rings = [];
    const ext = b.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/); if (ext) rings.push(posList(ext[1]));
    const ri = /<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g; let im; while ((im = ri.exec(b))) rings.push(posList(im[1]));
    if (rings.length) polys.push(rings);
  }
  if (!polys.length) return null;
  return polys.length === 1 ? { type: 'Polygon', coordinates: polys[0] } : { type: 'MultiPolygon', coordinates: polys };
}
export function bboxDi(g) { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; const v = x => { if (typeof x[0] === 'number') { a = Math.min(a, x[0]); c = Math.max(c, x[0]); b = Math.min(b, x[1]); d = Math.max(d, x[1]); } else x.forEach(v); }; v(g.coordinates); return [a, b, c, d]; }
export function leggiGml(xml) {
  if (/ServiceException|ExceptionReport/i.test(xml.slice(0, 800))) throw new ErroreCatasto('Il servizio catastale ha rifiutato la richiesta.', 'WFS');
  const out = []; const re = /<wfs:member>([\s\S]*?)<\/wfs:member>/g; let m;
  while ((m = re.exec(xml))) {
    const ch = m[1]; const p = {}; const pr = /<CP:([A-Za-z_]+)>([^<]*)<\/CP:\1>/g; let x; while ((x = pr.exec(ch))) p[x[1].toUpperCase()] = dec(x[2]);
    const g = geometria(ch); if (!g) continue;
    out.push({ ref: p.NATIONALCADASTRALREFERENCE || p.NATIONALCADASTRALZONINGREFERENCE || '', label: p.LABEL || '', area: +p.AREAVALUE || null, geom: g, bbox: bboxDi(g) });
  }
  return out;
}
const urlBbox = (tipo, [x0, y0, x1, y1], count, extra = '') => `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature&TYPENAMES=${tipo}&SRSNAME=urn:ogc:def:crs:EPSG::6706&BBOX=${[y0, x0, y1, x1].map(v => v.toFixed(7)).join(',')}${count ? '&COUNT=' + count : ''}${extra}`;
// Il WFS risponde con zero risultati (senza errore) se il riquadro è troppo alto in latitudine: oltre ~0,07° per i fogli,
// ~0,017° per le particelle (la larghezza e il numero di risultati non contano). Si chiede quindi a riquadri più piccoli.
const PASSO = { 'CP:CadastralZoning': [0.12, 0.06], 'CP:CadastralParcel': [0.02, 0.015] }; // [longitudine, latitudine]
function riquadri([x0, y0, x1, y1], [dx, dy]) {
  const nx = Math.max(1, Math.ceil((x1 - x0) / dx - 1e-9)), ny = Math.max(1, Math.ceil((y1 - y0) / dy - 1e-9)), sx = (x1 - x0) / nx, sy = (y1 - y0) / ny; const out = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) out.push([x0 + i * sx, y0 + j * sy, x0 + (i + 1) * sx, y0 + (j + 1) * sy]);
  return out;
}
// Ogni tanto il servizio risponde "Richiesta non valida" a una richiesta corretta: si riprova con un indirizzo diverso (la risposta sbagliata può restare in cache).
async function wfsUno(tipo, bbox, count, timeout) {
  for (let prova = 0; ; prova++) {
    try { return leggiGml(await scarica(urlBbox(tipo, bbox, count, prova ? '&_=' + Date.now() : ''), { timeout })); }
    catch (e) { if (e.code !== 'WFS' || prova >= 3) throw e; await new Promise(r => setTimeout(r, 800 * (prova + 1))); }
  }
}
/** Elementi di un riquadro già piccolo (una cella del catasto disegnato sulla mappa, js/catastomappa.js). */
export const elementiRiquadro = (tipo, bbox, timeout = 90000) => wfsUno(tipo, bbox, 0, timeout);
/** Elementi del WFS nel riquadro, chiesti a pezzi (3 richieste alla volta) e senza doppioni. avanz(fatti, totale) */
async function wfs(tipo, bbox, count, timeout, avanz) {
  const rs = riquadri(bbox, PASSO[tipo]), coda = rs.slice(), visti = new Map(); let fatti = 0;
  await Promise.all(Array.from({ length: Math.min(3, rs.length) }, async () => {
    while (coda.length) { for (const f of await wfsUno(tipo, coda.shift(), count, timeout)) if (f.ref && !visti.has(f.ref)) visti.set(f.ref, f); fatti++; if (avanz && rs.length > 1) avanz(fatti, rs.length); }
  }));
  return [...visti.values()];
}

/* ---------------- geometria ---------------- */
function dentroAnello(r, x, y) { let d = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) d = !d; } return d; }
export function contiene(g, x, y) { const ps = g.type === 'Polygon' ? [g.coordinates] : g.coordinates; return ps.some(rs => dentroAnello(rs[0], x, y) && !rs.slice(1).some(h => dentroAnello(h, x, y))); }
/** Unisce due geometrie in un multipoligono (le particelle vicine restano poligoni separati dello stesso campo). */
export function unisci(a, b) {
  const ps = g => !g ? [] : g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  const tutti = [...ps(a), ...ps(b)]; return tutti.length === 1 ? { type: 'Polygon', coordinates: tutti[0] } : { type: 'MultiPolygon', coordinates: tutti };
}

/* ---------------- comuni ---------------- */
let COMUNI = null;
export async function comuni() {
  if (COMUNI) return COMUNI;
  const r = await fetch(new URL('../data/comuni.json', import.meta.url)); const j = await r.json();
  COMUNI = j.comuni.map(([codice, nome, sigla, regione]) => ({ codice, nome, sigla, regione })); return COMUNI;
}
const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export async function trovaComune(testo) {
  const cs = await comuni(); const t = String(testo || '').trim();
  const cod = /^[A-Z]\d{3}$/i.test(t) && cs.find(c => c.codice === t.toUpperCase()); if (cod) return cod;
  const m = /^(.*?)\s*\(([A-Z]{2})\)\s*$/i.exec(t); const nome = norm(m ? m[1] : t), sig = m ? m[2].toUpperCase() : '';
  const es = cs.filter(c => norm(c.nome) === nome && (!sig || c.sigla === sig)); if (es.length >= 1) return es[0];
  const st = cs.filter(c => norm(c.nome).startsWith(nome)); return st.length === 1 ? st[0] : null;
}
async function riquadroComune(c) {
  const k = 'ces.cat.box.' + c.codice; const s = lsGet(k, null); if (s) return s;
  const q = encodeURIComponent(`${c.nome}, ${c.regione}, Italia`);
  const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&accept-language=it&q=${q}`); const j = await r.json();
  const hit = j.find(x => /administrative|city|town|village|municipality/.test(x.type + ' ' + x.addresstype)) || j[0];
  if (!hit) throw new ErroreCatasto(`Non trovo il territorio di ${c.nome}.`, 'COMUNE');
  const [s0, n0, w0, e0] = hit.boundingbox.map(Number); const box = [w0, s0, e0, n0]; lsSet(k, box); return box;
}

/* ---------------- fogli e particelle ---------------- */
const FOGLI = new Map(), PART = new Map();
async function fogliDi(c, avanz) {
  if (FOGLI.has(c.codice)) return FOGLI.get(c.codice);
  const k = 'ces.cat.fogli.' + c.codice; const s = lsGet(k, null);
  if (s && Date.now() - s.t < 60 * 864e5) { const m = new Map(Object.entries(s.d)); FOGLI.set(c.codice, m); return m; }
  avanz(`Cerco il territorio di ${c.nome}…`);
  const [x0, y0, x1, y1] = await riquadroComune(c); const px = (x1 - x0) * 0.03, py = (y1 - y0) * 0.03;
  avanz(`Scarico i fogli di mappa di ${c.nome}…`);
  const zs = await wfs('CP:CadastralZoning', [x0 - px, y0 - py, x1 + px, y1 + py], 0, 120000, (i, n) => avanz(`Scarico i fogli di mappa di ${c.nome}… (${i}/${n})`));
  const m = new Map(); for (const z of zs) if (z.ref && z.ref.toUpperCase().startsWith(c.codice)) m.set(z.ref.toUpperCase(), { bbox: z.bbox, label: z.label });
  if (!m.size) throw new ErroreCatasto(`Nessun foglio di mappa trovato per ${c.nome}.`, 'FOGLI');
  FOGLI.set(c.codice, m); lsSet(k, { t: Date.now(), d: Object.fromEntries(m) }); return m;
}
/** Cerca una particella: ritorna { ...riferimento, comune, geom, bbox, ha } oppure errore con spiegazione. */
export async function cercaParticella(comuneTxt, foglio, particella, { sezione = '', avanz = () => { } } = {}) {
  const c = await trovaComune(comuneTxt); if (!c) throw new ErroreCatasto(`Comune "${comuneTxt}" non trovato: scegli dall'elenco.`, 'COMUNE');
  if (!String(foglio).trim()) throw new ErroreCatasto('Scrivi il numero del foglio.', 'DATI'); if (!String(particella).trim()) throw new ErroreCatasto('Scrivi il numero della particella (mappale).', 'DATI');
  const fogli = await fogliDi(c, avanz);
  const voluto = rifFoglio(c.codice, foglio, sezione);
  let fr = fogli.has(voluto) ? voluto : null;
  if (!fr) { const base = voluto.slice(0, -2); const cand = [...fogli.keys()].filter(k => k.startsWith(base)); fr = cand.find(k => k.endsWith('00')) || cand[0] || null; }
  if (!fr) throw new ErroreCatasto(`Il foglio ${foglio} non esiste a ${c.nome}. Fogli presenti: ${[...fogli.values()].map(v => v.label).filter(Boolean).sort((a, b) => parseInt(a) - parseInt(b)).slice(0, 60).join(', ')}.`, 'FOGLIO');
  const f = fogli.get(fr); const voluta = `${fr}.${normPart(particella)}`;
  let parts = PART.get(fr);
  if (!parts) { avanz(`Scarico le particelle del foglio ${f.label || foglio} di ${c.nome}…`); parts = (await wfs('CP:CadastralParcel', f.bbox, 0, 180000, (i, n) => avanz(`Scarico le particelle del foglio ${f.label || foglio} di ${c.nome}… (${i}/${n})`))).filter(p => p.ref.toUpperCase().startsWith(fr + '.')); PART.set(fr, parts); }
  const hit = parts.find(p => p.ref.toUpperCase() === voluta) || parts.find(p => normPart(p.ref.split('.').pop()) === normPart(particella));
  if (!hit) throw new ErroreCatasto(`La particella ${particella} non esiste nel foglio ${f.label || foglio} di ${c.nome} (${parts.length} particelle nel foglio).`, 'PARTICELLA');
  return Object.assign(leggiRif(hit.ref), { comune: c.nome, sigla: c.sigla, geom: hit.geom, bbox: hit.bbox, areaCatasto: hit.area });
}
/** Particella in un punto della mappa (lon, lat): riferimento e geometria. */
export async function particellaNelPunto(lon, lat) {
  const d = 0.00025; const ps = await wfs('CP:CadastralParcel', [lon - d, lat - d, lon + d, lat + d], 60, 60000);
  const hit = ps.find(p => contiene(p.geom, lon, lat)); if (!hit) return null;
  const r = leggiRif(hit.ref); if (!r) return null;
  const c = (await comuni()).find(x => x.codice === r.codice);
  return Object.assign(r, { comune: c ? c.nome : r.codice, sigla: c ? c.sigla : '', geom: hit.geom, bbox: hit.bbox, areaCatasto: hit.area });
}
export const statoCollegamento = () => STATO.ok;

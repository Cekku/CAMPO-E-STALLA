// Registrazione rapida in linguaggio naturale: "diserbo pradone erbicida 1,5 l/ha ieri con Marco".
// Interprete locale (funziona senza rete); con una chiave Anthropic salvata sul dispositivo usa Claude per i casi difficili.
import { S, UI } from './state.js';
import { today, addDays, isoOf, lsGet, N } from './util.js';
import { cropOf, capoI } from './domain.js';

const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').replace(/\s+/g, ' ').trim();
const num = s => N(String(s).replace(/\.(?=\d{3}\b)/g, ''));
const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const GIORNI = ['domenica', 'lunedi', 'martedi', 'mercoledi', 'giovedi', 'venerdi', 'sabato'];

const TIPI = [
  ['Diserbo', /diserb|erbicid|infestant/],
  ['Trattamento fitosanitario', /trattament|trattato|trattata|fungicid|insetticid|acaricid|difesa|irrorat|spruzzat|antiperonosp|piralide|diabrotica|septoria|ruggine|fusariosi/],
  ['Concimazione', /concim|urea|nitrato|letame|liquame|digestato|fertirrig|fertilizz|solfato ammonico|azoto/],
  ['Semina', /semin|trapiant/],
  ['Irrigazione', /irrig|adacqu|pivot|rotolone/],
  ['Sfalcio', /sfalc|falcia|fienagion|taglio del fieno|fieno|rotoballe|imballat/],
  ['Raccolta', /raccol|trebbi|trincia|insilat|mietitur|vendemmi/],
  ['Lavorazione terreno', /arat|erpic|ripunt|rullat|fresat|vangat|lavorazion|minima lavorazione|discat|estirpat|assolcat|sarchiat/],
];

export function parseDate(t, T = today()) {
  if (/\baltro ?ieri\b/.test(t)) return addDays(T, -2);
  if (/\bdopodomani\b/.test(t)) return addDays(T, 2);
  if (/\bieri\b/.test(t)) return addDays(T, -1);
  if (/\bdomani\b/.test(t)) return addDays(T, 1);
  if (/\boggi\b|stamattina|stamani|stasera|stanotte/.test(t)) return T;
  let m = t.match(/\btra (\d+) giorni\b/); if (m) return addDays(T, +m[1]);
  m = t.match(/\b(\d+) giorni fa\b/); if (m) return addDays(T, -m[1]);
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m && +m[1] <= 31 && +m[2] <= 12) { const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : +T.slice(0, 4); return isoOf(new Date(y, +m[2] - 1, +m[1])); }
  m = t.match(new RegExp('\\b(\\d{1,2}) (' + MESI.join('|') + ')(?: (\\d{4}))?'));
  if (m) return isoOf(new Date(m[3] ? +m[3] : +T.slice(0, 4), MESI.indexOf(m[2]), +m[1]));
  for (let i = 0; i < 7; i++) {
    const re = new RegExp('\\b(' + GIORNI[i] + ')\\b'); if (!re.test(t)) continue;
    const cur = new Date(T + 'T12:00:00').getDay(); const fut = /prossim|\bfra\b|\btra\b/.test(t);
    let d = fut ? (i - cur + 7) % 7 || 7 : -((cur - i + 7) % 7 || 7); if (/\bscors|passat/.test(t)) d = -((cur - i + 7) % 7 || 7);
    return addDays(T, d);
  }
  return null;
}

// Cerca il nome più lungo contenuto nel testo (con tolleranza sugli spazi e sugli accenti)
function findNames(t, items, key) {
  const hits = [];
  items.forEach(x => { const n = norm(x[key]); if (n.length >= 2 && new RegExp('(^|[^a-z0-9])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z0-9])').test(t)) hits.push(x); });
  return hits.sort((a, b) => norm(b[key]).length - norm(a[key]).length);
}
// Prodotto: nome intero o, in mancanza, il prodotto con più parole in comune, coerente con il tipo di lavoro
const CAT_TIPO = { 'Diserbo': ['Diserbante', 'Fitofarmaco'], 'Trattamento fitosanitario': ['Fitofarmaco', 'Diserbante'], 'Concimazione': ['Concime'], 'Semina': ['Seme'], 'Irrigazione': ['Altro'] };
const GENERIC = /^(seme|sementi|concime|mangime|farina|prodotto|esempio|conciato)$/;
function findProduct(t, tipo, cats) {
  cats = cats || CAT_TIPO[tipo];
  const pool = cats ? S.prodotti.filter(p => cats.includes(p.categoria)) : S.prodotti;
  const full = findNames(t, pool, 'nome'); if (full.length) return full[0];
  const words = new Set(t.split(' ').filter(Boolean)); let best = null, bs = 0;
  pool.forEach(p => { const w = norm(p.nome).split(/[\s-]+/).filter(x => x.length >= 4 && !GENERIC.test(x)); const sc = w.filter(x => words.has(x)).length / Math.max(1, w.length) + w.filter(x => words.has(x)).length; if (sc > bs) { bs = sc; best = p; } });
  return bs >= 1 ? best : null;
}

export function parseLocal(text) {
  const t = ' ' + norm(text) + ' '; const out = { kind: 'operazione', values: {}, campi: [], capire: [] };
  const T = today(); const Y = +T.slice(0, 4);
  // stalla: latte del giorno
  let m = t.match(/(\d[\d.,]*)\s*(litri|lt|l)\b[^.]*?(latte|munt|conferit|mungitur)|(latte|munt|mungitur)[^.]*?(\d[\d.,]*)\s*(litri|lt|l)\b/);
  if (m && !TIPI.some(([, re]) => re.test(t))) {
    const litri = num(m[1] || m[5]); out.kind = 'latte'; out.values = { data: parseDate(t) || T, litri };
    const c = t.match(/conferit\w*\s*(\d[\d.,]*)|(\d[\d.,]*)\s*(?:litri|l)?\s*conferit/); if (c) out.values.conferiti = num(c[1] || c[2]);
    const v = t.match(/(\d+)\s*vacche/); if (v) out.values.vacche = +v[1];
    return out;
  }
  // stalla: eventi su un capo
  const capi = S.capi.filter(c => capoI(c) && capoI(c).stato !== 'Uscita');
  const capo = findNames(t, capi, 'nome')[0] || capi.find(c => c.matricola && t.includes(norm(c.matricola).slice(-5)));
  const EV = [['Parto', /partori|\bparto\b|ha figliato|vitell[oa] nat/], ['Fecondazione', /feconda|insemina|\bia\b|montat/], ['Diagnosi gravidanza', /diagnosi|gravid|ecografi|\bpiena\b|\bvuota\b/], ['Messa in asciutta', /asciutt/], ['Calore', /calore|in estro/], ['Trattamento sanitario', /mastit|antibiot|curat|trattat|zoppi|febbre|metrit|iniezion/], ['Vaccinazione', /vaccin/], ['Uscita', /vendut|macellat|mort/]];
  if (capo) {
    const ev = EV.find(([, re]) => re.test(t));
    if (ev) {
      out.kind = 'evento'; out.values = { tipo: ev[0], capoId: capo.id, data: parseDate(t) || T };
      if (ev[0] === 'Diagnosi gravidanza') out.values.esito = /negativ|vuota|non gravid/.test(t) ? 'Negativa' : 'Positiva';
      if (ev[0] === 'Fecondazione') { const tr = text.match(/(?:toro|seme)\s+([A-Za-zÀ-ÿ0-9'-]+(?:\s+[A-Z][A-Za-zÀ-ÿ0-9'-]+)?)/); if (tr) out.values.toro = tr[1]; out.values.metodoFec = /monta/.test(t) ? 'Monta naturale' : 'Inseminazione artificiale'; }
      if (ev[0] === 'Trattamento sanitario') { const mo = t.match(/\bper (?:la |il |una |un )?([a-z ]{4,40}?)(?: con | \d|$)/); if (mo) out.values.motivo = mo[1].trim(); const p = findProduct(t, null, ['Farmaco veterinario']); if (p) out.values.prodottoId = p.id; }
      if (ev[0] === 'Parto') { if (/femmin|vitella/.test(t)) out.values.vitelloSesso = 'F'; else if (/maschi|vitello/.test(t)) out.values.vitelloSesso = 'M'; }
      if (ev[0] === 'Uscita') out.values.motivoUscita = /vendut/.test(t) ? 'Vendita' : /macell/.test(t) ? 'Macellazione' : /mort/.test(t) ? 'Morte' : 'Altro';
      return out;
    }
  }
  // campagna: operazione
  const tipo = (TIPI.find(([, re]) => re.test(t)) || [])[0] || null;
  const v = out.values; if (tipo) v.tipo = tipo; else out.capire.push('tipo di lavoro');
  const d = parseDate(t); v.data = d || T;
  v.stato = /\b(devo|dovro|da fare|pianific|programm|bisogna|domani|dopodomani|prossim)/.test(t) || (d && d > T) ? 'Pianificata' : 'Fatto';
  let campi = findNames(t, S.campi, 'nome');
  if (/tutti i campi|ovunque|tutta l azienda/.test(t)) campi = [...S.campi];
  if (!campi.length) {
    const cr = [...new Set(S.campi.map(c => cropOf(c, Y)).filter(Boolean))].find(k => t.includes(' ' + norm(k).split(' ')[0] + ' '));
    if (cr) { const fam = norm(cr).split(' ')[0]; campi = S.campi.filter(c => norm(cropOf(c, Y)).startsWith(fam)); }
  }
  out.campi = campi.map(c => c.id); if (!campi.length) out.capire.push('campo');
  const p = findProduct(t, tipo); if (p) v.prodottoId = p.id;
  // dose per ettaro e quantità totale
  const U = '(kg|chili|chilogrammi|l|lt|litri|q|quintali|t|tonnellate|g|grammi|ml|dosi)';
  m = t.match(new RegExp('(\\d[\\d.,]*)\\s*' + U + '?\\s*(?:/\\s*ha|a ettaro|per ettaro|all ettaro|ad ettaro|ettaro)'));
  if (m) v.dose = num(m[1]);
  m = t.match(new RegExp('(?:totale|in tutto|usat\\w*|messo|distribuit\\w*)\\s*(\\d[\\d.,]*)\\s*' + U)); if (m) v.quantita = num(m[1]);
  if ((tipo === 'Raccolta' || tipo === 'Sfalcio')) {
    m = t.match(/(\d[\d.,]*)\s*(t|tonnellate|q|quintali|rotoballe|balle)\b/);
    if (m) { const q = num(m[1]); v.raccolto = /^q/.test(m[2]) ? q / 10 : /balle/.test(m[2]) ? null : q; if (/balle/.test(m[2])) v.note = m[1] + ' ' + m[2]; }
  }
  m = t.match(/(\d[\d.,]*)\s*(?:ore|h)\b/); if (m) v.ore = num(m[1]);
  const mz = findNames(t, S.mezzi, 'nome')[0] || S.mezzi.find(x => x.tipo && new RegExp('\\b' + norm(x.tipo) + '\\b').test(t)); if (mz) v.mezzoId = mz.id;
  const op = findNames(t, S.operatori, 'nome')[0]; if (op) v.operatore = op.nome; else { const w = text.match(/\b(?:con|fatto da|operatore)\s+([A-Z][a-zà-ù]+)/); if (w && !S.prodotti.some(x => norm(x.nome).startsWith(norm(w[1])))) v.operatore = w[1]; }
  m = t.match(/\bcontro (?:la |il |le |i |gli )?([a-z ]{3,40}?)(?:,| con | \d| su | sul | nel |$)/); if (m) v.avversita = m[1].trim();
  m = t.match(/\bbbch\s*(\d{2})/); if (m) v.bbch = m[1];
  if (/vento forte/.test(t)) v.vento = 'Forte'; else if (/vento moderato/.test(t)) v.vento = 'Moderato'; else if (/vento debole|poco vento/.test(t)) v.vento = 'Debole'; else if (/senza vento|niente vento/.test(t)) v.vento = 'Assente';
  return out;
}

/* ---------- Claude (facoltativo) ---------- */
export const aiConfig = () => lsGet('ces.ai', null);
export async function parseAI(text) {
  const cfg = aiConfig(); if (!cfg || !cfg.key) return null;
  const Y = new Date().getFullYear();
  const ctx = {
    oggi: today(),
    campi: S.campi.map(c => ({ id: c.id, nome: c.nome, coltura: cropOf(c, Y) })),
    prodotti: S.prodotti.map(p => ({ id: p.id, nome: p.nome, categoria: p.categoria, unita: p.unita })),
    mezzi: S.mezzi.map(m => ({ id: m.id, nome: m.nome, tipo: m.tipo })),
    operatori: S.operatori.map(o => o.nome),
    capi: S.capi.filter(c => capoI(c).stato !== 'Uscita').map(c => ({ id: c.id, nome: c.nome, matricola: c.matricola })),
  };
  const sys = `Converti la frase di un agricoltore italiano in una registrazione per un gestionale aziendale. Rispondi SOLO con un oggetto JSON, senza testo intorno.
Formati possibili:
{"kind":"operazione","campi":[id...],"values":{"tipo":uno tra ${JSON.stringify(['Lavorazione terreno', 'Semina', 'Concimazione', 'Trattamento fitosanitario', 'Diserbo', 'Irrigazione', 'Sfalcio', 'Raccolta', 'Altro'])},"data":"AAAA-MM-GG","stato":"Fatto"|"Pianificata","prodottoId":id|null,"dose":numero per ettaro|null,"quantita":numero totale|null,"avversita":testo|null,"bbch":testo|null,"mezzoId":id|null,"ore":numero|null,"operatore":nome|null,"raccolto":tonnellate|null,"vento":"Assente"|"Debole"|"Moderato"|"Forte"|null,"note":testo|null}}
{"kind":"latte","values":{"data":"AAAA-MM-GG","litri":numero,"conferiti":numero|null,"vacche":numero|null}}
{"kind":"evento","values":{"tipo":uno tra ${JSON.stringify(['Parto', 'Calore', 'Fecondazione', 'Diagnosi gravidanza', 'Messa in asciutta', 'Trattamento sanitario', 'Vaccinazione', 'Controllo funzionale', 'Uscita', 'Nota'])},"capoId":id,"data":"AAAA-MM-GG","esito":"Positiva"|"Negativa"|null,"toro":testo|null,"motivo":testo|null,"prodottoId":id|null,"note":testo|null}}
Usa solo id presenti nei dati. Le date relative si calcolano da "oggi". Se un'attività è futura usa stato "Pianificata". Ometti i campi che non conosci.
Dati dell'azienda: ${JSON.stringify(ctx)}`;
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model: cfg.model || 'claude-haiku-5-5', max_tokens: 800, system: sys, messages: [{ role: 'user', content: text }] }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Claude non ha risposto: ' + ((j.error && j.error.message) || r.status));
  const txt = (j.content || []).map(c => c.text || '').join('');
  const m = txt.match(/\{[\s\S]*\}/); if (!m) throw new Error('Risposta non leggibile');
  const o = JSON.parse(m[0]); o.values = o.values || {}; o.campi = (o.campi || []).filter(id => S.campi.some(c => c.id === id)); o.capire = [];
  Object.keys(o.values).forEach(k => { if (o.values[k] === null || o.values[k] === '') delete o.values[k]; });
  if (o.kind === 'operazione' && !o.campi.length) o.capire.push('campo');
  o.ai = true; return o;
}

/* ---------- dettatura vocale ---------- */
export const canDictate = () => !!(window.SpeechRecognition || window.webkitSpeechRecognition);
let rec = null;
export function dictate(onText, onEnd) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) return false;
  if (rec) { try { rec.stop(); } catch (e) { } rec = null; return false; }
  rec = new SR(); rec.lang = 'it-IT'; rec.interimResults = true; rec.continuous = false;
  rec.onresult = e => { let s = ''; for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript; onText(s, e.results[e.results.length - 1].isFinal); };
  rec.onerror = () => { };
  rec.onend = () => { rec = null; onEnd && onEnd(); };
  rec.start(); return true;
}

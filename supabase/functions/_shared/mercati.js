// Rassegna e mercati: portali consigliati, serie dei prezzi, lettori di feed e listini, calcoli.
// JavaScript puro senza import: lo usano la funzione Supabase "rassegna" (Deno) e l'app (browser).

/* ================= portali ================= */

export const ARGOMENTI = { stalla: 'Vacche da latte', campi: 'Campi e colture', tecnologia: 'Tecnologia e innovazione', mercati: 'Mercati e prezzi', politica: 'Norme e politica agricola', altro: 'Altro' };

// Portali proposti alla prima apertura (Marco: CLAL, Teseo, Ruminantia; gli altri consigliati). Indirizzi dei feed provati il 23/11/2026.
export const FONTI_CONSIGLIATE = [
  { nome: 'CLAL notizie', url: 'https://news.clal.it/it/feed/', argomento: 'mercati', sito: 'https://news.clal.it/it/' },
  { nome: 'Teseo notizie', url: 'https://teseo.clal.it/news/it/feed/', argomento: 'mercati', sito: 'https://teseo.clal.it/news/it/' },
  { nome: 'Ruminantia', url: 'https://www.ruminantia.it/feed/', argomento: 'stalla', sito: 'https://www.ruminantia.it/' },
  { nome: 'Informatore Zootecnico', url: 'https://informatorezootecnico.edagricole.it/feed/', argomento: 'stalla', sito: 'https://informatorezootecnico.edagricole.it/', consigliata: true },
  { nome: 'AIA – Associazione Italiana Allevatori', url: 'https://www.aia.it/feed/', argomento: 'stalla', sito: 'https://www.aia.it/', consigliata: true },
  { nome: 'Terra e Vita', url: 'https://terraevita.edagricole.it/feed/', argomento: 'campi', sito: 'https://terraevita.edagricole.it/', consigliata: true },
  { nome: 'Il Nuovo Agricoltore', url: 'https://www.ilnuovoagricoltore.it/feed/', argomento: 'campi', sito: 'https://www.ilnuovoagricoltore.it/', consigliata: true },
  { nome: 'Agrifood.tech', url: 'https://www.agrifood.tech/feed/', argomento: 'tecnologia', sito: 'https://www.agrifood.tech/', consigliata: true },
  { nome: 'Agricolae', url: 'https://www.agricolae.eu/feed/', argomento: 'politica', sito: 'https://www.agricolae.eu/', consigliata: true },
];

/* ================= serie dei prezzi ================= */

export const GRUPPI = { latte: 'Latte', alimenti: 'Alimenti e foraggi', concimi: 'Concimi', energia: 'Gasolio' };

const T = 'https://teseo.clal.it/?section=', C = 'https://www.clal.it/?section=';
// mesi / sett: espressione che riconosce la tabella dei prezzi medi mensili (anni in colonna) o dei rilevamenti settimanali.
// Le pagine di CLAL e Teseo riportano i listini delle Borse merci e delle Camere di commercio (Bologna, Torino, Verona, Milano).
export const SERIE = [
  { id: 'latte-lomb', nome: 'Latte alla stalla (Lombardia)', gruppo: 'latte', unita: '€/100 l', url: C + 'confronto_latte_lodi', mesi: /Latte alla stalla Lombardia/i, fonte: 'CLAL' },
  { id: 'latte-spot', nome: 'Latte spot (Milano)', gruppo: 'latte', unita: '€/100 l', url: C + 'confronto_latte_lodi', mesi: /latte spot Milano/i, fonte: 'CLAL, Camera di commercio di Milano Monza Brianza Lodi' },
  { id: 'latte-ue', nome: 'Latte alla stalla (media UE)', gruppo: 'latte', unita: '€/100 kg', url: C + 'latte_europa_mmo', mesi: /^UE-27 Prezzo medio mensile/i, fonte: 'CLAL, Osservatorio europeo del latte' },
  { id: 'mais', nome: 'Mais zootecnico (Bologna)', gruppo: 'alimenti', unita: '€/t', url: T + 'granoturco_secco_bologna', mesi: /Prezzi medi mensili Granoturco nazionale ad uso zootecnico/i, sett: /^Data del rilevamento Granoturco nazionale ad uso zootecnico/i, fonte: 'Teseo, Borsa merci di Bologna' },
  { id: 'soia', nome: 'Farina di soia 44% (Bologna)', gruppo: 'alimenti', unita: '€/t', url: T + 'farine_soia_bologna', mesi: /Prezzi medi mensili Farina di soia tostata integrale nazionale/i, sett: /^Data del rilevamento Farina di soia tostata integrale nazionale/i, fonte: 'Teseo, Borsa merci di Bologna' },
  { id: 'orzo', nome: 'Orzo p.s. 62/64 (Bologna)', gruppo: 'alimenti', unita: '€/t', url: T + 'orzo_bologna', mesi: /Prezzi medi mensili Orzo - p\.s\. 62\/64/i, sett: /^Data del rilevamento Orzo - p\.s\. 62\/64/i, fonte: 'Teseo, Borsa merci di Bologna' },
  { id: 'fieno', nome: 'Fieno maggengo (Verona)', gruppo: 'alimenti', unita: '€/t', url: T + 'fieno_maggengo_verona', mesi: /Prezzi medi mensili Fieno maggengo imballato \(f\.co arrivo\)/i, sett: /^Data del rilevamento Fieno maggengo imballato \(f\.co arrivo\)/i, fonte: 'Teseo, Camera di commercio di Verona' },
  { id: 'urea', nome: 'Urea 46% (Torino)', gruppo: 'concimi', unita: '€/t', url: T + 'fertilizzanti_torino', mesi: /Prezzi medi mensili Urea agricola 46%/i, sett: /^Data del rilevamento Urea agricola 46%/i, fonte: 'Teseo, Camera di commercio di Torino' },
  { id: 'gasolio', nome: 'Gasolio agricolo (Milano)', gruppo: 'energia', unita: '€/l', url: T + 'gasolio_agricolo', mesi: /^Prodotti destinati all'agricoltura contenuto di zolfo/i, fonte: 'Teseo, Camera di commercio di Milano Monza Brianza Lodi' },
];

/* ================= lettura del testo ================= */

const NOMINATE = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', agrave: 'à', egrave: 'è', eacute: 'é', igrave: 'ì', ograve: 'ò', ugrave: 'ù', Agrave: 'À', Egrave: 'È', Eacute: 'É', euro: '€', laquo: '«', raquo: '»', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—', hellip: '…', deg: '°', plusmn: '±' };
export function entita(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);?/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);?/gi, (m, n) => (n in NOMINATE ? NOMINATE[n] : m));
}
/** Testo semplice da un pezzo di HTML o XML (CDATA, tag, entità, spazi). */
export function pulisci(s) {
  return entita(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<br\s*\/?>|<\/p>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/* ================= feed RSS e Atom ================= */

function tag(xml, nome) {
  const m = xml.match(new RegExp(`<${nome}\\b[^>]*>([\\s\\S]*?)</${nome}>`, 'i'));
  return m ? m[1] : '';
}
/** Articoli di un feed RSS o Atom: [{ titolo, link, data (ISO o ''), testo, autore }]. */
export function leggiFeed(xml) {
  const pezzi = String(xml || '').match(/<(item|entry)\b[\s\S]*?<\/(item|entry)>/gi) || [];
  return pezzi.map(it => {
    let link = pulisci(tag(it, 'link'));
    if (!link) { const m = it.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i) || it.match(/<link\b[^>]*href=["']([^"']+)["']/i); link = m ? entita(m[1]) : ''; }
    if (!link) link = pulisci(tag(it, 'guid'));
    const quando = pulisci(tag(it, 'pubDate') || tag(it, 'published') || tag(it, 'updated') || tag(it, 'dc:date'));
    const t = Date.parse(quando);
    const testo = pulisci(tag(it, 'content:encoded') || tag(it, 'content') || tag(it, 'description') || tag(it, 'summary'));
    return { titolo: pulisci(tag(it, 'title')), link: link.trim(), data: isNaN(t) ? '' : new Date(t).toISOString(), testo, autore: pulisci(tag(it, 'dc:creator') || tag(tag(it, 'author'), 'name') || tag(it, 'author')) };
  }).filter(a => a.titolo && /^https?:\/\//.test(a.link));
}
/** Indirizzo del feed dichiarato in una pagina HTML (link rel="alternate"), o null. */
export function trovaFeed(html, base) {
  for (const m of String(html || '').matchAll(/<link\b[^>]*>/gi)) {
    const t = m[0];
    if (!/rel=["']?alternate/i.test(t) || !/application\/(rss|atom)\+xml/i.test(t)) continue;
    const h = t.match(/href=["']([^"']+)["']/i); if (!h) continue;
    try { return new URL(entita(h[1]), base).href; } catch { /* indirizzo non valido */ }
  }
  return null;
}
export const sembraFeed = s => /<(rss|feed|rdf:RDF)\b/i.test(String(s || '').slice(0, 2000));

/* ================= tabelle dei listini ================= */

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MESI3 = MESI.map(m => m.slice(0, 3));
const RE_GIORNO = /(\d{1,2})[\s-]+(gen|feb|mar|apr|mag|giu|lug|ago|set|ott|nov|dic)[a-zì]*[\s-]+(\d{4})/i;
const due = n => String(n).padStart(2, '0');

/** Numero all'italiana ("1.234,56", "51,79 (e)"); null per "-", "n.q.", percentuali e testo. */
export function numero(s) {
  const t = String(s == null ? '' : s).replace(/\((e|p)\)/gi, '').replace(/\s+/g, '');
  if (!t || /%/.test(t)) return null;
  if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$|^-?\d+\.\d+$/.test(t)) return null;
  const v = /,/.test(t) || /^\-?\d{1,3}(\.\d{3})+$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : Number(t);
  return isFinite(v) ? v : null;
}
/** Tabelle di una pagina: [{ testo (inizio, senza tag), righe: [[celle]] }]. */
export function tabelle(html) {
  const h = String(html || '').replace(/<!--[\s\S]*?-->/g, '');
  return (h.match(/<table\b[\s\S]*?<\/table>/gi) || []).map(t => {
    const righe = t.split(/<tr\b/i).slice(1).map(r => [...r.matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(c => pulisci(c[1]))).filter(r => r.length);
    return { testo: pulisci(t).slice(0, 400), righe };
  });
}
/** Tabella dei prezzi medi mensili (anni in colonna, mesi in riga) → { 'AAAA-MM': valore }. */
export function tabMesi(righe) {
  let anni = null; const out = {};
  for (const r of righe) {
    const y = r.filter(c => /^(19|20)\d\d$/.test(c));
    if (!anni) { if (y.length >= 2) anni = y.map(Number); continue; }
    const m = MESI.indexOf(String(r[0] || '').toLowerCase()); if (m < 0) continue;
    anni.forEach((a, i) => { const v = numero(r[1 + i]); if (v != null && v > 0) out[`${a}-${due(m + 1)}`] = v; });
  }
  return out;
}
/** Tabella dei rilevamenti (data, minimo, massimo) → [['AAAA-MM-GG', media]] dalla più vecchia. */
export function tabSett(righe) {
  const out = [];
  for (const r of righe) {
    const d = String(r[0] || '').match(RE_GIORNO); if (!d) continue;
    const m = MESI3.indexOf(d[2].toLowerCase()); if (m < 0) continue;
    const v = r.slice(1).map(numero).filter(x => x != null && x > 0).slice(0, 2);
    if (v.length) out.push([`${d[3]}-${due(m + 1)}-${due(d[1])}`, Math.round(v.reduce((a, b) => a + b, 0) / v.length * 1000) / 1000]);
  }
  return out.sort((a, b) => a[0].localeCompare(b[0]));
}
/** Valori di una serie da una pagina già scaricata: { mesi, sett }. */
export function leggiSerie(s, html) {
  const tt = tabelle(html); let mesi = {}, sett = [];
  if (s.mesi) for (const t of tt) { if (!s.mesi.test(t.testo)) continue; const v = tabMesi(t.righe); if (Object.keys(v).length) { mesi = v; break; } }
  if (s.sett) for (const t of tt) { if (!s.sett.test(t.testo)) continue; const v = tabSett(t.righe); if (v.length) { sett = v; break; } }
  return { mesi, sett };
}

/* ================= calcoli ================= */

export const meseDi = d => String(d).slice(0, 7);
export const meseIt = k => { const [a, m] = String(k).split('-'); return MESI[Number(m) - 1] ? MESI3[Number(m) - 1] + ' ' + String(a).slice(2) : k; };
/** Serie mese per mese: prezzi medi mensili, completati con la media dei rilevamenti dove manca il mese. */
export function mensile(r) {
  const out = Object.assign({}, (r && r.mesi) || {});
  const g = {};
  for (const [d, v] of (r && r.sett) || []) (g[meseDi(d)] = g[meseDi(d)] || []).push(v);
  for (const [k, vv] of Object.entries(g)) if (out[k] == null) out[k] = Math.round(vv.reduce((a, b) => a + b, 0) / vv.length * 1000) / 1000;
  return out;
}
/** Mesi consecutivi da a fino a b compresi ('AAAA-MM'). */
export function mesiFra(a, b) {
  const out = []; let [y, m] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number);
  while (y < yb || (y === yb && m <= mb)) { out.push(`${y}-${due(m)}`); m++; if (m > 12) { m = 1; y++; } if (out.length > 600) break; }
  return out;
}
/** Ultimo valore e variazioni: { mese, valore, suMese (%), suAnno (%) }. */
export function andamento(mens) {
  const k = Object.keys(mens || {}).sort(); if (!k.length) return null;
  const u = k[k.length - 1], v = mens[u];
  const [y, m] = u.split('-').map(Number);
  const prec = mens[m === 1 ? `${y - 1}-12` : `${y}-${due(m - 1)}`], anno = mens[`${y - 1}-${due(m)}`];
  const pc = (a, b) => (b ? Math.round((a / b - 1) * 1000) / 10 : null);
  return { mese: u, valore: v, suMese: pc(v, prec), suAnno: pc(v, anno) };
}
function pearson(x, y) {
  const n = x.length; if (n < 3) return null;
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { const a = x[i] - mx, b = y[i] - my; sxy += a * b; sx += a * a; sy += b * b; }
  return sx && sy ? sxy / Math.sqrt(sx * sy) : null;
}
/**
 * Quanto la serie a anticipa la serie b: correlazione delle variazioni mensili (%) con un ritardo da 0 a maxRit mesi,
 * negli ultimi `mesi` mesi in comune. Le variazioni, non i prezzi: due prezzi che salgono tutti e due col tempo
 * sembrerebbero legati anche se non lo sono. → { ritardo, r, n, tutti: [{ritardo, r, n}] } o null.
 */
export function anticipo(a, b, { maxRit = 6, mesi = 72 } = {}) {
  const var_ = s => { const o = {}; const k = Object.keys(s).sort(); for (const m of k) { const [y, mm] = m.split('-').map(Number); const p = s[mm === 1 ? `${y - 1}-12` : `${y}-${due(mm - 1)}`]; if (p) o[m] = s[m] / p - 1; } return o; };
  const va = var_(a), vb = var_(b);
  const kb = Object.keys(vb).sort().slice(-mesi);
  const tutti = [];
  for (let rit = 0; rit <= maxRit; rit++) {
    const x = [], y = [];
    for (const m of kb) { const [yy, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(yy, mm - 1 - rit, 1)); const ka = `${d.getUTCFullYear()}-${due(d.getUTCMonth() + 1)}`; if (va[ka] != null) { x.push(va[ka]); y.push(vb[m]); } }
    const r = pearson(x, y); if (r != null) tutti.push({ ritardo: rit, r: Math.round(r * 100) / 100, n: x.length });
  }
  if (!tutti.length) return null;
  const best = tutti.filter(t => t.n >= 12).sort((p, q) => q.r - p.r)[0] || null;
  return best ? Object.assign({}, best, { tutti }) : { ritardo: null, r: null, n: 0, tutti };
}
/** Parola semplice per una correlazione. */
export const forza = r => (r == null ? 'non calcolabile' : r >= 0.6 ? 'forte' : r >= 0.35 ? 'media' : r >= 0.15 ? 'debole' : 'quasi nulla');

// Razione indicativa per il rapporto latte/alimenti: 70% mais e 30% farina di soia (non è la razione dell'azienda).
export const MIX = { mais: 0.7, soia: 0.3 };
/** Kg di mangime indicativo (mais + soia) pagati da un litro di latte, mese per mese. */
export function latteSuMangime(latte, mais, soia) {
  const out = {};
  for (const k of Object.keys(latte || {})) {
    if (mais[k] == null || soia[k] == null) continue;
    const eKg = (MIX.mais * mais[k] + MIX.soia * soia[k]) / 1000;
    if (eKg > 0) out[k] = Math.round(latte[k] / 100 / eKg * 100) / 100;
  }
  return out;
}

/**
 * Riepilogo dei mercati per l'analisi (numeri arrotondati, ultimi 24 mesi): lo legge Claude per scrivere il commento,
 * e lo stesso calcolo lo rifà l'app per i grafici.
 * `serie` = { id: { mesi, sett } }; `extra` = serie mensili in più già pronte, es. { proprio: { nome, unita, mesi } }.
 */
export function riepilogo(serie, extra = {}) {
  const mens = {}; for (const s of SERIE) if (serie[s.id]) mens[s.id] = mensile(serie[s.id]);
  for (const [id, e] of Object.entries(extra)) mens[id] = e.mesi;
  const nome = id => (SERIE.find(s => s.id === id) || extra[id] || { nome: id }).nome;
  const unita = id => (SERIE.find(s => s.id === id) || extra[id] || { unita: '' }).unita;
  const prezzi = Object.keys(mens).map(id => {
    const k = Object.keys(mens[id]).sort().slice(-24);
    return { id, nome: nome(id), unita: unita(id), andamento: andamento(mens[id]), ultimi24: k.map(m => [m, mens[id][m]]) };
  }).filter(p => p.andamento);
  const rif = mens.proprio && Object.keys(mens.proprio).length >= 12 ? 'proprio' : 'latte-lomb';
  const legami = [];
  for (const id of ['latte-spot', 'latte-ue', 'mais', 'soia']) {
    if (!mens[id] || !mens[rif] || id === rif) continue;
    const a = anticipo(mens[id], mens[rif]); if (a && a.ritardo != null) legami.push({ da: nome(id), a: nome(rif), ritardo: a.ritardo, r: a.r, n: a.n, forza: forza(a.r) });
  }
  const ls = mens['latte-lomb'] && mens.mais && mens.soia ? latteSuMangime(mens['latte-lomb'], mens.mais, mens.soia) : {};
  return { prezzi, legami, latteSuMangime: andamento(ls), mix: MIX };
}

/* ================= pagina del giorno: istruzioni e schema per l'IA (Claude o IA del PC) ================= */
export const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['titolo', 'sintesi', 'argomenti', 'analisi', 'prospettive', 'mercati'],
  properties: {
    titolo: { type: 'string' },
    sintesi: { type: 'string' },
    argomenti: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['nome', 'riassunto', 'articoli'], properties: {
      nome: { type: 'string' }, riassunto: { type: 'string' },
      articoli: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'sintesi', 'importanza'], properties: { n: { type: 'integer' }, sintesi: { type: 'string' }, importanza: { type: 'string', enum: ['alta', 'media', 'bassa'] } } } },
    } } },
    analisi: { type: 'string' },
    prospettive: { type: 'array', items: { type: 'string' } },
    mercati: { type: 'object', additionalProperties: false, required: ['commento', 'correlazioni', 'idee'], properties: { commento: { type: 'string' }, correlazioni: { type: 'string' }, idee: { type: 'array', items: { type: 'string' } } } },
  },
};
export const ISTRUZIONI = `Sei l'assistente di un'azienda agricola con vacche da latte in Friuli (provincia di Udine). L'azienda consegna il latte a un caseificio e coltiva i campi per gli alimenti della stalla.
Ogni giorno ricevi gli articoli nuovi dei portali di settore scelti dall'azienda e un riepilogo dei prezzi di mercato. Scrivi la pagina del giorno in italiano semplice, per un agricoltore: frasi corte, niente gergo, niente parole inglesi se c'è quella italiana.
Regole:
- Usa solo i fatti scritti negli articoli e nei numeri: non inventare dati, nomi, date o prezzi. Se un articolo è solo un titolo o un invito a un evento, dillo in poche parole.
- Raggruppa gli articoli per argomento (stalla, campi, tecnologia, mercati, norme). Ogni articolo va citato una volta con il suo numero "n".
- Importanza "alta" solo per quello che può cambiare le scelte o i conti di una stalla da latte in pianura friulana; "bassa" per notizie lontane (altri paesi, altre specie, eventi).
- "analisi": cosa vogliono dire, insieme, le notizie del giorno per un'azienda come questa (8-12 righe).
- "prospettive": da 3 a 6 punti su cosa aspettarsi nei prossimi mesi e cosa conviene fare o tenere d'occhio; separa i fatti dalle tue stime ("è probabile", "da verificare").
- "mercati.commento": i prezzi del latte e degli alimenti con i numeri del riepilogo (ultimo mese, variazione sul mese e sull'anno).
- "mercati.correlazioni": spiega in parole semplici i legami calcolati (quanti mesi prima una serie anticipa il latte alla stalla e quanto è forte il legame). Una correlazione non è una certezza: dillo. Con meno di 24 mesi in comune il legame è poco affidabile.
- "mercati.idee": da 2 a 5 idee pratiche (per esempio quando conviene comprare mais o soia, se fissare un prezzo, come leggere lo spot).
- "titolo": una riga con la notizia più importante; "sintesi": 2-3 frasi per chi ha un minuto.`;

/** Messaggio con gli articoli numerati e il riepilogo dei prezzi. articoli = [{ fonte, argomento, data, titolo, testo }]. */
export function messaggioUtente(articoli, mercati, giorno) {
  const elenco = articoli.map((a, i) => `[${i + 1}] ${a.fonte} (${ARGOMENTI[a.argomento] || a.argomento}) — ${String(a.data || '').slice(0, 10)}
Titolo: ${a.titolo}
${String(a.testo || '').slice(0, 1200)}`).join('\n\n');
  return `Oggi è il ${giorno}.

ARTICOLI NUOVI (${articoli.length}):

${elenco || '(nessun articolo nuovo oggi: scrivi solo la parte dei mercati e lascia vuoti gli argomenti)'}

RIEPILOGO DEI PREZZI (JSON, prezzi in euro, mesi AAAA-MM):
${JSON.stringify(mercati)}`;
}

/** Unisce la risposta di Claude agli articoli veri (i collegamenti non passano mai da Claude). */
// (anche l'IA del PC passa da qui: le risposte possono avere la forma sbagliata, quindi tutto si mette a posto)
const elenco = v => (Array.isArray(v) ? v : v == null || v === '' ? [] : [v]);
export function componi(uscita, articoli) {
  uscita = uscita && typeof uscita === 'object' ? uscita : {};
  const usati = new Set();
  const argomenti = elenco(uscita.argomenti).filter(g => g && typeof g === 'object').map((g) => ({
    nome: String(g.nome || ''), riassunto: String(g.riassunto || ''),
    articoli: elenco(g.articoli).map((x) => { const n = Number(x && x.n); const a = articoli[n - 1]; if (!a || usati.has(n)) return null; usati.add(n); return { titolo: a.titolo, link: a.link, fonte: a.fonte, data: a.data, sintesi: String(x.sintesi || ''), importanza: ['alta', 'media', 'bassa'].includes(x.importanza) ? x.importanza : 'media' }; }).filter(Boolean),
  })).filter((g) => g.articoli.length || g.riassunto);
  const avanzati = articoli.filter((_, i) => !usati.has(i + 1));
  if (avanzati.length) argomenti.push({ nome: 'Altri articoli', riassunto: '', articoli: avanzati.map(a => ({ titolo: a.titolo, link: a.link, fonte: a.fonte, data: a.data, sintesi: '', importanza: 'bassa' })) });
  const m = uscita.mercati && typeof uscita.mercati === 'object' ? uscita.mercati : null;
  return {
    titolo: String(uscita.titolo || ''), sintesi: String(uscita.sintesi || ''), argomenti, analisi: String(uscita.analisi || ''), prospettive: elenco(uscita.prospettive).map(String),
    mercati: m ? { commento: String(m.commento || ''), correlazioni: String(m.correlazioni || ''), idee: elenco(m.idee).map(String) } : null,
  };
}

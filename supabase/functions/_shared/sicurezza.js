// Campo e Stalla — controllo della sicurezza (1.74.0). JavaScript puro: lo usano la funzione Supabase
// "sicurezza" (Deno) e l'app (pagina Sicurezza). Qui: elenco delle parti da controllare, lettura delle
// falle note (OSV.dev), filtro delle notizie, istruzioni e schema per Claude, consigli automatici.
// Se aggiungi o aggiorni una libreria in vendor/, aggiorna LIBRERIE (versione e, se cambia, il file).

export const REPO = 'Cekku/CAMPO-E-STALLA';
export const RAW = `https://raw.githubusercontent.com/${REPO}/main/`;
export const SITO = 'https://cekku.github.io/CAMPO-E-STALLA/';

// versione: quella scritta qui vale se nel file non si legge (cerca = espressione con la versione fra parentesi)
export const LIBRERIE = [
  { id: 'leaflet', nome: 'Leaflet (mappa)', pacchetto: 'leaflet', versione: '1.9.4', file: 'vendor/leaflet/leaflet.js', cerca: /Leaflet (\d+\.\d+\.\d+)/ },
  { id: 'geoman', nome: 'Geoman (disegno dei campi)', pacchetto: '@geoman-io/leaflet-geoman-free', versione: '2.17.0', file: 'vendor/geoman/leaflet-geoman.min.js', cerca: /version:"(\d+\.\d+\.\d+)"/ },
  { id: 'pdfjs', nome: 'pdf.js (lettura dei PDF)', pacchetto: 'pdfjs-dist', versione: '4.10.38', file: 'vendor/pdfjs/pdf.min.mjs', cerca: /apiVersion:"(\d+\.\d+\.\d+)"/ },
  { id: 'supabase', nome: 'supabase-js (collegamento a Supabase)', pacchetto: '@supabase/supabase-js', versione: '2.117.3', file: 'vendor/supabase/supabase.js', cerca: /(?:supabase-js|realtime-js)\/(\d+\.\d+\.\d+)/ },
  { id: 'tesseract', nome: 'Tesseract.js (lettura ottica)', pacchetto: 'tesseract.js', versione: '6.0.1', file: 'vendor/tesseract/tesseract.esm.min.js', cerca: /rE:"(\d+\.\d+\.\d+)"/ },
  { id: 'three', nome: 'three.js (3D dei trattori)', pacchetto: 'three', versione: '0.128.0', file: 'vendor/three/three.min.js', cerca: /"use strict";const \w+="(\d{3})"/, comeVersione: r => `0.${r}.0` },
  // versione non scritta nel file: si guardano tutte le falle note del pacchetto
  { id: 'shpjs', nome: 'shpjs (confini da shapefile)', pacchetto: 'shpjs', versione: null, file: null },
];
export const FILE_ANDROID = 'app-android/package-lock.json';
export const FILE_AZIONI = ['.github/workflows/apk.yml'];

// notizie: portali di sicurezza informatica con feed RSS (provati il 24/11/2026)
export const FONTI_NOTIZIE = [
  { nome: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
  { nome: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
  { nome: 'SecurityWeek', url: 'https://www.securityweek.com/feed/' },
  { nome: 'Cybersecurity360', url: 'https://www.cybersecurity360.it/feed/' },
  { nome: 'SecurityInfo', url: 'https://www.securityinfo.it/feed/' },
  // aggiornamenti di Chrome: contano solo quando una falla è già sfruttata (l'app Android usa il motore di Chrome)
  { nome: 'Chrome Releases', url: 'https://chromereleases.googleblog.com/feeds/posts/default', solo: /in the wild|exploit/i },
];
export const KEV = 'https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json';

// parole delle parti che usiamo: una notizia passa se ne contiene almeno una
export const PAROLE = [
  ['Supabase', /\bsupabase\b/i], ['PostgreSQL', /\bpostgre(s|sql)\b|\bpostgrest\b/i], ['Capacitor', /\bcapacitor\b/i],
  ['Android', /\bandroid\b|\bwebview\b/i], ['Chrome', /\bchrom(e|ium)\b/i], ['pdf.js', /\bpdf\.?js\b|\bpdfjs\b/i],
  ['Leaflet', /\bleaflet\b/i], ['Tesseract', /\btesseract\b/i], ['three.js', /\bthree\.js\b/i],
  ['GitHub', /\bgithub\b/i], ['npm', /\bnpm\b/i], ['Python', /\bpython\b|\bpypi\b|\bpip\b/i],
  ['Windows', /\bwindows\b|\bmicrosoft defender\b|\bonedrive\b/i], ['IA sul PC', /\blm ?studio\b|\bllama\.cpp\b|\bgguf\b|\bollama\b/i],
  ['Claude', /\banthropic\b|\bclaude\b/i], ['Deno', /\bdeno\b/i], ['Telegram', /\btelegram\b/i],
  ['Fotovoltaico', /\bfronius\b|\binverter\b/i], ['Agricoltura', /\bagricol|\bzootecn|\ballevament|\bagri(food|culture)\b|\bfarm(ing|ers?)\b|\bdairy\b/i],
];
export function parole(testo) { return PAROLE.filter(([, re]) => re.test(testo)).map(([n]) => n); }

/* ---------- versioni ---------- */
export function versioneDa(lib, testo) {
  if (!lib.cerca || !testo) return lib.versione;
  const m = String(testo).match(lib.cerca);
  return m ? (lib.comeVersione ? lib.comeVersione(m[1]) : m[1]) : lib.versione;
}
const pezzi = v => String(v || '').replace(/^v/i, '').split(/[.+-]/).map(x => (/^\d+$/.test(x) ? Number(x) : x));
export function confronta(a, b) {
  const x = pezzi(a), y = pezzi(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const p = x[i] ?? 0, q = y[i] ?? 0;
    if (p === q) continue;
    if (typeof p === 'number' && typeof q === 'number') return p < q ? -1 : 1;
    return String(p) < String(q) ? -1 : 1;
  }
  return 0;
}

/* ---------- falle note (OSV.dev) ---------- */
export const GRAVITA = { alta: 'Alta', media: 'Media', bassa: 'Bassa' };
export function gravitaOsv(v) {
  const s = String(v?.database_specific?.severity || '').toUpperCase();
  if (s === 'CRITICAL' || s === 'HIGH') return 'alta';
  if (s === 'LOW') return 'bassa';
  return 'media';
}
// versioni che riparano la falla per quel pacchetto
export function riparateIn(v, pacchetto) {
  const out = [];
  for (const a of v?.affected || []) {
    if (a?.package?.name !== pacchetto) continue;
    for (const r of a.ranges || []) for (const e of r.events || []) if (e.fixed) out.push(e.fixed);
  }
  return [...new Set(out)].sort(confronta);
}
// la prima versione riparata dopo la nostra (null = nessuna riparazione nota)
export function rimedioVersione(v, pacchetto, nostra) {
  const ok = riparateIn(v, pacchetto).filter(f => !nostra || confronta(f, nostra) > 0);
  return ok[0] || null;
}
// azioni di GitHub con il solo numero grande (es. actions/checkout@v5): il tag segue l'ultima 5.x,
// quindi la falla ci riguarda solo se non è riparata dentro la stessa serie
export function azioneColpita(v, nome, maggiore) {
  for (const a of v?.affected || []) {
    if (a?.package?.name?.toLowerCase() !== nome.toLowerCase()) continue;
    for (const r of a.ranges || []) {
      let dentro = false, riparata = null;
      for (const e of r.events || []) { if (e.introduced != null) dentro = Number(pezzi(e.introduced)[0] || 0) <= maggiore; if (e.fixed) riparata = e.fixed; }
      if (dentro && (!riparata || Number(pezzi(riparata)[0]) > maggiore)) return true;
    }
  }
  return false;
}
export function cve(v) { return [v.id, ...(v.aliases || [])].find(x => /^CVE-/.test(x)) || v.id; }
export function linkOsv(id) { return `https://osv.dev/vulnerability/${encodeURIComponent(id)}`; }

// pacchetti dal package-lock.json (lockfileVersion 2 o 3)
export function pacchettiLock(lock) {
  const out = new Map();
  for (const [k, p] of Object.entries(lock?.packages || {})) {
    if (!k || !p?.version) continue;
    const nome = p.name || k.slice(k.lastIndexOf('node_modules/') + 13);
    out.set(`${nome}@${p.version}`, { nome, versione: p.version, sviluppo: !!p.dev });
  }
  return [...out.values()];
}
// "uses: proprietario/nome@versione" dai file delle GitHub Actions
export function azioniDa(yml) {
  const out = [];
  for (const m of String(yml).matchAll(/uses:\s*['"]?([\w.-]+\/[\w.-]+)(?:\/[\w./-]+)?@([\w.-]+)/g)) out.push({ nome: m[1], ref: m[2] });
  return out;
}

/* ---------- segreti (sito e file) ---------- */
export function ruoloJwt(t) {
  try {
    const p = String(t).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const s = typeof atob === 'function' ? atob(p + '==='.slice((p.length + 3) % 4)) : '';
    return JSON.parse(s).role || null;
  } catch (_) { return null; }
}

/* ---------- notizie ---------- */
export function sceltaNotizie(articoli, giorni = 8, quante = 25) {
  const limite = Date.now() - giorni * 864e5;
  return articoli
    .filter(a => !a.data || Date.parse(a.data) >= limite)
    .map(a => ({ ...a, parole: parole(`${a.titolo} ${a.testo}`) }))
    .filter(a => a.parole.length)
    .sort((a, b) => b.parole.length - a.parole.length || String(b.data).localeCompare(String(a.data)))
    .slice(0, quante);
}
// falle già sfruttate dai criminali (elenco CISA KEV) aggiunte negli ultimi giorni e che toccano le nostre parti
export function sceltaKev(kev, giorni = 8) {
  const limite = new Date(Date.now() - giorni * 864e5).toISOString().slice(0, 10);
  return (kev?.vulnerabilities || [])
    .filter(v => String(v.dateAdded) >= limite)
    .map(v => ({ v, parole: parole(`${v.vendorProject} ${v.product} ${v.vulnerabilityName}`) }))
    .filter(x => x.parole.length)
    .map(({ v, parole: p }) => ({
      titolo: `${v.cveID}: ${v.vendorProject} ${v.product} — ${v.vulnerabilityName}`,
      link: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, data: v.dateAdded, fonte: 'CISA (falle già sfruttate)',
      testo: `${v.shortDescription || ''} Cosa fare secondo CISA: ${v.requiredAction || ''}`.slice(0, 900), parole: p,
    }));
}

/* ---------- Claude ---------- */
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['stato', 'titolo', 'sintesi', 'falle', 'notizie', 'consigli'],
  properties: {
    stato: { type: 'string', enum: ['verde', 'giallo', 'rosso'] },
    titolo: { type: 'string' },
    sintesi: { type: 'string' },
    falle: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['rif', 'titolo', 'gravita', 'cosa', 'rimedio', 'chi'], properties: {
      rif: { type: 'integer' }, titolo: { type: 'string' }, gravita: { type: 'string', enum: ['alta', 'media', 'bassa'] },
      cosa: { type: 'string' }, rimedio: { type: 'array', items: { type: 'string' } }, chi: { type: 'string' } } } },
    notizie: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['n', 'riguarda', 'perche', 'cosa_fare'], properties: {
      n: { type: 'integer' }, riguarda: { type: 'string', enum: ['si', 'forse', 'no'] }, perche: { type: 'string' }, cosa_fare: { type: 'string' } } } },
    consigli: { type: 'array', items: { type: 'string' } },
  },
};

export const ISTRUZIONI = `Sei il consulente di sicurezza informatica di un'azienda agricola con vacche da latte in Friuli. Il titolare, Marco, non è un informatico: scrivi in italiano semplice, frasi corte, niente gergo; se una parola tecnica serve, spiegala in poche parole.
Ogni settimana ricevi i risultati dei controlli automatici sul gestionale dell'azienda "Campo e Stalla" e le notizie di sicurezza della settimana. Il sistema è fatto così:
- app web (JavaScript, senza framework) pubblicata su GitHub Pages da un repository PUBBLICO: nel codice non devono mai esserci chiavi segrete, nomi di dipendenti, IBAN, codici fiscali o importi veri;
- dati su Supabase (database Postgres con regole RLS, funzioni Edge, archivio file "allegati"); la chiave "anon" nel sito è pubblica per natura, quella "service_role" non deve mai uscire da Supabase;
- app Android fatta con Capacitor che apre il sito (usa il motore di Chrome del telefono, WebView);
- librerie copiate nella cartella vendor/ (Leaflet, Geoman, pdf.js, supabase-js, Tesseract.js, three.js, shpjs);
- un PC Windows in azienda con l'archivio dei documenti in Python, un "ponte" locale sulla porta 1236 e l'IA locale LM Studio sulla porta 1234 (devono ascoltare solo su 127.0.0.1).
Il codice lo scrive Claude Code nel progetto, su richiesta di Marco.
Regole:
- Usa solo i fatti dei controlli e delle notizie: non inventare falle, codici CVE, versioni o date. Se un dato manca, dillo.
- Per ogni problema dei controlli scrivi una voce in "falle" con "rif" = il numero del problema. Puoi aggiungere una voce con rif 0 solo per una notizia che ci riguarda di sicuro e richiede un'azione.
- "cosa": che cosa può succedere in pratica, in una o due frasi, senza allarmismi. "rimedio": passi concreti e in ordine. Se serve cambiare il codice, scrivi la frase pronta da dare a Claude Code fra virgolette. Se serve il pannello di Supabase, GitHub o Windows, scrivi il percorso dei menu. "chi": "Marco", "Claude Code" oppure "Marco con Claude Code".
- La gravità la decidi tu guardando il rischio vero per questa azienda (quella indicata dai controlli è un punto di partenza): una falla di una libreria che si attiva solo con file preparati apposta, quando i file li carica solo Marco, è più bassa di una chiave segreta pubblicata.
- "notizie": una voce per ogni notizia ricevuta, "n" = il suo numero. "riguarda": "si" solo se tocca una parte che usiamo davvero (con la versione giusta, se è scritta), "forse" se non si può sapere, "no" altrimenti. "perche" e "cosa_fare" in una frase ciascuno ("niente" va bene).
- "stato": "rosso" se c'è almeno un problema grave da sistemare subito, "giallo" se ci sono cose da fare senza urgenza, "verde" se va tutto bene. "titolo": una riga. "sintesi": 3-5 frasi su com'è la situazione e cosa è cambiato rispetto alla settimana scorsa.
- "consigli": al massimo 5 buone abitudini utili questa settimana, brevi; niente ripetizioni delle falle.`;

export function messaggioUtente({ giorno, problemi, ok, notizie, pc, prima }) {
  const r = [`Controllo della settimana, ${giorno}.`, ''];
  r.push(`Controlli superati (${ok.length}):`, ...ok.map(o => `- [${o.parte}] ${o.titolo}`), '');
  r.push(problemi.length ? `Problemi trovati (${problemi.length}):` : 'Problemi trovati: nessuno.');
  problemi.forEach((p, i) => r.push(`${i + 1}. [${p.parte}] gravità indicata: ${p.gravita}. ${p.titolo}. ${p.dettaglio || ''}${p.rimedio ? ` Rimedio automatico: ${p.rimedio}` : ''}`));
  r.push('', pc ? `Controllo del PC: fatto il ${String(pc.creato || '').slice(0, 10)}${pc.vecchio ? ' (è vecchio: il PC non ha mandato un controllo nuovo da più di 10 giorni)' : ''}; i suoi problemi sono già nell'elenco sopra con la parte "PC".` : 'Controllo del PC: non arrivato (il PC era spento o non è ancora collegato).');
  r.push('', notizie.length ? `Notizie della settimana (${notizie.length}):` : 'Notizie della settimana: nessuna che tocchi le nostre parti.');
  notizie.forEach((n, i) => r.push(`${i + 1}. [${n.fonte}, ${String(n.data || '').slice(0, 10)}] ${n.titolo} — parole: ${(n.parole || []).join(', ')}. ${String(n.testo || '').slice(0, 700)}`));
  if (prima) r.push('', `Resoconto della volta prima (${prima.giorno}): stato ${prima.stato || '?'}; problemi: ${(prima.titoli || []).join('; ') || 'nessuno'}.`);
  return r.join('\n');
}

// unisce la risposta di Claude con i dati veri: link e titoli delle notizie e i dettagli dei problemi
// li rimettiamo noi, così Claude non li può inventare
export function componi(uscita, problemi, notizie) {
  const falle = (uscita.falle || []).map(f => {
    const p = f.rif > 0 ? problemi[f.rif - 1] : null;
    return { ...f, parte: p ? p.parte : 'Notizie', fonte: p?.fonte || null, chiave: p?.chiave || null, dettaglio: p?.dettaglio || '' };
  });
  // un problema che Claude non ha commentato resta con il consiglio automatico
  const citati = new Set(falle.map(f => f.rif));
  problemi.forEach((p, i) => { if (!citati.has(i + 1)) falle.push(automatica(p, i + 1)); });
  const ordine = { alta: 0, media: 1, bassa: 2 };
  falle.sort((a, b) => ordine[a.gravita] - ordine[b.gravita]);
  const nz = notizie.map((n, i) => {
    const c = (uscita.notizie || []).find(x => x.n === i + 1) || {};
    return { titolo: n.titolo, link: n.link, fonte: n.fonte, data: n.data, parole: n.parole, riguarda: c.riguarda || 'forse', perche: c.perche || '', cosa_fare: c.cosa_fare || '' };
  });
  return { stato: uscita.stato, titolo: uscita.titolo, sintesi: uscita.sintesi, falle, notizie: nz, consigli: (uscita.consigli || []).slice(0, 5) };
}

// senza Claude: i consigli scritti nei controlli
export function automatica(p, rif) {
  return { rif, titolo: p.titolo, gravita: p.gravita, cosa: p.dettaglio || '', rimedio: p.rimedio ? [p.rimedio] : [], chi: p.chi || 'Marco con Claude Code', parte: p.parte, fonte: p.fonte || null, chiave: p.chiave || null, dettaglio: p.dettaglio || '' };
}
export function resocontoAutomatico(problemi, notizie) {
  const falle = problemi.map((p, i) => automatica(p, i + 1));
  const alte = falle.filter(f => f.gravita === 'alta').length;
  return {
    stato: alte ? 'rosso' : falle.length ? 'giallo' : 'verde',
    titolo: alte ? `${alte} problemi gravi da sistemare` : falle.length ? `${falle.length} cose da sistemare, niente di grave` : 'Nessun problema trovato',
    sintesi: 'Resoconto fatto in automatico, senza Claude: i consigli sono quelli scritti nei controlli.',
    falle, notizie: notizie.map(n => ({ titolo: n.titolo, link: n.link, fonte: n.fonte, data: n.data, parole: n.parole, riguarda: 'forse', perche: '', cosa_fare: '' })), consigli: [],
  };
}

// la parte del PC: la manda lo script strumenti/sicurezza/sicurezza-pc.py
export function problemiPc(pc) {
  if (!pc || !Array.isArray(pc.problemi)) return [];
  return pc.problemi.slice(0, 60).map(p => ({
    parte: 'PC', chiave: `pc:${String(p.chiave || p.titolo).slice(0, 80)}`, gravita: GRAVITA[p.gravita] ? p.gravita : 'media',
    titolo: String(p.titolo || '').slice(0, 200), dettaglio: String(p.dettaglio || '').slice(0, 600), rimedio: String(p.rimedio || '').slice(0, 400),
    fonte: /^https:\/\//.test(String(p.fonte || '')) ? p.fonte : null, chi: p.chi || 'Marco',
  }));
}
export const STATI = { verde: 'Tutto a posto', giallo: 'Qualcosa da sistemare', rosso: 'Da sistemare subito' };

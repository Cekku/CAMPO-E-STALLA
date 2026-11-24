// Campo e Stalla — controllo della sicurezza (funzione Supabase "sicurezza", 1.74.0).
//
// Ogni lunedì (pg_cron, vedi supabase/aggiornamento-sicurezza.sql) e quando il titolare preme "Controlla adesso":
//  1. librerie di vendor/, pacchetti dell'app Android e GitHub Actions: falle note da OSV.dev;
//  2. database: tabelle senza regole RLS, regole della raccolta riservata, funzioni speciali, archivio file,
//     prove dall'esterno con la sola chiave pubblica (non deve uscire nessun dato), impostazioni dell'accesso;
//  3. sito su GitHub Pages: noindex, robots.txt, HTTPS, chiave pubblicata (deve essere la "anon");
//  4. notizie della settimana dai portali di sicurezza e dall'elenco CISA delle falle già sfruttate,
//     tenute solo se toccano le parti che usiamo;
//  5. la parte del PC (la manda lo script strumenti/sicurezza/sicurezza-pc.py con lo stesso segreto);
//  6. con la chiave di Claude (ANTHROPIC_API_KEY) un resoconto in italiano semplice con i rimedi.
// Scrive solo la raccolta "sicurezza" (riservata al titolare: la funzione non scrive niente finché
// l'SQL di aggiornamento non l'ha resa riservata) e solo nell'azienda del segreto SICUREZZA_FARM (quella di Marco).
// I valori segreti trovati non si scrivono mai: solo dove sono e di che tipo.
import { LIBRERIE, RAW, SITO, FILE_ANDROID, FILE_AZIONI, FONTI_NOTIZIE, KEV, versioneDa, pacchettiLock, azioniDa, gravitaOsv,
  rimedioVersione, riparateIn, azioneColpita, confronta, cve, linkOsv, ruoloJwt, sceltaNotizie, sceltaKev, SCHEMA, ISTRUZIONI, messaggioUtente,
  componi, resocontoAutomatico, problemiPc } from '../_shared/sicurezza.js';
import { leggiFeed, sembraFeed } from '../_shared/mercati.js';

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
const URL_SB = Deno.env.get('SUPABASE_URL') || '';
const SERVIZIO = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const MODELLI = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];
const MODELLO = MODELLI.includes(Deno.env.get('SICUREZZA_MODELLO') || '') ? Deno.env.get('SICUREZZA_MODELLO')! : 'claude-opus-5-5';
const PREZZI: Record<string, [number, number]> = { 'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5] };
const UA = 'Mozilla/5.0 (compatible; CampoEStalla-Sicurezza/1.0)';

type Rec = { farm_id: string; col: string; id: string; data: Record<string, any>; deleted?: boolean };
type Problema = { parte: string; chiave: string; gravita: string; titolo: string; dettaglio?: string; rimedio?: string; fonte?: string | null; chi?: string };
type Ok = { parte: string; titolo: string };

const oggi = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Rome' }).format(new Date());
const msg = (e: unknown) => String((e as Error)?.message || e);

async function db(percorso: string, init: RequestInit = {}) {
  const r = await fetch(`${URL_SB}/rest/v1/${percorso}`, { ...init, headers: { apikey: SERVIZIO, authorization: `Bearer ${SERVIZIO}`, 'content-type': 'application/json', ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`database ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 || init.method === 'POST' && !String(percorso).startsWith('rpc/') ? null : r.json();
}
const scrivi = (righe: Rec[]) => righe.length ? db('records?on_conflict=farm_id,col,id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(righe.map(r => ({ ...r, deleted: false }))) }) : null;

async function scarica(url: string, ms = 15000, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { 'user-agent': UA, ...(init.headers || {}) }, redirect: init.redirect || 'follow', signal: AbortSignal.timeout(ms) });
  return r;
}
async function testo(url: string, ms = 15000) { const r = await scarica(url, ms); if (!r.ok) throw new Error(`HTTP ${r.status}`); return await r.text(); }

/* ---------- OSV ---------- */
const dettagli = new Map<string, Promise<any>>();
function vuln(id: string) {
  if (!dettagli.has(id)) dettagli.set(id, scarica(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`, 15000).then(r => (r.ok ? r.json() : null)).catch(() => null));
  return dettagli.get(id)!;
}
async function osv(query: { nome: string; eco: string; versione?: string | null }[]) {
  if (!query.length) return [] as string[][];
  const out: string[][] = [];
  for (let i = 0; i < query.length; i += 500) {
    const pezzo = query.slice(i, i + 500);
    const r = await scarica('https://api.osv.dev/v1/querybatch', 30000, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ queries: pezzo.map(q => ({ package: { name: q.nome, ecosystem: q.eco }, ...(q.versione ? { version: q.versione } : {}) })) }) });
    if (!r.ok) throw new Error(`OSV ${r.status}`);
    const d = await r.json();
    for (const x of d.results || []) out.push((x.vulns || []).map((v: { id: string }) => v.id));
  }
  return out;
}
// una voce per pacchetto con tutte le sue falle (la stessa falla con più nomi si conta una volta)
async function voce(parte: string, nome: string, pacchetto: string, versione: string | null, ids: string[], extra = ''): Promise<Problema | null> {
  const viste = new Set<string>(), falle: any[] = [];
  for (const id of ids.slice(0, 12)) {
    const v = await vuln(id);
    if (!v || v.withdrawn || [v.id, ...(v.aliases || [])].some((x: string) => viste.has(x))) continue;
    [v.id, ...(v.aliases || [])].forEach((x: string) => viste.add(x));
    falle.push(v);
  }
  if (!falle.length) return null;
  const ordine: Record<string, number> = { alta: 0, media: 1, bassa: 2 };
  falle.sort((a, b) => ordine[gravitaOsv(a)] - ordine[gravitaOsv(b)]);
  const rip = falle.map(v => (versione ? rimedioVersione(v, pacchetto, versione) : riparateIn(v, pacchetto).at(-1))).filter(Boolean) as string[];
  const serve = rip.sort(confronta).at(-1) || null;   // la più alta: ripara tutte quelle riparabili
  const nomi = falle.map(cve);
  const titolo = falle.length === 1
    ? `${nome}${versione ? ` ${versione}` : ''}: ${nomi[0]}${falle[0].summary ? ` — ${String(falle[0].summary).slice(0, 140)}` : ''}`
    : `${nome}${versione ? ` ${versione}` : ''}: ${falle.length} falle note (${nomi.slice(0, 4).join(', ')}${falle.length > 4 ? '…' : ''})`;
  return { parte, chiave: `${parte}:${pacchetto}`, gravita: gravitaOsv(falle[0]), titolo, fonte: linkOsv(falle[0].id),
    dettaglio: (falle.length === 1 ? String(falle[0].details || falle[0].summary || '').replace(/\s+/g, ' ').slice(0, 500)
      : falle.slice(0, 6).map(v => `${cve(v)}: ${String(v.summary || '').slice(0, 110)}`).join(' · ')) + extra,
    rimedio: serve ? `Aggiornare ${pacchetto} almeno alla versione ${serve}${versione ? '' : ' (la nostra versione non è scritta nel file: controllarla)'}.` : 'Non c\'è ancora una versione riparata: valutare se la parte colpita è usata.',
    chi: 'Marco con Claude Code' };
}

/* ---------- 1. librerie, app Android, GitHub Actions ---------- */
async function librerie(ok: Ok[], pb: Problema[], err: Record<string, string>) {
  const libs = await Promise.all(LIBRERIE.map(async l => {
    if (!l.file) return { l, v: l.versione };
    try { return { l, v: versioneDa(l, await testo(RAW + l.file, 20000)) }; } catch (e) { err[`libreria ${l.id}`] = msg(e); return { l, v: l.versione }; }
  }));
  const ris = await osv(libs.map(x => ({ nome: x.l.pacchetto, eco: 'npm', versione: x.v })));
  for (let i = 0; i < libs.length; i++) {
    const { l, v } = libs[i], ids = ris[i] || [];
    const p = ids.length ? await voce('Librerie', l.nome, l.pacchetto, v, ids) : null;
    if (p) pb.push(p); else ok.push({ parte: 'Librerie', titolo: `${l.nome}${v ? ` ${v}` : ''}: nessuna falla nota` });
  }
  return libs.map(x => ({ id: x.l.id, nome: x.l.nome, pacchetto: x.l.pacchetto, versione: x.v }));
}
async function android(ok: Ok[], pb: Problema[], err: Record<string, string>) {
  let pk: ReturnType<typeof pacchettiLock> = [];
  try { pk = pacchettiLock(JSON.parse(await testo(RAW + FILE_ANDROID))); } catch (e) { err['app Android'] = msg(e); return; }
  const ris = await osv(pk.map(p => ({ nome: p.nome, eco: 'npm', versione: p.versione })));
  let n = 0;
  for (let i = 0; i < pk.length; i++) {
    if (!(ris[i] || []).length) continue;
    const p = await voce('App Android', pk[i].nome, pk[i].nome, pk[i].versione, ris[i], pk[i].sviluppo ? ' (serve solo per creare l\'APK, non è dentro l\'app)' : '');
    if (!p) continue;
    const rip = p.rimedio?.match(/versione (\S+?)\.?$/)?.[1];
    // i pacchetti per creare l'APK girano solo su GitHub Actions con il nostro codice: rischio basso
    if (pk[i].sviluppo) p.gravita = 'bassa';
    p.rimedio = pk[i].sviluppo
      ? `Non entra nell'app sul telefono. Chiedere a Claude Code: "in app-android aggiorna i pacchetti per creare l'APK (npm update, @capacitor/cli) così ${pk[i].nome} passa${rip ? ` alla ${rip}` : ' a una versione riparata'}".`
      : `Chiedere a Claude Code: "aggiorna ${pk[i].nome} nell'app Android${rip ? ` alla ${rip}` : ''}, cambia versione e rifai l'APK".`;
    pb.push(p); n++;
  }
  if (!n) ok.push({ parte: 'App Android', titolo: `${pk.length} pacchetti dell'app Android (Capacitor): nessuna falla nota` });
}
async function azioni(ok: Ok[], pb: Problema[], err: Record<string, string>) {
  for (const f of FILE_AZIONI) {
    let yml = '';
    try { yml = await testo(RAW + f); } catch (e) { err[f] = msg(e); continue; }
    const az = azioniDa(yml);
    const maggiori = az.filter(a => /^v?\d+$/.test(a.ref)), esatte = az.filter(a => /^v?\d+\.\d+(\.\d+)?$/.test(a.ref));
    const ris = await osv([...maggiori.map(a => ({ nome: a.nome, eco: 'GitHub Actions' })), ...esatte.map(a => ({ nome: a.nome, eco: 'GitHub Actions', versione: a.ref.replace(/^v/, '') }))]);
    let n = 0;
    for (let i = 0; i < maggiori.length + esatte.length; i++) {
      const a = i < maggiori.length ? maggiori[i] : esatte[i - maggiori.length];
      const colpite: string[] = [];
      for (const id of ris[i] || []) {
        const d = await vuln(id); if (!d || d.withdrawn) continue;
        if (i < maggiori.length && !azioneColpita(d, a.nome, Number(a.ref.replace(/^v/, '')))) continue;
        colpite.push(id);
      }
      const p = colpite.length ? await voce('GitHub', a.nome, a.nome, i < maggiori.length ? null : a.ref.replace(/^v/, ''), colpite) : null;
      if (p) { pb.push({ ...p, titolo: p.titolo.replace(a.nome, `${a.nome}@${a.ref}`), rimedio: `Chiedere a Claude Code: "in ${f} aggiorna ${a.nome} a una versione riparata".` }); n++; }
    }
    if (!n) ok.push({ parte: 'GitHub', titolo: `${f}: ${az.length} azioni (${az.map(a => `${a.nome}@${a.ref}`).join(', ')}) senza falle note` });
    if (!/^\s*permissions\s*:/m.test(yml)) pb.push({ parte: 'GitHub', chiave: `GitHub:permessi:${f}`, gravita: 'bassa', titolo: `${f}: non dice quali permessi servono al lavoro`,
      dettaglio: 'Senza la voce "permissions" il lavoro automatico riceve i permessi predefiniti del repository, spesso più del necessario.',
      rimedio: `Chiedere a Claude Code: "in ${f} metti permissions con il minimo che serve (contents: write solo se crea la Release)".`, chi: 'Claude Code' });
  }
}

/* ---------- 2. database ---------- */
async function database(controllo: any, ok: Ok[], pb: Problema[], err: Record<string, string>) {
  const c = controllo || {};
  const P = (chiave: string, gravita: string, titolo: string, dettaglio: string, rimedio: string, chi = 'Marco con Claude Code') => pb.push({ parte: 'Database', chiave: `Database:${chiave}`, gravita, titolo, dettaglio, rimedio, chi });
  if ((c.senza_rls || []).length) P('rls', 'alta', `Tabelle senza regole di accesso (RLS): ${c.senza_rls.join(', ')}`, 'Chi ha la chiave pubblica del sito può leggere o cambiare queste tabelle.', 'Chiedere a Claude Code: "attiva le regole RLS sulle tabelle senza protezione e scrivi l\'SQL da eseguire in Supabase".');
  else ok.push({ parte: 'Database', titolo: 'Tutte le tabelle hanno le regole di accesso (RLS)' });
  const pol = (c.politiche || []).filter((p: any) => p.tabella === 'records');
  const riservate = ['fatture', 'bilanci', 'econfig', 'paghe', 'pagamenti', 'sicurezza'];
  for (const nome of ['records_select', 'records_insert', 'records_update']) {
    const p = pol.find((x: any) => x.nome === nome), t = `${p?.usa || ''} ${p?.controlla || ''}`;
    const mancano = riservate.filter(r => !t.includes(`'${r}'`));
    if (!p) P(`pol:${nome}`, 'alta', `Manca la regola ${nome} sui dati`, 'Senza questa regola i dati non sono protetti come previsto.', 'Rieseguire supabase/schema.sql e poi i file di aggiornamento nello SQL Editor di Supabase.');
    else if (mancano.length) P(`pol:${nome}`, 'alta', `La regola ${nome} non riserva al titolare: ${mancano.join(', ')}`, 'I collaboratori potrebbero vedere o cambiare dati riservati al titolare.', 'Eseguire supabase/aggiornamento-sicurezza.sql nello SQL Editor di Supabase.');
  }
  if (pol.length && !pb.some(p => p.chiave.startsWith('Database:pol:'))) ok.push({ parte: 'Database', titolo: 'Regole dei dati: Conti, Personale e Sicurezza riservati al titolare' });
  if ((c.definer_senza_path || []).length) P('path', 'media', `Funzioni speciali senza percorso fisso: ${c.definer_senza_path.join(', ')}`, 'Una funzione "security definer" senza search_path può essere ingannata a usare oggetti sbagliati.', 'Chiedere a Claude Code: "aggiungi set search_path = public alle funzioni security definer indicate".');
  const definerAnon = (c.definer_anon || []) as string[];
  if (definerAnon.length) P('anon', 'media', `Funzioni speciali che si possono chiamare senza accesso: ${definerAnon.join(', ')}`, 'Girano con i permessi pieni del database e le può chiamare chiunque abbia la chiave pubblica. Di solito controllano l\'utente dentro, ma è meglio toglierle a chi non ha fatto l\'accesso.', `Chiedere a Claude Code: "revoca execute da public e anon per ${definerAnon.join(', ')} e dalla a authenticated, se l'app non le usa prima dell'accesso".`);
  else if (controllo) ok.push({ parte: 'Database', titolo: 'Nessuna funzione speciale aperta a chi non ha fatto l\'accesso' });
  if ((c.viste || []).length) P('viste', 'media', `Viste che non rispettano le regole RLS: ${c.viste.join(', ')}`, 'Una vista senza security_invoker mostra i dati con i permessi di chi l\'ha creata.', 'Chiedere a Claude Code: "metti security_invoker = true alle viste indicate".');
  const pubblici = (c.secchi || []).filter((s: any) => s.pubblico);
  if (pubblici.length) P('secchi', 'alta', `Spazi file pubblici: ${pubblici.map((s: any) => s.nome).join(', ')}`, 'Chi conosce il nome di un file lo scarica senza accesso.', 'Supabase → Storage → lo spazio → Edit bucket → togliere "Public bucket".', 'Marco');
  else if (controllo) ok.push({ parte: 'Database', titolo: 'Spazio dei file (allegati) privato' });
  if (c.postgres) ok.push({ parte: 'Database', titolo: `Postgres ${c.postgres}; estensioni: ${Object.entries(c.estensioni || {}).map(([k, v]) => `${k} ${v}`).join(', ')}` });
  if ((c.estensioni_in_public || []).length) P('ext', 'bassa', `Estensioni nello schema public: ${c.estensioni_in_public.join(', ')}`, 'Supabase consiglia di tenerle in uno schema a parte (extensions).', 'Si può lasciare così; se si vuole, chiedere a Claude Code l\'SQL per spostarle.');

  // prove dall'esterno con la sola chiave pubblica: non deve uscire nessuna riga
  let tabelle: string[] = ['records', 'farms', 'farm_members'];
  try {
    const api = await scarica(`${URL_SB}/rest/v1/`, 15000, { headers: { apikey: SERVIZIO, authorization: `Bearer ${SERVIZIO}`, accept: 'application/openapi+json' } });
    if (api.ok) { const d = await api.json(); tabelle = Object.keys(d.paths || {}).filter(p => /^\/[^/]+$/.test(p) && p !== '/').map(p => p.slice(1)); }
  } catch (e) { err['elenco tabelle'] = msg(e); }
  const aperte: string[] = [];
  await Promise.all(tabelle.map(async t => {
    try {
      const r = await scarica(`${URL_SB}/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, 15000, { headers: { apikey: ANON, authorization: `Bearer ${ANON}` } });
      if (r.ok) { const d = await r.json(); if (Array.isArray(d) && d.length) aperte.push(t); }
    } catch (e) { err[`prova ${t}`] = msg(e); }
  }));
  if (aperte.length) P('aperte', 'alta', `Dati leggibili senza accesso: ${aperte.join(', ')}`, 'Con la sola chiave pubblica del sito si leggono delle righe: chiunque può vederle.', 'Subito: chiedere a Claude Code di controllare le regole RLS di queste tabelle.');
  else ok.push({ parte: 'Database', titolo: `Prova dall'esterno: ${tabelle.length} tabelle, nessun dato leggibile senza accesso` });
  try {
    const r = await scarica(`${URL_SB}/storage/v1/object/list/allegati`, 15000, { method: 'POST', headers: { apikey: ANON, authorization: `Bearer ${ANON}`, 'content-type': 'application/json' }, body: JSON.stringify({ prefix: '', limit: 1 }) });
    const d = r.ok ? await r.json() : [];
    if (Array.isArray(d) && d.length) P('file', 'alta', 'L\'elenco dei file allegati si legge senza accesso', 'Con la sola chiave pubblica si vedono i nomi dei file.', 'Chiedere a Claude Code di controllare le regole di storage.objects.');
    else ok.push({ parte: 'Database', titolo: 'Prova dall\'esterno: file allegati non visibili senza accesso' });
  } catch (e) { err['prova allegati'] = msg(e); }
  try {
    const a = await (await scarica(`${URL_SB}/auth/v1/settings`, 15000, { headers: { apikey: ANON } })).json();
    if (a.mailer_autoconfirm) P('conferma', 'bassa', 'Nuovi utenti accettati senza confermare l\'email', 'Chiunque può creare un utente con un\'email non sua (per entrare in azienda serve comunque il codice di invito).', 'Supabase → Authentication → Sign In / Providers → Email → attivare "Confirm email".', 'Marco');
    else ok.push({ parte: 'Database', titolo: 'Accesso: l\'email va confermata' });
  } catch (e) { err['impostazioni accesso'] = msg(e); }
}

/* ---------- funzioni Edge ---------- */
async function funzioni(ok: Ok[], pb: Problema[], err: Record<string, string>) {
  const prove: [string, RequestInit, string, (s: number) => boolean][] = [
    ['chiedi', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }, 'chat con Claude', s => s === 401 || s === 403],
    ['rassegna', { method: 'POST', headers: { 'content-type': 'application/json', apikey: ANON }, body: '{}' }, 'rassegna', s => s === 401 || s === 403],
    ['catasto?u=' + encodeURIComponent('https://example.com/'), { method: 'GET' }, 'catasto (solo i servizi dell\'Agenzia)', s => s === 403],
  ];
  for (const [f, init, nome, buono] of prove) {
    try {
      const r = await scarica(`${URL_SB}/functions/v1/${f}`, 15000, init); await r.body?.cancel();
      if (r.status === 404) continue;   // funzione non pubblicata
      if (buono(r.status)) ok.push({ parte: 'Funzioni', titolo: `Funzione ${nome}: rifiuta chi non ha il permesso` });
      else pb.push({ parte: 'Funzioni', chiave: `Funzioni:${f.split('?')[0]}`, gravita: 'alta', titolo: `La funzione ${f.split('?')[0]} risponde anche a chi non ha il permesso (codice ${r.status})`, dettaglio: 'Chiunque potrebbe usarla, anche spendendo il credito di Claude.', rimedio: `Chiedere a Claude Code: "controlla i permessi della funzione ${f.split('?')[0]}".`, chi: 'Claude Code' });
    } catch (e) { err[`funzione ${f.split('?')[0]}`] = msg(e); }
  }
}

/* ---------- 3. sito ---------- */
async function sito(ok: Ok[], pb: Problema[], err: Record<string, string>) {
  const P = (chiave: string, gravita: string, titolo: string, dettaglio: string, rimedio: string) => pb.push({ parte: 'Sito', chiave: `Sito:${chiave}`, gravita, titolo, dettaglio, rimedio, chi: 'Claude Code' });
  try {
    const html = await testo(SITO);
    if (/<meta[^>]+name=["']robots["'][^>]+noindex/i.test(html)) ok.push({ parte: 'Sito', titolo: 'Il sito chiede ai motori di ricerca di non comparire (noindex)' });
    else P('noindex', 'media', 'Manca il noindex nella pagina del sito', 'Il sito potrebbe comparire su Google.', 'Chiedere a Claude Code: "rimetti il meta robots noindex in index.html".');
    const esterni = [...html.matchAll(/<script[^>]+src=["'](https?:\/\/[^"']+)["'][^>]*>/gi)].filter(m => !/integrity=/i.test(m[0])).map(m => m[1]);
    if (esterni.length) P('esterni', 'media', `Programmi caricati da altri siti senza controllo: ${esterni.slice(0, 4).join(', ')}`, 'Se quel sito venisse manomesso, il programma cambiato girerebbe nell\'app.', 'Chiedere a Claude Code: "copia questi programmi in vendor/ oppure aggiungi integrity e crossorigin".');
    else ok.push({ parte: 'Sito', titolo: 'Nessun programma caricato da altri siti senza controllo' });
    if (!/http-equiv=["']Content-Security-Policy/i.test(html)) P('csp', 'bassa', 'La pagina non ha una regola CSP (elenco dei siti da cui può caricare)', 'È una protezione in più contro i programmi inseriti di nascosto; GitHub Pages non permette le intestazioni, ma si può mettere nella pagina.', 'Chiedere a Claude Code: "valuta una Content-Security-Policy nel meta di index.html che non blocchi mappa, Supabase e IA del PC".');
  } catch (e) { err['sito'] = msg(e); }
  try {
    const rob = await testo(SITO + 'robots.txt');
    if (/Disallow:\s*\/\s*$/im.test(rob)) ok.push({ parte: 'Sito', titolo: 'robots.txt chiude il sito ai motori di ricerca' });
    else P('robots', 'bassa', 'robots.txt non chiude tutto il sito', 'I motori di ricerca potrebbero leggere le pagine.', 'Chiedere a Claude Code: "metti Disallow: / in robots.txt".');
  } catch (e) { err['robots.txt'] = msg(e); }
  try {
    const r = await scarica(SITO.replace('https:', 'http:'), 15000, { redirect: 'manual' }); await r.body?.cancel();
    if (r.status >= 300 && r.status < 400 && /^https:/.test(r.headers.get('location') || '')) ok.push({ parte: 'Sito', titolo: 'Il sito passa sempre a HTTPS' });
    else P('https', 'media', 'Il sito si apre anche senza HTTPS', 'Su una rete pubblica i dati potrebbero essere letti o cambiati per strada.', 'GitHub → repository → Settings → Pages → attivare "Enforce HTTPS".');
  } catch (e) { err['https'] = msg(e); }
  try {
    const cfg = await testo(SITO + 'js/config.js');
    const chiavi = [...cfg.matchAll(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g)].map(m => ruoloJwt(m[0]));
    if (/sb_secret_/.test(cfg) || chiavi.includes('service_role')) pb.push({ parte: 'Sito', chiave: 'Sito:service_role', gravita: 'alta', titolo: 'Nel sito c\'è la chiave segreta di Supabase (service_role)', dettaglio: 'Con quella chiave chiunque legge e cambia tutti i dati di tutte le aziende.', rimedio: 'Subito: Supabase → Project Settings → API Keys → rigenerare la chiave segreta; poi chiedere a Claude Code di rimettere la chiave anon in js/config.js.', chi: 'Marco con Claude Code' });
    else ok.push({ parte: 'Sito', titolo: `Chiave pubblicata nel sito: ${chiavi.length ? chiavi.join(', ') : 'publishable'} (pubblica per natura)` });
  } catch (e) { err['config.js'] = msg(e); }
}

/* ---------- 4. notizie ---------- */
async function notizie(err: Record<string, string>) {
  const articoli: any[] = [];
  await Promise.all(FONTI_NOTIZIE.map(async f => {
    try {
      const t = await testo(f.url, 15000);
      if (!sembraFeed(t)) throw new Error('non è un feed');
      for (const a of leggiFeed(t).slice(0, 40)) if (!f.solo || f.solo.test(`${a.titolo} ${a.testo}`)) articoli.push({ ...a, fonte: f.nome, testo: String(a.testo || '').slice(0, 900) });
    } catch (e) { err[`notizie ${f.nome}`] = msg(e); }
  }));
  let kev: any[] = [];
  try { kev = sceltaKev(await (await scarica(KEV, 30000)).json()); } catch (e) { err['elenco CISA'] = msg(e); }
  // prima le falle già sfruttate, poi le notizie con più parole nostre
  return [...kev.slice(0, 10), ...sceltaNotizie(articoli, 8, 25 - Math.min(kev.length, 10))];
}

/* ---------- Claude ---------- */
async function chiediClaude(chiave: string, testoUtente: string, ms: number) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal: AbortSignal.timeout(ms),
    headers: { 'x-api-key': chiave, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELLO, max_tokens: 16000, system: [{ type: 'text', text: ISTRUZIONI, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } }, fallbacks: 'default',
      messages: [{ role: 'user', content: testoUtente }] }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(`Claude ${r.status}: ${d?.error?.message || ''}`);
  if (d.stop_reason === 'refusal') throw new Error('Claude non ha voluto rispondere');
  if (d.stop_reason === 'max_tokens') throw new Error('risposta di Claude troppo lunga, interrotta');
  const t = (d.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
  const u = d.usage || {}, p = PREZZI[d.model] || PREZZI[MODELLO];
  const costo = ((u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1) / 1e6 * p[0] + (u.output_tokens || 0) / 1e6 * p[1];
  return { uscita: JSON.parse(t), modello: d.model || MODELLO, costo: Math.round(costo * 1000) / 1000 };
}

/* ---------- un giro ---------- */
// Il controllo riguarda tutto il progetto (codice, database, PC di Marco): lo riceve solo l'azienda scritta nel
// segreto SICUREZZA_FARM. Senza questo limite chiunque si registri e crei un'azienda sua ne sarebbe "titolare",
// leggerebbe i punti deboli e farebbe partire Claude a spese di Marco.
const FARM = (Deno.env.get('SICUREZZA_FARM') || '').trim().toLowerCase();
const MASSIMO = 140000;   // la funzione ha 150 s in tutto

// la raccolta deve essere riservata al titolare prima di scriverci (la funzione scrive con la chiave di servizio)
async function controlloDb() {
  const c = await db('rpc/ces_controllo_sicurezza', { method: 'POST', body: '{}' });
  const sel = (c?.politiche || []).find((p: any) => p.tabella === 'records' && p.nome === 'records_select');
  return { c, riservata: !!sel && String(sel.usa || '').includes("'sicurezza'") };
}
const segni = async (giorno: string) => (await db(`records?farm_id=eq.${FARM}&col=eq.sicurezza&id=in.(attivo,giro,pc,${giorno})&deleted=eq.false&select=id,data`)) as Rec[];
const daPoco = (rr: Rec[]) => { const g = rr.find(x => x.id === 'giro'); return !!g && Date.now() - Date.parse(String(g.data.inizio || 0)) < 15 * 60000; };

async function giro(aMano: boolean, controllo?: { c: any; riservata: boolean }) {
  const t0 = Date.now(), giorno = oggi();
  const { c, riservata } = controllo || await controlloDb();
  if (!riservata) throw new Error('la raccolta sicurezza non è ancora riservata: eseguire supabase/aggiornamento-sicurezza.sql');
  const rr = await segni(giorno), rec = (id: string) => rr.find(x => x.id === id);
  if (!aMano && !(rec('attivo')?.data?.attivo)) return { giorno, esito: 'controllo non attivo' };
  if (aMano ? daPoco(rr) : !!rec(giorno)) return { giorno, esito: aMano ? 'controllato da poco' : 'già fatto oggi' };
  await scrivi([{ farm_id: FARM, col: 'sicurezza', id: 'giro', data: { inizio: new Date().toISOString(), aMano } }]);

  const ok: Ok[] = [], comuni: Problema[] = [], err: Record<string, string> = {};
  const [libs, , , , , nz] = await Promise.all([
    librerie(ok, comuni, err).catch(e => { err['librerie'] = msg(e); return []; }),
    android(ok, comuni, err).catch(e => { err['app Android'] = msg(e); }),
    azioni(ok, comuni, err).catch(e => { err['GitHub Actions'] = msg(e); }),
    database(c, ok, comuni, err).catch(e => { err['database'] = msg(e); }),
    Promise.all([funzioni(ok, comuni, err), sito(ok, comuni, err)]).catch(e => { err['sito'] = msg(e); }),
    notizie(err).catch(e => { err['notizie'] = msg(e); return []; }),
  ]);
  const pcRec = rec('pc');
  const pc = pcRec ? { ...pcRec.data, vecchio: Date.now() - Date.parse(String(pcRec.data.creato || 0)) > 10 * 864e5 } : null;
  // il resoconto di prima: gli id con la data vengono prima delle parole (attivo, giro, pc) nell'ordine
  const prec = ((await db(`records?farm_id=eq.${FARM}&col=eq.sicurezza&id=lt.${giorno}&deleted=eq.false&select=id,data&order=id.desc&limit=1`)) as Rec[])[0];
  const ordine: Record<string, number> = { alta: 0, media: 1, bassa: 2 };
  const problemi = [...comuni, ...problemiPc(pc)].sort((a, b) => ordine[a.gravita] - ordine[b.gravita]);
  const pagina: Record<string, unknown> = {
    giorno, creato: new Date().toISOString(), aMano, librerie: libs, ok, problemi, errori: err,
    pc: pc ? { creato: pc.creato, vecchio: pc.vecchio, computer: pc.computer || null, ok: (pc.ok || []).slice(0, 40) } : null, motore: 'automatico',
  };
  Object.assign(pagina, resocontoAutomatico(problemi, nz));
  const salva = () => scrivi([{ farm_id: FARM, col: 'sicurezza', id: giorno, data: pagina }]);
  // prima il resoconto automatico: se Claude è lento o la funzione si ferma, almeno quello resta
  await salva();
  const chiave = Deno.env.get('ANTHROPIC_API_KEY');
  const resta = MASSIMO - (Date.now() - t0) - 5000;
  if (chiave && resta > 20000) {
    try {
      const p = prec ? { giorno: prec.id, stato: prec.data.stato, titoli: (prec.data.falle || []).map((f: any) => f.titolo).slice(0, 15) } : null;
      const cl = await chiediClaude(chiave, messaggioUtente({ giorno, problemi, ok, notizie: nz, pc, prima: p }), resta);
      Object.assign(pagina, componi(cl.uscita, problemi, nz), { motore: 'claude', modello: cl.modello, costo: cl.costo });
    } catch (e) { pagina.erroreIA = msg(e); }
    await salva();
  } else if (chiave) { pagina.erroreIA = 'non c\'era più tempo per chiamare Claude'; await salva(); }
  return { giorno, problemi: problemi.length, motore: pagina.motore, errore: pagina.erroreIA || null, errori: err, secondi: Math.round((Date.now() - t0) / 1000) };
}

// la parte del PC: la usa il giro successivo
async function salvaPc(dati: any) {
  if (!dati || typeof dati !== 'object' || !Array.isArray(dati.problemi)) throw new Error('dati del PC non validi');
  const pulito = { creato: new Date().toISOString(), computer: String(dati.computer || '').slice(0, 60), versione: String(dati.versione || '').slice(0, 20),
    problemi: dati.problemi.slice(0, 60), ok: (Array.isArray(dati.ok) ? dati.ok : []).slice(0, 60).map((o: any) => ({ parte: 'PC', titolo: String(o?.titolo || o).slice(0, 200) })) };
  if (JSON.stringify(pulito).length > 150000) throw new Error('dati del PC troppo grandi');
  const { riservata } = await controlloDb();
  if (!riservata) throw new Error('eseguire prima supabase/aggiornamento-sicurezza.sql');
  await scrivi([{ farm_id: FARM, col: 'sicurezza', id: 'pc', data: pulito }]);
  return 1;
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function dopo(p: Promise<unknown>) {
  const q = p.then(r => console.log('sicurezza', JSON.stringify(r)), e => console.error('sicurezza', msg(e)));
  if (typeof EdgeRuntime !== 'undefined' && EdgeRuntime) EdgeRuntime.waitUntil(q);
}

const SQL = 'Esegui prima supabase/aggiornamento-sicurezza.sql nello SQL Editor di Supabase';
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ errore: 'Metodo non ammesso' }, 405);
  let corpo: { farm?: string; pc?: unknown } = {};
  try { corpo = await req.json(); } catch (_) { /* corpo vuoto */ }
  const segreto = Deno.env.get('SICUREZZA_SEGRETO');
  try {
    if (segreto && segreto.length >= 20 && req.headers.get('x-sicurezza-segreto') === segreto) {
      if (!/^[0-9a-f-]{36}$/.test(FARM)) return json({ errore: 'Manca il segreto SICUREZZA_FARM (codice dell\'azienda)' }, 503);
      // il PC manda la sua parte; pg_cron fa il giro del lunedì
      if (corpo.pc) return json({ salvato: await salvaPc(corpo.pc) });
      dopo(giro(false)); return json({ avviato: true }, 202);
    }
    // "Controlla adesso" dall'app: solo il titolare dell'azienda del progetto
    const auth = req.headers.get('authorization') || '';
    const farm = String(corpo.farm || '').toLowerCase();
    if (!/^Bearer .{20,}/.test(auth) || !/^[0-9a-f-]{36}$/.test(farm)) return json({ errore: 'Accedi all\'azienda come titolare' }, 401);
    const r = await fetch(`${URL_SB}/rest/v1/rpc/is_owner`, { method: 'POST', headers: { apikey: ANON, authorization: auth, 'content-type': 'application/json' }, body: JSON.stringify({ f: farm }) });
    if (!r.ok || (await r.json()) !== true) return json({ errore: 'Solo il titolare può fare il controllo della sicurezza' }, 403);
    if (!/^[0-9a-f-]{36}$/.test(FARM)) return json({ errore: 'Manca il segreto SICUREZZA_FARM in Supabase: mettici il codice dell\'azienda scritto in questa pagina' }, 503);
    if (farm !== FARM) return json({ errore: 'Il controllo della sicurezza è solo per l\'azienda di chi gestisce il progetto' }, 403);
    // controlli veloci prima di rispondere, così l'app può dire cosa manca
    let controllo;
    try { controllo = await controlloDb(); } catch (_) { return json({ errore: SQL }, 409); }
    if (!controllo.riservata) return json({ errore: SQL }, 409);
    if (daPoco(await segni(oggi()))) return json({ errore: 'Controllato da poco: riprova fra qualche minuto' }, 429);
    dopo(giro(true, controllo));
    return json({ avviato: true }, 202);
  } catch (e) {
    return json({ errore: msg(e) }, 500);
  }
});

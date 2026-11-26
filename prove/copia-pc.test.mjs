// Prove della copia di sicurezza sul PC (1.80.0) con dati INVENTATI: allegati nominati dalle registrazioni, conti del
// ripristino (js/copia-conta.js), invio al ponte con un ponte finto (js/copia-pc.js) e la parte del ponte in Python
// (strumenti/archivio/copie.py --prova: rotazione 8 settimane + 12 mesi, salvataggio, allegati, rifiuti).
// I risultati attesi sono fatti a mano (nei commenti). Uso: npm test (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const ROOT = new URL('../js', import.meta.url).href;
const { S, COLS } = await import(ROOT + '/state.js');
const K = await import(ROOT + '/copia-conta.js');

const finti = {
  campi: [{ id: 'c1', nome: 'Campo di prova', allegati: [{ id: 'a1', tipo: 'image/jpeg' }] }, { id: 'c2', nome: 'Altro campo' }],
  note: [{ id: 'n1', testo: 'x', allegati: [{ id: 'a1' }, { id: 'a2', tipo: 'application/pdf' }, { id: '../male' }, 'testo'] }, { testo: 'senza id' }],
  econfig: [{ id: 'do-ab12', impronta: 'ab12', copia: true, mime: 'application/pdf' }, { id: 'do-cd34', impronta: 'cd34', copia: false }, { id: 'altro', copia: true, impronta: 'zz' }],
  errori: [{ id: 'e1' }, { id: 'e2' }],
};

/* ---------------------------------------------------------------- */
sezione('1. Allegati nominati');
const al = K.allegatiDi(finti);
// a1 (campo e nota: una volta sola, tipo del primo), a2, conti/ab12 (originale con copia); non '../male', non cd34 (copia false), non 'altro' (non do-)
t('tre allegati', JSON.stringify(Object.keys(al).sort()) === '["a1","a2","conti/ab12"]', al);
t('tipo del primo', al.a1 === 'image/jpeg' && al['conti/ab12'] === 'application/pdf');
t('niente dati = niente allegati', Object.keys(K.allegatiDi(null)).length === 0 && Object.keys(K.allegatiDi({ campi: 'x' })).length === 0);

sezione('2. Conti del ripristino');
const att = K.attesi(finti, COLS);
// campi 2, note 1 (quella senza id non si rimette), econfig 3, errori fuori (il ripristino li salta), le altre 0
t('attesi', att.campi === 2 && att.note === 1 && att.econfig === 3 && !('errori' in att) && att.fatture === 0, att);
t('tutte le raccolte meno errori', Object.keys(att).length === COLS.length - 1);
const ok = K.confronta(att, { campi: 2, note: 1, econfig: 3 });
t('tutto torna', ok.ok && ok.attese === 6 && ok.trovate === 6 && ok.diverse.length === 0, ok);
const ko = K.confronta(att, { campi: 2, note: 0, econfig: 4 });
// note 1→0 e econfig 3→4: due raccolte diverse anche se il totale (6) è uguale... 2+0+4 = 6
t('diverse anche col totale uguale', !ko.ok && ko.trovate === 6 && JSON.stringify(ko.diverse) === '["note","econfig"]', ko);

sezione('3. Quando rifarla');
t('mai fatta', K.dovuta(null, '2026-11-25', 7));
t('6 giorni: no', !K.dovuta('2026-11-19', '2026-11-25', 7));
t('7 giorni: sì', K.dovuta('2026-11-18', '2026-11-25', 7));
t('con l\'ora', !K.dovuta('2026-11-24T23:50:00Z', '2026-11-25', 7));
t('30 giorni per la prova', K.dovuta('2026-10-26', '2026-11-25', 30) && !K.dovuta('2026-10-27', '2026-11-25', 30));

/* ---------------------------------------------------------------- */
sezione('4. Invio al ponte (ponte finto)');
{
  const chiamate = [];
  let mancanti = [{ id: 'a1', tipo: 'image/jpeg' }, { id: 'a2', tipo: 'application/pdf' }], versione = 5;
  globalThis.caches = { open: async () => ({ match: async k => (k.endsWith('/a1') ? new Response(new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' })) : null), put: async () => {} }) };
  globalThis.location = { href: 'http://127.0.0.1:8765/' };
  globalThis.window = globalThis.window || { addEventListener: () => {} };
  globalThis.fetch = async (url, o = {}) => {
    const p = new URL(url).pathname, corpo = o.body ? JSON.parse(o.body) : null; chiamate.push({ p, corpo });
    const r = d => new Response(JSON.stringify(d), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (p === '/stato') return r({ versione });
    if (p === '/copia') return r({ file: 'copia-2026-11-25.json.gz', registrazioni: 9, mancanti, tolte: [] });
    if (p === '/copia/allegato') return r({ id: corpo.id, byte: 3, gia: false });
    if (p === '/copia/prova') return r({ avviata: true, in_corso: true });
    return new Response('{"errore":"richiesta sconosciuta"}', { status: 404 });
  };
  S.campi = finti.campi; S.note = finti.note; S.econfig = [...finti.econfig];
  const CP = await import(ROOT + '/copia-pc.js');
  const c = await CP.copiaSulPC();
  const copia = chiamate.find(x => x.p === '/copia');
  t('manda tutte le raccolte', copia && copia.corpo.dati.campi.length === 2 && Array.isArray(copia.corpo.dati.fatture) && copia.corpo.versione, copia && Object.keys(copia.corpo));
  // a1 si trova nella memoria dei file e va al ponte (base64 di 1,2,3 = "AQID"); a2 non c'è e non c'è il cloud: mancato
  const inv = chiamate.filter(x => x.p === '/copia/allegato');
  t('allegato mandato', inv.length === 1 && inv[0].corpo.id === 'a1' && inv[0].corpo.dati === 'AQID' && inv[0].corpo.tipo === 'image/jpeg', inv);
  t('esito', c.registrazioni === 9 && c.allegati === 3 && c.inviati === 1 && c.mancati === 1, c);
  const st = CP.stato();
  t('stato salvato in econfig', st && st.giorno === '2026-11-25' && st.registrazioni === 9 && st.mancati === 1 && st.file === 'copia-2026-11-25.json.gz', st);
  // prima copia: nessuna prova di ripristino fatta → si chiede
  t('prova di ripristino chiesta', chiamate.some(x => x.p === '/copia/prova') && !!st.provaChiesta);
  // seconda copia lo stesso giorno: la prova è già chiesta → non si richiede
  chiamate.length = 0; mancanti = [];
  await CP.copiaSulPC();
  t('prova non richiesta due volte', !chiamate.some(x => x.p === '/copia/prova') && !chiamate.some(x => x.p === '/copia/allegato'));
  // ponte vecchio (versione 4): niente copia, messaggio chiaro
  versione = 4; chiamate.length = 0;
  let err = ''; try { await CP.copiaSulPC(); } catch (e) { err = e.message; }
  t('ponte vecchio', /versione vecchia/.test(err) && !chiamate.some(x => x.p === '/copia'), err);
  // allegato che non arriva (rete che cade solo su quello) con il ponte vivo: si conta fra i mancati e la copia resta fatta
  versione = 5; mancanti = [{ id: 'a1', tipo: 'image/jpeg' }];
  const vero = globalThis.fetch;
  globalThis.fetch = async (url, o) => { if (new URL(url).pathname === '/copia/allegato') throw new TypeError('Failed to fetch'); return vero(url, o); };
  S.econfig = S.econfig.filter(x => x.id !== 'copia-pc');
  const c2 = await CP.copiaSulPC();
  t('allegato perso non ferma la copia', c2.mancati === 1 && c2.inviati === 0 && CP.stato().giorno === '2026-11-25' && CP.stato().mancati === 1, c2);
  globalThis.fetch = vero;
  // ponte che si spegne a metà degli allegati: l'errore esce e la copia resta da rifare (giorno vuoto)
  mancanti = [{ id: 'a1', tipo: 'image/jpeg' }];
  globalThis.fetch = async (url, o) => { const p = new URL(url).pathname; if (p === '/copia/allegato' || (p === '/stato' && chiamate.some(x => x.p === '/copia'))) throw new TypeError('Failed to fetch'); return vero(url, o); };
  chiamate.length = 0; err = '';
  try { await CP.copiaSulPC(); } catch (e) { err = e.message; }
  t('ponte spento a metà', /ponte/i.test(err) && CP.stato().giorno === null, err);
  // la prova di ripristino non parte (Node mancante sul PC): il motivo resta nello stato
  globalThis.fetch = async (url, o) => { if (new URL(url).pathname === '/copia/prova') return new Response('{"errore":"Node non è installato sul PC"}', { status: 503 }); return vero(url, o); };
  mancanti = []; S.econfig = S.econfig.filter(x => x.id !== 'copia-pc');
  await CP.copiaSulPC();
  t('motivo della prova non partita', /Node/.test(CP.stato().provaErrore || '') && !CP.stato().provaChiesta, CP.stato());
  globalThis.fetch = vero;
  // sincronizzazione non finita: niente copia (anche dal pulsante)
  const { sync } = await import(ROOT + '/store.js');
  sync.mode = 'cloud'; sync.farm = { id: 'f' }; sync.status = 'sincronizzo'; chiamate.length = 0; err = '';
  try { await CP.copiaSulPC(); } catch (e) { err = e.message; }
  t('aspetta la sincronizzazione', /sincronizzazione/.test(err) && !chiamate.length, err);
  sync.mode = 'local'; sync.farm = null; sync.status = undefined;
}

/* ---------------------------------------------------------------- */
sezione('5. Parte del ponte (Python)');
{
  const script = fileURLToPath(new URL('../strumenti/archivio/copie.py', import.meta.url));
  let r = null;
  for (const py of process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python']) { r = spawnSync(py, [script, '--prova'], { encoding: 'utf8' }); if (!r.error) break; }
  if (r.error) console.log('  (Python non c\'è: prove del ponte saltate)');
  else t('copie.py --prova', r.status === 0, (r.stdout || '') + (r.stderr || ''));
}

fine('Copia di sicurezza sul PC');

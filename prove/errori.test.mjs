// Prove del registro degli errori dell'app (js/errori.js, 1.77.0) con dati INVENTATI: pulizia dei dati sensibili dal testo,
// pezzo corto della pila, stesso errore = una riga con il conteggio, limite delle righe, pulizia delle vecchie, gruppi della pagina.
// I risultati attesi sono fatti a mano (scritti nei commenti), non copiati da quello che il codice restituisce.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/errori.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S, UI } = await import(ROOT + '/state.js');
const { VERSION } = await import(ROOT + '/version.js');
const E = await import(ROOT + '/errori.js');
const ORA = Date.parse('2026-11-25T12:00:00Z');   // orologio fermo di avvio.mjs
const iso = ms => new Date(ms).toISOString();
const GIORNO = 864e5;

/* ---------------------------------------------------------------- */
sezione('1. Testo ripulito dai dati');
const P = E.pulisci;
// un errore del codice resta com'è: il nome fra virgolette ('importo') è del programma, non un dato
t('errore del codice intatto', P("Cannot read properties of undefined (reading 'importo')") === "Cannot read properties of undefined (reading 'importo')", P("Cannot read properties of undefined (reading 'importo')"));
// 1.234,56 e 1234 → # (numeri con separatori o da 3 cifre in su)
t('importi → #', P('Importo di 1.234,56 € diverso da 1234') === 'Importo di # € diverso da #', P('Importo di 1.234,56 € diverso da 1234'));
t('numeri piccoli restano', P('riga 12 di 3') === 'riga 12 di 3', P('riga 12 di 3'));
// nomi in maiuscolo (come nelle fatture) → [nome], due di fila diventano uno
t('nome in maiuscolo → [nome]', P('Fattura di ROSSI MARIO già caricata') === 'Fattura di [nome] già caricata', P('Fattura di ROSSI MARIO già caricata'));
// nome con la maiuscola in mezzo alla frase → [nome]; la prima parola della frase e la sigla IBAN restano
t('nome in mezzo alla frase → [nome]', P("Il dipendente Mario Rossi non ha l'IBAN") === "Il dipendente [nome] non ha l'IBAN", P("Il dipendente Mario Rossi non ha l'IBAN"));
t('codice fiscale e IBAN → [codice]', P('Il codice RSSMRA80A01H501U e IBAN IT60X0542811101000000123456') === 'Il codice [codice] e IBAN [codice]', P('Il codice RSSMRA80A01H501U e IBAN IT60X0542811101000000123456'));
t('email → [email]', P('Scrivi a mario.rossi@example.com per sapere') === 'Scrivi a [email] per sapere', P('Scrivi a mario.rossi@example.com per sapere'));
// dell'indirizzo resta solo il sito, senza percorso né domanda (che può contenere dati)
t('indirizzo → solo il sito', P('Errore da https://esempio.supabase.co/rest/v1/records?select=*&nome=ROSSI') === 'Errore da [esempio.supabase.co]', P('Errore da https://esempio.supabase.co/rest/v1/records?select=*&nome=ROSSI'));
// riga di dati fra virgolette doppie → "…"; la lettera 'R' e la sigla JSON restano
t('riga di dati fra virgolette → "…"', P('Unexpected token \'R\', "ROSSI MARIO;1.234,56" is not valid JSON') === 'Unexpected token \'R\', "…" is not valid JSON', P('Unexpected token \'R\', "ROSSI MARIO;1.234,56" is not valid JSON'));
t('testo fra virgolette semplici → \'…\'', P("Campo 'Prato grande' non trovato") === "Campo '…' non trovato", P("Campo 'Prato grande' non trovato"));
t('apostrofi italiani intatti', P("Non riesco a leggere l'archivio dell'azienda") === "Non riesco a leggere l'archivio dell'azienda", P("Non riesco a leggere l'archivio dell'azienda"));
t('nomi del browser intatti', P("Failed to execute 'put' on 'IDBObjectStore': The database connection is closing.") === "Failed to execute 'put' on 'IDBObjectStore': The database connection is closing.", P("Failed to execute 'put' on 'IDBObjectStore': The database connection is closing."));
// dopo un segnaposto non comincia una frase: "Bianchi" va tolto anche lì
t('nome dopo un segnaposto', P('Ho pagato ROSSI e poi Bianchi') === 'Ho pagato [nome] e poi [nome]', P('Ho pagato ROSSI e poi Bianchi'));
// casi trovati dal revisore il 25/11: dopo ":" ";" "(" il nome va tolto; la parola prima di ":" è un'etichetta e resta
t('nome dopo i due punti', P('Dipendente: Rossi') === 'Dipendente: [nome]', P('Dipendente: Rossi'));
t('nome dopo il punto e virgola', P('Fornitore; Bianchi') === 'Fornitore; [nome]', P('Fornitore; Bianchi'));
t('nome fra parentesi', P('Nota (Verdi Luigi)') === 'Nota ([nome])', P('Nota (Verdi Luigi)'));
// "Mario" è la prima parola ma dopo viene un'altra parola con la maiuscola: è un nome
t('nome all\'inizio della frase', P('Mario Rossi ha chiesto') === '[nome] ha chiesto', P('Mario Rossi ha chiesto'));
// trovato nel collaudo del 25/11: "Rossi" seguito da virgola e parola minuscola passava. Ora: "Dipendente" dopo i primi
// due punti è seguito da ":" (non da una parola minuscola) → [nome] anche lui (meglio un'etichetta in meno che un nome in più)
t('nome in un elenco dopo i due punti', P('Prova: Dipendente: Rossi, scadenza') === 'Prova: [nome]: [nome], scadenza', P('Prova: Dipendente: Rossi, scadenza'));
t('nome all\'inizio seguito da virgola', P('Rossi, la fattura non torna') === '[nome], la fattura non torna', P('Rossi, la fattura non torna'));
t('dopo i due punti una frase vera resta', P('Errore: Impossibile leggere') === 'Errore: Impossibile leggere', P('Errore: Impossibile leggere'));
t('nome del file → [file]', P('Non trovo fattura-Rossi-2026.pdf') === 'Non trovo [file]', P('Non trovo fattura-Rossi-2026.pdf'));
// il percorso arriva fino allo spazio; "rossi" in minuscolo resta (limite noto), "mario.pdf" è un file
t('percorso di Windows → [percorso]', P('Errore in C:\\Users\\esempio\\Documenti\\fattura rossi mario.pdf') === 'Errore in [percorso] rossi [file]', P('Errore in C:\\Users\\esempio\\Documenti\\fattura rossi mario.pdf'));
t('date → [data]', P('Scadenza del 12/03/2026 e del 2026-11-25') === 'Scadenza del [data] e del [data]', P('Scadenza del 12/03/2026 e del 2026-11-25'));
// 45 e 5 hanno meno di 3 cifre ma stanno accanto all'euro
t('numeri piccoli accanto all\'euro → #', P('Ne mancano 45 € e € 5 sul conto') === 'Ne mancano # € e € # sul conto', P('Ne mancano 45 € e € 5 sul conto'));
t('indirizzo con utente e parola chiave → solo il sito', P('Errore da https://utente:segreto@esempio.it/x') === 'Errore da [esempio.it]', P('Errore da https://utente:segreto@esempio.it/x'));
// seconda revisione del 25/11: dopo i due punti resta solo una parola di INIZI; ditte prima di srl/spa; nome all'inizio
// seguito da un numero o da niente; costanti di rete con il trattino basso intatte (servono a ignora)
t('nome dopo i due punti seguito da parola minuscola', P('Dipendente: Rossi senza cedolino') === 'Dipendente: [nome] senza cedolino', P('Dipendente: Rossi senza cedolino'));
t('ditta prima di srl', P('Rossi srl non trovato') === '[nome] srl non trovato' && P('(Rossi srl)') === '([nome] srl)', [P('Rossi srl non trovato'), P('(Rossi srl)')]);
t("nome all'inizio seguito da un importo", P('Bianchi 1.250,00') === '[nome] #', P('Bianchi 1.250,00'));
t('nome dopo un punto, in fondo', P('Fattura di Sig. Rossi') === 'Fattura di [nome]. [nome]', P('Fattura di Sig. Rossi'));
t('costante di rete intatta e ignorata', P('net::ERR_INTERNET_DISCONNECTED') === 'net::ERR_INTERNET_DISCONNECTED' && E.ignora(E.voce({ message: 'net::ERR_INTERNET_DISCONNECTED' })), P('net::ERR_INTERNET_DISCONNECTED'));
t('nome del codice non è un file', P('r.json is not a function') === 'r.json is not a function' && P('res.json is not a function') === 'res.json is not a function', P('res.json is not a function'));
t('utente:parola@sito → [email]', P('Scrivi a utente:parola@sito.it') === 'Scrivi a [email]', P('Scrivi a utente:parola@sito.it'));
{ const lungo = P('Errore ' + 'molto '.repeat(60)); t('al massimo 160 caratteri', lungo.length === 160 && lungo.endsWith('…'), lungo.length); }
t('vuoto e null', P('') === '' && P(null) === '');

/* ---------------------------------------------------------------- */
sezione('2. Pezzo corto della pila');
const chrome = "TypeError: Cannot read properties of undefined (reading 'importo')\n    at riga (https://esempio.github.io/CAMPO-E-STALLA/js/views/conti-fatture.js?v=2:120:15)\n    at Array.map (<anonymous>)\n    at render (https://esempio.github.io/CAMPO-E-STALLA/js/views/conti.js:88:9)\n    at https://esempio.github.io/CAMPO-E-STALLA/js/app.js:201:30";
// la riga del messaggio e "Array.map (<anonymous>)" non sono del codice; la domanda ?v=2 e il sito spariscono
t('pila di Chrome', JSON.stringify(E.pila(chrome)) === JSON.stringify(['riga js/views/conti-fatture.js:120', 'render js/views/conti.js:88', 'js/app.js:201']), E.pila(chrome));
const firefox = 'riga@https://esempio.github.io/CAMPO-E-STALLA/js/views/conti-fatture.js:120:15\nasync*render@https://esempio.github.io/CAMPO-E-STALLA/js/views/conti.js:88:9\n';
t('pila di Firefox (async* tolto)', JSON.stringify(E.pila(firefox)) === JSON.stringify(['riga js/views/conti-fatture.js:120', 'render js/views/conti.js:88']), E.pila(firefox));
{ const sei = [1, 2, 3, 4, 5, 6].map(i => `    at f${i} (https://x.it/js/a${i}.js:${i}:1)`).join('\n'); const p = E.pila(sei); t('al massimo 4 righe', p.length === 4 && p[0] === 'f1 js/a1.js:1' && p[3] === 'f4 js/a4.js:4', p); }
t('estensione del browser → lasciato perdere', E.voce({ message: 'x', stack: '    at f (chrome-extension://abc/content.js:1:1)' }) === null);

/* ---------------------------------------------------------------- */
sezione('3. Firma: lo stesso errore');
const st = n => `    at f (https://x.it/js/conti/dati.js:${n}:5)`;
const v1 = E.voce({ name: 'Error', message: 'Il totale 1.234,56 non torna', stack: st(10) });
const v2 = E.voce({ name: 'Error', message: 'Il totale 99,10 non torna', stack: st(10) });
const v3 = E.voce({ name: 'Error', message: 'Il totale 99,10 non torna', stack: st(11) });
const v4 = E.voce({ name: 'Error', message: 'Il totale 5 non torna', stack: '    at g (https://x.it/js/conti/dati.js:10:5)' });
t('importi diversi, stesso punto → stessa firma', v1.firma === v2.firma && v1.msg === 'Il totale # non torna', [v1, v2]);
t('riga diversa → firma diversa', v1.firma !== v3.firma);
// "Totale 5 non torna" ha il 5 (una cifra) e quindi un testo diverso: firma diversa anche se il punto è lo stesso
t('testo diverso → firma diversa', v1.firma !== v4.firma);
t('stesso testo, nome della funzione diverso → stessa firma', E.firma('', 'm', ['f js/a.js:3']) === E.firma('', 'm', ['g js/a.js:3']));
t('nome "Error" non si scrive, TypeError sì', v1.nome === '' && E.voce(new TypeError('x')).nome === 'TypeError');
t('file non caricato: solo il percorso', E.voce({}, 'file', { file: 'https://x.it/CAMPO-E-STALLA/js/views/conti.js?v=3' }).msg === 'File non caricato: js/views/conti.js');
t('file di un altro sito: senza nome', E.voce({}, 'file', { file: 'https://altro.it/ROSSI-script.js' }).msg === 'File non caricato: file di un altro sito');

/* ---------------------------------------------------------------- */
sezione('4. Cosa non si registra');
t('ResizeObserver', E.ignora(E.voce({ message: 'ResizeObserver loop completed with undelivered notifications.' })));
t('Script error di un altro sito', E.ignora(E.voce({ message: 'Script error.' })));
// rete che manca o va a singhiozzo (anche con navigator.onLine vero) e ponte del PC spento non sono guasti dell'app
t('Failed to fetch no, anche con la rete', E.ignora(E.voce(new TypeError('Failed to fetch')), { offline: true }) && E.ignora(E.voce(new TypeError('Failed to fetch')), { offline: false }));
t('funzione di Supabase che non risponde: no', E.ignora(E.voce({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' })));
t('file non caricato senza rete: no; con la rete sì', E.ignora(E.voce({}, 'file', { file: 'https://x.it/js/a.js' }), { offline: true }) && !E.ignora(E.voce({}, 'file', { file: 'https://x.it/js/a.js' }), { offline: false }));
t('un errore vero sì', !E.ignora(E.voce(new TypeError("Cannot read properties of undefined (reading 'x')"))));
t('operazione annullata', E.ignora(E.voce({ name: 'AbortError', message: 'The user aborted a request.' })));
t('guasto vero di un pulsante', E.sembraGuasto(new TypeError('x')) && E.sembraGuasto({ name: 'QuotaExceededError' }));
t('avviso scritto per l\'utente: no', !E.sembraGuasto(new Error("Sei in sola lettura")) && !E.sembraGuasto({ message: 'x' }) && !E.sembraGuasto(null));
t('password sbagliata: no', !E.sembraGuasto({ name: 'AuthApiError', message: 'Invalid login credentials' }));
t('PDF rovinato o con password, file non leggibile: no', !E.sembraGuasto({ name: 'InvalidPDFException' }) && !E.sembraGuasto({ name: 'PasswordException' }) && !E.sembraGuasto({ name: 'NotReadableError' }));

/* ---------------------------------------------------------------- */
sezione('5. Dispositivo');
const D = E.dispositivo;
const andr = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';
t('telefono Android', JSON.stringify(D(andr)) === JSON.stringify({ tipo: 'telefono', sistema: 'Android', browser: 'Chrome', app: 'sito' }) && E.etichettaDisp(D(andr)) === 'Telefono Android · Chrome', D(andr));
t('iPhone', JSON.stringify(D('Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1')) === JSON.stringify({ tipo: 'telefono', sistema: 'iOS', browser: 'Safari', app: 'sito' }));
const edge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';
t('computer Windows con Edge', E.etichettaDisp(D(edge)) === 'Computer Windows · Edge', E.etichettaDisp(D(edge)));
t('tablet Android (senza Mobile)', D('Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36').tipo === 'tablet');
t('app Android', E.etichettaDisp(D(andr, { nativa: true })) === 'Telefono Android · app Android');

/* ---------------------------------------------------------------- */
sezione('6. Conteggio dei doppioni (unisci)');
{
  const a = { firma: 'f', volte: 3, prima: '2026-11-20T10:00:00.000Z', ultima: '2026-11-22T10:00:00.000Z', pagine: ['campagna/oggi'], versione: '1.76.0' };
  const b = { firma: 'f', volte: 2, prima: '2026-11-24T09:00:00.000Z', ultima: '2026-11-25T11:00:00.000Z', pagine: ['conti/conti/fatture', 'campagna/oggi'], versione: '1.77.0' };
  const r = E.unisci(a, b);
  // 3 + 2 = 5; prima = la più vecchia (20/11), ultima = la più nuova (25/11 11:00); pagine: prima le nuove, senza doppioni
  t('volte sommate', r.volte === 5, r.volte);
  t('prima e ultima volta', r.prima === '2026-11-20T10:00:00.000Z' && r.ultima === '2026-11-25T11:00:00.000Z', r);
  t('pagine senza doppioni', JSON.stringify(r.pagine) === JSON.stringify(['conti/conti/fatture', 'campagna/oggi']), r.pagine);
  t('versione della più nuova', r.versione === '1.77.0');
  // visto del titolare il 23/11 (config errori-visti): a (ultima 22/11) non è nuovo, r (ultima 25/11) sì; senza visto è nuovo
  const v = { f: '2026-11-23T00:00:00.000Z' };
  t('tornato dopo il visto → nuovo', E.nuovo(r, v) && !E.nuovo(a, v) && E.nuovo(a, {}));
  t('volte scritte come testo', E.unisci({ volte: '3' }, { volte: 1 }).volte === 4);
  // un errore di prima dell'avvio (versione '') non cancella la versione già salvata
  t('versione non nota non cancella quella salvata', E.unisci({ versione: '1.77.0' }, { versione: '' }).versione === '1.77.0' && E.unisci({ versione: '1.76.0' }, { versione: '1.77.0' }).versione === '1.77.0');
  t('al massimo 3 pagine', JSON.stringify(E.unisci({ pagine: ['x', 'y'] }, { pagine: ['z', 'w'] }).pagine) === JSON.stringify(['z', 'w', 'x']));
  t('senza il salvato è una copia', E.unisci(null, b).volte === 2 && E.unisci(null, b) !== b);
}

/* ---------------------------------------------------------------- */
sezione('7. Limite delle righe e pulizia delle vecchie (daTogliere)');
{
  const pad = i => String(i).padStart(3, '0');
  const recenti = n => Array.from({ length: n }, (_, i) => ({ id: 'r' + pad(i), ultima: iso(ORA - i * 3600e3) }));   // r000 adesso, r001 un'ora fa…
  const vecchi = [{ id: 'v1', ultima: iso(ORA - 91 * GIORNO) }, { id: 'v2', ultima: iso(ORA - 100 * GIORNO) }, { id: 'v3', ultima: iso(ORA - 120 * GIORNO) }];
  // 210 recenti + 3 oltre i 90 giorni: via i 3 vecchi e le 10 recenti più vecchie (r200…r209) = 13
  const via = E.daTogliere([...recenti(210), ...vecchi], ORA);
  const atteso = ['v1', 'v2', 'v3', ...Array.from({ length: 10 }, (_, i) => 'r' + pad(200 + i))];
  t('210 + 3 vecchi → 13 da togliere', via.length === 13 && atteso.every(x => via.includes(x)), via);
  t('esattamente 200 → niente', E.daTogliere(recenti(200), ORA).length === 0);
  // 89 giorni resta, 91 va via, senza data va via; 90 giorni esatti resta (non è "più di 90")
  const b = E.daTogliere([{ id: 'a', ultima: iso(ORA - 89 * GIORNO) }, { id: 'b', ultima: iso(ORA - 91 * GIORNO) }, { id: 'c' }, { id: 'd', ultima: iso(ORA - 90 * GIORNO) }], ORA);
  t('confine dei 90 giorni', JSON.stringify(b) === JSON.stringify(['b', 'c']), b);
}

/* ---------------------------------------------------------------- */
sezione('8. Gruppi della pagina (stesso errore su più dispositivi)');
{
  const tel = E.dispositivo(andr), pc = E.dispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  const g = E.gruppi([
    { id: 'er-aaaa-d1', firma: 'aaaa', msg: 'M', volte: 3, prima: '2026-11-20T10:00:00.000Z', ultima: '2026-11-24T10:00:00.000Z', pagine: ['campagna/oggi'], versione: '1.76.0', disp: tel, ruolo: 'membro' },
    { id: 'er-aaaa-d2', firma: 'aaaa', msg: 'M', volte: 2, prima: '2026-11-21T10:00:00.000Z', ultima: '2026-11-25T10:00:00.000Z', pagine: ['conti/conti/fatture'], versione: '1.77.0', disp: pc, ruolo: 'titolare' },
    { id: 'er-bbbb-d1', firma: 'bbbb', msg: 'N', volte: 1, prima: '2026-11-25T11:00:00.000Z', ultima: '2026-11-25T11:00:00.000Z', pagine: [], versione: '1.77.0', disp: pc, ruolo: 'titolare' },
  ], { aaaa: '2026-11-24T12:00:00.000Z', bbbb: '2026-11-25T11:30:00.000Z' });
  // aaaa: 3 + 2 = 5 volte, visto il 24/11 alle 12 ma successo di nuovo il 25/11 alle 10 sul PC → nuovo, e viene prima di bbbb
  // anche se bbbb è più recente; bbbb visto alle 11:30, dopo la sua ultima volta (11:00) → non nuovo
  t('due gruppi, il nuovo prima', g.length === 2 && g[0].firma === 'aaaa' && g[0].nuovo && !g[1].nuovo, g.map(x => x.firma));
  t('volte e date del gruppo', g[0].volte === 5 && g[0].prima === '2026-11-20T10:00:00.000Z' && g[0].ultima === '2026-11-25T10:00:00.000Z');
  t('versioni e dispositivi', JSON.stringify(g[0].versioni) === JSON.stringify(['1.76.0', '1.77.0']) && JSON.stringify(g[0].disp) === JSON.stringify(['Telefono Android · Chrome (collaboratore)', 'Computer Windows · Chrome']) && g[0].ids.length === 2, g[0]);
  // record rovinati (da un'altra versione o da un dispositivo modificato): la pagina non si deve bloccare
  let rotti = null;
  try { rotti = E.gruppi([{ id: 'x1', firma: 'zz', pila: 'non una lista', pagine: { a: 1 }, ultima: 5, volte: '3', disp: 'telefono', versione: 7 }, { id: 'x2', firma: 42 }, null, { id: 'x3' }], {}); } catch (e) { rotti = e; }
  t('record rovinati: niente blocco', Array.isArray(rotti) && rotti.length === 1 && rotti[0].volte === 3 && rotti[0].pila.length === 0 && rotti[0].pagine.length === 0 && rotti[0].ultima === '' && rotti[0].versioni.length === 0, rotti);
}

/* ---------------------------------------------------------------- */
sezione('9. Registra e scrivi (archivio finto)');
{
  const finto = await import(new URL('./finti/store.mjs', import.meta.url).href);
  UI.loaded = true; S.errori = []; E._azzera();
  const guasto = m => new TypeError(m);   // stesso punto del codice per tutti: stessa firma se il testo ripulito è uguale
  const T = h => '2026-11-25T' + h + ':00.000Z';
  const id1 = E.registra(guasto('Il totale 1.234,56 non torna'), 'errore', { quando: T('10:00') });
  const id2 = E.registra(guasto('Il totale 99,10 non torna'), 'errore', { quando: T('10:05') });
  const id3 = E.registra(guasto('Fattura di ROSSI MARIO già caricata'), 'errore', { quando: T('10:06') });
  t('stesso errore → stesso record', id1 && id1 === id2 && id3 && id3 !== id1, [id1, id2, id3]);
  t('scritti 2 record', (await E.scrivi()) === 2 && S.errori.length === 2, S.errori.length);
  let r1 = S.errori.find(x => x.id === id1); const r3 = S.errori.find(x => x.id === id3);
  // due volte: prima 10:00, ultima 10:05
  t('conteggio 2 con prima e ultima volta', r1.volte === 2 && r1.prima === T('10:00') && r1.ultima === T('10:05'), r1);
  t('testo ripulito, nome dell\'errore, versione', r1.msg === 'Il totale # non torna' && r1.nome === 'TypeError' && r1.versione === VERSION && r3.msg === 'Fattura di [nome] già caricata', [r1.msg, r3.msg]);
  t('pagina, dispositivo e ruolo', JSON.stringify(r1.pagine) === JSON.stringify(['campagna/oggi']) && r1.disp && r1.disp.tipo === 'computer' && r1.ruolo === 'titolare', r1);
  t('pila corta', Array.isArray(r1.pila) && r1.pila.length >= 1 && r1.pila.length <= 4, r1.pila);
  t('nessun dato nel salvato', !/ROSSI|MARIO|1\.234|99,10/.test(JSON.stringify(S.errori)));
  t('scritto nella raccolta errori', finto.scritti.some(x => x[0] === 'put' && x[1] === 'errori' && x[2] === id1));
  // torna alle 11:00: 3 volte, la prima resta 10:00
  E.registra(guasto('Il totale 5,00 non torna'), 'errore', { quando: T('11:00') }); await E.scrivi();
  r1 = S.errori.find(x => x.id === id1);
  t('torna: 3 volte, prima volta uguale', r1.volte === 3 && r1.prima === T('10:00') && r1.ultima === T('11:00'), r1);
  // il titolare lo segna visto alle 11:30 (un record solo in config); torna alle 11:45 → 4 volte e di nuovo nuovo, il visto resta
  S.config = []; await finto.put('config', E.VISTI, { firme: { [r1.firma]: T('11:30') } });
  t('visto → non nuovo', !E.nuovo(S.errori.find(x => x.id === id1), E.visti()) && E.gruppi(S.errori).find(g => g.firma === r1.firma).nuovo === false);
  E.registra(guasto('Il totale 7,00 non torna'), 'errore', { quando: T('11:45') }); await E.scrivi();
  r1 = S.errori.find(x => x.id === id1);
  t('torna dopo il visto: nuovo, visto tenuto', r1.volte === 4 && E.nuovo(r1, E.visti()) && E.visti()[r1.firma] === T('11:30') && r1.visto === undefined, r1);
  // errore di prima dell'avvio (js/errori-avvio.js): la versione non si sa
  const id5 = E.registra(guasto('Errore numero 9'), 'errore', { quando: T('11:46'), versione: '' }); await E.scrivi();
  t('versione non nota per gli errori di prima dell\'avvio', S.errori.find(x => x.id === id5).versione === '');

  // archivio non ancora pronto: resta in coda (e nel dispositivo) finché non si può scrivere
  UI.loaded = false;
  const id4 = E.registra(guasto('Errore numero 7'), 'errore', { quando: T('11:50') });
  t('archivio non pronto: niente scritto', (await E.scrivi()) === 0 && !S.errori.some(x => x.id === id4) && localStorage.getItem('ces.errori.attesa'));
  UI.loaded = true;
  t('archivio pronto: scritto e tolto dal dispositivo', (await E.scrivi()) === 1 && S.errori.some(x => x.id === id4) && localStorage.getItem('ces.errori.attesa') === null);

  // 201 vecchi errori di 1…201 minuti fa + uno di 100 giorni fa + quello nuovo = 203 → restano i 200 più nuovi
  S.errori = Array.from({ length: 201 }, (_, i) => ({ id: 'er-old-' + i, firma: 'o' + i, msg: 'x', volte: 1, ultima: iso(ORA - (i + 1) * 60e3) }));
  S.errori.push({ id: 'er-vecchio', firma: 'v', msg: 'x', volte: 1, ultima: iso(ORA - 100 * GIORNO) });
  const nuovoId = E.registra(guasto('Errore numero 8'), 'errore', { quando: iso(ORA - 30e3) });
  await E.scrivi();
  const ids = new Set(S.errori.map(x => x.id));
  t('limite di 200 righe', S.errori.length === 200, S.errori.length);
  t('via la vecchia e le due più vecchie, resta la nuova', !ids.has('er-vecchio') && !ids.has('er-old-200') && !ids.has('er-old-199') && ids.has('er-old-198') && ids.has(nuovoId));

  // un guasto che cambia testo a ogni volta: al massimo 20 errori diversi per apertura; uno già preso si conta ancora
  S.errori = []; E._azzera();
  const presi = Array.from({ length: 30 }, (_, i) => E.registra(guasto('Errore numero ' + i), 'errore', { quando: T('11:59') })).filter(Boolean);
  t('al massimo 20 errori diversi', presi.length === 20, presi.length);
  t('uno già preso si conta ancora', E.registra(guasto('Errore numero 0'), 'errore', { quando: T('11:59') }) === presi[0]);
  t('scritti 20', (await E.scrivi()) === 20 && S.errori.length === 20 && S.errori.find(x => x.id === presi[0]).volte === 2);
}

fine('Registro degli errori');

// Prove del Centro automatico con dati INVENTATI (js/automazioni.js): iscrizione, giro, diario con le versioni di prima,
// raccolte riservate, lavoro a mano durante un giro, annulla (anche di un record cambiato dopo), dubbi (conferma,
// alternativa, scarta e annullamento dello scarto), automazioni da saltare o guaste, collaboratore, sola lettura,
// blocco, pulizia del diario dopo 30 giorni e righe troppo grandi.
// I risultati attesi sono fatti a mano (scritti nei commenti), non copiati da quello che il codice restituisce.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/automazioni.test.mjs  (PROVE_TUTTE=1 per vedere anche quelle che passano)
import './avvio.mjs';
import { t, sezione, fine } from './aiuto.mjs';
const ROOT = new URL('../js', import.meta.url).href;
const { S, COLS } = await import(ROOT + '/state.js');
const store = await import(ROOT + '/store.js');
const A = await import(ROOT + '/automazioni.js');

// L'orologio di avvio.mjs è fermo: qui lo si fa avanzare a mano, così ogni giro ha il suo numero (Date.now in base 36).
const ORA = Date.now(); let off = 0;
Date.now = () => ORA + off;
const avanza = (ms = 1000) => { off += ms; };
const pausa = () => new Promise(r => setTimeout(r, 0));
const trova = (col, id) => S[col].find(x => x.id === id) || null;
const azzera = () => { for (const c of COLS) S[c] = []; };
const riga = (gid, aut) => trova('config', 'ad-' + gid + '-' + aut) || trova('econfig', 'ad-' + gid + '-' + aut);
async function errore(p) { try { await p; return ''; } catch (e) { return e.message; } }
azzera();

// Le automazioni lavorano solo se accese qui: avviaTutto le fa girare tutte, le altre restano senza scritture (niente diario).
const accese = new Set();
const on = id => accese.has(id);
let tolti = null;

sezione('iscrizione');
t('registra senza esegui: errore', /servono id, nome ed esegui/.test(await errore((async () => A.registra({ id: 'x', nome: 'X', area: 'campagna' }))())));
t('registra con area sconosciuta: errore', /area sconosciuta "cucina"/.test(await errore((async () => A.registra({ id: 'x', nome: 'X', area: 'cucina', esegui() { } }))())));

// semina: scrive un'attività nuova, cambia due volte lo stesso campo e una nota (la nota non è fra le sue raccolte)
A.registra({
  id: 'semina', nome: 'Semina', area: 'campagna', raccolte: ['operazioni', 'campi'],
  async esegui() {
    if (!on('semina')) return {};
    await store.put('operazioni', 'op-nuova', { tipo: 'Semina', campoId: 'c1' });
    await store.put('campi', 'c1', { nome: 'Prato', ha: 3 });
    await store.put('campi', 'c1', { nome: 'Prato', ha: 4 });
    await store.put('note', 'n1', { testo: 'nota' });
  },
  annullato(r, tt) { tolti = tt; },
});
// mista: area campagna (diario in config) che scrive anche una fattura: la fattura non deve finire nel diario dei collaboratori
A.registra({ id: 'mista', nome: 'Mista', area: 'campagna', async esegui() { if (!on('mista')) return {}; await store.put('fatture', 'f1', { numero: '1' }); await store.put('campi', 'c2', { nome: 'Vigna' }); } });
// fatt: area conti (riservata) → diario in econfig, la fattura c'è
const dFatt = A.registra({ id: 'fatt', nome: 'Fatture', area: 'conti', async esegui() { if (!on('fatt')) return {}; await store.put('fatture', 'f2', { numero: '2' }); } });
const dTit = A.registra({ id: 'tit', nome: 'Solo titolare', area: 'campagna', soloTitolare: true, esegui() { return {}; } });
const dCamp = A.registra({ id: 'camp', nome: 'Campagna', area: 'campagna', esegui() { return {}; } });
t('area conti = solo titolare', dFatt.soloTitolare === true);
t('soloTitolare scritto in campagna', dTit.soloTitolare === true);
t('campagna senza soloTitolare = per tutti', dCamp.soloTitolare === false);
// amano: senza propri; propria: con propri (solo gli id "pr-" sono suoi)
A.registra({ id: 'amano', nome: 'A mano', area: 'stalla', async esegui() { if (!on('amano')) return {}; await store.put('eventi', 'am-1', { n: 1 }); } });
A.registra({ id: 'propria', nome: 'Propria', area: 'stalla', propri: (c, id) => id.startsWith('pr-'), async esegui() { if (!on('propria')) return {}; await store.put('eventi', 'pr-1', { n: 1 }); await store.put('eventi', 'xx-1', { n: 1 }); } });
// pronta: risposta scelta dalla prova
let rispPronta = true, eseguitePronta = 0;
A.registra({ id: 'pronta', nome: 'Pronta', area: 'stalla', pronta() { if (rispPronta === 'getta') throw new Error('Senza dati'); return rispPronta; }, async esegui() { eseguitePronta++; return {}; } });
A.registra({ id: 'guasto', nome: 'Guasto', area: 'stalla', async esegui() { if (on('guasto')) throw new Error('rotto'); return {}; } });
let rispConta = {};
A.registra({ id: 'conta', nome: 'Conta', area: 'stalla', async esegui() { return on('conta') ? rispConta : {}; } });
const GRANDE = 'x'.repeat(800e3);
A.registra({ id: 'grande', nome: 'Grande', area: 'campagna', async esegui() { if (!on('grande')) return {}; await store.put('campi', 'cg', { nome: 'Grande', ha: 1 }); } });
// dubbiosa: dubbi restituiti dal giro (uno doppio) e uno letto dai dati salvati
A.registra({
  id: 'dubbiosa', nome: 'Dubbiosa', area: 'stalla',
  async esegui() {
    if (!on('dubbiosa')) return {};
    return {
      dubbi: [
        { id: 'd1', testo: 'Vacca 1?', conferma: () => store.put('eventi', 'ev-1', { tipo: 'Parto' }) },
        { id: 'd1', testo: 'doppione' },
        { id: 'd2', testo: 'Vacca 2?', alternative: [{ testo: 'Altra', conferma: () => store.put('eventi', 'ev-2', { tipo: 'Asciutta' }) }] },
        { id: 'd3', testo: 'Cambiato nel frattempo', conferma: async () => false },
        { id: 'd4', testo: 'Scartami', scarta: () => store.remove('eventi', 'ev-old') },
      ],
    };
  },
  dubbi() { return on('dubbiosa') ? [{ id: 'd5', testo: 'Dai dati salvati' }] : []; },
});

sezione('giro e diario');
S.campi = [{ id: 'c1', nome: 'Prato', ha: 2 }];
accese.add('semina');
let r = await A.avvia('semina', 'ogni30');
const g1 = r.giro;
let rg = riga(g1, 'semina');
t('riga del diario ad-<giro>-semina in config', !!trova('config', 'ad-' + g1 + '-semina'));
t('non in econfig', !trova('econfig', 'ad-' + g1 + '-semina'));
t('motivo del giro', rg && rg.motivo === 'ogni30', rg && rg.motivo);
// scritti: attività nuova (n) e campo c1 con la versione di PRIMA del giro (ha 2, non 3), la nota fuori
t('salvati = 2 (attività + campo)', r.esiti[0][1].salvati === 2 && r.salvati === 2, r.esiti[0][1].salvati);
const sOp = rg.scritti.find(s => s.id === 'op-nuova'), sC1 = rg.scritti.find(s => s.id === 'c1');
t('attività nuova segnata come nuova', sOp && sOp.c === 'operazioni' && sOp.n === 1 && !sOp.p);
t('campo con la versione di prima del giro (ha 2)', sC1 && sC1.p && sC1.p.ha === 2 && sC1.p.nome === 'Prato' && !('id' in sC1.p), sC1);
t('la nota (raccolta non sua) non è nel diario', !rg.scritti.some(s => s.c === 'note'));
t('impronta della versione scritta', sOp.h > 0 && sC1.h > 0);
t('esito con il numero della riga', r.esiti[0][1].riga === 'ad-' + g1 + '-semina');

sezione('annulla');
let tot = await A.annulla(['ad-' + g1 + '-semina']);
t('annulla: 2 fatti', tot.fatti === 2 && tot.cambiati === 0 && tot.persi === 0, tot);
t('attività nuova tolta', !trova('operazioni', 'op-nuova'));
t('campo rimesso com\'era (ha 2)', trova('campi', 'c1') && trova('campi', 'c1').ha === 2);
t('la nota resta', !!trova('note', 'n1'));
rg = riga(g1, 'semina');
t('riga segnata annullata, scritti svuotati, quanti 2', rg.annullato && rg.scritti.length === 0 && rg.quanti === 2 && rg.esito.fatti === 2, rg);
t('annullato() chiamato con i record com\'erano prima di annullare', tolti && tolti.length === 2 && tolti.find(x => x.id === 'c1').rec.ha === 4 && tolti.some(x => x.id === 'op-nuova'), tolti);
tot = await A.annulla(['ad-' + g1 + '-semina']);
t('seconda volta: niente', tot.fatti === 0 && tot.cambiati === 0);

// cambiato dopo il giro: resta com'è
avanza();
r = await A.avvia('semina', 'ogni30'); const g2 = r.giro;
t('giro nuovo, numero nuovo', g2 !== g1);
await store.put('operazioni', 'op-nuova', { tipo: 'Semina', campoId: 'c1', note: 'cambiata a mano' });
tot = await A.annullaGiro(g2);
t('annullaGiro: 1 fatto, 1 cambiato dopo', tot.fatti === 1 && tot.cambiati === 1, tot);
t('attività cambiata a mano resta', trova('operazioni', 'op-nuova') && trova('operazioni', 'op-nuova').note === 'cambiata a mano');
t('campo rimesso (ha 2)', trova('campi', 'c1').ha === 2);
accese.delete('semina');

sezione('raccolte riservate');
accese.add('mista'); accese.add('fatt');
avanza(); r = await A.avvia('mista', 'ogni30'); rg = riga(r.giro, 'mista');
t('mista: diario in config senza la fattura', rg && trova('config', rg.id) && rg.scritti.length === 1 && rg.scritti[0].id === 'c2', rg && rg.scritti);
avanza(); r = await A.avvia('fatt', 'ogni30');
t('conti: diario in econfig con la fattura', !!trova('econfig', 'ad-' + r.giro + '-fatt') && trova('econfig', 'ad-' + r.giro + '-fatt').scritti[0].c === 'fatture');
t('conti: niente in config', !trova('config', 'ad-' + r.giro + '-fatt'));
accese.delete('mista'); accese.delete('fatt');

sezione('lavoro a mano durante il giro');
accese.add('amano'); accese.add('propria');
A.segnaMano();
avanza(); r = await A.avvia('amano', 'ogni30');
// la scrittura è avvenuta ma non è sua: nessuna riga (niente scritti, niente errore), salvati 0
t('a mano: niente diario', !riga(r.giro, 'amano') && r.esiti[0][1].salvati === 0 && r.esiti[0][1].riga === null, r.esiti[0][1]);
t('a mano: il dato è scritto lo stesso', !!trova('eventi', 'am-1'));
avanza(100); r = await A.avvia('propria', 'ogni30'); rg = riga(r.giro, 'propria');
t('con propri: solo pr-1 nel diario, 1 a mano', rg && rg.scritti.length === 1 && rg.scritti[0].id === 'pr-1' && rg.aMano === 1, rg);
A.segnaMano();
avanza(100); r = await A.avvia('amano');   // pulsante: il tocco su Avvia non è lavoro a mano
t('pulsante: nel diario anche subito dopo un tocco', !!riga(r.giro, 'amano') && riga(r.giro, 'amano').motivo === 'pulsante');
let rilascia; A.mano(new Promise(res => { rilascia = res; }));
avanza(5000); r = await A.avvia('amano', 'ogni30');
t('azione a mano in corso: fuori', !riga(r.giro, 'amano'));
rilascia(); await pausa();
avanza(1500); r = await A.avvia('amano', 'ogni30');
t('1,5 s dopo la fine: ancora fuori', !riga(r.giro, 'amano'));
avanza(600); r = await A.avvia('amano', 'ogni30');
t('2,1 s dopo la fine: dentro', !!riga(r.giro, 'amano'));
accese.delete('amano'); accese.delete('propria');

sezione('pronta, errori, conteggio');
rispPronta = false; avanza(); r = await A.avvia('pronta', 'ogni30');
t('pronta false: saltata in silenzio', r.esiti[0][1].saltata === 'non serve adesso' && eseguitePronta === 0);
rispPronta = 'Manca il campo'; avanza(); r = await A.avvia('pronta');
t('pronta testo: saltata con il motivo', r.esiti[0][1].saltata === 'Manca il campo' && eseguitePronta === 0);
t('esito a mano ricordato', A.STATO.esiti.pronta.saltata === 'Manca il campo');
rispPronta = 'getta'; avanza(); r = await A.avvia('pronta', 'ogni30');
t('pronta che si rompe: saltata con il messaggio', r.esiti[0][1].saltata === 'Senza dati');
t('giro automatico non copre l\'esito di prima', A.STATO.esiti.pronta.saltata === 'Manca il campo');
rispPronta = true; avanza(); r = await A.avvia('pronta', 'ogni30');
t('pronta true: parte', eseguitePronta === 1 && !r.esiti[0][1].saltata);
const avvisa = console.warn; console.warn = () => { };   // il guasto voluto non sporca l'uscita
accese.add('guasto'); avanza(); r = await A.avvia('guasto', 'ogni30'); console.warn = avvisa;
t('guasto: errore nell\'esito e nel totale', r.esiti[0][1].errore === 'rotto' && r.errori === 1);
t('guasto: riga del diario anche senza scritture', riga(r.giro, 'guasto') && riga(r.giro, 'guasto').errore === 'rotto');
accese.delete('guasto');
accese.add('conta');
rispConta = { salvati: ['a', 'b', 'c'], note: 'tre' }; avanza(); r = await A.avvia('conta', 'ogni30');
t('salvati da un elenco = 3', r.esiti[0][1].salvati === 3 && r.esiti[0][1].note === 'tre');
rispConta = { salvati: 5 }; avanza(); r = await A.avvia('conta', 'ogni30');
t('salvati da un numero = 5', r.esiti[0][1].salvati === 5);
accese.delete('conta');

sezione('riga troppo grande');
S.campi = [...S.campi, { id: 'cg', nome: 'Grande', ha: 1, note: GRANDE }];
accese.add('grande'); avanza(); r = await A.avvia('grande', 'ogni30'); rg = riga(r.giro, 'grande');
t('versione di prima lasciata fuori oltre 700 000 caratteri', rg && rg.scritti.length === 1 && !rg.scritti[0].p && !rg.scritti[0].n && rg.scritti[0].h > 0, rg && rg.scritti);
tot = await A.annulla([rg.id]);
t('annulla: 1 perso, record lasciato', tot.persi === 1 && tot.fatti === 0 && !trova('campi', 'cg').note, tot);
accese.delete('grande');

sezione('dubbi');
accese.add('dubbiosa'); avanza(); r = await A.avvia('dubbiosa', 'ogni30');
let D = A.dubbi();
// d5 (dai dati) + d1, d2, d3, d4 dal giro; il secondo d1 è un doppione
t('5 dubbi, il doppione fuori', D.length === 5 && A.numeroDubbi() === 5, D.map(x => x.id));
t('prima quelli dai dati salvati', D[0].id === 'd5');
t('area e automazione aggiunte', D.every(x => x.area === 'stalla' && x.aut === 'dubbiosa'));
t('d1 è il primo (non il doppione)', D.find(x => x.id === 'd1').testo === 'Vacca 1?');
// d5 si leggeva già dai dati prima del giro (dubbi()): i nuovi sono d1, d2, d3, d4 = 4
t('dubbi nuovi del giro = 4', r.dubbiNuovi === 4, r.dubbiNuovi);
avanza(); await A.conferma('d1');
t('conferma: evento scritto', !!trova('eventi', 'ev-1'));
t('conferma: dubbio tolto', !A.dubbi().some(x => x.id === 'd1') && A.numeroDubbi() === 4);
let rc = S.config.find(x => x.tipo === 'diario' && x.motivo === 'conferma');
t('conferma: riga del diario con l\'evento nuovo', rc && rc.scritti.length === 1 && rc.scritti[0].id === 'ev-1' && rc.scritti[0].n === 1 && rc.note === 'Confermato: Vacca 1?', rc);
t('dubbio senza conferma: va aperto', /tocca Apri/.test(await errore(A.conferma('d5'))));
t('conferma che non cambia niente: errore', /Non è cambiato niente/.test(await errore(A.conferma('d3'))));
t('e il dubbio resta', A.dubbi().some(x => x.id === 'd3'));
t('dubbio che non c\'è', /Non c'è più/.test(await errore(A.conferma('d9'))));
avanza(); await A.alternativa('d2', 0);
rc = S.config.find(x => x.tipo === 'diario' && x.motivo === 'conferma' && x.note.startsWith('Scelto'));
t('alternativa: evento scritto e nota', !!trova('eventi', 'ev-2') && rc && rc.note === 'Scelto «Altra»: Vacca 2?' && !A.dubbi().some(x => x.id === 'd2'), rc && rc.note);
// conferma annullabile
tot = await A.annulla([rc.id]);
t('annullare l\'alternativa toglie l\'evento', tot.fatti === 1 && !trova('eventi', 'ev-2'));
S.eventi = [...S.eventi, { id: 'ev-old', tipo: 'Vecchio' }];
avanza(); await A.scarta('d4');
t('scarta: evento tolto da scarta()', !trova('eventi', 'ev-old'));
const sc = trova('config', 'ad-scarti');
t('scarta: segnato negli scarti', sc && sc.ids && !!sc.ids.d4);
t('scarta: dubbio tolto', !A.dubbi().some(x => x.id === 'd4'));
const rs = S.config.find(x => x.tipo === 'diario' && x.motivo === 'scarta');
t('scarta: riga del diario con l\'evento di prima', rs && rs.dubbio === 'd4' && rs.scritti.length === 1 && rs.scritti[0].p && rs.scritti[0].p.tipo === 'Vecchio', rs);
avanza(); await A.avvia('dubbiosa', 'ogni30');
t('scartato: non torna al giro dopo', !A.dubbi().some(x => x.id === 'd4') && A.dubbi().some(x => x.id === 'd1'));
tot = await A.annulla([rs.id]);
t('annullare lo scarto: evento rimesso e dubbio di nuovo', tot.fatti === 1 && trova('eventi', 'ev-old') && A.dubbi().some(x => x.id === 'd4') && !trova('config', 'ad-scarti').ids.d4);
accese.delete('dubbiosa');

sezione('diario per giro');
accese.add('mista'); accese.add('semina'); avanza(); r = await A.avviaTutto('ogni30');
const gr = A.diario().find(x => x.giro === r.giro);
t('avviaTutto: un giro con le due righe (mista, semina)', gr && gr.righe.length === 2 && gr.righe.some(x => x.aut === 'mista') && gr.righe.some(x => x.aut === 'semina'), gr && gr.righe.map(x => x.aut));
t('avviaTutto: ora dell\'ultimo giro completo', A.STATO.ultimo && localStorage.getItem('ces.centro.ultimo') && A.prossimo() === new Date(A.STATO.ultimo).getTime() + 30 * 60e3);
const ult = A.STATO.ultimo; avanza(); await A.avvia('semina', 'ogni30');
t('avvia di una sola: l\'ultimo giro completo non cambia', A.STATO.ultimo === ult);
accese.delete('mista'); accese.delete('semina');

sezione('pulizia del diario');
// oggi 25/11/2026 (più pochi secondi): limite 26/10/2026; il 20/10 si toglie, il 1/11 resta
S.config = [...S.config, { id: 'ad-vecchio-x', tipo: 'diario', giro: 'vecchio', aut: 'x', quando: '2026-10-20T00:00:00.000Z' }, { id: 'ad-recente-x', tipo: 'diario', giro: 'recente', aut: 'x', quando: '2026-11-01T00:00:00.000Z' }];
avanza(); await A.avvia('camp', 'ogni30'); await pausa(); await pausa();
t('riga di 36 giorni fa tolta', !trova('config', 'ad-vecchio-x'));
t('riga di 24 giorni fa resta', !!trova('config', 'ad-recente-x'));

sezione('collaboratore, sola lettura, blocco');
Object.assign(store.sync, { mode: 'cloud', farm: { id: 'az-prova' }, user: { id: 'u2' }, members: [{ user_id: 'u2', role: 'collaboratore' }] });
t('collaboratore: le automazioni riservate non si vedono', !A.visibili().some(d => d.id === 'fatt' || d.id === 'tit') && A.visibili().some(d => d.id === 'semina'));
t('collaboratore: avvia di una riservata rifiutato', /non trovata/.test(await errore(A.avvia('fatt'))));
t('collaboratore: il diario in econfig non si vede', !A.diario().some(g => g.righe.some(x => x.aut === 'fatt')));
accese.add('fatt'); avanza(); r = await A.avviaTutto('ogni30');
t('collaboratore: avviaTutto non fa girare i Conti', !r.esiti.some(([d]) => d.id === 'fatt') && !trova('econfig', 'ad-' + r.giro + '-fatt'));
accese.delete('fatt');
store.sync.perm = { role: 'lettore' };
r = await A.avviaTutto('ogni30');
t('sola lettura: nessun giro', r.solaLettura === true);
Object.assign(store.sync, { mode: 'local', farm: null, user: null, members: [], perm: null });
A.STATO.attivo = true;
r = await A.avviaTutto('ogni30');
t('giro in corso: occupato', r.occupato === true);
t('annulla durante un giro: aspetta', /Aspetta la fine/.test(await errore(A.annulla([]))));
A.STATO.attivo = false;

fine('Centro automatico');

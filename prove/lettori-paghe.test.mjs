// Prove dei lettori delle paghe (js/conti/paghe-parse.js: leggiCedolini, leggiBilancinoPaghe, tipoPaghe) con i
// documenti FINTI di prove/documenti/ (cedolini a moduli fissi letti per posizione, bilancino contabile del mese).
// Dipendenti inventati: ROSSI MARIO e VERDI LUIGI. I conti fatti a mano sono qui e in genera.mjs.
// Uso: npm test   oppure   node --import ./prove/avvio.mjs prove/lettori-paghe.test.mjs   (PROVE_TUTTE=1 per tutte)
import './avvio.mjs';
import { t, sezione, fine, uguale } from './aiuto.mjs';
import { documento, modulo } from './lettori.mjs';
import { Pagina, creaPdf } from './documenti/pdf.mjs';
const PP = await modulo('conti/paghe-parse.js');
const PT = await modulo('conti/pdftext.js');

const errore = async fn => { try { await fn(); return ''; } catch (e) { return e.message; } };
const ok = c => c.every(x => x.esito === 'OK');

/* ---------------------------------------------------------------- */
sezione('1. Cedolini di novembre 2025: due dipendenti e i totali generali');
const L = await PP.leggiCedolini(documento('cedolini.pdf'));
t('due cedolini, mese 11 e anno 2025', L.cedolini.length === 2 && L.mese === 11 && L.anno === 2025, [L.cedolini.length, L.mese, L.anno]);
const [r, v] = L.cedolini;
t('anagrafica: nome, codice fiscale, matricola, livello', r.nome === 'ROSSI MARIO' && r.cf === 'RSSMRA80A01H501U' && r.matricola === '000012' && r.livello === '3', [r.nome, r.cf, r.matricola, r.livello]);
t('contratto, qualifica, mansione, nascita', r.contratto === 'OTI' && r.qualifica === 'OPERAIO AGRICOLO' && r.mansione === 'MUNGITORE' && r.nascita === '1980-01-01', [r.contratto, r.qualifica, r.mansione, r.nascita]);
t('date: assunzione, anzianità, scatto, visita medica', r.assunzione === '2020-03-01' && r.anzianita === '2020-03-01' && r.prossimoScatto === '2026-03-01' && r.visitaMedica === '2026-06-15' && r.scadTD === null, [r.assunzione, r.prossimoScatto, r.visitaMedica]);
t('paga base, ore 168, giorni 26, ore del contratto 169', r.pagaBase === 1650 && r.retribuzione === 1650 && r.ore === 168 && r.giorni === 26 && r.oreContratto === 169 && r.giorniInps === 26, [r.pagaBase, r.ore, r.giorni]);
// 168 × 10,00 = 1.680,00 + 10 × 12,50 = 125,00 → 1.805,00
t('5 voci con codice e descrizione', r.voci.length === 5 && r.voci.map(x => x.codice).join(' ') === '1.0001 1.0050 2.0100 3.0001 9.0001' && r.voci[3].descrizione === 'ANTICIPO SU RETRIBUZIONE', r.voci);
t('voce delle ore: 168 × 10,00000 = 1.680,00', r.voci[0].tempo === 168 && r.voci[0].unitario === 10 && r.voci[0].competenza === 1680 && r.voci[0].trattenuta === null, r.voci[0]);
t('voci di trattenuta e voce neutra', r.voci[2].trattenuta === 15 && r.voci[3].trattenuta === 200 && r.voci[4].neutro === 8 && r.voci[4].competenza === null, r.voci.slice(2));
t('totali: competenze 1.805,00, trattenute 625,00, netto 1.180,20', r.totComp === 1805 && r.totTratt === 625 && uguale(r.netto, 1180.2), [r.totComp, r.totTratt, r.netto]);
t('contributi per ente: INPS 150 + CIMACLA 10 = 160', r.enti.INPS === 150 && r.enti.CIMACLA === 10 && r.ritPrev === 160 && r.impPrev === 1805, [r.enti, r.ritPrev]);
// imponibile fiscale 1.805 − 160 = 1.645; IRPEF lorda 390 − detrazioni 140 = 250
t('IRPEF: imponibile 1.645, lorda 390, detrazioni 140, netta 250', r.impFisc === 1645 && r.irpefLorda === 390 && r.detrazioni === 140 && r.irpef === 250, [r.impFisc, r.irpefLorda, r.detrazioni, r.irpef]);
t('lordo, TFR (1.805 / 13,5 = 133,70) e arrotondamenti', r.lordo === 1805 && r.retribTfr === 1805 && uguale(r.tfrFondo, 133.7) && uguale(r.arrPrec, 0.4) && uguale(r.arrCorr, 0.6), [r.lordo, r.tfrFondo, r.arrPrec, r.arrCorr]);
t('permessi e ferie (40 + 13,33 − 8 = 45,33)', r.permessi.prec === 8 && r.permessi.saldo === 12 && r.ferie.prec === 40 && uguale(r.ferie.mat, 13.33) && uguale(r.ferie.saldo, 45.33) && r.ferie.godAnno === 16, [r.permessi, r.ferie]);
// 1.805,00 − 625,00 − 0,40 + 0,60 = 1.180,20; voci 1.680 + 125 = 1.805; 15 + 200 + 160 + 250 = 625
t('controlli interni del cedolino tutti OK', r.controlli.length === 3 && ok(r.controlli), r.controlli);
let vc = PP.verificaCedolino(r);
t('ROSSI passa i controlli per il salvataggio automatico', vc.ok && !vc.avvisi.length, vc);

t('secondo cedolino: VERDI LUIGI a tempo determinato fino al 31/12/2025', v.nome === 'VERDI LUIGI' && v.cf === 'VRDLGU90B15L483Z' && v.contratto === 'OTD' && v.scadTD === '2025-12-31' && v.mansione === 'TRATTORISTA', [v.nome, v.scadTD]);
// 150 × 9,50 = 1.425,00; 126 + 100 = 226; netto 1.199,00, senza arrotondamenti
t('VERDI: 150 ore × 9,50 = 1.425,00, netto 1.199,00', v.voci.length === 1 && v.voci[0].competenza === 1425 && v.totTratt === 226 && v.netto === 1199 && v.arrPrec === null, [v.voci, v.netto]);
vc = PP.verificaCedolino(v);
t('VERDI passa i controlli', vc.ok && ok(v.controlli), vc);

const T = L.totali;
t('pagina dei totali generali: lordo 3.230, netto 2.379,20, 2 dipendenti', T && T.totale && T.lordo === 3230 && uguale(T.netto, 2379.2) && T.dipendenti === 2 && T.mese === 11, T);
// 1.180,20 + 1.199,00 = 2.379,20; 1.805 + 1.425 = 3.230
t('controlli col riepilogo: netti, lordi, numero di cedolini', L.controlli.length === 3 && ok(L.controlli), L.controlli);

sezione('2. Tredicesima, riconoscimento del tipo e controlli che non tornano');
const tr = await PP.leggiCedolini(documento('cedolino-tredicesima.pdf'));
// 1.650,00 − (146 + 300) = 1.204,00
t('"Tredicesima" diventa il mese 13', tr.mese === 13 && tr.anno === 2025 && tr.cedolini[0].netto === 1204 && !tr.totali, [tr.mese, tr.cedolini[0].netto]);
t('tredicesima senza voce delle ore: passa i controlli', PP.verificaCedolino(tr.cedolini[0]).ok, PP.verificaCedolino(tr.cedolini[0]));
t('tipoPaghe: cedolini e bilancino riconosciuti', PP.tipoPaghe(await PT.leggiPdf(documento('cedolini.pdf'))) === 'cedolino' && PP.tipoPaghe(await PT.leggiPdf(documento('bilancino-paghe.pdf'))) === 'bilancino');
t('tipoPaghe: una fattura non è un documento delle paghe', PP.tipoPaghe(await PT.leggiPdf(documento('fattura-ade.pdf'))) === null);
// cedolino letto con un netto sbagliato di 10 €: il controllo lo deve fermare
vc = PP.verificaCedolino(Object.assign({}, r, { netto: 1190.2 }));
t('netto che non torna con competenze e trattenute: bloccato', !vc.ok && vc.problemi.some(p => /non danno il netto/.test(p)), vc.problemi);
vc = PP.verificaCedolino(Object.assign({}, r, { voci: r.voci.map((x, i) => i ? x : Object.assign({}, x, { unitario: 9 })) }));
t('ore × paga che non fa l\'importo della voce: bloccato', !vc.ok && vc.problemi.some(p => /168 ore × 9,00 € non fa 1680,00 €/.test(p)), vc.problemi);
// senza la riga delle ferie in fondo la riga più bassa è quella del mese: niente spostamento (prima la pagina si scartava)
const sf = await PP.leggiCedolini(documento('cedolino-senza-ferie.pdf'));
const c3 = sf.cedolini[0];
t('cedolino senza la riga delle ferie: letto', sf.cedolini.length === 1 && c3.nome === 'BIANCHI LUCA' && c3.cf === 'BNCLCU95E10L483K' && c3.scadTD === '2025-11-30', sf.cedolini.map(c => [c.nome, c.cf]));
// 80 × 9,50 = 760,00; 760 − 67 = 693,00
t('senza ferie: riconosciuto da solo come cedolino', PP.tipoPaghe(await PT.leggiPdf(documento('cedolino-senza-ferie.pdf'))) === 'cedolino');
t('senza ferie: voci, totali e netto giusti, ferie vuote', c3.voci.length === 2 && c3.voci[1].neutro === 12 && c3.voci[0].competenza === 760 && c3.totComp === 760 && c3.totTratt === 67 && c3.netto === 693 && c3.ritPrev === 67 && c3.ferie.saldo === null, [c3.voci, c3.netto, c3.ferie]);
t('senza ferie: passa i controlli per il salvataggio automatico', PP.verificaCedolino(c3).ok, PP.verificaCedolino(c3));
let e = await errore(() => PP.leggiCedolini(documento('fattura-ade.pdf')));
t('PDF che non è un cedolino: errore', e === 'Nessun cedolino riconosciuto nel PDF.', e);

sezione('3. Bilancino contabile delle paghe');
const b = await PP.leggiBilancinoPaghe(documento('bilancino-paghe.pdf'));
t('mese, anno, ditta e dipendenti in forza', b.mese === 11 && b.anno === 2025 && b.ditta === 'AZIENDA AGRICOLA FINTA S.S.' && b.nDip === 2, [b.mese, b.anno, b.ditta, b.nDip]);
t('lordo 3.230 e netto 2.379,20 (colonna del dipendente)', b.lordo === 3230 && uguale(b.netto, 2379.2), [b.lordo, b.netto]);
t('ritenute col meno in coda diventano positive: 286, 350, 215', b.ritPrev === 286 && b.ritFisc === 350 && b.ritNetto === 215 && b.acconti === 0, [b.ritPrev, b.ritFisc, b.ritNetto]);
t('arrotondamenti letti con il segno', uguale(b.voci.arrPrec.ditta, -0.4) && uguale(b.voci.arrCorr.ditta, 0.6), [b.voci.arrPrec, b.voci.arrCorr]);
// ditta: 290 − 230 + 800 = 860; dipendente: 0 + 286; a debito: 1.086
t('contributi: ditta 860, dipendente 286, a debito 1.086; TFR al fondo 230', b.contribDitta === 860 && b.contribDip === 286 && b.contribDebito === 1086 && b.tfrFpc === 230, [b.contribDitta, b.contribDip, b.contribDebito, b.tfrFpc]);
t('IRPEF 350, costo 4.320, versamenti 1.436', b.irpef === 350 && b.costo === 4320 && b.versamenti === 1436, [b.irpef, b.costo, b.versamenti]);
t('due coppie sulla stessa riga: imponibile previdenziale 3.230 e fiscale 2.944', b.impPrev === 3230 && b.impFisc === 2944, [b.impPrev, b.impFisc]);
// 3.230 − 286 − 350 − 215 − 0,40 + 0,60 = 2.379,20; 3.230 + 860 + 230 = 4.320
t('controlli del bilancino: netto e costo tornano', b.controlli.length === 2 && ok(b.controlli), b.controlli);
e = await errore(() => PP.leggiBilancinoPaghe(creaPdf([new Pagina().t(40, 40, 'BILANCINO CONTABILE').t(40, 60, 'RETRIBUZIONE LORDA').d(280, 60, '1.000,00')])));
t('bilancino senza mese: errore', e === 'Nel bilancino delle paghe non ho trovato il mese.', e);

fine('lettori-paghe');

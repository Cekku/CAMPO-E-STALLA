// Struttura del bilancio (conto economico, stato patrimoniale, cespiti), indici e calcoli.
// Le voci sono indicate con il numero di riga del modello Excel originale: così l'importazione del vecchio file
// e la lettura dei bilancini restano allineate.

const S = (row, l, code = '', n = '') => ({ row, l, code, n, in: true });           // voce da inserire
const G = (row, code, l, from, to, n = '') => ({ row, code, l, sum: [from, to], n, grp: true }); // gruppo = somma del dettaglio
const T = (row, l, f, n = '') => ({ row, l, f, n, tot: true });                      // totale calcolato
const H = l => ({ sez: l });

export const CE = [
  H('A) VALORE DELLA PRODUZIONE'),
  G(7, 'A.1', 'Ricavi delle vendite e delle prestazioni', 8, 15),
  S(8, 'Vendita di latte', '', 'Da fatture di vendita / conferimenti al caseificio'), S(9, 'Vendita di bovini (vitelli, vitelloni, capi a fine carriera)'), S(10, 'Vendita di cereali, foraggi e altri prodotti dei campi'),
  S(11, 'Vendita di altri prodotti agricoli e zootecnici'), S(12, 'Prestazioni di servizi e lavorazioni per conto terzi'), S(13, 'Attività connesse (agriturismo, vendita diretta, trasformazione)'),
  S(14, 'Vendita di energia (fotovoltaico, biogas)'), S(15, 'Altri ricavi delle vendite e delle prestazioni'),
  S(16, 'Variazione delle rimanenze di prodotti in corso, semilavorati e finiti', 'A.2', '(+) se le rimanenze aumentano; (−) se diminuiscono'),
  S(17, 'Variazione dei lavori in corso su ordinazione', 'A.3', '(+) aumento; (−) diminuzione'),
  S(18, 'Incrementi di immobilizzazioni per lavori interni', 'A.4', 'Es. rimonta interna (manze allevate in azienda), lavori in economia'),
  G(19, 'A.5', 'Altri ricavi e proventi', 20, 25),
  S(20, 'Contributi PAC (pagamenti diretti, domanda unica)', '', 'Contributi in conto esercizio: di norma fuori campo IVA'), S(21, 'Contributi PSR e altri contributi UE/regionali in conto esercizio'),
  S(22, "Contributi in conto capitale (quota di competenza dell'esercizio)"), S(23, 'Indennizzi assicurativi e risarcimenti danni (grandine, ecc.)'), S(24, 'Plusvalenze da alienazione di cespiti'), S(25, 'Sopravvenienze attive e altri proventi'),
  T(26, 'TOTALE VALORE DELLA PRODUZIONE (A)', v => v[7] + v[16] + v[17] + v[18] + v[19]),
  H('B) COSTI DELLA PRODUZIONE'),
  G(29, 'B.6', 'Costi per materie prime, sussidiarie, di consumo e merci', 30, 37),
  S(30, 'Mangimi e foraggi acquistati'), S(31, 'Sementi e piantine'), S(32, 'Concimi e ammendanti'), S(33, 'Fitofarmaci e diserbanti'), S(34, 'Carburanti e lubrificanti'), S(35, 'Acquisto di bestiame'), S(36, 'Materiali di consumo, ricambi e minuteria'), S(37, 'Altri acquisti'),
  G(38, 'B.7', 'Costi per servizi', 39, 50),
  S(39, 'Spese veterinarie e medicinali'), S(40, 'Lavorazioni di terzi e contoterzisti'), S(41, 'Manutenzioni e riparazioni (mezzi, impianti, fabbricati)'), S(42, 'Energia elettrica, acqua e gas'), S(43, 'Assicurazioni'),
  S(44, 'Consulenze (commercialista, paghe, tecniche)'), S(45, 'Trasporti e spedizioni'), S(46, 'Controlli funzionali, analisi e selezione genetica'), S(47, 'Telefono, internet e spese postali'), S(48, 'Spese e commissioni bancarie'), S(49, 'Compensi amministratori e sindaci'), S(50, 'Altri servizi'),
  G(51, 'B.8', 'Costi per godimento di beni di terzi', 52, 55),
  S(52, 'Affitti passivi di terreni'), S(53, 'Canoni di leasing'), S(54, 'Noleggi di macchine e attrezzature'), S(55, 'Altri canoni e fitti'),
  G(56, 'B.9', 'Costi per il personale', 57, 61),
  S(57, 'a) Salari e stipendi'), S(58, 'b) Oneri sociali (INPS, INAIL)'), S(59, 'c) Trattamento di fine rapporto'), S(60, 'd) Trattamento di quiescenza e simili'), S(61, 'e) Altri costi del personale'),
  G(62, 'B.10', 'Ammortamenti e svalutazioni', 63, 68),
  S(63, 'a) Ammortamento delle immobilizzazioni immateriali'), S(64, 'b1) Ammortamento di fabbricati e impianti'), S(65, 'b2) Ammortamento di macchine agricole, attrezzature e automezzi'), S(66, 'b3) Ammortamento di bestiame da reddito e colture pluriennali'), S(67, 'c) Altre svalutazioni delle immobilizzazioni'), S(68, "d) Svalutazione dei crediti dell'attivo circolante"),
  S(69, 'Variazioni delle rimanenze di materie prime, sussidiarie, di consumo e merci', 'B.11', '(+) se le rimanenze diminuiscono (costo); (−) se aumentano'),
  S(70, 'Accantonamenti per rischi', 'B.12'), S(71, 'Altri accantonamenti', 'B.13'),
  G(72, 'B.14', 'Oneri diversi di gestione', 73, 77),
  S(73, 'IMU, tasse e imposte indirette'), S(74, 'Contributi consortili e associativi (bonifica, consorzi, sindacati)'), S(75, 'Minusvalenze da alienazione di cespiti'), S(76, 'Sopravvenienze passive'), S(77, 'Altri oneri di gestione'),
  T(78, 'TOTALE COSTI DELLA PRODUZIONE (B)', v => v[29] + v[38] + v[51] + v[56] + v[62] + v[69] + v[70] + v[71] + v[72]),
  T(79, 'DIFFERENZA TRA VALORE E COSTI DELLA PRODUZIONE (A − B)', v => v[26] - v[78], 'Risultato operativo (EBIT)'),
  H('C) PROVENTI E ONERI FINANZIARI'),
  S(82, 'Proventi da partecipazioni', 'C.15', 'Dividendi, ristorni da cooperative e consorzi'),
  G(83, 'C.16', 'Altri proventi finanziari', 84, 85), S(84, 'Interessi attivi bancari e su crediti'), S(85, 'Altri proventi finanziari'),
  G(86, 'C.17', 'Interessi e altri oneri finanziari', 87, 90), S(87, 'Interessi passivi su mutui e finanziamenti'), S(88, 'Interessi passivi su conti correnti e anticipi'), S(89, 'Interessi su leasing e altri finanziatori'), S(90, 'Altri oneri finanziari'),
  S(91, 'Utili e perdite su cambi', 'C.17-bis', '(+) utile; (−) perdita'),
  T(92, 'TOTALE PROVENTI E ONERI FINANZIARI (C)', v => v[82] + v[83] - v[86] + v[91], 'C.15 + C.16 − C.17 ± C.17-bis'),
  H('D) RETTIFICHE DI VALORE DI ATTIVITÀ E PASSIVITÀ FINANZIARIE'),
  S(95, 'Rivalutazioni', 'D.18'), S(96, 'Svalutazioni', 'D.19'),
  T(97, 'TOTALE RETTIFICHE DI VALORE (D)', v => v[95] - v[96]),
  T(99, 'RISULTATO PRIMA DELLE IMPOSTE (A − B ± C ± D)', v => v[79] + v[92] + v[97]),
  G(100, '20', "Imposte sul reddito dell'esercizio, correnti, differite e anticipate", 101, 104),
  S(101, 'IRES / IRPEF (se imputata in bilancio)'), S(102, 'IRAP'), S(103, 'Imposte differite e anticipate', '', '(+) onere; (−) provento'), S(104, 'Altre imposte sul reddito'),
  T(105, "21) UTILE (PERDITA) DELL'ESERCIZIO", v => v[99] - v[100]),
];

// voci dello stato patrimoniale collegate ai cespiti (valore netto) e al conto economico
const CESP = (row, l, code, cr) => ({ row, l, code, cesp: cr, link: 'Valore netto dal registro cespiti' });
export const SP = [
  H('ATTIVO'),
  S(7, 'Crediti verso soci per versamenti ancora dovuti', 'A'),
  G(8, 'B.I', 'Immobilizzazioni immateriali', 9, 12),
  CESP(9, 'Costi di impianto e ampliamento', 'B.I.1', 7), CESP(10, 'Concessioni, licenze, marchi e diritti (inclusi diritti PAC)', 'B.I.4', 8), CESP(11, 'Immobilizzazioni in corso e acconti', 'B.I.6', 9), CESP(12, 'Altre immobilizzazioni immateriali (software, migliorie su beni di terzi)', 'B.I.7', 10),
  G(13, 'B.II', 'Immobilizzazioni materiali', 14, 22),
  CESP(14, 'Terreni agricoli', 'B.II.1', 13), CESP(15, 'Fabbricati rurali e strumentali', 'B.II.1', 14), CESP(16, 'Impianti e macchinari', 'B.II.2', 15), CESP(17, 'Macchine agricole e attrezzature', 'B.II.3', 16), CESP(18, 'Automezzi e autovetture', 'B.II.4', 17),
  CESP(19, "Mobili, arredi e macchine d'ufficio", 'B.II.4', 18), CESP(20, 'Bestiame da riproduzione e da reddito', 'B.II.4', 19), CESP(21, 'Colture arboree pluriennali', 'B.II.4', 20), CESP(22, 'Immobilizzazioni in corso e acconti', 'B.II.5', 21),
  G(23, 'B.III', 'Immobilizzazioni finanziarie', 24, 26),
  S(24, 'Partecipazioni (consorzi, cooperative, società)', 'B.III.1', 'Valore di bilancio'), S(25, 'Crediti immobilizzati (depositi cauzionali, finanziamenti)', 'B.III.2'), S(26, 'Altri titoli', 'B.III.3'),
  T(27, 'TOTALE IMMOBILIZZAZIONI (B)', v => v[8] + v[13] + v[23]),
  G(28, 'C.I', 'Rimanenze', 29, 33),
  S(29, 'Materie prime, sussidiarie e di consumo (mangimi, concimi, sementi, carburanti)', 'C.I.1', 'Valore delle scorte al 31/12'), S(30, 'Prodotti in corso di lavorazione e semilavorati (colture in atto)', 'C.I.2'), S(31, 'Lavori in corso su ordinazione', 'C.I.3'),
  S(32, 'Prodotti finiti e merci (incl. bestiame da vendita, scorte di cereali e foraggi)', 'C.I.4'), S(33, 'Acconti', 'C.I.5'),
  G(34, 'C.II', 'Crediti (al netto del fondo svalutazione)', 35, 40),
  S(35, 'Crediti verso clienti', 'C.II.1'), S(36, 'Credito IVA', 'C.II.5-bis', 'Eccedenza a credito da dichiarazione IVA'), S(37, 'Altri crediti tributari (acconti imposte, ritenute, crediti d\'imposta)', 'C.II.5-bis'), S(38, 'Imposte anticipate', 'C.II.5-ter'),
  S(39, 'Crediti verso AGEA e altri enti per contributi', 'C.II.5-quater'), S(40, 'Altri crediti (anticipi a fornitori, soci, dipendenti)', 'C.II.5-quater'),
  G(41, 'C.III', 'Attività finanziarie che non costituiscono immobilizzazioni', 42, 42), S(42, 'Altri titoli e investimenti finanziari a breve', 'C.III.6'),
  G(43, 'C.IV', 'Disponibilità liquide', 44, 45), S(44, 'Depositi bancari e postali', 'C.IV.1'), S(45, 'Denaro e valori in cassa', 'C.IV.3'),
  T(46, 'TOTALE ATTIVO CIRCOLANTE (C)', v => v[28] + v[34] + v[41] + v[43]),
  S(47, 'Ratei e risconti attivi', 'D'),
  T(48, 'TOTALE ATTIVO', v => v[7] + v[27] + v[46] + v[47]),
  H('PASSIVO E PATRIMONIO NETTO'),
  G(51, 'A', 'PATRIMONIO NETTO', 52, 61),
  S(52, 'Capitale (ditta individuale: capitale netto del titolare)', 'A.I'), S(53, 'Riserva da sovrapprezzo delle azioni', 'A.II'), S(54, 'Riserve di rivalutazione', 'A.III'), S(55, 'Riserva legale', 'A.IV'), S(56, 'Riserve statutarie', 'A.V'), S(57, 'Altre riserve', 'A.VI'),
  S(58, 'Riserva per operazioni di copertura dei flussi finanziari attesi', 'A.VII'), S(59, 'Utili (perdite) portati a nuovo', 'A.VIII', 'Perdite con segno negativo'),
  { row: 60, l: "Utile (perdita) dell'esercizio", code: 'A.IX', ce: 105, link: 'Collegato al conto economico' },
  S(61, 'Riserva negativa per azioni proprie in portafoglio', 'A.X', 'Inserire con segno negativo'),
  G(62, 'B', 'FONDI PER RISCHI E ONERI', 63, 66), S(63, 'Trattamento di quiescenza e obblighi simili', 'B.1'), S(64, 'Imposte, anche differite', 'B.2'), S(65, 'Strumenti finanziari derivati passivi', 'B.3'), S(66, 'Altri fondi', 'B.4'),
  S(67, 'TRATTAMENTO DI FINE RAPPORTO DI LAVORO SUBORDINATO', 'C'),
  G(68, 'D', 'DEBITI', 69, 82),
  S(69, 'Obbligazioni e obbligazioni convertibili', 'D.1-2'), S(70, 'Debiti verso soci per finanziamenti', 'D.3'), S(71, 'Debiti verso banche – mutui e finanziamenti a medio/lungo termine', 'D.4'), S(72, 'Debiti verso banche – conti correnti e anticipi', 'D.4'),
  S(73, 'Debiti verso altri finanziatori (leasing, finanziarie)', 'D.5'), S(74, 'Acconti da clienti', 'D.6'), S(75, 'Debiti verso fornitori', 'D.7'), S(76, 'Debiti tributari – IVA a debito', 'D.12'), S(77, 'Debiti tributari – ritenute IRPEF', 'D.12'),
  S(78, 'Debiti tributari – imposte sul reddito (IRES/IRAP) da versare', 'D.12'), S(79, 'Altri debiti tributari (rateizzazioni, cartelle)', 'D.12'), S(80, 'Debiti verso istituti di previdenza e sicurezza sociale (INPS, INAIL)', 'D.13'),
  S(81, 'Debiti verso dipendenti (stipendi, ferie, mensilità aggiuntive)', 'D.14'), S(82, 'Altri debiti', 'D.14'),
  S(83, 'Ratei e risconti passivi', 'E', 'Inclusi i risconti su contributi in conto capitale'),
  T(84, 'TOTALE PASSIVO E PATRIMONIO NETTO', v => v[51] + v[62] + v[67] + v[68] + v[83]),
  T(85, 'DIFFERENZA ATTIVO − PASSIVO (deve essere zero)', v => v[48] - v[84], 'Se diverso da zero, controllare le voci inserite'),
  H('INFORMAZIONI INTEGRATIVE (non sommate ai totali)'),
  S(88, "Crediti esigibili oltre l'esercizio successivo (già inclusi in C.II)", '', 'Serve per gli indici di liquidità'), S(89, "Debiti esigibili oltre l'esercizio successivo (già inclusi in D)", '', 'Es. quota capitale dei mutui in scadenza oltre i 12 mesi'),
  S(90, 'Fondo svalutazione crediti (già dedotto da C.II.1)'), S(91, 'Debiti assistiti da garanzie reali (ipoteche, pegni)'), S(92, 'Impegni, garanzie e fideiussioni non risultanti dallo stato patrimoniale'),
];

export const CESPITI = [
  H('IMMOBILIZZAZIONI IMMATERIALI'),
  { row: 7, l: 'Costi di impianto e ampliamento' }, { row: 8, l: 'Diritti, concessioni, licenze, marchi (inclusi diritti e titoli PAC)' }, { row: 9, l: 'Immobilizzazioni immateriali in corso e acconti' }, { row: 10, l: 'Software e altre immobilizzazioni immateriali (migliorie su beni di terzi)' },
  { row: 11, l: 'Totale immobilizzazioni immateriali', sum: [7, 10] },
  H('IMMOBILIZZAZIONI MATERIALI'),
  { row: 13, l: 'Terreni agricoli', n: 'Non ammortizzabili: fondo = 0' }, { row: 14, l: 'Fabbricati rurali e strumentali' }, { row: 15, l: 'Impianti e macchinari (mungitura, silos, irrigazione, ...)' }, { row: 16, l: 'Macchine agricole e attrezzature (trattori, mietitrebbie, ...)' },
  { row: 17, l: 'Automezzi e autovetture' }, { row: 18, l: "Mobili, arredi e macchine d'ufficio" }, { row: 19, l: 'Bestiame da riproduzione e da reddito (fattrici)' }, { row: 20, l: 'Colture arboree pluriennali (vigneti, frutteti, impianti)' }, { row: 21, l: 'Immobilizzazioni materiali in corso e acconti' },
  { row: 22, l: 'Totale immobilizzazioni materiali', sum: [13, 21] },
  { row: 23, l: 'TOTALE IMMOBILIZZAZIONI IMMATERIALI E MATERIALI', sum: [7, 21], tot: true },
];
export const CESP_CAMPI = [['c', 'Costo storico'], ['f', 'Fondo ammortamento'], ['n', 'Valore netto'], ['a', "Acquisti dell'anno"]];

export const ROWS_IN = { ce: CE.filter(x => x.in).map(x => x.row), sp: SP.filter(x => x.in).map(x => x.row) };
const N = v => (typeof v === 'number' && isFinite(v) ? v : 0);

/** Calcola tutte le voci di un anno: ritorna { ce, sp, cesp, has } con i valori per riga. */
export function calcolaAnno(rec) {
  rec = rec || {};
  const ce = {}; const ci = rec.ce || {};
  for (const x of CE) if (x.in) ce[x.row] = N(ci[x.row]);
  for (const x of CE) if (x.grp) { let t = 0; for (let r = x.sum[0]; r <= x.sum[1]; r++) t += N(ce[r]); ce[x.row] = t; }
  for (const x of CE) if (x.tot) ce[x.row] = x.f(ce);
  const cesp = {}; const ce_ = rec.cespiti || {};
  for (const x of CESPITI) if (x.row && !x.sum) { const o = ce_[x.row] || {}; cesp[x.row] = { c: N(o.c), f: N(o.f), a: N(o.a), n: N(o.c) - N(o.f) }; }
  for (const x of CESPITI) if (x.sum) { const t = { c: 0, f: 0, a: 0, n: 0 }; for (let r = x.sum[0]; r <= x.sum[1]; r++) if (cesp[r] && !CESPITI.find(y => y.row === r && y.sum)) for (const k of 'cfan') t[k] += cesp[r][k]; cesp[x.row] = t; }
  const sp = {}; const si = rec.sp || {};
  for (const x of SP) { if (x.in) sp[x.row] = N(si[x.row]); if (x.cesp) sp[x.row] = cesp[x.cesp].n; if (x.ce) sp[x.row] = ce[x.ce]; }
  for (const x of SP) if (x.grp) { let t = 0; for (let r = x.sum[0]; r <= x.sum[1]; r++) t += N(sp[r]); sp[x.row] = t; }
  for (const x of SP) if (x.tot) sp[x.row] = x.f(sp);
  const rd = o => { for (const k in o) if (typeof o[k] === 'number') o[k] = Math.round(o[k] * 100) / 100; }; rd(ce); rd(sp); Object.values(cesp).forEach(rd);
  const has = { ce: Object.values(ci).some(v => N(v) !== 0), sp: Object.values(si).some(v => N(v) !== 0) || Object.values(ce_).some(o => o && (N(o.c) || N(o.f))), cesp: Object.values(ce_).some(o => o && (N(o.c) || N(o.f) || N(o.a))) };
  return { ce, sp, cesp, has };
}

/* ---------------- indici ---------------- */
const div = (a, b) => (b ? a / b : null);
// ogni indice: [chiave, etichetta, funzione(ctx), formato, nota]; ctx = { ce, sp, dim }
export const INDICI = [
  ['SINTESI ECONOMICA (€)', [
    ['vp', 'Valore della produzione', c => c.ce[26], 'eur', 'Totale A) del conto economico'],
    ['ricavi', 'Ricavi delle vendite e delle prestazioni', c => c.ce[7], 'eur', 'Voce A.1'],
    ['cext', 'Costi esterni (materie, servizi, godimento beni di terzi, oneri diversi)', c => c.ce[29] + c.ce[38] + c.ce[51] + c.ce[69] + c.ce[72], 'eur', 'B.6 + B.7 + B.8 + B.11 + B.14'],
    ['va', 'Valore aggiunto', c => c.ce[26] - (c.ce[29] + c.ce[38] + c.ce[51] + c.ce[69] + c.ce[72]), 'eur', 'Valore della produzione − costi esterni'],
    ['pers', 'Costo del personale', c => c.ce[56], 'eur', 'Voce B.9'],
    ['ebitda', 'EBITDA (margine operativo lordo)', c => c.I.va - c.ce[56], 'eur', 'Valore aggiunto − costo del personale'],
    ['amm', 'Ammortamenti, svalutazioni e accantonamenti', c => c.ce[62] + c.ce[70] + c.ce[71], 'eur', 'B.10 + B.12 + B.13'],
    ['ebit', 'EBIT (risultato operativo)', c => c.I.ebitda - c.I.amm, 'eur', 'EBITDA − ammortamenti e accantonamenti (= A − B)'],
    ['fin', 'Gestione finanziaria', c => c.ce[92], 'eur', 'Totale C)'],
    ['rett', 'Rettifiche di valore di attività finanziarie', c => c.ce[97], 'eur', 'Totale D)'],
    ['ante', 'Risultato prima delle imposte', c => c.I.ebit + c.I.fin + c.I.rett, 'eur', 'EBIT ± gestione finanziaria ± rettifiche'],
    ['imp', 'Imposte sul reddito', c => c.ce[100], 'eur', 'Voce 20)'],
    ['utile', "Utile (perdita) dell'esercizio", c => c.ce[105], 'eur', 'Voce 21)'],
    ['autof', 'Autofinanziamento lordo (utile + ammortamenti e accantonamenti)', c => c.I.utile + c.I.amm, 'eur', 'Misura semplificata della cassa generata dalla gestione'],
    ['contr', 'Contributi in conto esercizio (PAC e PSR)', c => c.ce[20] + c.ce[21], 'eur', 'Voci A.5 – contributi PAC e PSR'],
    ['ebitnc', 'EBIT al netto dei contributi PAC/PSR', c => c.I.ebit - c.I.contr, 'eur', 'Redditività della sola gestione produttiva, senza sostegni pubblici'],
  ]],
  ['SINTESI PATRIMONIALE (€)', [
    ['attivo', 'Totale attivo (capitale investito)', c => c.sp[48], 'eur', ''],
    ['immob', 'Immobilizzazioni', c => c.sp[27], 'eur', "Totale B) dell'attivo"],
    ['acc', 'Attivo circolante corrente (a breve)', c => c.sp[28] + (c.sp[34] - c.sp[88]) + c.sp[41] + c.sp[43], 'eur', 'Rimanenze + crediti entro 12 mesi + attività finanziarie + liquidità'],
    ['pn', 'Patrimonio netto', c => c.sp[51], 'eur', 'Voce A) del passivo'],
    ['debiti', 'Debiti totali', c => c.sp[68], 'eur', 'Voce D) del passivo'],
    ['pc', 'Passività correnti (debiti entro 12 mesi)', c => c.sp[68] - c.sp[89], 'eur', "Debiti totali − debiti esigibili oltre l'esercizio"],
    ['ccn', 'Capitale circolante netto', c => c.I.acc - c.I.pc, 'eur', 'Attivo circolante corrente − passività correnti'],
    ['pfn', 'Posizione finanziaria netta (debiti finanziari − liquidità)', c => c.sp[69] + c.sp[70] + c.sp[71] + c.sp[72] + c.sp[73] - c.sp[41] - c.sp[43], 'eur', 'Obbligazioni + soci + banche + altri finanziatori − liquidità e titoli'],
  ]],
  ['INDICI DI REDDITIVITÀ', [
    ['roe', 'ROE – redditività del capitale proprio', c => div(c.I.utile, c.I.pn), 'pct', 'Utile / patrimonio netto'],
    ['roi', 'ROI – redditività del capitale investito', c => div(c.I.ebit, c.I.attivo), 'pct', 'EBIT / totale attivo'],
    ['ros', 'ROS – redditività delle vendite', c => div(c.I.ebit, c.I.ricavi), 'pct', 'EBIT / ricavi delle vendite'],
    ['ebitdam', 'EBITDA margin', c => div(c.I.ebitda, c.I.vp), 'pct', 'EBITDA / valore della produzione'],
    ['incpers', 'Incidenza del costo del personale', c => div(c.I.pers, c.I.vp), 'pct', 'Costo del personale / valore della produzione'],
    ['incof', 'Incidenza degli oneri finanziari', c => div(c.ce[86], c.I.vp), 'pct', 'Interessi e oneri finanziari / valore della produzione'],
    ['inccontr', 'Incidenza dei contributi PAC/PSR sul valore della produzione', c => div(c.I.contr, c.I.vp), 'pct', 'Dipendenza dai sostegni pubblici'],
  ]],
  ['INDICI DI LIQUIDITÀ E DI STRUTTURA', [
    ['liqc', 'Indice di liquidità corrente', c => div(c.I.acc, c.I.pc), 'x2', 'Attivo circolante corrente / passività correnti (valore prudente ≥ 1)'],
    ['liqi', 'Indice di liquidità immediata', c => div(c.I.acc - c.sp[28], c.I.pc), 'x2', '(Attivo circolante corrente − rimanenze) / passività correnti'],
    ['mstr', 'Margine di struttura (€)', c => c.I.pn - c.I.immob, 'eur', 'Patrimonio netto − immobilizzazioni'],
    ['cop', 'Indice di copertura delle immobilizzazioni', c => div(c.I.pn + c.sp[89] + c.sp[67], c.I.immob), 'x2', '(Patrimonio netto + debiti a lungo + TFR) / immobilizzazioni'],
    ['auton', 'Indice di autonomia finanziaria', c => div(c.I.pn, c.I.attivo), 'pct', 'Patrimonio netto / totale attivo'],
    ['lev', 'Leva finanziaria (leverage)', c => div(c.I.attivo, c.I.pn), 'x2', 'Totale attivo / patrimonio netto'],
    ['pfnebitda', 'Posizione finanziaria netta / EBITDA', c => div(c.I.pfn, c.I.ebitda), 'x2', "Anni di EBITDA necessari per ripagare l'indebitamento netto"],
    ['copof', 'Copertura degli oneri finanziari', c => div(c.I.ebit, c.ce[86]), 'x2', 'EBIT / interessi e oneri finanziari'],
  ]],
  ['CICLI DI INCASSO E PAGAMENTO', [
    ['ggcli', 'Giorni medi di incasso dai clienti', c => div(c.sp[35] * 365, c.I.ricavi), 'gg', 'Crediti verso clienti / ricavi × 365 (indicativo: ricavi senza IVA)'],
    ['ggfor', 'Giorni medi di pagamento ai fornitori', c => div(c.sp[75] * 365, c.ce[29] + c.ce[38] + c.ce[51]), 'gg', 'Debiti verso fornitori / (B.6 + B.7 + B.8) × 365 (indicativo)'],
  ]],
  ['PRODUTTIVITÀ AGRICOLA', [
    ['vpha', 'Valore della produzione per ettaro (€/ha)', c => div(c.I.vp, c.dim.sau), 'eur', 'Valore della produzione / SAU'],
    ['ebitdaha', 'EBITDA per ettaro (€/ha)', c => div(c.I.ebitda, c.dim.sau), 'eur', 'EBITDA / SAU'],
    ['vpula', 'Valore della produzione per addetto (€/ULA)', c => div(c.I.vp, c.dim.ula), 'eur', 'Valore della produzione / ULA'],
    ['persula', 'Costo del personale per addetto (€/ULA)', c => div(c.I.pers, c.dim.ula), 'eur', 'Costo del personale / ULA'],
    ['ricapo', 'Ricavi per capo allevato (€/capo)', c => div(c.I.ricavi, c.dim.capi), 'eur', 'Ricavi delle vendite / capi allevati'],
  ]],
];
/** Calcola gli indici di un anno. calc = calcolaAnno(rec); dim = { sau, ula, capi }. */
export function indici(calc, dim = {}) {
  const ctx = { ce: calc.ce, sp: calc.sp, dim, I: {} };
  for (const [, voci] of INDICI) for (const [k, , f] of voci) { let v; try { v = f(ctx); } catch (e) { v = null; } ctx.I[k] = v === undefined || v === null || (typeof v === 'number' && !isFinite(v)) ? null : Math.round(v * 1e6) / 1e6; }
  return ctx.I;
}

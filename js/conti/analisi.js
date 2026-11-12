// Analisi dell'azienda da latte: parametri tecnico-economici per litro, per vacca, per ettaro e per unità di lavoro.
// I dati tecnici arrivano da soli dalla stalla, dai campi e dalle fatture; ognuno si può correggere a mano.

const div = (a, b) => (a == null || !b ? null : a / b);
const N = v => (typeof v === 'number' && isFinite(v) ? v : 0);

// Dati tecnici: [chiave, etichetta, formato, nota, origine automatica]
export const DATI = [
  ['vacche', "Vacche da latte (media presenti nell'anno)", 'n', "Media annua delle vacche presenti (in lattazione + asciutte). Con almeno 3 controlli funzionali AIA nell'anno si usa la loro media, altrimenti il registro della stalla.", 'stalla'],
  ['vacche_latt', 'di cui vacche in lattazione (media)', 'n', 'Serve per i litri per vacca in lattazione. Dai controlli AIA: presenti meno asciutte.', 'stalla'],
  ['latte_prod', "Latte prodotto nell'anno (litri)", 'n', 'Dal registro del latte della stalla. Comprende anche il latte per i vitelli. Senza registro: stima dai controlli AIA (latte medio × vacche controllate × giorni).', 'stalla'],
  ['latte_ven', 'Latte venduto (litri)', 'n', 'Dalle fatture di vendita (righe "Latte"); in mancanza, dai litri conferiti del registro.', 'fatture'],
  ['sau', 'Superficie agricola utilizzata – SAU (ha)', 'n1', 'Somma della superficie dei campi.', 'campi'],
  ['sup_for', 'di cui superficie a foraggere (ha)', 'n1', 'Campi con mais da insilato, prati, medica, erbai, sorgo.', 'campi'],
  ['ula', 'Unità di lavoro (ULA)', 'n1', 'Persone a tempo pieno, soci compresi (es. 2 soci + 1 dipendente = 3).', ''],
  ['capi', 'Capi allevati totali (media annua)', 'n', 'Tutti i bovini presenti: vacche, manze, vitelli.', 'stalla'],
  ['vitelli', 'Vitelli venduti (numero)', 'n', 'Dalle fatture di vendita (categoria "Vitelli").', 'fatture'],
  ['bovini', 'Altri bovini venduti (numero)', 'n', 'Dalle fatture di vendita (categoria "Bovini"): vacche a fine carriera, manze…', 'fatture'],
  ['lav_fam', 'Costo figurativo del lavoro familiare (€)', 'eur', 'Quanto costerebbero i soci come dipendenti (ore lavorate × tariffa). Serve per il costo "pieno" del latte.', ''],
  ['tasso_cap', 'Remunerazione figurativa del capitale proprio (%)', 'pct', 'Rendimento alternativo del patrimonio netto (es. 2–3%). Facoltativo.', ''],
];

// Parametri: [sezione, [[chiave, etichetta, funzione(c), formato, nota]]]; c = { ce, sp, I (indici), d (dati tecnici), F (fatture) }
export const PARAMETRI = [
  ['Produzione e prezzo del latte', [
    ['l_vacca', "Litri per vacca all'anno", c => div(c.d.latte * c.d.ann, c.d.vacche), 'n', 'Produttività della mandria. Frisona in Italia: in media 9.500–10.500 litri/anno nelle stalle con controlli funzionali. Anno in corso: riportato a 12 mesi.'],
    ['l_vacca_g', 'Litri per vacca al giorno', c => div(c.d.latte, c.d.vacche * c.d.gg), 'n1', "Media sull'intero anno (vacche presenti, comprese le asciutte)."],
    ['l_latt_g', 'Litri per vacca in lattazione al giorno', c => div(c.d.latte, c.d.vacche_latt * c.d.gg), 'n1', ''],
    ['prezzo_ce', 'Prezzo medio del latte da contabilità (€/l)', c => div(c.ce[8], c.d.lv), 'eur4', 'Vendita di latte del conto economico / litri venduti (se mancano, litri prodotti).'],
    ['prezzo_ft', 'Prezzo medio del latte dalle fatture, premi inclusi (€/l)', c => div(c.F.latteEuro, c.F.latteLitri), 'eur4', 'Controllo incrociato: se è molto diverso dal precedente mancano fatture o il latte è in un\'altra voce.'],
    ['ric_latte_v', 'Ricavo dal latte per vacca (€)', c => div(c.ce[8], c.d.vacche), 'eur', ''],
    ['inc_latte', 'Incidenza del latte sul valore della produzione', c => div(c.ce[8], c.ce[26]), 'pct', 'Grado di specializzazione della stalla.'],
    ['ric_carne_v', 'Ricavo da bovini e vitelli per vacca (€)', c => div(c.ce[9], c.d.vacche), 'eur', 'Vitelli e vacche a fine carriera.'],
    ['vitelli_v', 'Vitelli venduti per vacca', c => div(c.d.vitelli, c.d.vacche), 'n2', 'Indicatore indiretto di fertilità e rimonta.'],
  ]],
  ['PLV e reddito lordo standard (dalle fatture, senza PAC)', [
    ['plv', "PLV dell'anno (€)", c => c.F.plv, 'eur', 'Vendite delle fatture (latte, premi, vitelli, bovini…) più i corrispettivi, senza IVA e senza PAC: come nella pagina Reddito lordo standard.'],
    ['plv_v', 'PLV per vacca presente (€)', c => div(c.F.plv * c.d.ann, c.d.vacche), 'eur', 'Quanto rende ogni vacca in un anno, latte e carne insieme. Anno in corso: riportato a 12 mesi.'],
    ['plv_l', 'PLV per litro di latte venduto (€/l)', c => div(c.F.plv, c.d.lv), 'eur4', 'Prezzo del latte più quello che rendono vitelli e vacche vendute, per ogni litro.'],
    ['plv_ha', 'PLV per ettaro di SAU (€/ha)', c => div(c.F.plv * c.d.ann, c.d.sau), 'eur', ''],
    ['plv_ula', 'PLV per unità di lavoro (€/ULA)', c => div(c.F.plv * c.d.ann, c.d.ula), 'eur', 'Serve il numero di unità di lavoro nei dati tecnici.'],
    ['sau_v', 'Ettari di SAU per vacca', c => div(c.d.sau, c.d.vacche), 'n2', "Quanta terra c'è dietro ogni vacca: poca terra = più alimenti da comprare."],
    ['alim_plv', 'Alimenti acquistati sulla PLV', c => div(c.F.alimAcq, c.F.plv), 'pct', 'Mangimi, materie prime, integratori e foraggi comprati (categorie delle fatture) divisi per la PLV.'],
    ['sv_plv', 'Spese varie sulla PLV', c => div(c.F.sv, c.F.plv), 'pct', "Il relatore del corso indica 25% come media e 40% come allarme, ma su aziende apistiche, viticole, cerealicole e suinicole: in una stalla che compra gran parte degli alimenti è normale stare più in alto. Guarda soprattutto come cambia da un anno all'altro."],
    ['camp_plv', 'Costi della campagna sulla PLV', c => div(c.F.campagna, c.F.plv), 'pct', 'Dai centri di costo: sementi, concimi, gasolio, contoterzisti, affitti e la parte di personale e ammortamenti della campagna.'],
    ['rls_v', 'Reddito lordo standard per vacca (€)', c => div(c.F.rls * c.d.ann, c.d.vacche), 'eur', 'PLV − spese varie − affitti − salari, per vacca presente.'],
    ['rls_plv', 'Reddito lordo standard sulla PLV', c => div(c.F.rls, c.F.plv), 'pct', ''],
    ['amm_int_plv', 'Ammortamenti e interessi sulla PLV', c => (c.ce[62] + c.ce[86] ? div(c.ce[62] + c.ce[86], c.F.plv) : null), 'pct', 'Quanto della PLV serve a pagare stalle e macchine (ammortamenti) e i debiti (interessi). Serve il conto economico.'],
    ['debito_plv', 'Debiti finanziari netti sulla PLV', c => (c.I.pfn ? div(c.I.pfn, c.F.plv) : null), 'pct', 'Quanti anni di PLV servono per pagare i debiti verso le banche (100% = un anno intero). Serve lo stato patrimoniale.'],
  ]],
  ['Alimentazione e margine sul costo alimentare (IOFC)', [
    ['alim_l', 'Costo degli alimenti acquistati per litro (€/l)', c => div(c.ce[30], c.d.latte), 'eur4', 'Mangimi e foraggi comprati, per tutta la mandria (anche manze e asciutte): di solito la voce di costo più importante.'],
    ['alim_v', "Alimenti acquistati per vacca all'anno (€)", c => div(c.ce[30] * c.d.ann, c.d.vacche), 'eur', ''],
    ['alim_vg', 'Alimenti acquistati per vacca al giorno (€)', c => div(c.ce[30], c.d.vacche * c.d.gg), 'eur2', ''],
    ['alim_inc', 'Incidenza degli alimenti acquistati sul ricavo del latte', c => div(c.ce[30], c.ce[8]), 'pct', 'Quanto del ricavo del latte se ne va in alimenti comprati.'],
    ['alim_tot_l', 'Costo alimentare allargato per litro (€/l)', c => div(c.P.alim_tot, c.d.latte), 'eur4', 'Alimenti acquistati + sementi, concimi, fitofarmaci e contoterzisti: comprende il costo dei foraggi fatti in azienda.'],
    ['iofc', 'Margine del latte sugli alimenti acquistati (€)', c => c.ce[8] - c.ce[30], 'eur', 'Ricavo del latte − alimenti acquistati.'],
    ['iofc_l', 'Margine sugli alimenti acquistati per litro (€/l)', c => div(c.ce[8] - c.ce[30], c.d.latte), 'eur4', ''],
    ['iofc_vg', 'Margine sugli alimenti acquistati per vacca al giorno (€)', c => div(c.ce[8] - c.ce[30], c.d.vacche * c.d.gg), 'eur2', "Non è l'IOFC della razione: qui pesano anche manze e asciutte e mancano i foraggi aziendali. Utile per confrontare gli anni."],
    ['iofc_tot_vg', 'IOFC allargato per vacca al giorno (€)', c => div(c.ce[8] - c.P.alim_tot, c.d.vacche * c.d.gg), 'eur2', 'Ricavo del latte − costo alimentare allargato (anche i foraggi aziendali), per vacca presente al giorno.'],
    ['iofc_latt_vg', 'IOFC allargato per vacca in lattazione al giorno (€)', c => div(c.ce[8] - c.P.alim_tot, c.d.vacche_latt * c.d.gg), 'eur2', "Stessa misura riferita alle sole vacche in lattazione, come negli indici IOFC pubblicati: è un'approssimazione per eccesso del costo, perché comprende anche gli alimenti di manze e asciutte."],
  ]],
  ['Altri costi della stalla', [
    ['san', 'Sanità e riproduzione per vacca (€)', c => div(c.ce[39] + c.ce[46], c.d.vacche), 'eur', 'Veterinario, medicinali, fecondazione, controlli funzionali.'],
    ['en_l', 'Energia elettrica, acqua e gas per litro (€/l)', c => div(c.ce[42], c.d.latte), 'eur4', 'Mungitura, refrigerazione, pompe, illuminazione.'],
    ['mecc', 'Costo della meccanizzazione (€)', c => c.ce[34] + c.ce[41] + c.ce[54] + c.ce[40] + c.ce[65], 'eur', 'Carburanti + manutenzioni + noleggi + contoterzisti + ammortamento macchine.'],
    ['mecc_ha', 'Meccanizzazione per ettaro (€/ha)', c => div(c.ce[34] + c.ce[41] + c.ce[54] + c.ce[40] + c.ce[65], c.d.sau), 'eur', ''],
    ['mecc_l', 'Meccanizzazione per litro (€/l)', c => div(c.ce[34] + c.ce[41] + c.ce[54] + c.ce[40] + c.ce[65], c.d.latte), 'eur4', ''],
    ['rimonta', 'Acquisto di bestiame per vacca (€)', c => div(c.ce[35], c.d.vacche), 'eur', 'Rimonta acquistata: alta = poca rimonta interna.'],
    ['pers_l', 'Costo del personale per litro (€/l)', c => div(c.ce[56], c.d.latte), 'eur4', 'Solo dipendenti: il lavoro dei soci è nel costo figurativo.'],
    ['aff_ha', 'Affitti dei terreni per ettaro (€/ha)', c => div(c.ce[52], c.d.sau), 'eur', ''],
  ]],
  ['Costo di produzione del latte e prezzo di pareggio', [
    ['costi_tot', 'Costi totali (costi della produzione + oneri finanziari) (€)', c => c.ce[78] + c.ce[86], 'eur', 'Totale B) + interessi e oneri finanziari.'],
    ['altri_ric', 'Ricavi diversi dal latte (€)', c => c.ce[26] - c.ce[8] - c.ce[20] - c.ce[21], 'eur', 'Valore della produzione − latte − contributi PAC e PSR.'],
    ['costo_netto', 'Costo netto del latte (€)', c => c.ce[78] + c.ce[86] - (c.ce[26] - c.ce[8] - c.ce[20] - c.ce[21]), 'eur', 'Costi totali meno i ricavi delle altre produzioni: il costo che deve coprire il latte.'],
    ['costo_l', 'Costo di produzione per litro (€/l)', c => div(c.P.costo_netto, c.d.lv), 'eur4', '= prezzo del latte di pareggio senza contributi.'],
    ['pareggio_contr', 'Prezzo di pareggio con i contributi PAC/PSR (€/l)', c => div(c.P.costo_netto - c.ce[20] - c.ce[21], c.d.lv), 'eur4', 'Prezzo minimo del latte che, con i contributi, copre tutti i costi contabili.'],
    ['margine_l', 'Margine per litro: prezzo − costo di produzione (€/l)', c => (c.P.prezzo_ce == null || c.P.costo_l == null ? null : c.P.prezzo_ce - c.P.costo_l), 'eur4', 'Positivo: il prezzo copre i costi anche senza contributi.'],
    ['costo_pieno', 'Costo pieno per litro, con lavoro e capitale propri (€/l)', c => div(c.P.costo_netto + N(c.d.lav_fam) + (N(c.d.tasso_cap) ? N(c.d.tasso_cap) * c.sp[51] : 0), c.d.lv), 'eur4', "Aggiunge il compenso figurativo dei soci e la remunerazione del capitale proprio: misura se l'azienda remunera davvero lavoro e capitale della famiglia."],
    ['margine_pieno', 'Margine per litro sul costo pieno, contributi inclusi (€/l)', c => (c.P.prezzo_ce == null || c.P.costo_pieno == null ? null : c.P.prezzo_ce - c.P.costo_pieno + (div(c.ce[20] + c.ce[21], c.d.lv) || 0)), 'eur4', ''],
  ]],
  ["Dall'IOFC al reddito netto, per vacca in lattazione al giorno (metodo Lari, Boldrin, Riuzzi)", [
    ['rn_iofc', 'IOFC allargato (€/vacca in lattazione/giorno)', c => c.P.iofc_latt_vg, 'eur2', 'Ricavo del latte − costo alimentare allargato, diviso le vacche munte e i giorni.'],
    ['rn_man', 'Manodopera, con il lavoro dei soci (€/vacca in lattazione/giorno)', c => div(c.ce[56] + N(c.d.lav_fam), c.d.vl_gg), 'eur2', 'Dipendenti + costo figurativo del lavoro familiare (se inserito nei dati tecnici).'],
    ['rn_amm', 'Ammortamenti (€/vacca in lattazione/giorno)', c => div(c.ce[62], c.d.vl_gg), 'eur2', ''],
    ['rn_en', 'Energia elettrica, acqua e gas (€/vacca in lattazione/giorno)', c => div(c.ce[42], c.d.vl_gg), 'eur2', 'Nel metodo comprende anche il gasolio della stalla (carro unifeed), non quello dei campi.'],
    ['rn_san', 'Veterinario e medicinali (€/vacca in lattazione/giorno)', c => div(c.ce[39], c.d.vl_gg), 'eur2', ''],
    ['rn_manut', 'Manutenzioni (€/vacca in lattazione/giorno)', c => div(c.ce[41], c.d.vl_gg), 'eur2', 'Nel conto economico ci sono anche quelle dei mezzi di campagna.'],
    ['rn_fin', 'Oneri finanziari e assicurazioni (€/vacca in lattazione/giorno)', c => div(c.ce[86] + c.ce[43], c.d.vl_gg), 'eur2', ''],
    ['rn_entr', 'Entrate non dal latte (€/vacca in lattazione/giorno)', c => div(c.ce[26] - c.ce[8], c.d.vl_gg), 'eur2', 'Vitelli e vacche vendute, contributi PAC e PSR, altre vendite e variazioni delle scorte.'],
    ['rn', 'Reddito netto (€/vacca in lattazione/giorno)', c => div(c.ce[105] - N(c.d.lav_fam), c.d.vl_gg), 'eur2', 'Utile meno il lavoro dei soci: quanto resta per vacca munta al giorno.'],
    ['rn_nfc', 'Costi non alimentari totali – NFC (€/vacca in lattazione/giorno)', c => (c.P.rn_iofc == null || c.P.rn == null ? null : c.P.rn_iofc + c.P.rn_entr - c.P.rn), 'eur2', 'Ricavato da: reddito netto = IOFC − NFC + entrate non dal latte. Comprende tutti gli altri costi, anche quelli dei campi.'],
  ]],
  ['Redditività per unità produttiva', [
    ['mol_l', 'EBITDA per litro (€/l)', c => div(c.I.ebitda, c.d.latte), 'eur4', 'Margine operativo lordo dagli indici.'],
    ['mol_v', 'EBITDA per vacca (€)', c => div(c.I.ebitda, c.d.vacche), 'eur', ''],
    ['utile_l', 'Utile per litro (€/l)', c => div(c.ce[105], c.d.latte), 'eur4', ''],
    ['utile_v', 'Utile per vacca (€)', c => div(c.ce[105], c.d.vacche), 'eur', ''],
    ['va_ula', 'Valore aggiunto per unità di lavoro (€/ULA)', c => div(c.I.va, c.d.ula), 'eur', 'Ricchezza prodotta da ciascuna unità di lavoro: la produttività del lavoro.'],
    ['mol_ula', 'EBITDA per unità di lavoro (€/ULA)', c => div(c.I.ebitda, c.d.ula), 'eur', ''],
    ['red_ula', 'Utile per unità di lavoro (€/ULA)', c => div(c.ce[105], c.d.ula), 'eur', 'In una società semplice è il reddito che remunera lavoro e capitale dei soci.'],
    ['contr_v', 'Contributi PAC e PSR per vacca (€)', c => div(c.ce[20] + c.ce[21], c.d.vacche), 'eur', ''],
    ['contr_utile', "Peso dei contributi sull'utile", c => div(c.ce[20] + c.ce[21], c.ce[105]), 'pct', 'Oltre il 100%: senza contributi l\'azienda sarebbe in perdita.'],
  ]],
  ['Intensità produttiva e carico di bestiame', [
    ['vacche_ha', 'Vacche per ettaro di SAU', c => div(c.d.vacche, c.d.sau), 'n2', ''],
    ['vacche_haf', 'Vacche per ettaro di superficie foraggera', c => div(c.d.vacche, c.d.sup_for), 'n2', "Carico di bestiame: più è alto, più l'alimentazione dipende dagli acquisti."],
    ['latte_ha', 'Latte per ettaro di superficie foraggera (l/ha)', c => div(c.d.latte, c.d.sup_for), 'n', ''],
    ['vacche_ula', 'Vacche per unità di lavoro', c => div(c.d.vacche, c.d.ula), 'n1', ''],
    ['latte_ula', 'Latte per unità di lavoro (l/ULA)', c => div(c.d.latte, c.d.ula), 'n', ''],
  ]],
  ['Indebitamento rapportato alla stalla', [
    ['pfn_v', 'Debito finanziario netto per vacca (€)', c => (c.I.pfn ? div(c.I.pfn, c.d.vacche) : null), 'eur', 'Misura usata dalle banche per le aziende da latte.'],
    ['pfn_l', 'Debito finanziario netto per litro (€/l)', c => (c.I.pfn ? div(c.I.pfn, c.d.latte) : null), 'eur4', ''],
    ['of_l', 'Oneri finanziari per litro (€/l)', c => div(c.ce[86], c.d.latte), 'eur4', ''],
    ['pn_v', 'Patrimonio netto per vacca (€)', c => div(c.sp[51], c.d.vacche), 'eur', ''],
  ]],
];

/** Calcola i parametri. d = dati tecnici effettivi (già scelti tra automatici e inseriti). */
export function calcolaParametri(calc, I, d, F) {
  const dd = Object.assign({}, d); dd.latte = d.latte_prod || d.latte_ven || null; dd.lv = d.latte_ven || d.latte_prod || null;
  // giorni del periodo: l'anno in corso arriva fino a oggi, quindi le medie al giorno non si dividono per 365
  dd.gg = d.giorni || 365; dd.ann = dd.gg < 365 ? 365 / dd.gg : 1; dd.vl_gg = d.vacche_latt ? d.vacche_latt * dd.gg : null;
  // senza conto economico (o stato patrimoniale) i parametri che li usano restano vuoti
  const vuoto = new Proxy({}, { get: () => NaN });
  const Iv = calc.has.ce ? I : new Proxy({}, { get: (o, k) => (['pfn', 'pn', 'attivo'].includes(k) && calc.has.sp ? I[k] : NaN) });
  const c = { ce: calc.has.ce ? calc.ce : vuoto, sp: calc.has.sp ? calc.sp : vuoto, I: Iv, d: dd, F: F || {}, P: {} };
  c.P.alim_tot = c.ce[30] + c.ce[31] + c.ce[32] + c.ce[33] + c.ce[40]; // alimenti acquistati + colture (anche i foraggi aziendali)
  for (const [, voci] of PARAMETRI) for (const [k, , f] of voci) { let v; try { v = f(c); } catch (e) { v = null; } c.P[k] = typeof v === 'number' && isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; }
  return c.P;
}

// Analisi dell'azienda da latte: parametri tecnico-economici per litro, per vacca, per ettaro e per unità di lavoro.
// I dati tecnici arrivano da soli dalla stalla, dai campi e dalle fatture; ognuno si può correggere a mano.

const div = (a, b) => (a == null || !b ? null : a / b);
const N = v => (typeof v === 'number' && isFinite(v) ? v : 0);

// Dati tecnici: [chiave, etichetta, formato, nota, origine automatica]
export const DATI = [
  ['vacche', "Vacche da latte (media presenti nell'anno)", 'n', 'Media annua delle vacche presenti (in lattazione + asciutte).', 'stalla'],
  ['vacche_latt', 'di cui vacche in lattazione (media)', 'n', 'Serve per i litri per vacca in lattazione.', 'stalla'],
  ['latte_prod', "Latte prodotto nell'anno (litri)", 'n', 'Dal registro del latte della stalla. Comprende anche il latte per i vitelli.', 'stalla'],
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
    ['l_vacca', "Litri per vacca all'anno", c => div(c.d.latte, c.d.vacche), 'n', 'Produttività della mandria. Frisona in Italia: in media 9.500–10.500 litri/anno nelle stalle con controlli funzionali.'],
    ['l_vacca_g', 'Litri per vacca al giorno', c => div(c.d.latte, c.d.vacche * 365), 'n1', "Media sull'intero anno (vacche presenti, comprese le asciutte)."],
    ['l_latt_g', 'Litri per vacca in lattazione al giorno', c => div(c.d.latte, c.d.vacche_latt * 365), 'n1', ''],
    ['prezzo_ce', 'Prezzo medio del latte da contabilità (€/l)', c => div(c.ce[8], c.d.latte_ven), 'eur4', 'Vendita di latte del conto economico / litri venduti.'],
    ['prezzo_ft', 'Prezzo medio del latte dalle fatture, premi inclusi (€/l)', c => div(c.F.latteEuro, c.F.latteLitri), 'eur4', 'Controllo incrociato: se è molto diverso dal precedente mancano fatture o il latte è in un\'altra voce.'],
    ['ric_latte_v', 'Ricavo dal latte per vacca (€)', c => div(c.ce[8], c.d.vacche), 'eur', ''],
    ['inc_latte', 'Incidenza del latte sul valore della produzione', c => div(c.ce[8], c.ce[26]), 'pct', 'Grado di specializzazione della stalla.'],
    ['ric_carne_v', 'Ricavo da bovini e vitelli per vacca (€)', c => div(c.ce[9], c.d.vacche), 'eur', 'Vitelli e vacche a fine carriera.'],
    ['vitelli_v', 'Vitelli venduti per vacca', c => div(c.d.vitelli, c.d.vacche), 'n2', 'Indicatore indiretto di fertilità e rimonta.'],
  ]],
  ['Alimentazione e margine sul costo alimentare (IOFC)', [
    ['alim_l', 'Costo alimentare per litro (€/l)', c => div(c.ce[30], c.d.latte), 'eur4', 'Mangimi e foraggi acquistati: di solito la voce di costo più importante.'],
    ['alim_v', "Costo alimentare per vacca all'anno (€)", c => div(c.ce[30], c.d.vacche), 'eur', ''],
    ['alim_vg', 'Costo alimentare per vacca al giorno (€)', c => div(c.ce[30], c.d.vacche * 365), 'eur2', ''],
    ['alim_inc', 'Incidenza del costo alimentare sul ricavo del latte', c => div(c.ce[30], c.ce[8]), 'pct', 'Quanto del ricavo del latte se ne va in alimenti acquistati.'],
    ['iofc', 'Margine sul costo alimentare – IOFC (€)', c => c.ce[8] - c.ce[30], 'eur', 'Ricavo del latte − alimenti acquistati (Income Over Feed Cost).'],
    ['iofc_l', 'IOFC per litro (€/l)', c => div(c.ce[8] - c.ce[30], c.d.latte), 'eur4', ''],
    ['iofc_vg', 'IOFC per vacca al giorno (€)', c => div(c.ce[8] - c.ce[30], c.d.vacche * 365), 'eur2', "L'indicatore più usato per confrontare la gestione alimentare tra stalle e tra anni."],
    ['alim_tot_l', 'Costo alimentare allargato per litro (€/l)', c => div(c.ce[30] + c.ce[31] + c.ce[32] + c.ce[33] + c.ce[40], c.d.latte), 'eur4', 'Alimenti acquistati + sementi, concimi, fitofarmaci e contoterzisti dei foraggi.'],
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
    ['costo_l', 'Costo di produzione per litro (€/l)', c => div(c.P.costo_netto, c.d.latte_ven), 'eur4', '= prezzo del latte di pareggio senza contributi.'],
    ['pareggio_contr', 'Prezzo di pareggio con i contributi PAC/PSR (€/l)', c => div(c.P.costo_netto - c.ce[20] - c.ce[21], c.d.latte_ven), 'eur4', 'Prezzo minimo del latte che, con i contributi, copre tutti i costi contabili.'],
    ['margine_l', 'Margine per litro: prezzo − costo di produzione (€/l)', c => (c.P.prezzo_ce == null || c.P.costo_l == null ? null : c.P.prezzo_ce - c.P.costo_l), 'eur4', 'Positivo: il prezzo copre i costi anche senza contributi.'],
    ['costo_pieno', 'Costo pieno per litro, con lavoro e capitale propri (€/l)', c => div(c.P.costo_netto + N(c.d.lav_fam) + N(c.d.tasso_cap) * c.sp[51], c.d.latte_ven), 'eur4', "Aggiunge il compenso figurativo dei soci e la remunerazione del capitale proprio: misura se l'azienda remunera davvero lavoro e capitale della famiglia."],
    ['margine_pieno', 'Margine per litro sul costo pieno, contributi inclusi (€/l)', c => (c.P.prezzo_ce == null || c.P.costo_pieno == null ? null : c.P.prezzo_ce - c.P.costo_pieno + (div(c.ce[20] + c.ce[21], c.d.latte_ven) || 0)), 'eur4', ''],
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
    ['pfn_v', 'Debito finanziario netto per vacca (€)', c => div(c.I.pfn, c.d.vacche), 'eur', 'Misura usata dalle banche per le aziende da latte.'],
    ['pfn_l', 'Debito finanziario netto per litro (€/l)', c => div(c.I.pfn, c.d.latte), 'eur4', ''],
    ['of_l', 'Oneri finanziari per litro (€/l)', c => div(c.ce[86], c.d.latte), 'eur4', ''],
    ['pn_v', 'Patrimonio netto per vacca (€)', c => div(c.sp[51], c.d.vacche), 'eur', ''],
  ]],
];

/** Calcola i parametri. d = dati tecnici effettivi (già scelti tra automatici e inseriti). */
export function calcolaParametri(calc, I, d, F) {
  const dd = Object.assign({}, d); dd.latte = d.latte_prod || d.latte_ven || null;
  // senza conto economico (o stato patrimoniale) i parametri che li usano restano vuoti
  const vuoto = new Proxy({}, { get: () => NaN });
  const Iv = calc.has.ce ? I : new Proxy({}, { get: (o, k) => (['pfn', 'pn', 'attivo'].includes(k) && calc.has.sp ? I[k] : NaN) });
  const c = { ce: calc.has.ce ? calc.ce : vuoto, sp: calc.has.sp ? calc.sp : vuoto, I: Iv, d: dd, F: F || {}, P: {} };
  for (const [, voci] of PARAMETRI) for (const [k, , f] of voci) { let v; try { v = f(c); } catch (e) { v = null; } c.P[k] = typeof v === 'number' && isFinite(v) ? Math.round(v * 1e6) / 1e6 : null; }
  return c.P;
}

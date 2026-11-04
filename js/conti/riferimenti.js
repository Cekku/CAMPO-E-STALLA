// Valori di riferimento di altre aziende da latte (dati pubblici), per il confronto nell'analisi della stalla.
// Ogni voce: { media, min, max, anni: { anno: media }, meglio: 'alto' | 'basso' | '', f: [chiavi delle fonti], n: nota }.
// Sono medie di fonti diverse (anni, campioni, metodi): servono a capire l'ordine di grandezza, non sono un giudizio preciso.
// Ricerca del 4/11/2026: dettagli e calcoli in "RICERCA-CONTI-STALLA.md" (fuori dal repository).

export const FONTI = {
  CA: { breve: 'Campiotti, bilanci 2023', testo: 'M. Campiotti, "Progetto Allevamento Futuro", bilanci 2023 di stalle da latte del Nord Italia (latte alimentare e DOP): mediana, fascia tra il 25% e il 75% delle aziende (UNIMI 2025, FIDAF 2024).' },
  AIA: { breve: 'AIA 2024/25', testo: 'AIA, bollettino dei controlli funzionali 2024/25, Frisona: medie di Friuli Venezia Giulia, Veneto e Lombardia.' },
  CLAL: { breve: 'CLAL Lombardia', testo: 'CLAL, prezzo medio annuo del latte alla stalla in Lombardia, senza IVA e senza premi.' },
  ISM: { breve: 'Ismea 2024', testo: 'Ismea, costo di produzione del latte 2024 (Lombardia, latte alimentare).' },
  CREA: { breve: 'CREA-RICA', testo: 'CREA-RICA, "Latte italiano. Quanto costa produrre un litro di latte" (2019-2021, aziende di pianura) e RICA Veneto 2023 (bovini da latte).' },
  B: { breve: 'Boldrin e altri, Tecnozoo (2016)', testo: 'L. Lari, P. Boldrin, S. Riuzzi (veterinari del servizio tecnico Tecnozoo), "Redditività nell’allevamento da latte: dall’IOFC al reddito netto", Ex-Dairy Press, 3 parti, circa 2016. Valori per vacca in lattazione al giorno, con prezzi di allora: oggi i costi sono più alti.' },
  TZ: { breve: 'Tecnozoo (2022)', testo: 'Tecnozoo, rivista IOFC 2022: esempio 37,5 l × 0,45 €/l − 7,6 € = 9,3 € per vacca munta al giorno; fascia 6,75–10,1 €.' },
  PSU: { breve: 'Penn State', testo: 'Penn State Extension, "Managing income over feed costs": alimentazione sotto il 40% del ricavo del latte = buono, sopra il 60% = scarso.' },
};

export const RIF = {
  // produzione e prezzo
  l_vacca: { media: 10960, min: 10120, max: 11710, meglio: 'alto', f: ['CA', 'AIA'], n: 'Frisona controllata AIA nel Nord: circa 10.900 litri.' },
  prezzo_ce: { anni: { 2023: 0.528, 2024: 0.530, 2025: 0.591, 2026: 0.484 }, meglio: 'alto', f: ['CLAL'], n: 'Il riferimento è senza premi: con i premi qualità il tuo prezzo è di solito 1–3 centesimi più alto. Il 2026 è la media gennaio–settembre.' },
  // alimentazione e IOFC
  alim_l: { media: 0.259, min: 0.22, max: 0.306, meglio: 'basso', f: ['CA'], n: 'Alimenti acquistati: 68% di un costo alimentare di 38,0 €/100 l.' },
  alim_tot_l: { media: 0.38, min: 0.348, max: 0.409, meglio: 'basso', f: ['CA'], n: 'Costo alimentare totale, con i foraggi aziendali valutati: il tuo valore allargato di solito è più basso, perché non comprende gasolio, lavoro e affitti dei campi.' },
  alim_inc: { media: 0.46, meglio: 'basso', f: ['CA', 'PSU'], n: 'Alimenti acquistati sul prezzo del latte (25,9 su 56,1 €/100 l).' },
  iofc_tot_vg: { media: 5.5, min: 4.44, max: 6.67, meglio: 'alto', f: ['CA'], n: 'IOFC per vacca presente: 2.007 € all\'anno per vacca.' },
  iofc_latt_vg: { media: 9.3, min: 6.75, max: 10.1, meglio: 'alto', f: ['TZ'] },
  // altri costi
  san: { media: 99, min: 94, max: 121, meglio: 'basso', f: ['CA'], n: 'Solo medicinali: il tuo valore comprende anche fecondazione e controlli funzionali.' },
  en_l: { media: 0.015, min: 0.012, max: 0.018, meglio: 'basso', f: ['CA'] },
  // costo di produzione
  pareggio_contr: { media: 0.497, min: 0.462, max: 0.547, meglio: 'basso', f: ['CA'], n: 'Prezzo del latte che copre i costi (2023).' },
  costo_pieno: { media: 0.518, min: 0.458, max: 0.583, meglio: 'basso', f: ['CA', 'ISM', 'CREA'] },
  // redditività
  utile_v: { media: 712, min: 238, max: 1099, meglio: 'alto', f: ['CA'] },
  red_ula: { media: 46440, min: 45000, max: 47880, meglio: 'alto', f: ['CREA'] },
  contr_v: { media: 240, min: 220, max: 259, meglio: '', f: ['CREA'] },
  // intensità
  vacche_ha: { media: 1.96, min: 1.49, max: 2.9, meglio: '', f: ['CA', 'CREA'] },
  vacche_ula: { media: 33.4, min: 30, max: 36.8, meglio: 'alto', f: ['CA', 'CREA'] },
  latte_ula: { media: 315000, min: 206000, max: 424000, meglio: 'alto', f: ['CA', 'CREA'] },
  // dall'IOFC al reddito netto (€/vacca in lattazione/giorno, valori di circa il 2016: oggi i costi sono più alti)
  rn_iofc: { media: 9.3, min: 6.75, max: 10.1, meglio: 'alto', f: ['TZ'] },
  rn_man: { min: 1.7, max: 2.5, meglio: 'basso', f: ['B'] },
  rn_amm: { min: 0.5, max: 1.5, meglio: 'basso', f: ['B'] },
  rn_en: { min: 0.3, max: 0.5, meglio: 'basso', f: ['B'] },
  rn_san: { min: 0.2, max: 0.6, meglio: 'basso', f: ['B'] },
  rn_manut: { min: 0.2, max: 0.4, meglio: 'basso', f: ['B'] },
  rn_fin: { min: 0.15, max: 0.3, meglio: 'basso', f: ['B'] },
  rn_nfc: { min: 4.55, max: 7.5, meglio: 'basso', f: ['B'], n: 'Nel metodo il totale non comprende i costi dei campi, che qui invece ci sono.' },
};

// indici della mandria (pagina Stalla): Frisona, controlli funzionali AIA 2024/25, Friuli Venezia Giulia, Veneto e Lombardia
export const RIF_MANDRIA = { etaPrimoParto: 25.3, interparto: 431, giorniAperti: 151, uscite: 31 };

/** Riferimento di una voce per l'anno: { media, min, max } (i prezzi cambiano ogni anno). */
export function rifAnno(k, y) {
  const r = RIF[k]; if (!r) return null;
  if (!r.anni) return r;
  const v = r.anni[y]; return v == null ? null : Object.assign({}, r, { media: v });
}

/** Posizione di un valore rispetto al riferimento: { pos: -1 sotto | 0 in linea | 1 sopra, esito: 'ok' | 'ko' | '' }. */
export function confronta(k, v, y) {
  const r = rifAnno(k, y); if (!r || v == null || !isFinite(v)) return null;
  const lo = r.min ?? r.media * 0.95, hi = r.max ?? r.media * 1.05;
  const pos = v < lo ? -1 : v > hi ? 1 : 0;
  const verso = r.meglio === 'alto' ? 1 : r.meglio === 'basso' ? -1 : 0;
  return { pos, esito: !pos ? 'ok' : !verso ? '' : pos * verso > 0 ? 'ok' : 'ko' };
}

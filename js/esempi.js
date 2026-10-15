// Azienda di prova: ogni registrazione è contrassegnata "esempio" e si elimina dalle Impostazioni
import { today, addDays, uid } from './util.js';
import { areaHa } from './geo.js';

function rect(lon, lat, wM, hM, deg) {
  const k = 111320 * Math.cos(lat * Math.PI / 180), a = deg * Math.PI / 180;
  const pts = [[-wM / 2, -hM / 2], [wM / 2, -hM / 2], [wM / 2, hM / 2], [-wM / 2, hM / 2]].map(([x, y]) => { const rx = x * Math.cos(a) - y * Math.sin(a), ry = x * Math.sin(a) + y * Math.cos(a); return [+(lon + rx / k).toFixed(7), +(lat + ry / 111320).toFixed(7)]; });
  return { type: 'Polygon', coordinates: [[...pts, pts[0]]] };
}
const ha = g => Math.round(areaHa(g) * 10000) / 10000;

export function exampleRows() {
  const T = today(); const d = n => addDays(T, -n); const Y = +T.slice(0, 4);
  const ids = {}; const id = k => (ids[k] = ids[k] || 'ex-' + k + '-' + uid().slice(0, 8));
  const rows = []; const add = (col, k, data) => rows.push({ col, id: col === 'latte' ? k : id(k), data: Object.assign(data, { esempio: true }) });
  const g1 = rect(9.4712, 45.2790, 420, 290, 12), g2 = rect(9.4772, 45.2768, 260, 260, 12), g3 = rect(9.4668, 45.2752, 380, 240, 10), g4 = rect(9.4740, 45.2822, 230, 170, 14);
  add('campi', 'c1', { nome: 'Campo della Roggia', geom: g1, superficie: ha(g1), coltura: 'Mais trinciato', varieta: 'Classe FAO 600', colture: [{ anno: Y, coltura: 'Mais trinciato', varieta: 'Classe FAO 600' }, { anno: Y - 1, coltura: 'Frumento tenero' }, { anno: Y - 2, coltura: 'Soia' }], irriguo: 'Sì', conduzione: 'Proprietà', comune: 'Esempio', catasto: 'Fg. 8 mapp. 112, 113' });
  add('campi', 'c2', { nome: 'Brolo', geom: g2, superficie: ha(g2), coltura: 'Erba medica', varieta: 'Secondo anno', colture: [{ anno: Y, coltura: 'Erba medica' }, { anno: Y - 1, coltura: 'Erba medica' }, { anno: Y - 2, coltura: 'Orzo' }], irriguo: 'No', conduzione: 'Affitto', comune: 'Esempio' });
  add('campi', 'c3', { nome: 'Pradone', geom: g3, superficie: ha(g3), coltura: 'Frumento tenero', varieta: 'Panificabile superiore', colture: [{ anno: Y, coltura: 'Frumento tenero', varieta: 'Panificabile superiore', semina: d(3) }, { anno: Y - 1, coltura: 'Mais da granella' }], irriguo: 'No', conduzione: 'Proprietà', comune: 'Esempio', catasto: 'Fg. 11 mapp. 40' });
  add('campi', 'c4', { nome: 'Cascinetta', geom: g4, superficie: ha(g4), coltura: 'Soia', irriguo: 'Sì', conduzione: 'Comodato', comune: 'Esempio' });
  add('prodotti', 'p1', { nome: 'Urea 46%', categoria: 'Concime', unita: 'q', prezzo: 58, giacenzaIniziale: 60, scortaMin: 20, fornitore: 'Consorzio agrario' });
  add('prodotti', 'p2', { nome: 'Seme frumento conciato', categoria: 'Seme', unita: 'kg', prezzo: 0.62, giacenzaIniziale: 2500 });
  add('prodotti', 'p3', { nome: 'Erbicida pre-emergenza', categoria: 'Diserbante', unita: 'l', prezzo: 24, giacenzaIniziale: 30, scortaMin: 10, carenza: 60, nReg: '00000', scadenza: addDays(T, 45) });
  add('prodotti', 'p4', { nome: 'Farina di mais', categoria: 'Mangime', unita: 'kg', prezzo: 0.30, giacenzaIniziale: 4000, scortaMin: 1500 });
  add('prodotti', 'p5', { nome: 'Nucleo proteico soia 44', categoria: 'Mangime', unita: 'kg', prezzo: 0.52, giacenzaIniziale: 900, scortaMin: 500 });
  add('prodotti', 'p6', { nome: 'Silomais trincea 1', categoria: 'Foraggio', unita: 'kg', prezzo: 0.045, giacenzaIniziale: 180000 });
  add('prodotti', 'p7', { nome: 'Antibiotico intramammario', categoria: 'Farmaco veterinario', unita: 'dosi', prezzo: 6.5, giacenzaIniziale: 24, scortaMin: 8, sospLatte: 5, sospCarne: 7 });
  add('mezzi', 'm1', { nome: 'Trattore 140 CV', tipo: 'Trattore', modello: 'Esempio', targa: 'AB123C', anno: 2017, oreIniziali: 6100, costoOra: 42, intervallo: 500, oreUltimoTagliando: 5650, scadenzaRevisione: addDays(T, 22) });
  add('mezzi', 'm2', { nome: 'Carro miscelatore 14 m³', tipo: 'Carro miscelatore', anno: 2019, oreIniziali: 3800, costoOra: 30, intervallo: 250, oreUltimoTagliando: 3600 });
  add('manutenzioni', 'mn1', { mezzoId: id('m1'), data: d(180), tipo: 'Tagliando', ore: 5650, costo: 780, descrizione: 'Olio motore, filtri, ingrassaggio', officina: 'Officina meccanica' });
  add('operazioni', 'o1', { data: d(40), campoId: id('c1'), tipo: 'Raccolta', raccolto: 620, prezzoVendita: 42, costoExtra: 2600, operatore: 'Contoterzista', note: 'Trinciatura a contoterzi' });
  add('operazioni', 'o2', { data: d(12), campoId: id('c2'), tipo: 'Sfalcio', raccolto: 18, prezzoVendita: 160, mezzoId: id('m1'), ore: 6, operatore: 'Marco' });
  add('operazioni', 'o3', { data: d(6), campoId: id('c3'), tipo: 'Lavorazione terreno', mezzoId: id('m1'), ore: 9, operatore: 'Marco', note: 'Erpicatura' });
  add('operazioni', 'o4', { data: d(3), campoId: id('c3'), tipo: 'Semina', prodottoId: id('p2'), dose: 200, quantita: 1840, mezzoId: id('m1'), ore: 5, operatore: 'Marco' });
  add('operazioni', 'o5', { data: d(1), campoId: id('c3'), tipo: 'Diserbo', prodottoId: id('p3'), dose: 1.5, quantita: 13.8, avversita: 'Infestanti graminacee e dicotiledoni', fase: 'Pre-emergenza', meteo: 'Sereno, vento debole', mezzoId: id('m1'), ore: 3, operatore: 'Marco' });
  add('movimenti', 'mv1', { data: d(3), prodottoId: id('p2'), tipo: 'Scarico', quantita: 1840, note: 'Semina · Pradone', opId: id('o4') });
  add('movimenti', 'mv2', { data: d(1), prodottoId: id('p3'), tipo: 'Scarico', quantita: 13.8, note: 'Diserbo · Pradone', opId: id('o5') });
  add('capi', 'k1', { matricola: 'IT012000845121', nome: 'Stella', razza: 'Frisona', sesso: 'F', nascita: '2020-02-11', gruppo: 'Alta produzione', lattazioniPrecedenti: 3 });
  add('capi', 'k2', { matricola: 'IT012000845377', nome: 'Luna', razza: 'Frisona', sesso: 'F', nascita: '2021-09-03', gruppo: 'Alta produzione', lattazioniPrecedenti: 1 });
  add('capi', 'k3', { matricola: 'IT012000846010', nome: 'Mora', razza: 'Bruna', sesso: 'F', nascita: '2019-12-20', gruppo: 'Asciutta', lattazioniPrecedenti: 3 });
  add('capi', 'k4', { matricola: 'IT012000847222', nome: 'Perla', razza: 'Frisona', sesso: 'F', nascita: '2022-05-14', gruppo: 'Media produzione', lattazioniPrecedenti: 1 });
  add('capi', 'k5', { matricola: 'IT012000851004', nome: 'Nuvola', razza: 'Frisona', sesso: 'F', nascita: addDays(T, -560), gruppo: 'Manze' });
  add('capi', 'k6', { matricola: 'IT012000853310', nome: 'Gaia', razza: 'Frisona', sesso: 'F', nascita: addDays(T, -118), gruppo: 'Vitelle' });
  const ev = (k, data) => add('eventi', k, data);
  ev('e1', { capoId: id('k1'), data: d(84), tipo: 'Parto', facilita: 'Normale', vitelloSesso: 'M' });
  ev('e2', { capoId: id('k1'), data: d(34), tipo: 'Fecondazione', metodoFec: 'Inseminazione artificiale', toro: 'Toro esempio A' });
  ev('e3a', { capoId: id('k1'), data: d(40), tipo: 'Controllo funzionale', kg: 44.2, grasso: 3.7, proteine: 3.28, cellule: 120 });
  ev('e3', { capoId: id('k1'), data: d(9), tipo: 'Controllo funzionale', kg: 41.5, grasso: 3.82, proteine: 3.35, cellule: 140 });
  ev('e5', { capoId: id('k2'), data: d(56), tipo: 'Parto', facilita: 'Assistito', vitelloSesso: 'M' });
  ev('e6', { capoId: id('k2'), data: d(2), tipo: 'Trattamento sanitario', prodottoId: id('p7'), quantita: 2, motivo: 'Mastite clinica posteriore destro', sospLatte: 5, sospCarne: 7, ricetta: '0000000', veterinario: 'Dott. Esempio' });
  ev('e7', { capoId: id('k3'), data: d(350), tipo: 'Parto', facilita: 'Normale', vitelloSesso: 'F' });
  ev('e8', { capoId: id('k3'), data: d(265), tipo: 'Fecondazione', metodoFec: 'Inseminazione artificiale', toro: 'Toro esempio B' });
  ev('e9', { capoId: id('k3'), data: d(228), tipo: 'Diagnosi gravidanza', esito: 'Positiva', metodoDiag: 'Ecografia' });
  ev('e10', { capoId: id('k3'), data: d(44), tipo: 'Messa in asciutta' });
  ev('e11', { capoId: id('k4'), data: d(310), tipo: 'Parto', facilita: 'Normale', vitelloSesso: 'F' });
  ev('e12', { capoId: id('k4'), data: d(222), tipo: 'Fecondazione', metodoFec: 'Inseminazione artificiale', toro: 'Toro esempio A' });
  ev('e13', { capoId: id('k4'), data: d(186), tipo: 'Diagnosi gravidanza', esito: 'Positiva', metodoDiag: 'Ecografia' });
  rows.push({ col: 'movimenti', id: id('mv3'), data: { data: d(2), prodottoId: id('p7'), tipo: 'Scarico', quantita: 2, note: 'Trattamento sanitario · IT012000845377', evId: id('e6'), esempio: true } });
  for (let i = 30; i >= 1; i--) { const dd = d(i); const base = 97 + Math.round(Math.sin(i / 3) * 3); const sc = i <= 2 ? 30 : 0; rows.push({ col: 'latte', id: dd, data: { data: dd, vacche: 3, litri: base, conferiti: base - sc, scartati: sc || null, prezzo: 0.55, grasso: i % 10 === 0 ? 3.82 : null, proteine: i % 10 === 0 ? 3.36 : null, cellule: i % 10 === 0 ? 180 + i : null, esempio: true } }); }
  add('operazioni', 'o6', { data: addDays(T, 4), stato: 'Pianificata', campoId: id('c4'), tipo: 'Raccolta', mezzoId: id('m1'), operatore: 'Contoterzista', note: 'Trebbiatura soia' });
  add('operazioni', 'o7', { data: addDays(T, 10), stato: 'Pianificata', campoId: id('c1'), tipo: 'Lavorazione terreno', mezzoId: id('m1'), note: 'Aratura dopo trinciatura' });
  add('note', 'n1', { titolo: 'Prova irrigazione', data: d(20), campoId: id('c1'), colore: 'blu', testo: 'Tre pluviometri lungo la campata: 7 mm, 9 mm, 17 mm in 20 minuti. Pressione 4,8 bar. Da ripetere con i regolatori nuovi.' });
  add('note', 'n2', { titolo: 'Infestanti a chiazze', data: d(9), campoId: id('c2'), colore: 'giallo', testo: 'Lato nord, vicino al fosso: controllare prima del prossimo sfalcio.' });
  add('note', 'n3', { titolo: 'Ordinare seme mais', data: d(2), colore: 'rossa', testo: 'Chiedere preventivo per classe 600 e 500 entro fine mese.' });
  add('razioni', 'r1', { nome: 'Unifeed alta produzione', gruppo: 'Alta produzione', ingredienti: [{ prodottoId: id('p6'), kg: 28 }, { prodottoId: id('p4'), kg: 7 }, { prodottoId: id('p5'), kg: 4 }], note: 'Più fieno di medica a volontà' });
  return rows;
}

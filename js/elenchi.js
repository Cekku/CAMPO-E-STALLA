// Elenchi delle attività in campo (1.67.0): voci prese dai moduli di xFarm (giro del 21/11/2026),
// tenute solo quelle utili a una stalla da latte con seminativi e prati. In ogni elenco si può scrivere anche altro.
import { S } from './state.js';

// Sottotipo per ogni tipo di attività (campo "sottotipo" delle operazioni)
export const SOTTOTIPI = {
  'Lavorazione terreno': ['Aratura', 'Ripuntatura', 'Erpicatura', 'Erpicatura rotante', 'Discatura', 'Estirpatura', 'Fresatura', 'Vangatura', 'Minima lavorazione', 'Lavorazione a strisce (strip-till)', 'Falsa semina', 'Rullatura', 'Sarchiatura', 'Rincalzatura', 'Assolcatura', 'Livellatura', 'Livellamento laser', 'Sovescio', 'Trinciatura dei residui', 'Interramento dei residui'],
  'Semina': ['Semina', 'Semina su sodo', 'Semina con erpicatura', 'Semina con concimazione', 'Trasemina', 'Trapianto'],
  'Concimazione': ['Concime minerale', 'Concime organico', 'Liquame', 'Letame', 'Digestato', 'Fertirrigazione', 'Concimazione fogliare', 'Correttivo o calce', 'Sarchiatura con concimazione'],
  'Trattamento fitosanitario': ['Fungicida', 'Insetticida', 'Acaricida', 'Concia del seme', 'Geodisinfestante', 'Fitoregolatore', 'Lotta biologica', 'Trattamento con concimazione'],
  'Diserbo': ['Pre-semina', 'Pre-emergenza', 'Post-emergenza', 'Disseccante', 'Diserbo localizzato', 'Diserbo meccanico', 'Pirodiserbo'],
  'Irrigazione': ['Irrigazione', 'Irrigazione di soccorso', 'Irrigazione antibrina', 'Fertirrigazione'],
  'Sfalcio': ['Falciatura', 'Falcia-condizionatura', 'Spandimento (voltafieno)', 'Ranghinatura', 'Pressatura', 'Fasciatura', 'Trinciatura', 'Fienagione', 'Taglio erba (capezzagne, fossi)'],
  'Raccolta': ['Trebbiatura', 'Trinciatura (insilato)', 'Raccolta pastone', 'Pressatura', 'Raccolta paglia', 'Raccolta stocchi'],
  'Altro': ['Movimentazione letame', 'Pulizia fossi', 'Manutenzione capezzagne e strade', 'Siepi', 'Spietramento', 'Drenaggi', 'Scavo fossi', 'Trasporto materiale', 'Campionamento del terreno', 'Osservazione / sopralluogo', 'Alimentazione bestiame', 'Preparazione lettiera', 'Pulizia stalla', 'Altro'],
};

/** Voci del sottotipo per un tipo: quelle fisse più quelle scritte a mano nelle attività già salvate. */
export function sottotipiDi(tipo) {
  const fisse = SOTTOTIPI[tipo] || [];
  const usate = new Set();
  for (const o of S.operazioni || []) if (o.tipo === tipo && o.sottotipo && !fisse.includes(o.sottotipo)) usate.add(o.sottotipo);
  return [...fisse, ...[...usate].sort()];
}

export const PROFONDITA = ['Meno di 20 cm', '20-40 cm', 'Oltre 40 cm'];
export const CIELO = ['Sereno', 'Poco nuvoloso', 'Variabile', 'Nuvoloso', 'Molto nuvoloso', 'Coperto', 'Nebbia', 'Coperto con pioggia', 'Rovesci', 'Temporale', 'Neve', 'Pioggia mista a neve'];
// Fitofarmaci: le prime 5 voci erano già nell'app (1.54.0) e restano uguali
export const MODI_FITO = ['Barra irroratrice', 'Atomizzatore', 'Localizzato', 'Concia del seme', 'Microgranulato', 'Polverizzatore', 'Lancia o tubo flessibile', 'Drone', 'Altro'];
// Prima 'Basso', 'Medio', 'Alto' (1.54.0): restano, con le due voci estreme di xFarm
export const LIVELLI_INFESTAZIONE = ['Molto basso', 'Basso', 'Medio', 'Alto', 'Molto alto'];
export const MOTIVI_INTERVENTO = ['Prevenzione (tempo o condizioni a rischio)', 'Superamento della soglia', 'Su consiglio del tecnico', 'Altro'];
export const METODI_CONCIMAZIONE = ['A spaglio', 'Al terreno', 'Con barra', 'Piatto deviatore', 'Rasoterra in banda', 'Rasoterra in banda con deflettori', 'Iniezione profonda', 'Sotto-superficiale a dischi', 'Sotto-superficiale con assolcatore', 'Sotto-superficiale con ripper', 'Interrato entro 24 ore', 'Localizzato alla semina', 'Rotolone a bassa pressione', 'Fertirrigazione a goccia', 'Fertirrigazione a pioggia', 'Fertirrigazione a scorrimento', 'Fertirrigazione con pivot o rotolone', 'Fogliare', 'Altro'];
export const METODI_IRRIGAZIONE = ['Rotolone', 'Pivot', 'Rainger (ala avanzante)', 'Sprinkler (irrigatori fissi)', 'Micro-sprinkler', 'A goccia', 'Subirrigazione', 'Scorrimento', 'A solchi', 'Spruzzatori sottochioma', 'Altro'];
export const RESIDUI = ['Lasciati sul campo', 'Interrati', 'Raccolti per l\'azienda (paglia, lettiera)', 'Raccolti e venduti', 'Bruciati'];

/** Dettagli brevi di un'attività per le righe e il registro (solo quelli compilati). */
export function dettagliOp(o, nomeMezzo) {
  const d = [];
  if (o.profondita) d.push('profondità ' + o.profondita.toLowerCase());
  if (o.trasemina === 'Sì') d.push('trasemina');
  if (o.concFondo === 'Sì') d.push('di fondo');
  if (o.metodoConc) d.push(o.metodoConc.toLowerCase());
  if (o.antibrina === 'Sì') d.push('antibrina');
  if (o.metodoIrr) d.push(o.metodoIrr.toLowerCase());
  if (o.volumeIrr) d.push(String(o.volumeIrr).replace('.', ',') + ' m³');
  if (o.residui) d.push('residui: ' + o.residui.toLowerCase());
  if (o.attrezzoId && nomeMezzo) { const n = nomeMezzo(o.attrezzoId); if (n) d.push('con ' + n); }
  return d;
}

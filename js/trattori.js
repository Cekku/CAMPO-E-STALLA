// Libretto dei trattori: catalogo componenti con intervalli in ore e mesi, modelli dell'azienda, stato di ogni pezzo
import { S, get } from './state.js';
import { N, okD, diff, today, byDate } from './util.js';
import { mezzoOre } from './domain.js';

// Gruppi nell'ordine in cui compaiono nel libretto (ic = icona)
export const GRUPPI_COMP = [['motore', 'Motore', 'gauge'], ['gasolio', 'Gasolio e scarico', 'fuel'], ['trasm', 'Trasmissione e assali', 'repeat-2'], ['idraulica', 'Idraulica e sollevatore', 'droplets'], ['ruote', 'Ingrassaggio, ruote e freni', 'wrench'], ['cabina', 'Cabina', 'wind'], ['elettrico', 'Impianto elettrico', 'zap']];

// Intervalli indicativi, uguali per tutti i trattori se il modello non ne ha di suoi (MODELLI.int) e se l'utente non li cambia (mezzo.intervalli).
// sez = sezione del catalogo ricambi John Deere dove si trova il pezzo; opz = pezzo presente solo su alcuni trattori.
export const CATALOGO = [
  { id: 'olio_motore', g: 'motore', nome: 'Olio motore e filtro olio', ore: 500, mesi: 12, sez: 'Motore', d: 'Il tagliando base. Con olio a specifica del costruttore (John Deere Plus-50 II, per Fendt quello indicato nel manuale) i trattori recenti arrivano a 500 ore; con lavori pesanti o gasolio di qualità dubbia meglio anticipare. Comunque una volta l\'anno.' },
  { id: 'gioco_valvole', g: 'motore', nome: 'Gioco valvole', ore: 2000, sez: 'Motore', d: 'Registrazione delle valvole da parte dell\'officina. Rumore di punterie o avviamento difficile sono i segnali per anticiparla.' },
  { id: 'refrigerante', g: 'motore', nome: 'Liquido di raffreddamento', ore: 2000, mesi: 24, sez: '30 Organi ausiliari motore', d: 'Antigelo e protezione dalla corrosione. Con i liquidi a lunga durata (John Deere COOL-GARD II) l\'intervallo si allunga fino a 6 anni sui modelli recenti: controlla sul manuale e cambia qui l\'intervallo.' },
  { id: 'cinghia', g: 'motore', nome: 'Cinghia servizi e tendicinghia', sez: '30 Organi ausiliari motore', d: 'Trascina alternatore, pompa acqua, ventola e compressore del clima. Si controlla a ogni tagliando e si cambia se è crepata o lucida.' },
  { id: 'radiatori', g: 'motore', nome: 'Radiatori e masse radianti', sez: '30 Organi ausiliari motore', d: 'Radiatore, intercooler, radiatore olio e condensatore del clima: si soffiano con l\'aria quando sono sporchi, nei periodi di trinciatura e fienagione anche ogni giorno.' },
  { id: 'turbo', g: 'motore', nome: 'Turbocompressore', sez: '30 Organi ausiliari motore', d: 'Nessuna scadenza: dura di più se l\'olio si cambia puntuale e se il motore gira al minimo qualche secondo prima di spegnerlo dopo un lavoro pesante.' },
  { id: 'iniettori', g: 'gasolio', nome: 'Iniettori e pompa iniezione', sez: 'Motore', d: 'Si controllano in officina se il motore fuma, perde potenza o consuma di più.' },
  { id: 'filtro_gasolio', g: 'gasolio', nome: 'Filtri gasolio e separatore d\'acqua', ore: 500, mesi: 12, sez: '30 Organi ausiliari motore', d: 'Filtro principale e prefiltro con separatore. L\'acqua del separatore si scarica ogni giorno o quando si accende la spia.' },
  { id: 'filtro_aria', g: 'gasolio', nome: 'Filtro aria (elemento principale)', mesi: 12, sez: '30 Organi ausiliari motore', d: 'Si pulisce con aria compressa dall\'interno verso l\'esterno quando si accende la spia; si sostituisce una volta l\'anno o dopo sei pulizie.' },
  { id: 'filtro_aria_sic', g: 'gasolio', nome: 'Filtro aria di sicurezza', mesi: 36, sez: '30 Organi ausiliari motore', d: 'L\'elemento interno: non si pulisce mai. Di solito si cambia ogni tre sostituzioni del principale.' },
  { id: 'serbatoio', g: 'gasolio', nome: 'Serbatoio gasolio', mesi: 12, sez: '30 Organi ausiliari motore', d: 'Scarico della condensa dal tappo in basso, meglio prima dell\'inverno. Fare il pieno a fine giornata riduce la condensa.' },
  { id: 'adblue', g: 'gasolio', nome: 'Sistema AdBlue (SCR) e filtro AdBlue', opz: 1, mesi: 36, sez: 'Motore', d: 'Solo sui trattori con il serbatoio blu dell\'AdBlue. Il filtro della pompa AdBlue ha un intervallo suo: controllalo sul manuale. Usa AdBlue pulito e non lasciarlo al sole.' },
  { id: 'scarico', g: 'gasolio', nome: 'Scarico, marmitta e catalizzatore', sez: '30 Organi ausiliari motore', d: 'Tubo di scarico, silenziatore e, sui trattori recenti, catalizzatore e filtro antiparticolato.' },
  { id: 'olio_trasm', g: 'trasm', nome: 'Olio trasmissione e idraulico', ore: 1500, mesi: 24, sez: '50 Trasmissione', d: 'Sui trattori John Deere lo stesso olio (Hy-Gard) serve cambio, ponte posteriore, sollevatore, idroguida e freni. Si cambia insieme ai filtri; usa solo l\'olio indicato nel manuale.' },
  { id: 'filtri_trasm', g: 'trasm', nome: 'Filtri olio trasmissione e idraulico', ore: 750, mesi: 12, sez: '50 Trasmissione', d: 'Filtro (o filtri) dell\'olio di trasmissione e idraulico. Su molti John Deere si cambia ogni 750 ore anche senza cambiare l\'olio.' },
  { id: 'assale_ant', g: 'trasm', nome: 'Olio assale anteriore e riduttori', ore: 1500, mesi: 24, sez: '80 Assali anteriori', d: 'Olio della scatola del differenziale anteriore e dei riduttori finali delle ruote anteriori (trazione integrale).' },
  { id: 'frizione', g: 'trasm', nome: 'Frizione e inversore', sez: '50 Trasmissione', d: 'Nessuna scadenza: si interviene se slitta, strappa o se il pedale cambia corsa.' },
  { id: 'pto', g: 'trasm', nome: 'Presa di forza (PTO)', sez: '50 Trasmissione', d: 'Innesto della presa di forza e protezioni dell\'albero cardanico. Le protezioni rotte vanno sostituite subito.' },
  { id: 'sollevatore', g: 'idraulica', nome: 'Sollevatore e attacco a tre punti', sez: '70 Impianto idraulico', d: 'Bracci, tiranti, terzo punto, ganci rapidi e sensori dello sforzo.' },
  { id: 'distributori', g: 'idraulica', nome: 'Distributori e attacchi rapidi', sez: '72 Distributori idraulici', d: 'Si controllano perdite e guarnizioni degli innesti; tieni puliti i tappi antipolvere.' },
  { id: 'pompa_idr', g: 'idraulica', nome: 'Pompa idraulica', sez: '71 Pompe idrauliche', d: 'Nessuna scadenza: rumori o sollevatore lento sono i segnali di un problema.' },
  { id: 'idroguida', g: 'idraulica', nome: 'Sterzo e idroguida', sez: '60 Sterzo e freni', d: 'Cilindro dello sterzo, tubi e testine. Gioco al volante o sterzo duro sono da far vedere.' },
  { id: 'ingrassaggio', g: 'ruote', nome: 'Ingrassaggio', ore: 50, sez: '80 Assali anteriori', d: 'Perni dell\'assale anteriore, sollevatore, terzo punto, cardani e, se ci sono, sospensioni della cabina e dell\'assale. Alcuni punti vanno ingrassati ogni 10 ore: guarda la targhetta sul trattore.' },
  { id: 'pneumatici', g: 'ruote', nome: 'Pneumatici e cerchi', sez: '82 Ruote', d: 'Pressione secondo il lavoro (campo o strada) e serraggio dei bulloni delle ruote, soprattutto dopo averle smontate.' },
  { id: 'mozzi', g: 'ruote', nome: 'Mozzi e cuscinetti ruote anteriori', sez: '80 Assali anteriori', d: 'Gioco delle ruote anteriori e tenute dei mozzi.' },
  { id: 'freni', g: 'ruote', nome: 'Freni e freno di stazionamento', sez: '60 Sterzo e freni', d: 'Efficienza dei freni, bilanciamento dei pedali e freno a mano. Sui trattori con serbatoio dell\'olio freni separato si cambia anche quello come da manuale.' },
  { id: 'filtro_cabina', g: 'cabina', nome: 'Filtro aria cabina', mesi: 12, sez: '94 Riscaldamento e climatizzazione', d: 'Si pulisce ogni 250 ore circa e si sostituisce una volta l\'anno. Per i trattamenti con fitofarmaci serve il filtro a carboni attivi, da cambiare come indica il costruttore.' },
  { id: 'clima', g: 'cabina', nome: 'Climatizzatore', mesi: 24, sez: '94 Riscaldamento e climatizzazione', d: 'Ricarica del gas, filtro deidratatore e pulizia del condensatore.' },
  { id: 'cabina', g: 'cabina', nome: 'Cabina, vetri, sedile e tergicristalli', sez: '91 Posto di guida', d: 'Vetri, guarnizioni, sedile, cinture, specchi e spazzole del tergicristallo.' },
  { id: 'batteria', g: 'elettrico', nome: 'Batterie', mesi: 60, sez: '41 Componenti elettrici', d: 'Morsetti puliti e ingrassati. Se il trattore resta fermo a lungo, staccale o tienile sotto un mantenitore.' },
  { id: 'alternatore', g: 'elettrico', nome: 'Alternatore e motorino di avviamento', sez: '41 Componenti elettrici', d: 'Si sostituiscono a guasto.' },
  { id: 'luci', g: 'elettrico', nome: 'Luci, lampeggiante e impianto elettrico', sez: '41 Componenti elettrici', d: 'Fari, frecce, luci di lavoro, lampeggiante, presa del rimorchio e fusibili.' },
];
export const COMP = Object.fromEntries(CATALOGO.map(c => [c.id, c]));

// Catalogo ricambi ufficiale John Deere: pubblico, con le tavole esplose e i codici. jd = [id del catalogo, descrizione].
export const JD_CATALOGO = id => 'https://partscatalog.deere.com/jdrc/navigation/equipment/' + id;
export const JD_CERCA = 'https://partscatalog.deere.com/jdrc/';
// Fendt: catalogo AGCO Parts Books, con accesso dato dal concessionario
export const AGCO_PARTS = 'https://www.agcopartsandservice.com/eame/en/parts/brands/fendt/parts-books.html';
// Pagina ponte su claude.ai che legge le fatture con l'account Claude dell'utente (sorgente: strumenti/ponte-fatture-trattori.html)
export const PONTE_FATTURE = 'https://claude.ai/artifact/SZB96LSws2JF7BGFakwn5h';

// Modelli dell'azienda. int = intervalli diversi da quelli del catalogo; opz = pezzi facoltativi presenti di serie.
export const MODELLI = {
  'jd-7530p': { marca: 'John Deere', modello: '7530 Premium', motore: 'PowerTech 6068, 6 cilindri 6,8 l', jd: [[12662, '7530 Premium (Edizione Europea) · PC4579']] },
  'jd-7810': { marca: 'John Deere', modello: '7810', motore: 'PowerTech 6081, 6 cilindri 8,1 l', jd: [[12724, '7610, 7710 e 7810 · numero di serie fino a 089999 · PC2540'], [12725, '7710 e 7810 · numero di serie da 090000 · PC2831']], int: { olio_motore: { ore: 250 } } },
  'jd-6420s': { marca: 'John Deere', modello: '6420S', motore: 'PowerTech 4045, 4 cilindri 4,5 l', jd: [[12107, '6320, 6420, 6420S (Edizione Europea) · PC4349']] },
  'jd-5080m': { marca: 'John Deere', modello: '5080M', motore: 'PowerTech 4045, 4 cilindri 4,5 l', jd: [[4256, '5080M (Edizione Europea) · PC4589']] },
  'jd-6800': { marca: 'John Deere', modello: '6800', motore: 'PowerTech 6068, 6 cilindri 6,8 l', jd: [[12271, '6800, 6900 (Edizione Europea) · PC4255']], int: { olio_motore: { ore: 250 } } },
  'jd-6900': { marca: 'John Deere', modello: '6900', motore: 'PowerTech 6068, 6 cilindri 6,8 l', jd: [[12306, '6800, 6900 (Edizione Europea) · PC4255']], int: { olio_motore: { ore: 250 } } },
  'fendt-724': { marca: 'Fendt', modello: '724 Vario Profi Plus', motore: 'Deutz TCD 6.1, 6 cilindri', agco: 1, opz: ['adblue'], int: { olio_trasm: { ore: 2000, mesi: 24 }, filtri_trasm: { ore: 1000, mesi: 12 } } },
};
export const OPZ_MODELLI = Object.entries(MODELLI).map(([k, m]) => [k, m.marca + ' ' + m.modello]);
export const modelloDi = m => (m && m.catalogo && MODELLI[m.catalogo]) || null;
export const isTrattore = m => !!m && m.tipo === 'Trattore';

// Pezzi del libretto di questo trattore: i facoltativi solo se presenti, gli altri se non tolti a mano
export function compDi(m) {
  const mod = modelloDi(m) || {}, pres = new Set([...(mod.opz || []), ...(m.presenti || [])]), tolti = new Set(m.tolti || []);
  return CATALOGO.filter(c => c.opz ? pres.has(c.id) && !tolti.has(c.id) : !tolti.has(c.id));
}
export function intervallo(m, id) {
  const c = COMP[id] || {}, mod = modelloDi(m), own = (m.intervalli || {})[id];
  const base = { ore: c.ore || null, mesi: c.mesi || null };
  if (mod && mod.int && mod.int[id]) Object.assign(base, mod.int[id]);
  // il vecchio campo "Tagliando ogni … ore" della scheda mezzo vale per l'olio motore
  if (id === 'olio_motore' && N(m.intervallo) && !own) base.ore = N(m.intervallo);
  if (own) { if (own.ore !== undefined) base.ore = own.ore || null; if (own.mesi !== undefined) base.mesi = own.mesi || null; }
  return base;
}
export const interventiDi = m => S.manutenzioni.filter(x => x.mezzoId === m.id);
// Ultimo intervento che ha toccato il pezzo (il più recente per data, a parità per ore)
export function ultimo(m, id) {
  const l = interventiDi(m).filter(x => (x.componenti || []).includes(id) || (id === 'olio_motore' && x.tipo === 'Tagliando' && !(x.componenti || []).length));
  l.sort((a, b) => byDate(a, b) || N(a.ore) - N(b.ore));
  const x = l[l.length - 1];
  if (x) return { data: x.data, ore: N(x.ore) || null, id: x.id, n: l.length };
  if (id === 'olio_motore' && N(m.oreUltimoTagliando)) return { data: null, ore: N(m.oreUltimoTagliando), id: null, n: 0 };
  return null;
}
const addMesi = (s, n) => { const [y, mo, d] = s.split('-').map(Number); const t = new Date(Date.UTC(y, mo - 1 + n, d)); return t.toISOString().slice(0, 10); };

// Stato di un pezzo: lv = ok | warn | bad | none (nessun dato) | free (senza scadenza)
export function stato(m, id, oreOra = mezzoOre(m)) {
  const iv = intervallo(m, id), u = ultimo(m, id);
  if (!iv.ore && !iv.mesi) return { lv: 'free', iv, u };
  if (!u) return { lv: 'none', iv, u };
  const prossOre = iv.ore && u.ore !== null ? u.ore + iv.ore : null, restOre = prossOre !== null ? prossOre - oreOra : null;
  const prossData = iv.mesi && okD(u.data) ? addMesi(u.data, iv.mesi) : null, restGg = prossData ? diff(today(), prossData) : null;
  const late = (restOre !== null && restOre < 0) || (restGg !== null && restGg < 0);
  const near = (restOre !== null && restOre <= Math.max(25, iv.ore * 0.1)) || (restGg !== null && restGg <= 30);
  return { lv: late ? 'bad' : near ? 'warn' : 'ok', iv, u, prossOre, restOre, prossData, restGg };
}
export function riepilogo(m) {
  const ore = mezzoOre(m), out = { bad: [], warn: [], none: [] };
  compDi(m).forEach(c => { const s = stato(m, c.id, ore); if (out[s.lv]) out[s.lv].push(c); });
  return out;
}
// Trattore della fattura: quello scelto prima della scansione, altrimenti per numero di serie o targa scritti sul documento
export function trovaMezzo(d, preferito) {
  if (preferito && get('mezzi', preferito)) return preferito;
  const norm = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ser = norm(d.serial), tg = norm(d.plate);
  const m = S.mezzi.find(x => (ser && norm(x.serie) && (ser.includes(norm(x.serie)) || norm(x.serie).includes(ser))) || (tg && norm(x.targa) === tg));
  return m ? m.id : null;
}

// Definizione dei moduli di inserimento e delle loro regole
import { S, D, UI, get } from './state.js';
import { N, nf, fd, today, addDays, byName, okD, yearOf } from './util.js';
import * as store from './store.js';
import { openForm, openSheet, setVal, setHint, setUnit, toast, FORM, readForm } from './ui.js';
import { COLTURE, coltureNote, TIPI_OP, OP_PROD, CATEGORIE, UNITA, TIPI_MEZZO, TIPI_MAN, RAZZE, GRUPPI, TIPI_EV, giac, capoI, campoHa, numCapo, nomeCapoLungo, cropOf, kgUnita, colturaAlla } from './domain.js';
import { areaHa } from './geo.js';
import { meteoAlMomento } from './meteo.js';
import { controlliOp, checksHTML, forceOk, isFitoOp, FITO } from './checks.js';
import { fitoLookup, fitoSearch, fitoMeta, etichettaUrl } from './fitodb.js';
import { esc } from './util.js';
import { haTrattati } from './registro.js';
import { FASI_BOX, allBoxes } from './herd.js';
import { scaricaRazioni } from './razauto.js';
import { CATALOGO, GRUPPI_COMP, OPZ_MODELLI, MODELLI, isTrattore } from './trattori.js';
import { boxAllegati, salvaAllegati } from './views/libretto.js';

const oCampi = () => [...S.campi].sort(byName).map(c => [c.id, `${c.nome} · ${nf(campoHa(c), 2)} ha`]);
const oProd = cats => () => [...S.prodotti].filter(p => !cats || cats.includes(p.categoria)).sort(byName).map(p => [p.id, `${p.nome} — ${nf(giac(p), 1)} ${p.unita || ''}`]);
const oMezzi = () => [...S.mezzi].sort(byName).map(m => [m.id, m.nome]);
// Prima i capi con il numero aziendale, in ordine di numero; poi gli altri per matricola
const nInt = c => { const n = parseInt(numCapo(c), 10); return isNaN(n) ? Infinity : n; };
const oCapi = () => [...S.capi].filter(c => capoI(c).stato !== 'Uscita').sort((a, b) => nInt(a) - nInt(b) || (a.matricola || '').localeCompare(b.matricola || '')).map(c => [c.id, [nomeCapoLungo(c), c.matricola && numCapo(c) ? c.matricola.slice(-6) : ''].filter(Boolean).join(' · ')]);
const isT = (...t) => v => t.includes(v.tipo);
const isTr = isT('Trattamento sanitario', 'Vaccinazione');
// Meteo del trattamento: compila da solo temperatura, umidità, vento e pioggia se non li ha toccati l'utente
const CAMPI_METEO = ['temp', 'umidita', 'ventoKmh', 'pioggia24'];
let meteoSeq = 0;   // conta le richieste: vale solo la risposta dell'ultima
export async function meteoAuto(ch, v) {
  const f = FORM; if (!f || !okD(v.data)) return;
  const toccati = () => CAMPI_METEO.some(k => f.dirty.has(k));
  if (toccati()) return;
  if ((ch === null || ch === 'tipo') && CAMPI_METEO.some(k => v[k] !== null && v[k] !== undefined && v[k] !== '')) return;
  let m = null, errore = false; const mia = ++meteoSeq;
  try { m = await meteoAlMomento(v.data, v.oraInizio); } catch (e) { errore = true; }
  if (mia !== meteoSeq || FORM !== f || toccati()) return;
  if (errore) { if (ch !== null) CAMPI_METEO.forEach(k => setVal(k, '')); setHint('temp', 'Meteo non disponibile senza internet: scrivilo tu'); return; }
  if (!m) { if (ch !== null) CAMPI_METEO.forEach(k => setVal(k, '')); setHint('temp', 'Meteo non trovato per quel giorno: scrivilo tu'); return; }
  setVal('temp', m.temp); setVal('umidita', m.umidita); setVal('ventoKmh', m.ventoKmh); setVal('pioggia24', m.pioggia24);
  setHint('temp', 'Meteo preso da Open-Meteo per le ' + (m.ora || '10:00') + (m.fonte === 'archivio' ? ' (archivio storico)' : '') + ': controllalo');
}
const oOperatori = () => S.operatori.map(o => o.nome).filter(Boolean).sort();
// Raccolta (1.50.0): come è stata fatta e cosa si è ottenuto (si può scrivere anche altro)
export const MODI_RACCOLTA = ['Trebbiatura', 'Trinciatura', 'Sfalcio', 'Pressatura', 'Altro'];
export const PRODOTTI_RACCOLTA = ['Granella', 'Pastone di granella', 'Pastone integrale (spiga)', 'Insilato', 'Fieno', 'Fieno-silo (fasciato)', 'Erba verde', 'Paglia', 'Stocchi', 'Altro'];
export const BBCH = ['00 Seme secco', '09 Emergenza', '10-19 Sviluppo fogliare', '21-29 Accestimento', '30-39 Levata / allungamento', '41-49 Botticella', '51-59 Spigatura / pennacchio', '61-69 Fioritura', '71-79 Sviluppo frutti / granella', '81-89 Maturazione', '91-99 Senescenza', 'Pre-semina', 'Pre-emergenza', 'Post-raccolta'];
// Riquadro dei controlli, condiviso tra modulo singolo e registrazione guidata
export function runChecks(v, campi, opId) {
  const box = document.getElementById('box_controlli'); if (!box) return [];
  const list = isFitoOp(v.tipo) || (get('prodotti', v.prodottoId) && FITO.includes(get('prodotti', v.prodottoId).categoria)) ? controlliOp(v, campi, opId) : [];
  const was = document.getElementById('chkForce'); const keep = was && was.checked;
  box.innerHTML = checksHTML(list); box.hidden = !list.length;
  const now = document.getElementById('chkForce'); if (now && keep) now.checked = true;
  if (FORM) FORM.checks = list;
  return list;
}

// Coda degli invii: il ponte (programma sul PC) manda l'evento a MooMonitor e Si@lleva e scrive l'esito.
// Non si rimette in coda un evento gia' inviato con gli stessi dati.
async function mettiInCoda(eventoId, v) {
  const dest = Array.isArray(v.invia) ? v.invia.filter(d => d === 'moomonitor' || d === 'sialleva') : [];
  if (!dest.length) return;
  const prima = S.invii.filter(x => x.eventoId === eventoId);
  const uguale = x => x.tipo === v.tipo && x.data === v.data && x.capoId === v.capoId && dest.every(d => (x.destinazioni || []).includes(d));
  if (prima.some(x => x.stato !== 'in attesa' && x.stato !== 'errore' && uguale(x))) return;
  // un invio ancora in coda o andato in errore si rimette in coda (dopo aver corretto l'evento); le destinazioni gia' riuscite restano tali
  const aperto = prima.find(x => x.stato === 'in attesa') || prima.find(x => x.stato === 'errore');
  const esiti = aperto && aperto.tipo === v.tipo && aperto.data === v.data ? Object.fromEntries(Object.entries(aperto.esiti || {}).filter(([d, e]) => dest.includes(d) && e && (e.stato === 'inviato' || e.stato === "gia' presente"))) : {};
  await store.put('invii', aperto ? aperto.id : null, { eventoId, capoId: v.capoId, tipo: v.tipo, data: v.data, destinazioni: dest, stato: 'in attesa', esiti, creato: aperto ? aperto.creato : new Date().toISOString(), rimesso: aperto ? new Date().toISOString() : undefined });
  if (FORM) FORM.done = 'Evento salvato e messo in coda per ' + dest.map(d => d === 'moomonitor' ? 'MooMonitor' : 'Si@lleva').join(' e ');
}

// "Fino al" prima del primo giorno: errore (vuoto o uguale = lavoro di un giorno)
export const erroreFine = v => okD(v.dataFine) && okD(v.data) && v.dataFine < v.data ? '"Fino al" non può essere prima del primo giorno.' : null;
export const SPEC = {
  campi: {
    title: 'Appezzamento', icon: 'map',
    fields: () => [
      { k: 'nome', l: 'Nome', req: 1, ph: 'Es. Campo della roggia' },
      { k: 'superficie', l: 'Superficie', t: 'number', req: 1, half: 1, unit: 'ha', hint: 'Calcolata dal confine disegnato, modificabile' },
      { k: 'coltura', l: 'Coltura in atto', half: 1, list: coltureNote() },
      { k: 'varieta', l: 'Varietà o ibrido', half: 1 },
      { k: 'irriguo', l: 'Irriguo', t: 'seg', opts: ['Sì', 'No'], half: 1 },
      { k: 's1', l: 'Dati catastali', t: 'section' },
      { k: 'comune', l: 'Comune', half: 1 },
      { k: 'catasto', l: 'Foglio e particelle', half: 1, ph: 'Fg. 12 mapp. 45, 46' },
      { k: 'conduzione', l: 'Conduzione', t: 'seg', opts: ['Proprietà', 'Affitto', 'Comodato'] },
      { k: 'gruppo', l: 'Gruppo', ph: 'Es. Campi della stalla' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ irriguo: 'No', conduzione: 'Proprietà' }),
    canDel: c => S.operazioni.some(o => o.campoId === c.id) ? 'Il campo ha operazioni registrate: eliminale prima dal quaderno.' : S.carichi.some(k => k.campoId === c.id) ? 'Il campo ha pesate del raccolto: eliminale prima da Pesate del raccolto.' : null,
  },
  operazioni: {
    title: 'Operazione in campo', icon: 'notebook-pen',
    fields: () => [
      { k: 'stato', l: 'Stato', t: 'seg', opts: [['Fatto', 'Fatta'], ['Pianificata', 'Da fare']] },
      { k: 'tipo', l: 'Operazione', t: 'select', opts: TIPI_OP, req: 1, blank: 'Scegli' },
      { k: 'data', l: 'Data (o primo giorno)', t: 'date', req: 1, half: 1 },
      { k: 'dataFine', l: 'Fino al', t: 'date', half: 1, hint: 'Solo se il lavoro dura più giorni' },
      { k: 'campoId', l: 'Appezzamento', t: 'select', opts: oCampi, req: 1, blank: 'Scegli il campo' },
      { k: 'haTrattati', l: 'Superficie trattata', t: 'number', half: 1, unit: 'ha', show: isT('Trattamento fitosanitario', 'Diserbo'), hint: 'Solo se hai trattato una parte del campo: vuoto = tutto il campo' },
      { k: 'prodottoId', l: 'Prodotto dal magazzino', t: 'select', opts: oProd(['Fitofarmaco', 'Diserbante', 'Concime', 'Effluente', 'Seme', 'Altro', 'Gasolio']), show: isT(...OP_PROD), blank: 'Nessun prodotto' },
      { k: 'dose', l: 'Dose', t: 'number', half: 1, unit: '/ha', show: v => !!v.prodottoId },
      { k: 'quantita', l: 'Quantità totale', t: 'number', half: 1, show: v => !!v.prodottoId, hint: 'Dose × ettari, si scarica dal magazzino' },
      { k: 'avversita', l: 'Avversità o motivo', show: isT('Trattamento fitosanitario', 'Diserbo'), ph: 'Es. piralide, infestanti dicotiledoni' },
      { k: 'bbch', l: 'Stadio BBCH', half: 1, list: BBCH, show: isT('Trattamento fitosanitario', 'Diserbo', 'Concimazione'), ph: 'Es. 32' },
      { k: 'fase', l: 'Fase fenologica', half: 1, show: isT('Trattamento fitosanitario', 'Diserbo', 'Concimazione'), ph: 'Es. 6 foglie' },
      { k: 'oraInizio', l: 'Ora di inizio', t: 'time', half: 1, show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'volumeAcqua', l: 'Volume d\'acqua', t: 'number', half: 1, unit: 'l/ha', show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'vento', l: 'Vento', t: 'seg', opts: ['Assente', 'Debole', 'Moderato', 'Forte'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'temp', l: 'Temperatura', t: 'number', half: 1, unit: '°C', hint: "Si compila da solo dal meteo del giorno e dell'ora di inizio", show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'umidita', l: 'Umidità', t: 'number', half: 1, unit: '%', show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'ventoKmh', l: 'Velocità del vento', t: 'number', half: 1, unit: 'km/h', show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'pioggia24', l: 'Pioggia nelle 24 ore prima', t: 'number', half: 1, unit: 'mm', show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'modoApplicazione', l: 'Modo di distribuzione', t: 'select', opts: ['Barra irroratrice', 'Atomizzatore', 'Localizzato', 'Concia del seme', 'Microgranulato', 'Altro'], blank: 'Scegli', half: 1, show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'livelloInfestazione', l: 'Livello di infestazione', t: 'seg', opts: ['Basso', 'Medio', 'Alto'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'sogliaSuperata', l: 'Soglia di intervento superata', t: 'seg', opts: ['Sì', 'No'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'autTecnica', l: 'Con autorizzazione o consiglio del tecnico', t: 'seg', opts: ['Sì', 'No'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'fasciaRispetto', l: 'Fascia di rispetto lasciata (acque, case, strade)', t: 'seg', opts: ['Sì', 'No'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'efficacia', l: 'Efficacia (da segnare dopo)', t: 'seg', opts: ['Buona', 'Media', 'Scarsa'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'meteo', l: 'Note sul meteo', show: isT('Trattamento fitosanitario', 'Diserbo'), ph: 'Es. sereno, 18 °C' },
      { k: 'modoRaccolta', l: 'Tipo di raccolta', t: 'seg', opts: MODI_RACCOLTA, show: isT('Raccolta') },
      { k: 'prodottoRaccolto', l: 'Cosa hai ottenuto', list: PRODOTTI_RACCOLTA, show: isT('Raccolta', 'Sfalcio'), ph: 'Es. insilato, pastone, granella, fieno' },
      { k: 'chiude', l: 'Questa raccolta chiude la coltura?', t: 'seg', opts: [['Sì', 'Sì, il campo resta libero'], ['No', 'No, la coltura continua (altri tagli)']], show: isT('Raccolta') },
      { k: 'raccolto', l: 'Quantità raccolta', t: 'number', half: 1, unit: 't', show: isT('Raccolta', 'Sfalcio'), hint: ' ' },
      { k: 'prezzoVendita', l: 'Prezzo', t: 'number', half: 1, unit: '€/t', show: isT('Raccolta', 'Sfalcio') },
      { k: 's1', l: 'Mezzi e costi', t: 'section' },
      { k: 'mezzoId', l: 'Mezzo', t: 'select', opts: oMezzi, half: 1, blank: 'Nessuno' },
      { k: 'ore', l: 'Ore di lavoro', t: 'number', half: 1, unit: 'h' },
      { k: 'operatore', l: 'Operatore', half: 1, list: oOperatori() },
      { k: 'costoExtra', l: 'Costi extra', t: 'number', half: 1, unit: '€', hint: 'Contoterzi, acqua, manodopera' },
      { k: 'note', l: 'Note', t: 'textarea' },
      { k: 'controlli', t: 'box' }],
    defaults: () => ({ data: today(), stato: 'Fatto' }),
    validate: v => erroreFine(v) || forceOk((FORM && FORM.checks) || []),
    onChange(ch, v) {
      const p = get('prodotti', v.prodottoId);
      if (ch === null || ch === 'prodottoId') { setUnit('dose', (p ? p.unita : '') + '/ha'); setUnit('quantita', p ? p.unita : ''); setHint('dose', p && N(p.carenza) ? 'Tempo di carenza: ' + p.carenza + ' giorni' : ''); }
      if (!(FORM && FORM.dirty.has('quantita')) && ['dose', 'campoId', 'prodottoId', 'haTrattati'].includes(ch)) { const c = get('campi', v.campoId); if (c && v.dose !== null) setVal('quantita', Math.round(N(v.dose) * haTrattati(v, c) * 100) / 100); }
      if (['Trattamento fitosanitario', 'Diserbo'].includes(v.tipo) && [null, 'data', 'oraInizio', 'tipo'].includes(ch)) meteoAuto(ch, v);
      if (['Raccolta', 'Sfalcio'].includes(v.tipo) && [null, 'campoId', 'data', 'tipo'].includes(ch)) { const y = yearOf(v.data), t = S.carichi.filter(x => x.campoId === v.campoId && yearOf(x.data) === y).reduce((s, x) => s + N(x.netto), 0) / 1000; setHint('raccolto', v.campoId && t > 0 ? 'Dalle pesate di quest\'anno: ' + nf(t, 1) + ' t' : ' '); }
      chiudeAuto(ch, v, v.tipo, v.campoId);
      const c0 = get('campi', v.campoId); runChecks(Object.assign({}, v, readForm()), c0 ? [c0] : [], FORM && FORM.id);
    },
    async save(id, v) {
      v.dataFine = okD(v.dataFine) && v.dataFine > v.data ? v.dataFine : null;
      if (FORM && FORM.checks) { const bad = FORM.checks.filter(x => x.lv === 'bad'); v.controlli = bad.length ? bad.map(x => x.t) : null; v.controllato = isFitoOp(v.tipo) ? today() : null; }
      const nid = await store.put('operazioni', id, v);
      const mov = S.movimenti.find(m => m.opId === nid); const c = get('campi', v.campoId);
      const eff = v.prodottoId && (get('prodotti', v.prodottoId) || {}).categoria === 'Effluente';   // gli effluenti non hanno giacenza
      if (!eff && v.prodottoId && N(v.quantita) > 0 && v.stato !== 'Pianificata') await store.put('movimenti', mov ? mov.id : null, { data: v.data, prodottoId: v.prodottoId, tipo: 'Scarico', quantita: N(v.quantita), note: (v.tipo || '') + ' · ' + (c ? c.nome : ''), opId: nid });
      else if (mov) await store.remove('movimenti', mov.id);
    },
    async remove(o) { const mov = S.movimenti.find(m => m.opId === o.id); if (mov) await store.remove('movimenti', mov.id); await store.remove('operazioni', o.id); },
  },
  carichi: {
    title: 'Pesata del raccolto', icon: 'scale',
    fields: () => [
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'campoId', l: 'Campo di provenienza', t: 'select', opts: oCampi, req: 1, blank: 'Scegli il campo' },
      { k: 'prodottoRaccolto', l: 'Cosa è', list: PRODOTTI_RACCOLTA, ph: 'Es. insilato, granella' },
      { k: 'lordo', l: 'Peso lordo', t: 'number', half: 1, unit: 'kg' },
      { k: 'tara', l: 'Tara', t: 'number', half: 1, unit: 'kg' },
      { k: 'netto', l: 'Peso netto', t: 'number', half: 1, unit: 'kg', req: 1, hint: 'Lordo meno tara: si calcola da solo' },
      { k: 'umidita', l: 'Umidità', t: 'number', half: 1, unit: '%' },
      { k: 'siloId', l: 'Dove va', t: 'select', opts: () => [...S.silos].sort(byName).map(s => [s.id, s.nome]), blank: 'Altro (vendita, essiccatoio…)', hint: 'Se il silo è collegato a un prodotto di magazzino, il carico entra in magazzino' },
      { k: 'destinazione', l: 'Destinazione', show: v => !v.siloId, ph: 'Es. venduto al consorzio' },
      { k: 's1', l: 'Documento e trasporto', t: 'section' },
      { k: 'documento', l: 'N. documento (DDT, bolla, scontrino della pesa)', half: 1 },
      { k: 'trasportatore', l: 'Trasportatore', half: 1 },
      { k: 'targa', l: 'Targa del mezzo', half: 1 },
      { k: 'mezzoId', l: 'Mezzo', t: 'select', opts: oMezzi, half: 1, blank: 'Nessuno' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today() }),
    onChange(ch, v) {
      if (['lordo', 'tara'].includes(ch) && !FORM.dirty.has('netto') && N(v.lordo) > N(v.tara) && v.lordo !== null && v.tara !== null) setVal('netto', Math.round((N(v.lordo) - N(v.tara)) * 100) / 100);
      if (ch === 'campoId' && !v.prodottoRaccolto) { const col = String((colturaAlla(get('campi', v.campoId), v.data) || {}).coltura || '').toLowerCase(); if (col.includes('trinciato') || col.includes('insilato')) setVal('prodottoRaccolto', 'Insilato'); }
    },
    async save(id, v) {
      const nid = await store.put('carichi', id, v);
      const mov = S.movimenti.find(m => m.caricoId === nid), silo = get('silos', v.siloId), p = silo ? get('prodotti', silo.prodottoId) : null, c = get('campi', v.campoId);
      if (p && ['kg', 'q', 't'].includes(p.unita || 'kg') && N(v.netto) > 0) await store.put('movimenti', mov ? mov.id : null, { data: v.data, prodottoId: p.id, tipo: 'Carico', quantita: Math.round(N(v.netto) / kgUnita(p) * 1000) / 1000, note: 'Raccolto · ' + (c ? c.nome : ''), caricoId: nid, autoprodotto: true });
      else if (mov) await store.remove('movimenti', mov.id);
    },
    async remove(o) { const mov = S.movimenti.find(m => m.caricoId === o.id); if (mov) await store.remove('movimenti', mov.id); await store.remove('carichi', o.id); },
  },
  prodotti: {
    title: 'Prodotto', icon: 'package',
    fields: () => [
      { k: 'nome', l: 'Nome commerciale', req: 1 },
      { k: 'categoria', l: 'Categoria', t: 'select', opts: CATEGORIE, req: 1, half: 1, blank: 'Scegli' },
      { k: 'unita', l: 'Unità di misura', t: 'select', opts: UNITA, req: 1, half: 1, blank: false },
      { k: 'prezzo', l: 'Prezzo per unità', t: 'number', half: 1, unit: '€' },
      { k: 'giacenzaIniziale', l: 'Giacenza iniziale', t: 'number', half: 1, hint: 'Quantità presente quando inizi a usare l\'app', show: v => v.categoria !== 'Effluente' },
      { k: 'scortaMin', l: 'Scorta minima', t: 'number', half: 1, show: v => v.categoria !== 'Effluente' },
      { k: 'scadenza', l: 'Scadenza', t: 'date', half: 1 },
      { k: 'nReg', l: 'N. registrazione', half: 1, show: v => ['Fitofarmaco', 'Diserbante', 'Farmaco veterinario'].includes(v.categoria) },
      { k: 'carenza', l: 'Tempo di carenza', t: 'number', half: 1, unit: 'giorni', show: v => ['Fitofarmaco', 'Diserbante'].includes(v.categoria), hint: 'Valore generale: se in etichetta cambia per coltura, indicalo negli impieghi' },
      { k: 'titN', l: 'Azoto (N)', t: 'number', half: 1, unit: '%', show: v => v.categoria === 'Concime', hint: 'Titolo in etichetta, es. urea 46 - 0 - 0' },
      { k: 'titP', l: 'Fosforo (P₂O₅)', t: 'number', half: 1, unit: '%', show: v => v.categoria === 'Concime' },
      { k: 'titK', l: 'Potassio (K₂O)', t: 'number', half: 1, unit: '%', show: v => v.categoria === 'Concime' },
      { k: 'kgN', l: 'Azoto (N)', t: 'number', half: 1, unit: 'kg per unità', show: v => v.categoria === 'Effluente', hint: 'Kg per m³ o per t: meglio dall\'analisi (liquame bovino circa 3-4 kg/m³, letame circa 5 kg/t)' },
      { k: 'kgP', l: 'Fosforo (P₂O₅)', t: 'number', half: 1, unit: 'kg per unità', show: v => v.categoria === 'Effluente' },
      { k: 'kgK', l: 'Potassio (K₂O)', t: 'number', half: 1, unit: 'kg per unità', show: v => v.categoria === 'Effluente' },
      { k: 'effN', l: 'Azoto efficiente', t: 'number', half: 1, unit: '%', show: v => v.categoria === 'Effluente', hint: 'Parte dell\'azoto che va alla coltura; se vuoto si usa 50%' },
      { k: 'dbbox', t: 'box', show: v => FITO.includes(v.categoria) },
      { k: 'sostanze', l: 'Sostanze attive', show: v => FITO.includes(v.categoria), ph: 'Es. glifosate 360 g/l' },
      { k: 'scadenzaAut', l: 'Autorizzazione valida fino al', t: 'date', half: 1, show: v => FITO.includes(v.categoria) },
      { k: 'impresa', l: 'Titolare della registrazione', half: 1, show: v => FITO.includes(v.categoria) },
      { k: 's2', l: 'Impieghi autorizzati (dall\'etichetta)', t: 'section', show: v => FITO.includes(v.categoria) },
      { k: 'impieghi', l: 'Una riga per coltura: i trattamenti vengono controllati su questi limiti', t: 'rows', show: v => FITO.includes(v.categoria), addLabel: 'Aggiungi coltura',
        cols: [{ k: 'coltura', l: 'Coltura', list: [...COLTURE.filter(c => c !== 'Riposo'), 'Cereali autunno-vernini', 'Mais', 'Frumento', 'Prati e pascoli'], ph: 'Coltura', w: 'minmax(110px,2fr)' }, { k: 'doseMin', l: 'Dose min', unit: '/ha', t: 'number', ph: '—' }, { k: 'doseMax', l: 'Dose max', unit: '/ha', t: 'number', ph: '—' }, { k: 'carenza', l: 'Carenza', unit: 'gg', t: 'number', ph: '—' }, { k: 'maxInterventi', l: 'Interventi', unit: 'max/anno', t: 'number', ph: '—' }, { k: 'intervallo', l: 'Intervallo', unit: 'gg', t: 'number', ph: '—' }] },
      { k: 'sospLatte', l: 'Sospensione latte', t: 'number', half: 1, unit: 'giorni', show: v => v.categoria === 'Farmaco veterinario' },
      { k: 'sospCarne', l: 'Sospensione carne', t: 'number', half: 1, unit: 'giorni', show: v => v.categoria === 'Farmaco veterinario' },
      { k: 'fornitore', l: 'Fornitore', half: 1 },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ unita: 'kg' }),
    onChange(ch, v) { if (ch === null || ch === 'categoria' || ch === 'nReg') dbBox(v); },
    canDel: p => S.movimenti.some(m => m.prodottoId === p.id) || S.operazioni.some(o => o.prodottoId === p.id) ? 'Il prodotto ha movimenti registrati e non si può eliminare.' : null,
  },
  movimenti: {
    title: 'Movimento di magazzino', icon: 'warehouse',
    fields: () => [
      { k: 'tipo', l: 'Tipo', t: 'seg', opts: ['Carico', 'Scarico'], req: 1 },
      { k: 'prodottoId', l: 'Prodotto', t: 'select', opts: oProd(), req: 1, blank: 'Scegli' },
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'quantita', l: 'Quantità', t: 'number', req: 1, half: 1 },
      { k: 'prezzo', l: 'Prezzo unitario', t: 'number', half: 1, unit: '€', show: isT('Carico'), hint: 'Aggiorna il prezzo del prodotto' },
      { k: 'documento', l: 'DDT o fattura', half: 1, show: isT('Carico') },
      { k: 'provenienza', l: 'Provenienza', t: 'seg', opts: ['Comprato', 'Prodotto in azienda'], show: isT('Carico'), hint: 'Per i silos: quanto del contenuto è prodotto in azienda e quanto comprato' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today(), tipo: 'Carico' }),
    onChange(ch, v) { if (ch === null || ch === 'prodottoId') { const p = get('prodotti', v.prodottoId); setUnit('quantita', p ? p.unita : ''); } },
    async save(id, v) {
      await store.put('movimenti', id, v);
      if (v.tipo === 'Carico' && N(v.prezzo) > 0) { const p = get('prodotti', v.prodottoId); if (p && N(p.prezzo) !== N(v.prezzo)) await store.put('prodotti', p.id, Object.assign({}, p, { prezzo: N(v.prezzo) })); }
    },
    canDel: m => m.caricoId ? 'Questo carico viene da una pesata: modificalo da Pesate del raccolto.' : m.opId || m.evId ? 'Questo scarico viene da una registrazione: modificala dal quaderno o dalla stalla.' : null,
  },
  mezzi: {
    title: 'Mezzo', icon: 'tractor',
    fields: () => [
      { k: 'nome', l: 'Nome', req: 1, ph: 'Es. Trattore 140 CV' },
      { k: 'tipo', l: 'Tipo', t: 'select', opts: TIPI_MEZZO, half: 1 },
      { k: 'catalogo', l: 'Modello per il libretto', t: 'select', opts: OPZ_MODELLI, blank: 'Altro modello', show: v => v.tipo === 'Trattore', hint: 'Collega il catalogo ricambi e gli intervalli di manutenzione del modello' },
      { k: 'modello', l: 'Marca e modello', half: 1 },
      { k: 'targa', l: 'Targa', half: 1 },
      { k: 'serie', l: 'Numero di serie (PIN)', half: 1, show: v => v.tipo === 'Trattore', hint: 'Sulla targhetta del trattore: i ricambi cambiano con il numero di serie' },
      { k: 'anno', l: 'Anno', t: 'number', half: 1 },
      { k: 's1', l: 'Ore e costi', t: 'section' },
      { k: 'oreIniziali', l: 'Ore motore attuali', t: 'number', half: 1, unit: 'h', hint: 'Le ore dei lavori si sommano da qui' },
      { k: 'costoOra', l: 'Costo orario', t: 'number', half: 1, unit: '€/h', hint: 'Gasolio, usura, ammortamento' },
      { k: 'intervallo', l: 'Tagliando ogni', t: 'number', half: 1, unit: 'h', show: v => v.tipo !== 'Trattore' },
      { k: 'oreUltimoTagliando', l: 'Ultimo tagliando a', t: 'number', half: 1, unit: 'h', show: v => v.tipo !== 'Trattore' },
      { k: 's2', l: 'Scadenze', t: 'section' },
      { k: 'scadenzaRevisione', l: 'Revisione', t: 'date', half: 1 },
      { k: 'scadenzaAssicurazione', l: 'Assicurazione', t: 'date', half: 1 },
      { k: 'controlloFunzionale', l: 'Controllo funzionale valido fino al', t: 'date', half: 1, show: v => v.tipo === 'Irroratrice', hint: 'Obbligatorio per le irroratrici (PAN)' },
      { k: 'taratura', l: 'Ultima regolazione strumentale', t: 'date', half: 1, show: v => v.tipo === 'Irroratrice' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    canDel: m => S.manutenzioni.some(x => x.mezzoId === m.id) || S.operazioni.some(o => o.mezzoId === m.id) ? 'Il mezzo ha lavori o manutenzioni registrati e non si può eliminare.' : null,
    onChange(ch, v) { if (ch === 'catalogo' && MODELLI[v.catalogo]) { const md = MODELLI[v.catalogo], n = md.marca + ' ' + md.modello; if (!FORM.dirty.has('modello')) setVal('modello', n); if (!v.nome) setVal('nome', n); } },
  },
  manutenzioni: {
    title: 'Manutenzione', icon: 'wrench',
    fields: () => [
      { k: 'mezzoId', l: 'Mezzo', t: 'select', opts: oMezzi, req: 1, blank: 'Scegli' },
      { k: 'tipo', l: 'Intervento', t: 'select', opts: TIPI_MAN, req: 1, half: 1, blank: false },
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'ore', l: 'Ore motore', t: 'number', half: 1, unit: 'h' },
      { k: 'costo', l: 'Costo', t: 'number', half: 1, unit: '€' },
      { k: 'descrizione', l: 'Descrizione', ph: 'Es. olio motore e filtri' },
      { k: 'officina', l: 'Officina', half: 1 },
      { k: 'fattura', l: 'N. fattura', half: 1 },
      { k: 'componenti', l: 'Pezzi sostituiti o rabboccati', t: 'checks', opts: () => GRUPPI_COMP.map(([g, l]) => [l, CATALOGO.filter(c => c.g === g).map(c => [c.id, c.nome])]), show: v => isTrattore(get('mezzi', v.mezzoId)), hint: 'Aggiornano il libretto: da qui partono le prossime scadenze di ogni pezzo' },
      { k: 'ricambi', l: 'Ricambi e voci della fattura', t: 'rows', addLabel: 'Aggiungi voce', cols: [{ k: 'codice', l: 'Codice', ph: 'Codice', w: '1fr' }, { k: 'descrizione', l: 'Descrizione', ph: 'Descrizione', w: '1.6fr' }, { k: 'qta', l: 'Q.tà', ph: 'Q.tà', t: 'number', w: '60px' }, { k: 'importo', l: 'Importo', ph: 'Importo €', t: 'number', unit: '€', w: '90px' }] },
      { k: 'allegati', l: 'Fattura e foto', t: 'box' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today(), tipo: 'Tagliando' }),
    onChange(ch, v) {
      if (ch === null) boxAllegati();
      if ((ch === null || ch === 'tipo' || ch === 'mezzoId') && v.tipo === 'Tagliando' && !FORM.dirty.has('componenti') && !(v.componenti || []).length && isTrattore(get('mezzi', v.mezzoId)) && !FORM.id) setVal('componenti', ['olio_motore']);
    },
    async save(id, v) { await salvaAllegati(id, v); },
  },
  operatori: {
    title: 'Operatore', icon: 'id-card',
    fields: () => [
      { k: 'nome', l: 'Nome e cognome', req: 1, ph: 'Come lo scrivi nelle attività' },
      { k: 'ruolo', l: 'Ruolo', t: 'seg', opts: ['Titolare', 'Dipendente', 'Familiare', 'Contoterzista'] },
      { k: 'patentino', l: 'N. certificato di abilitazione (patentino)', half: 1, ph: 'Es. FVG/UD/12345' },
      { k: 'scadenzaPatentino', l: 'Valido fino al', t: 'date', half: 1 },
      { k: 'cf', l: 'Codice fiscale', half: 1 },
      { k: 'telefono', l: 'Telefono', half: 1 },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ ruolo: 'Dipendente' }),
    validate: v => { const dup = S.operatori.find(o => (o.nome || '').toLowerCase() === (v.nome || '').toLowerCase() && o.id !== (FORM && FORM.id)); return dup ? 'Esiste già un operatore con questo nome.' : null; },
  },
  strutture: {
    title: 'Stalla', icon: 'layout-grid',
    fields: () => [
      { k: 'nome', l: 'Nome', req: 1, ph: 'Es. Stalla vacche in lattazione' },
      { k: 'tipo', l: 'Tipo', t: 'seg', opts: ['Stalla libera', 'Stalla fissa', 'Vitellaia', 'Paddock o pascolo'] },
      { k: 'box', l: 'Box e recinti', t: 'rows', addLabel: 'Aggiungi box', hint: 'Ogni box ha una fase e un numero di posti: i capi si assegnano ai box.',
        cols: [{ k: 'nome', l: 'Nome box', ph: 'Es. Box 1', w: 'minmax(110px,1.4fr)' }, { k: 'fase', l: 'Fase', t: 'select', opts: FASI_BOX, ph: 'Fase', w: 'minmax(110px,1.2fr)' }, { k: 'posti', l: 'Posti', t: 'number', ph: '0', w: '90px' }] },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ tipo: 'Stalla libera', box: [{ nome: 'Box 1', fase: 'Lattazione' }] }),
    validate: v => { const n = (v.box || []).map(b => (b.nome || '').trim()); if (n.some(x => !x)) return 'Dai un nome a ogni box.'; if (new Set(n).size !== n.length) return 'Due box hanno lo stesso nome.'; return null; },
    canDel: x => S.capi.some(c => String(c.box || '').startsWith(x.id + '|') && capoI(c).stato !== 'Uscita') ? 'Nella stalla ci sono ancora capi: spostali prima in un altro box.' : null,
  },
  silos: {
    title: 'Silo o deposito', icon: 'cylinder',
    fields: () => [
      { k: 'nome', l: 'Nome', req: 1, ph: 'Es. Trincea 1' },
      { k: 'tipo', l: 'Tipo', t: 'seg', opts: ['Trincea', 'Silo verticale', 'Fienile', 'Serbatoio'] },
      { k: 'prodottoId', l: 'Contenuto (dal magazzino)', t: 'select', opts: oProd(['Foraggio', 'Mangime', 'Altro']), blank: 'Non collegato', hint: 'Collegato al magazzino, il livello segue carichi, scarichi e razioni' },
      { k: 'capacita', l: 'Capacità', t: 'number', half: 1, unit: 't', req: 1 },
      { k: 'carico', l: 'Contenuto attuale', t: 'number', half: 1, unit: 't', show: v => !v.prodottoId },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ tipo: 'Trincea' }),
  },
  capi: {
    title: 'Capo', icon: 'cow',
    fields: () => [
      { k: 'matricola', l: 'Matricola', req: 1, ph: 'IT012000123456', half: 1 },
      { k: 'nome', l: 'Nome', half: 1 },
      { k: 'sesso', l: 'Sesso', t: 'seg', opts: [['F', 'Femmina'], ['M', 'Maschio']], half: 1 },
      { k: 'razza', l: 'Razza', t: 'select', opts: RAZZE, half: 1 },
      { k: 'nascita', l: 'Data di nascita', t: 'date', half: 1 },
      { k: 'gruppo', l: 'Gruppo', t: 'select', opts: GRUPPI, half: 1 },
      { k: 'numero', l: 'N. aziendale o collare', half: 1, hint: 'Il numero usato da sala di mungitura e collari (Alpro, MooMonitor…)' },
      { k: 'box', l: 'Stalla e box', t: 'select', opts: allBoxes, half: 1, blank: 'Nessuno' },
      { k: 's1', l: 'Origine', t: 'section' },
      { k: 'ingresso', l: 'Ingresso in azienda', t: 'date', half: 1 },
      { k: 'lattazioniPrecedenti', l: 'Lattazioni precedenti', t: 'number', half: 1, hint: 'Prima dell\'ingresso o dell\'uso dell\'app' },
      { k: 'madre', l: 'Matricola madre', half: 1 },
      { k: 'padre', l: 'Padre (toro)', half: 1 },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ sesso: 'F' }),
    validate: v => { const dup = S.capi.find(c => c.matricola === v.matricola && c.id !== (FORM && FORM.id)); return dup ? 'Esiste già un capo con questa matricola.' : null; },
    canDel: c => S.eventi.some(e => e.capoId === c.id) ? 'Il capo ha eventi registrati. Per toglierlo dalla mandria registra un\'Uscita.' : null,
  },
  eventi: {
    title: 'Evento di stalla', icon: 'cow',
    fields: () => [
      { k: 'tipo', l: 'Evento', t: 'select', opts: TIPI_EV, req: 1, blank: 'Scegli' },
      { k: 'capoId', l: 'Capo', t: 'select', opts: () => { const a = oCapi(); const cur = FORM && FORM.values && FORM.values.capoId; if (cur && !a.some(x => x[0] === cur)) { const c = get('capi', cur); if (c) a.unshift([c.id, c.matricola + ' (uscito)']); } return a; }, req: 1, half: 1, blank: 'Scegli il capo' },
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'facilita', l: 'Andamento del parto', t: 'seg', opts: ['Normale', 'Assistito', 'Difficile', 'Cesareo'], show: isT('Parto') },
      { k: 'nVitelli', l: 'Vitelli', t: 'seg', opts: [['1', 'Uno'], ['2', 'Gemelli']], show: isT('Parto') },
      { k: 'vitelloSesso', l: 'Vitello', t: 'seg', opts: [['F', 'Femmina'], ['M', 'Maschio']], half: 1, show: isT('Parto') },
      { k: 'vitelloEsito', l: 'Nato', t: 'seg', opts: ['Vivo', 'Morto'], half: 1, show: isT('Parto') },
      { k: 'vitelloMatricola', l: 'Matricola del vitello', show: isT('Parto'), hint: 'Se la indichi, la scheda del vitello si crea da sola' },
      { k: 'vitello2Sesso', l: 'Secondo vitello', t: 'seg', opts: [['F', 'Femmina'], ['M', 'Maschio']], half: 1, show: v => isT('Parto')(v) && v.nVitelli === '2' },
      { k: 'vitello2Esito', l: 'Nato', t: 'seg', opts: ['Vivo', 'Morto'], half: 1, show: v => isT('Parto')(v) && v.nVitelli === '2' },
      { k: 'vitello2Matricola', l: 'Matricola del secondo vitello', show: v => isT('Parto')(v) && v.nVitelli === '2' },
      { k: 'metodoFec', l: 'Metodo', t: 'seg', opts: [['Inseminazione artificiale', 'IA'], ['Monta naturale', 'Monta'], ['Embryo transfer', 'ET']], show: isT('Fecondazione') },
      { k: 'toro', l: 'Toro o seme', half: 1, show: isT('Fecondazione') },
      { k: 'esito', l: 'Esito', t: 'seg', opts: ['Positiva', 'Negativa'], req: 1, half: 1, show: isT('Diagnosi gravidanza') },
      { k: 'metodoDiag', l: 'Metodo', t: 'select', opts: ['Ecografia', 'Palpazione', 'Test sul latte'], half: 1, show: isT('Diagnosi gravidanza') },
      { k: 'prodottoId', l: 'Farmaco dal magazzino', t: 'select', opts: oProd(['Farmaco veterinario']), show: isTr, blank: 'Non in magazzino' },
      { k: 'farmaco', l: 'Nome del farmaco', show: v => isTr(v) && !v.prodottoId },
      { k: 'quantita', l: 'Quantità usata', t: 'number', half: 1, show: v => !!v.prodottoId && isTr(v), hint: 'Si scarica dal magazzino' },
      { k: 'motivo', l: 'Diagnosi o motivo', half: 1, show: isTr, ph: 'Es. mastite clinica' },
      { k: 'sospLatte', l: 'Sospensione latte', t: 'number', half: 1, unit: 'giorni', show: isTr },
      { k: 'sospCarne', l: 'Sospensione carne', t: 'number', half: 1, unit: 'giorni', show: isTr },
      { k: 'ricetta', l: 'N. ricetta elettronica', half: 1, show: isTr },
      { k: 'veterinario', l: 'Veterinario', half: 1, show: isT('Trattamento sanitario', 'Vaccinazione', 'Diagnosi gravidanza') },
      { k: 'kg', l: 'Latte', t: 'number', half: 1, unit: 'kg/g', show: isT('Controllo funzionale') },
      { k: 'cellule', l: 'Cellule', t: 'number', half: 1, unit: '×1000', show: isT('Controllo funzionale') },
      { k: 'grasso', l: 'Grasso', t: 'number', half: 1, unit: '%', show: isT('Controllo funzionale') },
      { k: 'proteine', l: 'Proteine', t: 'number', half: 1, unit: '%', show: isT('Controllo funzionale') },
      { k: 'motivoUscita', l: 'Motivo', t: 'seg', opts: ['Vendita', 'Macellazione', 'Morte', 'Altro'], req: 1, show: isT('Uscita') },
      { k: 'destinatario', l: 'Destinatario', show: isT('Uscita') },
      { k: 'operatore', l: 'Operatore', half: 1, show: isT('Fecondazione', 'Calore', 'Messa in asciutta', 'Parto') },
      { k: 'invia', l: 'Invia anche a', t: 'checks', opts: [['', [['moomonitor', 'MooMonitor'], ['sialleva', 'Si@lleva']]]], show: isT('Fecondazione', 'Diagnosi gravidanza', 'Messa in asciutta', 'Parto') },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today() }),
    onChange(ch, v) { if (ch === 'prodottoId') { const p = get('prodotti', v.prodottoId); if (p) { if (!FORM.dirty.has('sospLatte') && N(p.sospLatte)) setVal('sospLatte', p.sospLatte); if (!FORM.dirty.has('sospCarne') && N(p.sospCarne)) setVal('sospCarne', p.sospCarne); setHint('quantita', 'In ' + (p.unita || '') + ', si scarica dal magazzino'); } } },
    async save(id, v) {
      const nid = await store.put('eventi', id, v);
      await mettiInCoda(nid, v);
      const mov = S.movimenti.find(m => m.evId === nid); const c = get('capi', v.capoId);
      if (v.prodottoId && N(v.quantita) > 0) await store.put('movimenti', mov ? mov.id : null, { data: v.data, prodottoId: v.prodottoId, tipo: 'Scarico', quantita: N(v.quantita), note: (v.tipo || '') + ' · ' + (c ? c.matricola : ''), evId: nid });
      else if (mov) await store.remove('movimenti', mov.id);
      // schede dei vitelli nati vivi con la matricola (anche i gemelli)
      if (!id && v.tipo === 'Parto') {
        const info = D.capi.get(v.capoId); const fec = info && info.fec; let n = 0;
        for (const [m, s, e] of [[v.vitelloMatricola, v.vitelloSesso, v.vitelloEsito], [v.nVitelli === '2' ? v.vitello2Matricola : '', v.vitello2Sesso, v.vitello2Esito]]) {
          if (!m || (s !== 'F' && s !== 'M') || e === 'Morto' || S.capi.some(x => x.matricola === m)) continue;
          await store.put('capi', null, { matricola: m, sesso: s, nascita: v.data, madre: c ? c.matricola : '', padre: (fec && fec.toro) || '', razza: c ? c.razza || '' : '', gruppo: s === 'F' ? 'Vitelle' : 'Vitelli', ingresso: v.data }); n++;
        }
        if (n && FORM) FORM.done = (n > 1 ? 'Parto registrato e schede dei vitelli create' : 'Parto registrato e scheda del vitello creata') + (FORM.done ? ' · ' + FORM.done.replace('Evento salvato e messo', 'messo') : '');
      }
    },
    async remove(e) { const mov = S.movimenti.find(m => m.evId === e.id); if (mov) await store.remove('movimenti', mov.id); await store.remove('eventi', e.id); },
  },
  latte: {
    title: 'Latte del giorno', icon: 'milk',
    fields: () => [
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'vacche', l: 'Vacche munte', t: 'number', half: 1 },
      { k: 'litri', l: 'Prodotti', t: 'number', req: 1, half: 1, unit: 'litri' },
      { k: 'conferiti', l: 'Conferiti', t: 'number', half: 1, unit: 'litri', hint: 'Se vuoto, uguale ai prodotti' },
      { k: 'scartati', l: 'Scartati', t: 'number', half: 1, unit: 'litri' },
      { k: 'prezzo', l: 'Prezzo', t: 'number', half: 1, unit: '€/l' },
      { k: 's1', l: 'Qualità (analisi)', t: 'section' },
      { k: 'grasso', l: 'Grasso', t: 'number', half: 1, unit: '%' },
      { k: 'proteine', l: 'Proteine', t: 'number', half: 1, unit: '%' },
      { k: 'cellule', l: 'Cellule somatiche', t: 'number', half: 1, unit: '×1000/ml' },
      { k: 'cbt', l: 'Carica batterica', t: 'number', half: 1, unit: '×1000/ml' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => { const last = D.latte[D.latte.length - 1]; const sosp = S.capi.filter(c => capoI(c).inSospLatte); return { data: today(), vacche: S.capi.filter(c => capoI(c).stato === 'In lattazione').length || null, prezzo: last ? last.prezzo : null, note: sosp.length ? 'In sospensione: ' + sosp.map(c => c.nome || c.matricola).join(', ') : '' }; },
    validate: v => { const ex = S.latte.find(l => l.id === v.data); return ex && ex.id !== (FORM && FORM.id) ? 'Il latte del ' + fd(v.data) + ' è già registrato: aprilo dal registro per modificarlo.' : null; },
    async save(id, v) { await store.put('latte', v.data, v); if (id && id !== v.data) await store.remove('latte', id); },
  },
  note: {
    title: 'Nota', icon: 'pencil',
    fields: () => [
      { k: 'titolo', l: 'Titolo', req: 1, ph: 'Es. Prova irrigazione pivot' },
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'campoId', l: 'Campo', t: 'select', opts: oCampi, half: 1, blank: 'Nessun campo' },
      { k: 'colore', l: 'Etichetta', t: 'seg', opts: [['', 'Nessuna'], ['verde', 'Verde'], ['giallo', 'Gialla'], ['rossa', 'Rossa'], ['blu', 'Blu']] },
      { k: 'testo', l: 'Testo', t: 'textarea', ph: 'Osservazioni, misure, promemoria…' }],
    defaults: () => ({ data: today(), colore: '' }),
  },
  razioni: {
    title: 'Razione', icon: 'wheat',
    fields: () => [
      { k: 'nome', l: 'Nome della razione', req: 1, ph: 'Es. Unifeed alta produzione' },
      { k: 'gruppo', l: 'Gruppo', t: 'select', opts: GRUPPI, half: 1 },
      { k: 'capi', l: 'Numero di capi', t: 'number', half: 1, hint: 'Vuoto: conta i capi del gruppo' },
      { k: 'ingredienti', l: 'Alimenti, kg tal quale per capo al giorno', t: 'lines', opts: oProd(['Mangime', 'Foraggio', 'Altro']), req: 1 },
      { k: 'autoDal', l: 'Scarico automatico dal', t: 'date', hint: 'Ogni giorno toglie dal magazzino i kg per capo × i capi, anche per i giorni in cui l\'app è rimasta chiusa. Vuoto: niente scarico automatico' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    // cambiando la data di partenza lo scarico riparte da lì (i giorni già scaricati non si ripetono)
    // riattivato dopo una pausa (prima senza data, ma già scaricato in passato): riparte da oggi, non recupera i giorni fermi
    async save(id, v) {
      const old = id ? get('razioni', id) : null;
      // togliendo la data autoFino resta (serve a riconoscere la ripresa); cambiandola lo scarico riparte dalla data nuova
      if (old && (old.autoDal || '') !== (v.autoDal || '') && v.autoDal) v.autoFino = !old.autoDal && old.autoFino ? addDays(today(), -1) : null;
      const nid = await store.put('razioni', id, v);
      if (okD(v.autoDal)) { try { const k = await scaricaRazioni(); if (k) setTimeout(() => toast('Razioni: ' + k + ' scarichi registrati in magazzino'), 1800); } catch (e) { console.warn('scarico delle razioni', e); } }
      return nid;
    },
  },
};

function sceltaBlocco(rec, blocco) {
  const c0 = get('campi', rec.campoId); const ha = blocco.reduce((t, o) => t + campoHa(get('campi', o.campoId) || {}), 0);
  const nomi = blocco.map(o => (get('campi', o.campoId) || {}).nome || 'campo eliminato');
  const b = openSheet('Attività su più campi', `<p>Questa ${esc((rec.tipo || 'attività').toLowerCase())} fa parte di un <b>blocco di ${blocco.length} attività</b> registrate insieme (${nf(ha, 2)} ha):</p>
  <p class="muted small">${nomi.map(esc).join(' · ')}</p><p>Vuoi modificarle tutte?</p>
  <div class="btns"><button class="btn primary" data-bl="tutte">Modifica tutte e ${blocco.length}</button><button class="btn ghost" data-bl="una">Solo questa (${esc(c0 ? c0.nome : 'campo eliminato')})</button></div>`);
  b.onclick = e => { const x = e.target.closest('[data-bl]'); if (!x) return;
    if (x.dataset.bl === 'una') openEdit('operazioni', rec.id, null, true);
    else import('./wizard.js').then(m => m.modificaBlocco(rec.gruppo)); };
}
export function openEdit(c, id, pre, soloQuesta) {
  const spec = SPEC[c]; const rec = id ? get(c, id) : null;
  if (id && !rec) { toast('Registrazione non trovata', 'err'); return; }
  // attività registrata su più campi insieme (stesso `gruppo`): chiede se modificare tutto il blocco
  if (c === 'operazioni' && rec && rec.gruppo && !soloQuesta) { const blocco = S.operazioni.filter(o => o.gruppo === rec.gruppo); if (blocco.length > 1) return sceltaBlocco(rec, blocco); }
  const need = { operazioni: ['campi', 'Prima aggiungi un appezzamento.'], eventi: ['capi', 'Prima aggiungi un capo.'], manutenzioni: ['mezzi', 'Prima aggiungi un mezzo.'], movimenti: ['prodotti', 'Prima aggiungi un prodotto in magazzino.'] }[c];
  if (need && !S[need[0]].length) { toast(need[1], 'err'); return; }
  if (c === 'razioni' && !S.prodotti.some(p => ['Mangime', 'Foraggio', 'Altro'].includes(p.categoria))) { toast('Prima inserisci in magazzino mangimi e foraggi in kg.', 'err'); return; }
  const values = rec ? Object.assign({}, rec) : Object.assign({}, spec.defaults ? spec.defaults() : {}, pre || {});
  if (c === 'campi' && values.geom && !N(values.superficie)) values.superficie = Math.round(areaHa(values.geom) * 10000) / 10000;
  const fields = spec.fields();
  const fk = new Set(fields.map(f => f.k));
  openForm({
    title: rec ? 'Modifica ' + spec.title.toLowerCase() : spec.title, fields, values, id,
    validate: spec.validate, onChange: spec.onChange,
    onSave: async v => {
      const full = {}; for (const k in values) if (!fk.has(k) && k !== 'id') full[k] = values[k];
      Object.assign(full, v);
      if (spec.save) await spec.save(id || null, full); else await store.put(c, id || null, full);
    },
    onDelete: rec ? async () => {
      const why = spec.canDel && spec.canDel(rec); if (why) { toast(why, 'err'); return false; }
      if (spec.remove) await spec.remove(rec); else await store.remove(c, id);
      document.dispatchEvent(new CustomEvent('ces:deleted', { detail: { c, id } }));
      return true;
    } : null,
  });
}

// Seconda coltura dell'annata: campi s_… del modulo <-> oggetto `secondo` della riga
function secondoValori(s) { return s ? { s_uso: s.uso || 'Secondo raccolto', s_coltura: s.coltura, s_varieta: s.varieta, s_semina: s.semina, s_resa: s.resa, s_destinazione: s.destinazione } : { s_uso: 'Secondo raccolto' }; }
function secondoDa(v) {
  if (!v.s_coltura) return null;
  return { coltura: v.s_coltura, varieta: v.s_varieta || '', semina: v.s_semina || '', resa: v.s_resa, destinazione: v.s_destinazione || '', uso: v.s_uso || 'Secondo raccolto' };
}

// Raccolta: "chiude la coltura?" si propone da solo (No per medica, prato e simili) se non è già scelto
export function chiudeAuto(ch, v, tipo, campoId) {
  if (tipo !== 'Raccolta' || ![null, 'campoId', 'data', 'tipo'].includes(ch)) return;
  if ((ch === null && v.chiude) || (FORM && FORM.dirty.has('chiude'))) return;   // valore già salvato o scelto a mano
  const c = get('campi', campoId); const col = c && v.data ? (colturaAlla(c, v.data) || {}).coltura || '' : '';
  setVal('chiude', /medica|prato|loiessa|loietto|erba|trifoglio/i.test(col) ? 'No' : 'Sì');
}

// Coltura di un'annata dentro la scheda del campo
export function openColtura(campoId, anno) {
  const c = get('campi', campoId); if (!c) return;
  const y = anno || new Date().getFullYear();
  const st = Array.isArray(c.colture) ? c.colture : [];
  const cur = st.find(x => +x.anno === +y) || (+y === new Date().getFullYear() && c.coltura ? { anno: y, coltura: c.coltura, varieta: c.varieta } : null);
  const anni = []; for (let a = new Date().getFullYear() + 1; a >= new Date().getFullYear() - 8; a--) anni.push(String(a));
  openForm({
    title: cur ? 'Modifica coltura' : 'Aggiungi coltura', sub: c.nome,
    fields: [
      { k: 'anno', l: 'Annata', t: 'select', opts: anni, req: 1, half: 1, blank: false },
      { k: 'coltura', l: 'Coltura', req: 1, half: 1, list: coltureNote() },
      { k: 'varieta', l: 'Varietà o ibrido', half: 1 },
      { k: 'semina', l: 'Data di semina o trapianto', t: 'date', half: 1 },
      { k: 'resa', l: 'Resa attesa', t: 'number', half: 1, unit: 't/ha' },
      { k: 'destinazione', l: 'Destinazione', half: 1, ph: 'Es. trinciato aziendale' },
      { k: 's_sez', l: 'Dopo questa coltura, nello stesso anno', t: 'section' },
      { k: 's_uso', l: "Che cos'è", t: 'seg', opts: ['Secondo raccolto', 'Coltura di copertura'] },
      { k: 's_coltura', l: 'Seconda coltura', half: 1, list: coltureNote(), ph: 'Es. soia, loiessa, sorgo' },
      { k: 's_varieta', l: 'Varietà', half: 1 },
      { k: 's_semina', l: 'Data di semina', t: 'date', half: 1 },
      { k: 's_resa', l: 'Resa attesa', t: 'number', half: 1, unit: 't/ha' },
      { k: 's_destinazione', l: 'Destinazione', half: 1 }],
    values: Object.assign({ anno: String(y) }, cur || {}, { anno: String(y) }, secondoValori(cur && cur.secondo)),
    onSave: async v => {
      const list = (Array.isArray(c.colture) ? c.colture : []).filter(x => +x.anno !== +v.anno);
      const riga = Object.assign({}, v, { anno: +v.anno }); const sec = secondoDa(v);
      Object.keys(riga).forEach(k => { if (k.startsWith('s_')) delete riga[k]; });
      delete riga.secondo; if (sec) riga.secondo = sec;
      list.push(riga);
      const upd = Object.assign({}, c, { colture: list.sort((a, b) => b.anno - a.anno) });
      if (+v.anno === new Date().getFullYear()) { upd.coltura = v.coltura; upd.varieta = v.varieta; }
      await store.put('campi', c.id, upd);
    },
    onDelete: cur && st.some(x => +x.anno === +y) ? async () => { await store.put('campi', c.id, Object.assign({}, c, { colture: st.filter(x => +x.anno !== +y) })); return true; } : null,
  });
}

// Ricerca nella banca dati ministeriale dentro la scheda prodotto
function dbBox(v) {
  const box = document.getElementById('box_dbbox'); if (!box) return;
  const hit = fitoLookup(v.nReg);
  const status = hit ? `<div class="db-hit ${hit.revocato ? 'bad' : 'ok'}"><b>${esc(hit.nome)}</b><span>reg. ${esc(hit.nReg)} · ${esc(hit.impresa || '')}${hit.scadenza ? ' · autorizzato fino al ' + fd(hit.scadenza) : ''}${hit.stato ? ' · ' + esc(hit.stato) : ''}</span>${etichettaUrl(hit) ? `<a class="btn sm ghost" href="${etichettaUrl(hit)}" target="_blank" rel="noopener">Apri l'etichetta${hit.etichetta.data ? ' del ' + fd(hit.etichetta.data) : ''}</a>` : ''}</div>` : '';
  if (!fitoMeta.n) { box.innerHTML = `<div class="db-box"><p class="muted small" style="margin:0">La banca dati del Ministero arriva da sola quando l'app è collegata a internet (oppure si carica in <b>La mia azienda → Banca dati fitofarmaci</b>): serve a compilare questa scheda e a sapere se il prodotto è ancora autorizzato.</p></div>`; return; }
  box.innerHTML = `<div class="db-box"><div class="search">${'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'}<input class="inp" id="dbq" placeholder="Cerca nella banca dati (${fitoMeta.n} prodotti): nome, n. registrazione o sostanza" autocomplete="off"></div><div id="dbres" class="db-res"></div>${status}</div>`;
  const q = box.querySelector('#dbq'), res = box.querySelector('#dbres');
  q.oninput = () => { const r = fitoSearch(q.value, 12); res.innerHTML = r.map(x => `<button type="button" class="db-row${x.revocato ? ' rev' : ''}" data-reg="${esc(x.nReg)}"><b>${esc(x.nome)}</b><span>reg. ${esc(x.nReg)} · ${esc(x.sostanze || x.attivita || '')}${x.revocato ? ' · non autorizzato' : ''}</span></button>`).join('') || (q.value.trim().length > 1 ? '<div class="muted small">Nessun prodotto trovato.</div>' : ''); };
  res.onclick = e => { const b = e.target.closest('[data-reg]'); if (!b) return; const x = fitoLookup(b.dataset.reg); if (!x) return;
    setVal('nome', x.nome); setVal('nReg', x.nReg); if (x.sostanze) setVal('sostanze', x.sostanze); if (x.scadenza) setVal('scadenzaAut', x.scadenza); if (x.impresa) setVal('impresa', x.impresa);
    ['nome', 'nReg', 'sostanze', 'scadenzaAut', 'impresa'].forEach(k => FORM && FORM.dirty.add(k)); q.value = ''; res.innerHTML = ''; dbBox(Object.assign({}, v, { nReg: x.nReg })); };
}

// Coltura di un'annata su più campi insieme (scelti sulla mappa). Ogni campo riceve la stessa riga dell'annata;
// se un campo ne aveva già una per quell'anno viene sostituita (come nel modulo del singolo campo).
export function openColturaGruppo(ids, anno) {
  const campi = ids.map(id => get('campi', id)).filter(Boolean); if (!campi.length) return;
  const y = +(anno || UI.anno || new Date().getFullYear()); const oggi = new Date().getFullYear();
  const anni = []; for (let a = oggi + 1; a >= oggi - 8; a--) anni.push(String(a));
  const ha = campi.reduce((t, c) => t + campoHa(c), 0);
  const giaDi = a => campi.filter(c => (c.colture || []).some(x => +x.anno === +a) || (+a === oggi && c.coltura));
  // se hanno tutti la stessa coltura per l'annata, il modulo parte da quella
  const righe = campi.map(c => (c.colture || []).find(x => +x.anno === y) || (y === oggi && c.coltura ? { coltura: c.coltura, varieta: c.varieta } : null));
  const uguale = righe.every(r => r && r.coltura === (righe[0] && righe[0].coltura)) ? righe[0] : null;
  const avviso = a => { const g = giaDi(a); return g.length ? `${g.length} ${g.length === 1 ? 'campo ha' : 'campi hanno'} già una coltura nel ${a}: verrà sostituita` : `Nessuno dei campi ha già una coltura nel ${a}`; };
  openForm({
    title: 'Coltura su ' + campi.length + (campi.length === 1 ? ' campo' : ' campi'), sub: nf(ha, 2) + ' ha · ' + campi.map(c => c.nome).slice(0, 4).join(', ') + (campi.length > 4 ? ' e altri ' + (campi.length - 4) : ''),
    fields: [
      { k: 'anno', l: 'Annata', t: 'select', opts: anni, req: 1, half: 1, blank: false, hint: avviso(y) },
      { k: 'coltura', l: 'Coltura', req: 1, half: 1, list: coltureNote() },
      { k: 'varieta', l: 'Varietà o ibrido', half: 1 },
      { k: 'semina', l: 'Data di semina o trapianto', t: 'date', half: 1 },
      { k: 'resa', l: 'Resa attesa', t: 'number', half: 1, unit: 't/ha' },
      { k: 'destinazione', l: 'Destinazione', half: 1, ph: 'Es. trinciato aziendale' }],
    values: Object.assign({}, uguale || {}, { anno: String(y) }),
    saveLabel: 'Salva su ' + campi.length + (campi.length === 1 ? ' campo' : ' campi'),
    onChange(ch, v) { if (ch === 'anno') setHint('anno', avviso(v.anno)); },
    onSave: async v => {
      const a = +v.anno; const riga = Object.assign({}, v, { anno: a });
      const rows = campi.map(c => {
        const prec = (Array.isArray(c.colture) ? c.colture : []).find(x => +x.anno === a); const list = (Array.isArray(c.colture) ? c.colture : []).filter(x => +x.anno !== a); list.push(Object.assign({}, riga, prec && prec.secondo ? { secondo: prec.secondo } : {}));
        const upd = Object.assign({}, c, { colture: list.sort((p, q) => q.anno - p.anno) });
        if (a === oggi) { upd.coltura = v.coltura; upd.varieta = v.varieta; }
        return { col: 'campi', id: c.id, data: upd };
      });
      await store.bulkPut(rows);
      if (FORM) FORM.done = `${v.coltura} ${a} su ${campi.length} ${campi.length === 1 ? 'campo' : 'campi'} (${nf(ha, 2)} ha)`;
    },
    onDelete: giaDi(y).length ? async () => {
      const a = +(readForm().anno || y);
      const rows = giaDi(a).map(c => { const upd = Object.assign({}, c, { colture: (c.colture || []).filter(x => +x.anno !== a) }); if (a === oggi) { upd.coltura = ''; upd.varieta = ''; } return { col: 'campi', id: c.id, data: upd }; });
      if (rows.length) await store.bulkPut(rows);
      toast('Coltura ' + a + ' tolta da ' + rows.length + (rows.length === 1 ? ' campo' : ' campi'));
      return true;
    } : null,
  });
}

// Gruppo, conduzione, comune e irriguo su più campi: si cambia solo quello che si compila
export function openDatiGruppo(ids) {
  const campi = ids.map(id => get('campi', id)).filter(Boolean); if (!campi.length) return;
  const gruppi = [...new Set(S.campi.map(c => (c.gruppo || '').trim()).filter(Boolean))].sort();
  const comuni = [...new Set(S.campi.map(c => (c.comune || '').trim()).filter(Boolean))].sort();
  const stesso = k => { const s = new Set(campi.map(c => c[k] || '')); return s.size === 1 ? [...s][0] : ''; };
  const ha = campi.reduce((t, c) => t + campoHa(c), 0);
  openForm({
    title: 'Dati di ' + campi.length + (campi.length === 1 ? ' campo' : ' campi'), sub: nf(ha, 2) + ' ha · lascia vuoto quello che non vuoi cambiare',
    fields: [
      { k: 'gruppo', l: 'Gruppo', list: gruppi, ph: stesso('gruppo') ? '' : 'Diversi: lascia vuoto per non cambiarli', hint: 'Scrivi "-" per togliere il gruppo' },
      { k: 'conduzione', l: 'Conduzione', t: 'seg', opts: [['', 'Non cambiare'], 'Proprietà', 'Affitto', 'Comodato'] },
      { k: 'comune', l: 'Comune', half: 1, list: comuni, ph: stesso('comune') ? '' : 'Diversi' },
      { k: 'irriguo', l: 'Irriguo', t: 'seg', half: 1, opts: [['', 'Non cambiare'], 'Sì', 'No'] }],
    values: { gruppo: stesso('gruppo'), comune: stesso('comune'), conduzione: '', irriguo: '' },
    saveLabel: 'Salva su ' + campi.length + (campi.length === 1 ? ' campo' : ' campi'),
    onSave: async v => {
      const cambi = {};
      const g = (v.gruppo || '').trim(); if (g === '-') cambi.gruppo = ''; else if (g) cambi.gruppo = g;
      const co = (v.comune || '').trim(); if (co) cambi.comune = co;
      if (v.conduzione) cambi.conduzione = v.conduzione;
      if (v.irriguo) cambi.irriguo = v.irriguo;
      if (!Object.keys(cambi).length) { if (FORM) FORM.done = 'Nessuna modifica'; return; }
      await store.bulkPut(campi.map(c => ({ col: 'campi', id: c.id, data: Object.assign({}, c, cambi) })));
      if (FORM) FORM.done = 'Aggiornati ' + campi.length + (campi.length === 1 ? ' campo' : ' campi');
    },
  });
}

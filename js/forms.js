// Definizione dei moduli di inserimento e delle loro regole
import { S, D, get } from './state.js';
import { N, nf, fd, today, byName } from './util.js';
import * as store from './store.js';
import { openForm, setVal, setHint, setUnit, toast, FORM, readForm } from './ui.js';
import { COLTURE, TIPI_OP, OP_PROD, CATEGORIE, UNITA, TIPI_MEZZO, TIPI_MAN, RAZZE, GRUPPI, TIPI_EV, giac, capoI, campoHa } from './domain.js';
import { areaHa } from './geo.js';
import { controlliOp, checksHTML, forceOk, isFitoOp, FITO } from './checks.js';
import { fitoLookup, fitoSearch, fitoMeta } from './fitodb.js';
import { esc } from './util.js';

const oCampi = () => [...S.campi].sort(byName).map(c => [c.id, `${c.nome} · ${nf(campoHa(c), 2)} ha`]);
const oProd = cats => () => [...S.prodotti].filter(p => !cats || cats.includes(p.categoria)).sort(byName).map(p => [p.id, `${p.nome} — ${nf(giac(p), 1)} ${p.unita || ''}`]);
const oMezzi = () => [...S.mezzi].sort(byName).map(m => [m.id, m.nome]);
const oCapi = () => [...S.capi].filter(c => capoI(c).stato !== 'Uscita').sort((a, b) => (a.matricola || '').localeCompare(b.matricola || '')).map(c => [c.id, `${c.matricola}${c.nome ? ' · ' + c.nome : ''}`]);
const isT = (...t) => v => t.includes(v.tipo);
const isTr = isT('Trattamento sanitario', 'Vaccinazione');
const oOperatori = () => S.operatori.map(o => o.nome).filter(Boolean).sort();
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

export const SPEC = {
  campi: {
    title: 'Appezzamento', icon: 'map',
    fields: () => [
      { k: 'nome', l: 'Nome', req: 1, ph: 'Es. Campo della roggia' },
      { k: 'superficie', l: 'Superficie', t: 'number', req: 1, half: 1, unit: 'ha', hint: 'Calcolata dal confine disegnato, modificabile' },
      { k: 'coltura', l: 'Coltura in atto', half: 1, list: COLTURE },
      { k: 'varieta', l: 'Varietà o ibrido', half: 1 },
      { k: 'irriguo', l: 'Irriguo', t: 'seg', opts: ['Sì', 'No'], half: 1 },
      { k: 's1', l: 'Dati catastali', t: 'section' },
      { k: 'comune', l: 'Comune', half: 1 },
      { k: 'catasto', l: 'Foglio e particelle', half: 1, ph: 'Fg. 12 mapp. 45, 46' },
      { k: 'conduzione', l: 'Conduzione', t: 'seg', opts: ['Proprietà', 'Affitto', 'Comodato'] },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ irriguo: 'No', conduzione: 'Proprietà' }),
    canDel: c => S.operazioni.some(o => o.campoId === c.id) ? 'Il campo ha operazioni registrate: eliminale prima dal quaderno.' : null,
  },
  operazioni: {
    title: 'Operazione in campo', icon: 'notebook-pen',
    fields: () => [
      { k: 'stato', l: 'Stato', t: 'seg', opts: [['Fatto', 'Fatta'], ['Pianificata', 'Da fare']] },
      { k: 'tipo', l: 'Operazione', t: 'select', opts: TIPI_OP, req: 1, blank: 'Scegli' },
      { k: 'data', l: 'Data', t: 'date', req: 1, half: 1 },
      { k: 'campoId', l: 'Appezzamento', t: 'select', opts: oCampi, req: 1, half: 1, blank: 'Scegli il campo' },
      { k: 'prodottoId', l: 'Prodotto dal magazzino', t: 'select', opts: oProd(['Fitofarmaco', 'Diserbante', 'Concime', 'Seme', 'Altro', 'Gasolio']), show: isT(...OP_PROD), blank: 'Nessun prodotto' },
      { k: 'dose', l: 'Dose', t: 'number', half: 1, unit: '/ha', show: v => !!v.prodottoId },
      { k: 'quantita', l: 'Quantità totale', t: 'number', half: 1, show: v => !!v.prodottoId, hint: 'Dose × ettari, si scarica dal magazzino' },
      { k: 'avversita', l: 'Avversità o motivo', show: isT('Trattamento fitosanitario', 'Diserbo'), ph: 'Es. piralide, infestanti dicotiledoni' },
      { k: 'bbch', l: 'Stadio BBCH', half: 1, list: BBCH, show: isT('Trattamento fitosanitario', 'Diserbo', 'Concimazione'), ph: 'Es. 32' },
      { k: 'fase', l: 'Fase fenologica', half: 1, show: isT('Trattamento fitosanitario', 'Diserbo', 'Concimazione'), ph: 'Es. 6 foglie' },
      { k: 'oraInizio', l: 'Ora di inizio', t: 'time', half: 1, show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'volumeAcqua', l: 'Volume d\'acqua', t: 'number', half: 1, unit: 'l/ha', show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'vento', l: 'Vento', t: 'seg', opts: ['Assente', 'Debole', 'Moderato', 'Forte'], show: isT('Trattamento fitosanitario', 'Diserbo') },
      { k: 'meteo', l: 'Condizioni meteo', show: isT('Trattamento fitosanitario', 'Diserbo'), ph: 'Es. sereno, 18 °C' },
      { k: 'raccolto', l: 'Quantità raccolta', t: 'number', half: 1, unit: 't', show: isT('Raccolta', 'Sfalcio') },
      { k: 'prezzoVendita', l: 'Prezzo', t: 'number', half: 1, unit: '€/t', show: isT('Raccolta', 'Sfalcio') },
      { k: 's1', l: 'Mezzi e costi', t: 'section' },
      { k: 'mezzoId', l: 'Mezzo', t: 'select', opts: oMezzi, half: 1, blank: 'Nessuno' },
      { k: 'ore', l: 'Ore di lavoro', t: 'number', half: 1, unit: 'h' },
      { k: 'operatore', l: 'Operatore', half: 1, list: oOperatori() },
      { k: 'costoExtra', l: 'Costi extra', t: 'number', half: 1, unit: '€', hint: 'Contoterzi, acqua, manodopera' },
      { k: 'note', l: 'Note', t: 'textarea' },
      { k: 'controlli', t: 'box' }],
    defaults: () => ({ data: today(), stato: 'Fatto' }),
    validate: v => forceOk((FORM && FORM.checks) || []),
    onChange(ch, v) {
      const p = get('prodotti', v.prodottoId);
      if (ch === null || ch === 'prodottoId') { setUnit('dose', (p ? p.unita : '') + '/ha'); setUnit('quantita', p ? p.unita : ''); setHint('dose', p && N(p.carenza) ? 'Tempo di carenza: ' + p.carenza + ' giorni' : ''); }
      if (!(FORM && FORM.dirty.has('quantita')) && ['dose', 'campoId', 'prodottoId'].includes(ch)) { const c = get('campi', v.campoId); if (c && v.dose !== null) setVal('quantita', Math.round(N(v.dose) * campoHa(c) * 100) / 100); }
      const c0 = get('campi', v.campoId); runChecks(Object.assign({}, v, readForm()), c0 ? [c0] : [], FORM && FORM.id);
    },
    async save(id, v) {
      if (FORM && FORM.checks) { const bad = FORM.checks.filter(x => x.lv === 'bad'); v.controlli = bad.length ? bad.map(x => x.t) : null; v.controllato = isFitoOp(v.tipo) ? today() : null; }
      const nid = await store.put('operazioni', id, v);
      const mov = S.movimenti.find(m => m.opId === nid); const c = get('campi', v.campoId);
      if (v.prodottoId && N(v.quantita) > 0 && v.stato !== 'Pianificata') await store.put('movimenti', mov ? mov.id : null, { data: v.data, prodottoId: v.prodottoId, tipo: 'Scarico', quantita: N(v.quantita), note: (v.tipo || '') + ' · ' + (c ? c.nome : ''), opId: nid });
      else if (mov) await store.remove('movimenti', mov.id);
    },
    async remove(o) { const mov = S.movimenti.find(m => m.opId === o.id); if (mov) await store.remove('movimenti', mov.id); await store.remove('operazioni', o.id); },
  },
  prodotti: {
    title: 'Prodotto', icon: 'package',
    fields: () => [
      { k: 'nome', l: 'Nome commerciale', req: 1 },
      { k: 'categoria', l: 'Categoria', t: 'select', opts: CATEGORIE, req: 1, half: 1, blank: 'Scegli' },
      { k: 'unita', l: 'Unità di misura', t: 'select', opts: UNITA, req: 1, half: 1, blank: false },
      { k: 'prezzo', l: 'Prezzo per unità', t: 'number', half: 1, unit: '€' },
      { k: 'giacenzaIniziale', l: 'Giacenza iniziale', t: 'number', half: 1, hint: 'Quantità presente quando inizi a usare l\'app' },
      { k: 'scortaMin', l: 'Scorta minima', t: 'number', half: 1 },
      { k: 'scadenza', l: 'Scadenza', t: 'date', half: 1 },
      { k: 'nReg', l: 'N. registrazione', half: 1, show: v => ['Fitofarmaco', 'Diserbante', 'Farmaco veterinario'].includes(v.categoria) },
      { k: 'carenza', l: 'Tempo di carenza', t: 'number', half: 1, unit: 'giorni', show: v => ['Fitofarmaco', 'Diserbante'].includes(v.categoria), hint: 'Valore generale: se in etichetta cambia per coltura, indicalo negli impieghi' },
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
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today(), tipo: 'Carico' }),
    onChange(ch, v) { if (ch === null || ch === 'prodottoId') { const p = get('prodotti', v.prodottoId); setUnit('quantita', p ? p.unita : ''); } },
    async save(id, v) {
      await store.put('movimenti', id, v);
      if (v.tipo === 'Carico' && N(v.prezzo) > 0) { const p = get('prodotti', v.prodottoId); if (p && N(p.prezzo) !== N(v.prezzo)) await store.put('prodotti', p.id, Object.assign({}, p, { prezzo: N(v.prezzo) })); }
    },
    canDel: m => m.opId || m.evId ? 'Questo scarico viene da una registrazione: modificala dal quaderno o dalla stalla.' : null,
  },
  mezzi: {
    title: 'Mezzo', icon: 'tractor',
    fields: () => [
      { k: 'nome', l: 'Nome', req: 1, ph: 'Es. Trattore 140 CV' },
      { k: 'tipo', l: 'Tipo', t: 'select', opts: TIPI_MEZZO, half: 1 },
      { k: 'modello', l: 'Marca e modello', half: 1 },
      { k: 'targa', l: 'Targa o telaio', half: 1 },
      { k: 'anno', l: 'Anno', t: 'number', half: 1 },
      { k: 's1', l: 'Ore e costi', t: 'section' },
      { k: 'oreIniziali', l: 'Ore motore attuali', t: 'number', half: 1, unit: 'h', hint: 'Le ore dei lavori si sommano da qui' },
      { k: 'costoOra', l: 'Costo orario', t: 'number', half: 1, unit: '€/h', hint: 'Gasolio, usura, ammortamento' },
      { k: 'intervallo', l: 'Tagliando ogni', t: 'number', half: 1, unit: 'h' },
      { k: 'oreUltimoTagliando', l: 'Ultimo tagliando a', t: 'number', half: 1, unit: 'h' },
      { k: 's2', l: 'Scadenze', t: 'section' },
      { k: 'scadenzaRevisione', l: 'Revisione', t: 'date', half: 1 },
      { k: 'scadenzaAssicurazione', l: 'Assicurazione', t: 'date', half: 1 },
      { k: 'controlloFunzionale', l: 'Controllo funzionale valido fino al', t: 'date', half: 1, show: v => v.tipo === 'Irroratrice', hint: 'Obbligatorio per le irroratrici (PAN)' },
      { k: 'taratura', l: 'Ultima regolazione strumentale', t: 'date', half: 1, show: v => v.tipo === 'Irroratrice' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    canDel: m => S.manutenzioni.some(x => x.mezzoId === m.id) || S.operazioni.some(o => o.mezzoId === m.id) ? 'Il mezzo ha lavori o manutenzioni registrati e non si può eliminare.' : null,
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
      { k: 'officina', l: 'Officina' },
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today(), tipo: 'Tagliando' }),
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
  capi: {
    title: 'Capo', icon: 'cow',
    fields: () => [
      { k: 'matricola', l: 'Matricola', req: 1, ph: 'IT012000123456', half: 1 },
      { k: 'nome', l: 'Nome', half: 1 },
      { k: 'sesso', l: 'Sesso', t: 'seg', opts: [['F', 'Femmina'], ['M', 'Maschio']], half: 1 },
      { k: 'razza', l: 'Razza', t: 'select', opts: RAZZE, half: 1 },
      { k: 'nascita', l: 'Data di nascita', t: 'date', half: 1 },
      { k: 'gruppo', l: 'Gruppo', t: 'select', opts: GRUPPI, half: 1 },
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
      { k: 'vitelloSesso', l: 'Vitello', t: 'seg', opts: ['F', 'M', 'Gemelli', 'Nato morto'], show: isT('Parto') },
      { k: 'vitelloMatricola', l: 'Matricola del vitello', show: isT('Parto'), hint: 'Se la indichi, la scheda del vitello si crea da sola' },
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
      { k: 'note', l: 'Note', t: 'textarea' }],
    defaults: () => ({ data: today() }),
    onChange(ch, v) { if (ch === 'prodottoId') { const p = get('prodotti', v.prodottoId); if (p) { if (!FORM.dirty.has('sospLatte') && N(p.sospLatte)) setVal('sospLatte', p.sospLatte); if (!FORM.dirty.has('sospCarne') && N(p.sospCarne)) setVal('sospCarne', p.sospCarne); setHint('quantita', 'In ' + (p.unita || '') + ', si scarica dal magazzino'); } } },
    async save(id, v) {
      const nid = await store.put('eventi', id, v);
      const mov = S.movimenti.find(m => m.evId === nid); const c = get('capi', v.capoId);
      if (v.prodottoId && N(v.quantita) > 0) await store.put('movimenti', mov ? mov.id : null, { data: v.data, prodottoId: v.prodottoId, tipo: 'Scarico', quantita: N(v.quantita), note: (v.tipo || '') + ' · ' + (c ? c.matricola : ''), evId: nid });
      else if (mov) await store.remove('movimenti', mov.id);
      if (!id && v.tipo === 'Parto' && v.vitelloMatricola && (v.vitelloSesso === 'F' || v.vitelloSesso === 'M') && !S.capi.some(x => x.matricola === v.vitelloMatricola)) {
        const info = D.capi.get(v.capoId); const fec = info && info.fec;
        await store.put('capi', null, { matricola: v.vitelloMatricola, sesso: v.vitelloSesso, nascita: v.data, madre: c ? c.matricola : '', padre: (fec && fec.toro) || '', razza: c ? c.razza || '' : '', gruppo: v.vitelloSesso === 'F' ? 'Vitelle' : 'Vitelli', ingresso: v.data });
        if (FORM) FORM.done = 'Parto registrato e scheda del vitello creata';
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
      { k: 'note', l: 'Note', t: 'textarea' }],
  },
};

export function openEdit(c, id, pre) {
  const spec = SPEC[c]; const rec = id ? get(c, id) : null;
  if (id && !rec) { toast('Registrazione non trovata', 'err'); return; }
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
      { k: 'coltura', l: 'Coltura', req: 1, half: 1, list: COLTURE },
      { k: 'varieta', l: 'Varietà o ibrido', half: 1 },
      { k: 'semina', l: 'Data di semina o trapianto', t: 'date', half: 1 },
      { k: 'resa', l: 'Resa attesa', t: 'number', half: 1, unit: 't/ha' },
      { k: 'destinazione', l: 'Destinazione', half: 1, ph: 'Es. trinciato aziendale' }],
    values: Object.assign({ anno: String(y) }, cur || {}, { anno: String(y) }),
    onSave: async v => {
      const list = (Array.isArray(c.colture) ? c.colture : []).filter(x => +x.anno !== +v.anno);
      list.push(Object.assign({}, v, { anno: +v.anno }));
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
  const status = hit ? `<div class="db-hit ${hit.revocato ? 'bad' : 'ok'}"><b>${esc(hit.nome)}</b><span>reg. ${esc(hit.nReg)} · ${esc(hit.impresa || '')}${hit.scadenza ? ' · autorizzato fino al ' + fd(hit.scadenza) : ''}${hit.stato ? ' · ' + esc(hit.stato) : ''}</span></div>` : '';
  if (!fitoMeta.n) { box.innerHTML = `<div class="db-box"><p class="muted small" style="margin:0">Carica la banca dati del Ministero in <b>La mia azienda → Banca dati fitofarmaci</b> per compilare questa scheda in automatico e sapere se il prodotto è ancora autorizzato.</p></div>`; return; }
  box.innerHTML = `<div class="db-box"><div class="search">${'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>'}<input class="inp" id="dbq" placeholder="Cerca nella banca dati (${fitoMeta.n} prodotti): nome, n. registrazione o sostanza" autocomplete="off"></div><div id="dbres" class="db-res"></div>${status}</div>`;
  const q = box.querySelector('#dbq'), res = box.querySelector('#dbres');
  q.oninput = () => { const r = fitoSearch(q.value, 12); res.innerHTML = r.map(x => `<button type="button" class="db-row${x.revocato ? ' rev' : ''}" data-reg="${esc(x.nReg)}"><b>${esc(x.nome)}</b><span>reg. ${esc(x.nReg)} · ${esc(x.sostanze || x.attivita || '')}${x.revocato ? ' · non autorizzato' : ''}</span></button>`).join('') || (q.value.trim().length > 1 ? '<div class="muted small">Nessun prodotto trovato.</div>' : ''); };
  res.onclick = e => { const b = e.target.closest('[data-reg]'); if (!b) return; const x = fitoLookup(b.dataset.reg); if (!x) return;
    setVal('nome', x.nome); setVal('nReg', x.nReg); if (x.sostanze) setVal('sostanze', x.sostanze); if (x.scadenza) setVal('scadenzaAut', x.scadenza); if (x.impresa) setVal('impresa', x.impresa);
    ['nome', 'nReg', 'sostanze', 'scadenzaAut', 'impresa'].forEach(k => FORM && FORM.dirty.add(k)); q.value = ''; res.innerHTML = ''; dbBox(Object.assign({}, v, { nReg: x.nReg })); };
}

// Quaderno di campagna: registro dei trattamenti dell'annata, completezza, controllo automatico ed esportazioni.
// La logica sta in js/registro.js (righe, stampa, JSON) e js/quaderno.js (automazione del Centro automatico).
import { UI, bus } from '../state.js';
import { esc, nf, byDate } from '../util.js';
import { ic } from '../icons.js';
import { empty, toast } from '../ui.js';
import { righeTrattamenti } from '../registro.js';
import { registroCard } from '../agenda.js';
import { dubbi, avvia } from '../automazioni.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';

const manca = '<span class="qd-manca">manca</span>';
const cella = v => v ? esc(v) : manca;

function cardLegge() {
  return `<details class="card qd-legge"><summary><b>${ic('scale')}Cosa chiede la legge</b></summary>
  <ul>
    <li>Dal 1° gennaio 2027 il registro dei trattamenti deve essere in formato elettronico (Reg. UE 2023/564 e Reg. UE 2025/2203, decreto del Ministero del 30/12/2025).</li>
    <li>Ogni trattamento va registrato subito, al più tardi entro 30 giorni.</li>
    <li>Per ogni trattamento servono: prodotto e numero di registrazione, data (e ora se l'etichetta limita l'orario), dose per ettaro e quantità, appezzamento e superficie trattata, coltura con codice EPPO, stadio BBCH, avversità.</li>
    <li>Il registro si conserva almeno 3 anni.</li>
  </ul>
  <p class="muted small">Le linee guida del Ministero sul formato sono ancora attese: l'app prepara già il file dati (JSON) con tutti i campi.</p></details>`;
}

function cardAuto() {
  const n = dubbi().filter(d => String(d.id).startsWith('qd-')).length;
  return `<section class="card"><div class="card-h"><h2>${ic('zap')}In automatico</h2></div>
  <p>L'app compila da sola il quaderno dalle operazioni registrate in Attività: calcola la quantità o la dose dagli ettari e aggiunge il meteo dell'ora da Open-Meteo.</p>
  <p class="muted">Quello che manca va fra i "Da controllare" del Centro automatico, con la proposta già pronta.</p>
  <p><b>${n ? n + (n === 1 ? ' dato da controllare' : ' dati da controllare') : 'Niente da controllare'}</b></p>
  <div class="btns qd-btns"><button class="btn primary sm" data-act="qd-avvia">${ic('zap')}Completa ora</button>
  <button class="btn sm" data-act="nav" data-tab="automatico">${ic('list-checks')}Vedi cosa manca</button></div></section>`;
}

function cardScarica() {
  const b = (w, i, t) => `<button class="btn sm" data-act="export" data-what="${w}">${ic(i)}${t}</button>`;
  return `<section class="card"><div class="card-h"><h2>${ic('download')}Scarica il quaderno</h2></div><div class="btns qd-btns">
  ${b('registro', 'printer', 'Stampa o PDF')}${b('registroJson', 'file-text', 'File dati per il registro digitale (JSON)')}${b('quaderno', 'file-spreadsheet', 'Excel / CSV')}${b('registroHtml', 'file-text', 'Pagina da conservare (HTML)')}</div></section>`;
}

function righe(y) {
  return righeTrattamenti(y).sort((a, b) => byDate(b.o, a.o)).map(r => {
    const dose = r.o.dose !== undefined && r.o.dose !== null && r.o.dose !== '' && +r.o.dose > 0 ? nf(r.o.dose, 2) + (r.p.unita ? ' ' + r.p.unita : '') + '/ha' : '';
    return {
      id: r.o.id, data: r.o.data, campo: r.c.nome || '', coltura: r.coltura ? r.coltura + (r.eppo ? ' (' + r.eppo + ')' : '') : '',
      prodotto: r.p.nome || r.o.tipo || '', nreg: r.p.nReg || '', dose, ha: r.ha > 0 ? r.ha : null,
      bbch: r.o.bbch || r.o.fase || '', avversita: r.o.avversita || '', operatore: r.o.operatore || '',
    };
  });
}

function cardTabella(y) {
  const rr = righe(y);
  if (!rr.length) return `<section class="card"><div class="card-h"><h2>${ic('syringe')}Trattamenti ${y}</h2></div>${empty('syringe', 'Nessun trattamento registrato nell\'annata', 'Registra un trattamento o un diserbo in Attività: comparirà qui.')}</section>`;
  const t = tabella('qd_trattamenti', {
    title: 'Trattamenti ' + y,
    cols: [
      { k: 'data', h: 'Data', fmt: 'date' }, { k: 'campo', h: 'Appezzamento' }, { k: 'coltura', h: 'Coltura' }, { k: 'prodotto', h: 'Prodotto' },
      { k: 'nreg', h: 'N. reg.', html: r => cella(r.nreg) }, { k: 'dose', h: 'Dose/ha', html: r => cella(r.dose) },
      { k: 'ha', h: 'Ha trattati', fmt: 'num2' }, { k: 'bbch', h: 'BBCH / fase', html: r => cella(r.bbch) },
      { k: 'avversita', h: 'Avversità', html: r => cella(r.avversita) }, { k: 'operatore', h: 'Operatore', html: r => cella(r.operatore) },
    ],
    rows: rr, sort: false,
    rowAttr: r => `data-act="edit" data-form="operazioni" data-id="${esc(r.id)}" role="button" tabindex="0"`,
  });
  return `<section class="card"><div class="card-h"><h2>${ic('syringe')}Trattamenti ${y}</h2>${bottoniExport(['qd_trattamenti'], 'Quaderno di campagna ' + y)}</div>${t}<p class="muted small">Tocca una riga per aprirla e completarla.</p></section>`;
}

export function render() {
  const y = UI.anno;
  const reg = registroCard(y);
  const intro = `<p class="muted">Il registro dei trattamenti dell'annata ${y}, pronto per la stampa e per il registro digitale.</p>`;
  return { title: 'Quaderno di campagna', html: intro + cardLegge() + (reg || '') + cardAuto() + cardScarica() + cardTabella(y) };
}

export async function qdAct(a, b) {
  if (a !== 'qd-avvia') return;
  b.disabled = true;
  try {
    const r = await avvia('quaderno', 'pulsante');
    if (r && r.occupato) toast("C'è già un giro in corso: aspetta che finisca.", 'err');
    else if (r && r.solaLettura) toast('Sei in sola lettura: le automazioni non partono.', 'err');
    else if (r && r.esiti && r.esiti.length) { const e = r.esiti[0][1]; toast(e.errore || e.saltata || e.note || 'Fatto', e.errore || e.saltata ? 'err' : ''); }
    else toast('Fatto');
  } finally { b.disabled = false; bus.render(); }
}

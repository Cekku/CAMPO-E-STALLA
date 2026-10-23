// Si@lleva (AIA): caricamento dei report PDF, andamento della mandria ai controlli, dati AIA nella scheda del capo
import { S } from '../state.js';
import { esc, nf, fd, uid, plural, diff, today, okD } from '../util.js';
import { ic } from '../icons.js';
import { openSheet, closeSheet, toast, chip } from '../ui.js';
import { spark } from './charts.js';
import { tabella, bottoniExport } from '../conti/tabelle.js';
import * as store from '../store.js';
import { STATI_RIPR, OPERAZ } from '../aia.js';

const NOMI = { sintetico: 'Sintetico individuale ultimo controllo', prestampato: 'Scheda di riepilogo del controllo', parametri: 'Parametri zootecnici aziendali', collettivo: 'Sintetico collettivo', fe01: 'Statistica riproduttiva (FE01)', benessere: 'Benessere animale' };
const aiaCfg = () => S.config.find(c => c.id === 'aia') || {};

export function aiaCard() {
  const st = (aiaCfg().storia || []);
  const conAia = S.capi.filter(c => c.aia && c.aia.data);
  const ult = conAia.reduce((m, c) => c.aia.data > m ? c.aia.data : m, '');
  const last = st[st.length - 1];
  const serie = (k, l, u, d = 0) => { const v = st.slice(-14).map(x => x[k] ?? null); if (v.filter(x => x !== null).length < 2) return ''; return `<div class="ms-row"><span class="ms-l">${l}</span>${spark(v, 260, 44)}<b class="num">${nf(v[v.length - 1], d)} <small>${u}</small></b></div>`; };
  const rows = [...st].reverse().map(x => Object.assign({}, x));
  return `<section class="card set"><div class="set-h">${ic('badge-check')}<div><h2>Controlli funzionali AIA (Si@lleva)</h2><p>Scarica da Si@lleva i report in PDF e caricali qui, anche più insieme: <b>Sintetico individuale ultimo controllo</b> e <b>Scheda di riepilogo del controllo</b> aggiornano mandria, parti, asciutte, stato riproduttivo e controlli di ogni vacca; <b>Parametri zootecnici aziendali</b> aggiunge l'andamento della stalla mese per mese. Prima di salvare vedi un riepilogo.</p></div></div>
  ${ult ? `<div class="syncbox ok">${ic('circle-check')}<div><b>${plural(conAia.length, 'capo aggiornato', 'capi aggiornati')} dall'AIA</b><span>controllo del ${fd(ult)} · ${diff(ult, today())} giorni fa${diff(ult, today()) > 40 ? ': carica i report del controllo più recente' : ''}</span></div></div>` : ''}
  <div class="btns"><label class="btn primary">${ic('file-up')}Carica report Si@lleva (PDF)<input type="file" accept=".pdf,application/pdf" multiple data-act="aiaImport" hidden></label></div></section>
  ${st.length ? `<section class="card"><div class="card-h"><h2>${ic('chart-line')}Andamento ai controlli AIA</h2><span class="muted small">${plural(st.length, 'controllo', 'controlli')}${last ? ' · ultimo ' + fd(last.data) : ''}</span></div>
  <div class="ms">${serie('latte', 'Latte medio', 'kg/capo', 1)}${serie('evm', 'Equivalente maturo', 'kg')}${serie('grasso', 'Grasso', '%', 2)}${serie('proteine', 'Proteine', '%', 2)}${serie('ggLatt', 'Giorni in latte', 'gg')}${serie('partoConcepimento', 'Parto–concepimento', 'gg')}</div>
  <div class="pad-x">${bottoniExport(['aiaStoria'], 'controlli-aia')}</div>
  ${tabella('aiaStoria', { cols: [{ k: 'data', h: 'Controllo', fmt: 'date' }, { k: 'presenti', h: 'Presenti', fmt: 'num' }, { k: 'controllate', h: 'Controllate', fmt: 'num' }, { k: 'asciutte', h: 'Asciutte', fmt: 'num' }, { k: 'latte', h: 'Latte kg/capo', fmt: 'num2' }, { k: 'evm', h: 'EVM kg', fmt: 'num' }, { k: 'grasso', h: 'Grasso %', fmt: 'num2' }, { k: 'proteine', h: 'Proteine %', fmt: 'num2' }, { k: 'nLatt', h: 'N. lattaz. medio', fmt: 'num2' }, { k: 'ggLatt', h: 'Giorni in latte', fmt: 'num' }, { k: 'interparto', h: 'Interparto gg', fmt: 'num' }, { k: 'partoConcepimento', h: 'Parto–concep. gg', fmt: 'num' }, { k: 'fecGravidanza', h: 'Fec. per gravidanza', fmt: 'num2' }], rows })}</section>` : ''}`;
}

export async function aiaImport(files) {
  const [{ leggiPdf }, A] = await Promise.all([import('../conti/pdftext.js'), import('../aia.js')]);
  toast('Leggo i report…');
  const reps = []; const altri = []; const err = [];
  for (const f of files) {
    try { const r = A.leggiReport(await leggiPdf(await f.arrayBuffer())); r.file = f.name; if (r.tipo === 'sintetico' || r.tipo === 'prestampato' || r.tipo === 'parametri') reps.push(r); else altri.push([f.name, r.tipo]); }
    catch (e) { err.push(f.name); }
  }
  if (!reps.length) { toast(altri.length ? 'Questi report non contengono dati per vacca: carica il Sintetico individuale, la Scheda di riepilogo o i Parametri zootecnici.' : 'Non riconosco questi file come report di Si@lleva.', 'err'); return; }
  const { ops, R } = A.pianoImport(S, reps, uid);
  const vecchio = R.dataCF && diff(R.dataCF, today()) > 45;
  const body = openSheet('Report Si@lleva', `<div class="pcg">
    <div class="list flat">${reps.map(r => `<div class="row static"><span class="r-icon">${ic('file-text')}</span><span class="r-main"><b>${esc(NOMI[r.tipo])}</b><span>${esc(r.file)} · ${r.tipo === 'parametri' ? plural(r.storia.length, 'controllo', 'controlli') : plural(r.capi.length, 'vacca', 'vacche')}${r.data ? ' · controllo del ' + fd(r.data) : ''}</span></span></div>`).join('')}
    ${altri.map(([n, t]) => `<div class="row static"><span class="r-icon">${ic('info')}</span><span class="r-main"><b>${esc(NOMI[t] || 'Report non riconosciuto')}</b><span>${esc(n)} · solo riepilogo, non serve per l'importazione</span></span></div>`).join('')}</div>
    <div class="syncbox ${vecchio ? 'warn' : 'ok'}">${ic(vecchio ? 'triangle-alert' : 'circle-check')}<div><b>Cosa cambia nella stalla</b><span>${[R.nuovi ? plural(R.nuovi, 'capo nuovo', 'capi nuovi') : '', R.aggiornati ? plural(R.aggiornati, 'capo aggiornato', 'capi aggiornati') : '', R.parti ? plural(R.parti, 'parto', 'parti') : '', R.asciutte ? plural(R.asciutte, 'messa in asciutta', 'messe in asciutta') : '', R.controlli ? plural(R.controlli, 'controllo funzionale', 'controlli funzionali') : '', R.storia ? plural(R.storia, 'mese di andamento', 'mesi di andamento') : ''].filter(Boolean).join(' · ') || 'niente di nuovo: questi dati sono già registrati'}.${vecchio ? ' Attenzione: il controllo è di ' + diff(R.dataCF, today()) + ' giorni fa.' : ''}</span></div></div>
    <p class="muted small">Matricola, numero aziendale, razza e nome vengono aggiunti solo dove mancano; i dati che hai già inserito non vengono cancellati. Parti, asciutte e controlli già presenti non vengono duplicati.</p>
    <div class="factions"><span class="sp"></span><button class="btn ghost" data-act="close">Annulla</button><button class="btn primary" id="aiaGo"${ops.length ? '' : ' disabled'}>${ic('check')}Importa</button></div></div>`, { wide: true });
  const go = body.querySelector('#aiaGo');
  if (go) go.onclick = async () => { go.disabled = true; await store.bulkPut(ops); closeSheet(); toast('Dati AIA importati: ' + plural(R.nuovi + R.aggiornati, 'capo', 'capi')); };
}

// riquadro nella scheda del capo
export function capoAia(c) {
  const a = c.aia; if (!a || !a.data) return '';
  const op = a.prossima && okD(a.prossima.data) ? (OPERAZ[a.prossima.op] || a.prossima.op) + ' dal ' + fd(a.prossima.data) : '';
  const f = (l, v) => v === null || v === undefined || v === '' ? '' : `<div class="fact"><dt>${l}</dt><dd>${v}</dd></div>`;
  return `<section class="card"><div class="card-h"><h2>${ic('badge-check')}Controllo funzionale AIA</h2><span class="muted small">${fd(a.data)}</span></div><dl class="facts inner">
    ${f('Stato riproduttivo', a.stato ? esc(STATI_RIPR[a.stato] || a.stato) + (a.parcheggiata ? ' <small>parcheggiata</small>' : '') : '')}${f('Prossima operazione', esc(op))}${f('Lattazioni', a.nLatt)}${f('Equivalente maturo', a.evm ? `<span class="num">${nf(a.evm, 0)} kg</span>` : '')}${f('Indice ANA', a.ana ? `<span class="num">${a.ana > 0 ? '+' : ''}${nf(a.ana, 0)}</span>` : '')}${f('Linear score', a.ls !== null && a.ls !== undefined ? `<span class="num">${nf(a.ls, 2)}</span>` : '')}${f('Fecondazioni', a.nFec ? `${a.nFec}${a.ggConc ? ' <small>concepimento a ' + a.ggConc + ' gg</small>' : ''}` : '')}
  </dl></section>`;
}

// Pannello della chat "Chiedi" (dalla 1.37.0): sul computer sta di lato e si può continuare a usare l'app,
// sul telefono copre lo schermo. La conversazione resta solo su questo dispositivo (localStorage ces.chiedi.conv).
// I collegamenti nelle risposte diventano i pulsanti dell'app (data-act cmdPag, open, c-fatt) e li gestisce app.js.
import { esc, lsGet, lsSet } from '../util.js';
import { ic } from '../icons.js';
import { MODELLI, viaClaude, localeConfigurato, domandaClaude, domandaLocale } from './motori.js';

let opz = { conti: () => false, pagine: () => '', dettatura: null };
let el = null, occupato = false, passo = '', errore = '';
const ferma = { si: false };
const pref = () => Object.assign({ motore: 'claude', modello: MODELLI[0].id }, lsGet('ces.chiedi', {}) || {});
const nuova = () => ({ voci: [], api: { motore: null, msgs: [] } });
let conv = lsGet('ces.chiedi.conv', null) || nuova();
const salva = () => { try { localStorage.setItem('ces.chiedi.conv', JSON.stringify(conv)); } catch (e) { conv.api = { motore: null, msgs: [] }; lsSet('ces.chiedi.conv', conv); } };

const NOMI = {
  campi: 'i campi', attivita_campagna: 'le attività', magazzino: 'il magazzino', mezzi: 'i mezzi', scadenze: "l'agenda", avvisi: 'gli avvisi', meteo: 'il meteo',
  capi: 'la mandria', latte: 'il registro del latte', controlli_aia: 'i controlli AIA', cerca_fatture: 'le fatture', spese_raggruppate: 'i totali delle fatture',
  conto_economico: 'il conto economico', indici_economici: 'gli indici', salute_azienda: "la salute dell'azienda", centri_di_costo: 'i centri di costo',
  cose_in_sospeso: 'le cose in sospeso', preventivi: 'i preventivi', personale: 'il personale', cerca_archivio: "l'archivio del PC",
};
const ESEMPI = conti => [
  'Quali vacche partoriscono nei prossimi 30 giorni?', 'Cosa devo fare questa settimana?', 'Quanti ettari ho di mais quest\'anno?',
  ...(conti ? ['Quanto ho speso di mangimi nel 2025 rispetto al 2024?', 'Quali sono i 10 fornitori a cui ho pagato di più quest\'anno?', 'Come va la salute dell\'azienda e cosa posso migliorare?'] : ['Quanto latte abbiamo fatto nell\'ultima settimana?']),
];

export function initChiedi(o) {
  opz = Object.assign(opz, o);
  el = document.createElement('aside'); el.id = 'chiedi'; el.className = 'chiedi'; el.hidden = true; el.setAttribute('aria-label', 'Chiedi');
  document.body.appendChild(el);
  el.addEventListener('click', clic); el.addEventListener('change', cambio);
  el.addEventListener('keydown', e => { if (e.target.id === 'chTesto' && e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); invia(); } if (e.key === 'Escape') chiudi(); });
  el.addEventListener('input', e => { if (e.target.id === 'chTesto') cresci(e.target); });
}
export const aperto = () => el && !el.hidden;
export function apri(domanda) {
  if (!el) return; el.hidden = false; document.body.classList.add('chiedi-on'); disegna();
  const t = el.querySelector('#chTesto'); if (t) { if (domanda) { t.value = domanda; cresci(t); } setTimeout(() => t.focus(), 50); }
}
export function chiudi() { if (!el) return; el.hidden = true; document.body.classList.remove('chiedi-on'); }
export const alterna = () => (aperto() ? chiudi() : apri());

function cresci(t) { t.style.height = 'auto'; t.style.height = Math.min(160, t.scrollHeight) + 'px'; }

/* ---------------- testo delle risposte: un po' di markdown, sicuro ---------------- */
const VAI = /^#(pagina|capo|campo|mezzo|fattura):(.+)$/;
function collegamento(t, h) {
  const m = h.match(VAI); if (!m) return esc(t);
  const [, k, v] = m; const lab = esc(t);
  if (k === 'pagina') { const [area, tab, sub] = v.split('/'); return `<button class="ch-link" data-act="cmdPag" data-area="${esc(area)}" data-tab="${esc(tab || '')}"${sub ? ` data-sub="${esc(sub)}"` : ''}>${lab}${ic('chevron-right')}</button>`; }
  if (k === 'fattura') return `<button class="ch-link" data-act="c-fatt" data-id="${esc(v)}">${lab}${ic('chevron-right')}</button>`;
  return `<button class="ch-link" data-act="open" data-type="${k}" data-id="${esc(v)}">${lab}${ic('chevron-right')}</button>`;
}
function riga(s) {
  const pezzi = []; let out = '', i = 0;
  const re = /\[([^\]]+)\]\(([^)\s]+)\)/g; let m;
  while ((m = re.exec(s))) { out += esc(s.slice(i, m.index)) + '\u0000' + pezzi.length + '\u0000'; pezzi.push(collegamento(m[1], m[2])); i = re.lastIndex; }
  out += esc(s.slice(i));
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/(^|[\s(])_([^_]+)_(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>').replace(/(^|[\s(])\*([^*\s][^*]*)\*(?=[\s).,;:!?]|$)/g, '$1<i>$2</i>');
  return out.replace(/\u0000(\d+)\u0000/g, (x, n) => pezzi[+n]);
}
export function md(testo) {
  const L = String(testo || '').replace(/\r/g, '').split('\n'); const out = []; let lista = null;
  const chiudiLista = () => { if (lista) { out.push(`</${lista}>`); lista = null; } };
  for (let k = 0; k < L.length; k++) {
    const l = L[k];
    if (/^\s*\|.*\|\s*$/.test(l) && k + 1 < L.length && /^\s*\|[\s:|-]+\|\s*$/.test(L[k + 1])) {
      chiudiLista(); const celle = x => x.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const h = celle(l); k += 2; const rs = [];
      while (k < L.length && /^\s*\|.*\|\s*$/.test(L[k])) rs.push(celle(L[k++])); k--;
      const num = c => /^[-+]?[\d.,]+\s*(€|%|l|ha|kg)?$/.test(c);
      out.push(`<div class="ch-tab"><table><thead><tr>${h.map(c => `<th>${riga(c)}</th>`).join('')}</tr></thead><tbody>${rs.map(r => `<tr>${r.map(c => `<td${num(c) ? ' class="n"' : ''}>${riga(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    let m;
    if ((m = l.match(/^\s*[-*•]\s+(.*)$/))) { if (lista !== 'ul') { chiudiLista(); out.push('<ul>'); lista = 'ul'; } out.push(`<li>${riga(m[1])}</li>`); continue; }
    if ((m = l.match(/^\s*\d+[.)]\s+(.*)$/))) { if (lista !== 'ol') { chiudiLista(); out.push('<ol>'); lista = 'ol'; } out.push(`<li>${riga(m[1])}</li>`); continue; }
    chiudiLista();
    if ((m = l.match(/^#{1,4}\s+(.*)$/))) { out.push(`<p class="ch-h">${riga(m[1])}</p>`); continue; }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(l)) continue;
    if (l.trim()) out.push(`<p>${riga(l)}</p>`);
  }
  chiudiLista(); return out.join('');
}

/* ---------------- disegno ---------------- */
const fmtCosto = c => (c < 0.01 ? 'meno di 1 centesimo' : '≈ ' + c.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' $');
function statoMotore(p) {
  if (p.motore === 'locale') return localeConfigurato() ? 'Sul PC: i dati non escono dal computer. Risposte lente (anche un minuto).' : 'Il modello sul PC non è ancora collegato: La mia azienda → Modello sul PC.';
  const v = viaClaude(); return v.via ? 'Claude: riceve solo la domanda e i numeri che servono per rispondere.' : v.motivo;
}
function disegna() {
  if (!el || el.hidden) return;
  const p = pref(); const conti = opz.conti();
  const voci = conv.voci.map(v => v.ruolo === 'utente'
    ? `<div class="ch-msg tu"><p>${esc(v.testo)}</p></div>`
    : `<div class="ch-msg ia${v.errore ? ' err' : ''}">${v.errore ? `<p>${ic('triangle-alert')}${esc(v.testo)}</p><button class="btn sm" data-ch="riprova">${ic('refresh-cw')}Riprova</button>` : md(v.testo)}
      ${!v.errore && (v.strumenti || []).length ? `<p class="ch-fonti">${ic('database')}Ho guardato ${esc(v.strumenti.map(s => NOMI[s] || s).join(', '))}${v.motore ? ' · ' + esc(v.motore) : ''}${v.costo ? ' · ' + fmtCosto(v.costo) : ''}</p>` : (!v.errore && v.motore ? `<p class="ch-fonti">${esc(v.motore)}${v.costo ? ' · ' + fmtCosto(v.costo) : ''}</p>` : '')}</div>`).join('');
  const vuoto = !conv.voci.length ? `<div class="ch-vuoto"><p class="ch-ciao">${ic('sparkles')}Chiedimi qualcosa sui dati dell'azienda.</p><p class="muted small">Rispondo guardando campi, stalla, magazzino, agenda${conti ? ', fatture, bilancio e archivio' : ''}. Non cambio niente nell'app.</p><div class="ch-es">${ESEMPI(conti).map(e => `<button class="ch-chip" data-ch="esempio">${esc(e)}</button>`).join('')}</div></div>` : '';
  el.innerHTML = `<div class="ch-head"><b class="ch-tit">${ic('sparkles')}<span>Chiedi</span></b>
    <select id="chMotore" class="ch-sel" aria-label="Chi risponde"><option value="claude"${p.motore === 'claude' ? ' selected' : ''}>Claude</option><option value="locale"${p.motore === 'locale' ? ' selected' : ''}>Sul PC</option></select>
    ${p.motore === 'claude' ? `<select id="chModello" class="ch-sel" aria-label="Modello">${MODELLI.map(m => `<option value="${m.id}"${p.modello === m.id ? ' selected' : ''} title="${esc(m.nota)}">${esc(m.nome.replace('Claude ', ''))}</option>`).join('')}</select>` : ''}
    <span class="sp"></span>
    <button class="iconbtn ghost" data-ch="nuova" title="Nuova conversazione" aria-label="Nuova conversazione"${conv.voci.length ? '' : ' disabled'}>${ic('trash-2')}</button>
    <button class="iconbtn ghost" data-ch="chiudi" aria-label="Chiudi">${ic('x')}</button></div>
  <p class="ch-stato">${esc(statoMotore(p))}</p>
  <div class="ch-msgs" id="chMsgs">${vuoto}${voci}${occupato ? `<div class="ch-msg ia busy"><span class="spinner"></span><span>${esc(passo || 'Ci penso…')}</span><button class="btn ghost sm" data-ch="ferma">Ferma</button></div>` : ''}</div>
  <form class="ch-bar" data-ch-form><textarea id="chTesto" rows="1" placeholder="Scrivi una domanda…" enterkeyhint="send"${occupato ? ' disabled' : ''}></textarea>${opz.dettatura ? `<button type="button" class="iconbtn ghost" data-ch="detta" aria-label="Detta">${ic('mic')}</button>` : ''}<button type="button" class="iconbtn ch-go" data-ch="invia" aria-label="Invia"${occupato ? ' disabled' : ''}>${ic('send')}</button></form>`;
  const box = el.querySelector('#chMsgs'); box.scrollTop = box.scrollHeight;
}

/* ---------------- azioni ---------------- */
function clic(e) {
  const b = e.target.closest('[data-ch]');
  if (!b) { if (e.target.closest('.ch-link') && window.innerWidth < 900) chiudi(); return; }
  const k = b.dataset.ch;
  if (k === 'chiudi') return chiudi();
  if (k === 'nuova') { conv = nuova(); salva(); return disegna(); }
  if (k === 'esempio') { const t = el.querySelector('#chTesto'); t.value = b.textContent; return invia(); }
  if (k === 'invia') return invia();
  if (k === 'ferma') { ferma.si = true; return; }
  if (k === 'riprova') { const ult = conv.voci.filter(v => v.ruolo === 'utente').pop(); conv.voci = conv.voci.filter(v => !v.errore); if (ult) { conv.voci.pop(); conv.api = { motore: null, msgs: [] }; invia(ult.testo); } return; }
  if (k === 'detta' && opz.dettatura) { const t = el.querySelector('#chTesto'); const on = opz.dettatura((txt, fin) => { t.value = txt; cresci(t); if (fin) invia(); }, () => b.classList.remove('on')); b.classList.toggle('on', on); }
}
function cambio(e) {
  const p = pref();
  if (e.target.id === 'chMotore') p.motore = e.target.value;
  if (e.target.id === 'chModello') p.modello = e.target.value;
  lsSet('ces.chiedi', p); disegna();
}

// storia per l'API: se si cambia motore (o modello di Claude) si riparte dal testo delle domande e risposte già fatte
function storiaApi(motore) {
  if (conv.api.motore === motore) return conv.api.msgs;
  const msgs = []; conv.voci.filter(v => !v.errore).forEach(v => msgs.push({ role: v.ruolo === 'utente' ? 'user' : 'assistant', content: v.testo }));
  conv.api = { motore, msgs }; return msgs;
}
async function invia(testo) {
  const t = el.querySelector('#chTesto'); const q = String(testo ?? (t ? t.value : '')).trim();
  if (!q || occupato) return;
  const p = pref(); const conti = opz.conti();
  const chiave = p.motore === 'claude' ? 'claude|' + p.modello + '|' + conti : 'locale|' + conti;
  const msgs = storiaApi(chiave);
  // storia corta: oltre 12 domande si tengono le ultime (meno parole da mandare, meno costo)
  while (msgs.filter(m => m.role === 'user' && typeof m.content === 'string').length > 12) { const i = msgs.findIndex((m, j) => j > 0 && m.role === 'user' && typeof m.content === 'string'); msgs.splice(0, i > 0 ? i : msgs.length); }
  conv.voci.push({ ruolo: 'utente', testo: q }); msgs.push({ role: 'user', content: q });
  occupato = true; passo = ''; errore = ''; ferma.si = false; disegna();
  const onPasso = nomi => { passo = 'Guardo ' + [...new Set(nomi)].map(n => NOMI[n] || n).join(', ') + '…'; disegna(); };
  const lun = msgs.length;
  try {
    const r = p.motore === 'locale'
      ? await domandaLocale({ msgs, conti, pagine: opz.pagine(), onPasso, ferma })
      : await domandaClaude({ msgs, modello: p.modello, conti, pagine: opz.pagine(), onPasso, ferma });
    conv.voci.push({ ruolo: 'ia', testo: r.testo, strumenti: r.strumenti, costo: r.costo, motore: r.modello });
  } catch (e) {
    msgs.splice(lun - 1);   // la domanda non riuscita esce dalla storia dell'API (resta a video con Riprova)
    conv.voci.push({ ruolo: 'ia', errore: true, testo: e.message || 'Non sono riuscito a rispondere' });
  }
  occupato = false; passo = ''; salva(); disegna();
}

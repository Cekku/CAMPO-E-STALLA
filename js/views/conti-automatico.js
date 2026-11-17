// Conti → "Dall'archivio del PC": documenti nuovi presi e sistemati da soli (conti/automatico.js), con la coda dei dubbi.
import { esc, fd } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm } from '../ui.js';
import * as AU from '../conti/automatico.js';

const STATI = { dubbi: ['Da controllare', 'warn'], nonletto: ['Non letti', 'bad'], fatto: ['Sistemati', 'ok'], ignorato: ['Lasciati fuori', ''] };

export function vAutomatico() {
  const S0 = AU.STATO; const R = AU.records().sort((a, b) => String(b.quando + b.data).localeCompare(String(a.quando + a.data)));
  const per = k => R.filter(r => r.stato === k);
  const dub = per('dubbi'), nl = per('nonletto'), ok = per('fatto');
  const ultimo = (() => { try { return localStorage.getItem('ces.auto.ultimo'); } catch (e) { return null; } })();
  const giro = S0.attivo
    ? `<div class="note-box">${ic('refresh-cw')}<span><b>Lettura in corso: ${S0.fatti} di ${S0.tot || '…'}</b> · ${esc(S0.doc || '')}<br><span class="muted small">Sistemati ${S0.esiti.fatto || 0} · da controllare ${S0.esiti.dubbi || 0} · non letti ${S0.esiti.nonletto || 0}${S0.esiti.errori ? ' · da riprovare ' + S0.esiti.errori : ''}</span></span><button class="btn sm ghost" data-act="c-auFerma">${ic('x')}Ferma</button></div>`
    : `<div class="toolbar"><button class="btn sm primary" data-act="c-auVai">${ic('refresh-cw')}Cerca i documenti nuovi adesso</button><span class="muted small">${ultimo ? 'Ultimo giro: ' + fd(ultimo.slice(0, 10)) + ' alle ' + ultimo.slice(11, 16) : 'Ancora nessun giro'}${S0.fine && !S0.attivo ? ` · sistemati ${S0.esiti.fatto || 0}, da controllare ${S0.esiti.dubbi || 0}, non letti ${S0.esiti.nonletto || 0}` : ''}${S0.errore ? ' · ' + esc(S0.errore) : ''}</span></div>`;
  const riga = r => {
    const [st, cls] = STATI[r.stato] || [r.stato, ''];
    const btn = r.stato === 'dubbi' || r.stato === 'nonletto'
      ? `<span class="btns nowrap"><button class="btn sm" data-act="c-auRivedi" data-imp="${esc(r.impronta)}">${ic('search')}Rivedi</button><button class="btn sm ghost" data-act="c-auIgnora" data-imp="${esc(r.impronta)}">Lascia stare</button></span>`
      : `<span class="btns nowrap"><button class="btn sm ghost" data-act="c-orig" data-imp="${esc(r.impronta)}" data-file="${esc(r.nome)}">${ic('file-text')}Apri</button></span>`;
    return `<div class="row static"><span class="r-icon">${ic(r.stato === 'fatto' ? 'circle-check' : r.stato === 'ignorato' ? 'circle-x' : 'triangle-alert')}</span><span class="r-main"><b>${esc(r.nome || r.impronta.slice(0, 12))} <span class="chip ${cls}">${esc(st)}</span></b><span>${esc(String(r.tipoDoc || '').replace(/-/g, ' '))} · ${esc(r.data || '')}${r.da ? ` · conto …${esc(String(r.conto || '').slice(-4))} dal ${fd(r.da)} al ${fd(r.a)}` : ''} · ${esc(r.msg || '')}</span></span>${btn}</div>`;
  };
  const lista = (titolo, icn, L, max = 80) => L.length ? `<section class="card"><div class="card-h"><h2>${ic(icn)}${titolo}</h2><span class="count">${L.length}</span></div><div class="list flat">${L.slice(0, max).map(riga).join('')}</div>${L.length > max ? `<p class="muted small pad-x">… e altri ${L.length - max}</p>` : ''}</section>` : '';
  return `<section class="card"><div class="card-h"><h2>${ic('folder-open')}Documenti presi dall'archivio del PC</h2></div>
    <div class="pad-x" style="padding-bottom:14px"><p class="muted small">Quando apri l'app sul PC con il ponte dell'archivio acceso, l'app prende da sola i documenti dei Conti arrivati nell'archivio (fatture, cedolini, bilancini paghe, estratti conto, contabili, dichiarazioni IVA, bilancini) dal <b>${fd(AU.dataInizio())}</b> in poi e li mette al loro posto. Salva da sola solo quello che è sicuro; il resto lo trovi qui sotto in <i>Da controllare</i>. Gli estratti conto che coprono giorni già letti non creano doppioni: quei movimenti si saltano.</p>
    ${giro}
    <div class="toolbar" style="margin-top:10px"><label class="chk"><input type="checkbox" data-act="c-auAttivo"${AU.attivo() ? ' checked' : ''}> Cerca da solo all'apertura dell'app</label><label class="small muted">Dal <input class="inp sm" type="date" data-act="c-auDa" value="${esc(AU.dataInizio())}" style="max-width:160px"></label></div></div></section>
    ${lista('Da controllare', 'triangle-alert', dub)}${lista('Non letti', 'circle-x', nl)}${lista('Sistemati', 'circle-check', ok, 40)}${lista('Lasciati fuori', 'circle-x', per('ignorato'), 20)}`;
}

export async function automaticoAct(a, b, d, rerender) {
  if (a === 'c-auVai') { AU.esegui(rerender).then(s => toast(s.errore ? s.errore : `Archivio: ${s.esiti.fatto || 0} documenti sistemati, ${s.esiti.dubbi || 0} da controllare${s.esiti.nonletto ? ', ' + s.esiti.nonletto + ' non letti' : ''}`, s.errore ? 'err' : undefined)).catch(e => toast(e.message, 'err')); return rerender(); }
  if (a === 'c-auFerma') { AU.ferma(); toast('Mi fermo dopo questo documento'); return; }
  if (a === 'c-auIgnora') return arm(b, 'Conferma: lascia stare', async () => { await AU.segnaStato(d.imp, 'ignorato'); rerender(); });
  if (a === 'c-auRivedi') {
    const r = AU.record(d.imp); if (!r) return;
    const C = await import('./conti.js');
    // movimenti da controllare: si rivedono nella tabella di Carica documenti, senza rileggere l'estratto (i giorni già letti non ritornano)
    if ((r.dubbi || []).length) return C.rivediRighe({ tipo: 'bonifici', etichetta: 'Da controllare', nome: r.nome, imp: r.impronta, righe: r.dubbi.map(x => Object.assign({ sel: false, gia: false }, x)) });
    b.disabled = true;
    try { const AD = await import('./archivio-dati.js'); const f = await AD.scaricaFile(r.impronta); await C.leggiDaFile([f]); }
    catch (e) { toast(e.message, 'err'); b.disabled = false; }
  }
}
export async function automaticoChange(a, el, rerender) {
  if (a === 'c-auAttivo') { await AU.impostazioni({ attivo: el.checked }); toast(el.checked ? "Cerco i documenti nuovi all'apertura" : 'Ricerca automatica spenta'); return true; }
  if (a === 'c-auDa') { if (!/^\d{4}-\d{2}-\d{2}$/.test(el.value)) return true; await AU.impostazioni({ da: el.value }); toast('Prendo i documenti dal ' + fd(el.value)); rerender(); return true; }
  return false;
}

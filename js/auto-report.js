// Automazioni del report del mese nel Centro automatico (js/automazioni.js, contratto in .claude/rules/automazioni.md):
// il primo giorno del mese, o al primo giro dopo, preparano il report del mese finito (js/report.js) e lo salvano come
// istantanea, così resta uguale anche se i dati cambiano dopo. Se il report non è completo (cedolini, fatture da
// classificare, giorni senza latte, dati da controllare, estratto conto) non si salva da solo: è un dubbio
// "il report di ottobre è senza cedolini: preparalo lo stesso?". Quando i dati diventano completi si salva al giro dopo.
// Due iscrizioni, così niente dei Conti finisce nel diario che vedono i collaboratori:
// - report-mese (area Conti, solo titolare): salva config 'rp-AAAA-MM' (senza Conti) ed econfig 'rpc-AAAA-MM' (completo);
//   il suo diario è in econfig, quindi Annulla toglie tutte e due le copie.
// - report-mese-squadra (area Campagna): sul dispositivo di un collaboratore salva solo 'rp-AAAA-MM'; dal titolare non parte.
import { S, UI } from './state.js';
import * as store from './store.js';
import { registra, vai } from './automazioni.js';
import * as R from './report.js';
import { contiVisibili } from './views/conti.js';

const unisci = a => (a.length > 1 ? a.slice(0, -1).join(', ') + ' e ' + a[a.length - 1] : a[0] || '');
const apri = m => () => { UI.f.rp_m = m; UI.f.rp_live = false; vai({ tab: 'report' }); };
const propri = (col, id) => /^rpc?-\d{4}-\d{2}$/.test(id);

function giro(id, tit) {
  return async () => {
    const m = R.meseChiuso();
    const manca = !S.config.some(x => x.id === R.idPub(m)) || (tit && !S.econfig.some(x => x.id === R.idRis(m)));
    if (!manca) return { salvati: 0, note: 'Report ' + R.diMese(m) + ' pronto', dubbi: [] };
    if (!R.haDati(m)) return { salvati: 0, note: 'Niente da riassumere ' + R.diMese(m), dubbi: [] };
    const rep = R.prepara(m, { conti: tit });
    if (!rep.sezioni.length) return { salvati: 0, note: 'Niente da riassumere ' + R.diMese(m), dubbi: [] };
    const M = R.mancanze(rep);
    // annullato dal Diario: non si risalva da solo, si chiede
    if (R.annullato(m, 'config') || (tit && R.annullato(m, 'econfig'))) return { salvati: 0, note: 'Report ' + R.diMese(m) + ' annullato: aspetta la tua conferma', dubbi: [dubbio(id + ':ann', m, "Il report " + R.diMese(m) + " era stato annullato" + (M.length ? ' (è ' + unisci(M) + ')' : '') + ': salvarlo di nuovo?')] };
    if (!M.length) { const n = await R.salva(m, { solo: 'mancanti', come: 'automatico' }); return { salvati: n, note: 'Report ' + R.diMese(m) + ' pronto', dubbi: [] }; }
    return { salvati: 0, note: 'Report ' + R.diMese(m) + ' da completare: ' + unisci(M), dubbi: [dubbio(id, m, 'Il report ' + R.diMese(m) + ' è ' + unisci(M) + ': preparalo lo stesso?')] };
  };
}
const dubbio = (id, m, testo) => ({
  id: id + ':' + m, testo,
  proposta: "Lo salvo con quello che c'è adesso: quello che manca resta segnato in cima al report. Se aspetti, si salva da solo quando i dati sono completi.",
  conferma: async () => (await R.salva(m, { solo: 'mancanti', come: 'confermato' })) > 0,
  apri: apri(m),
});
// annullando la riga del Diario che ha salvato il report si lascia un segno, così il giro dopo non lo risalva da solo
const segna = col => async (riga, tolti) => {
  for (const t of tolti || []) { const x = /^rpc?-(\d{4}-\d{2})$/.exec(String(t.id)); if (!x) continue;
    // anche in config (solo il mese, nessun dato): così nemmeno il dispositivo di un collaboratore lo risalva
    for (const c of new Set([col, 'config'])) if (!R.annullato(x[1], c)) await store.put(c, R.idAnn(x[1]), { tipo: 'reportAnnullato', mese: x[1], quando: new Date().toISOString() }); }
};

registra({
  id: R.AUT, nome: 'Report del mese', area: 'conti',
  descr: "Il primo del mese salva il report del mese finito, con i Conti, così resta com'è anche se i dati cambiano dopo. Se manca qualcosa chiede prima.",
  raccolte: ['config', 'econfig'], propri, apriPagina: { tab: 'report' },
  esegui: giro(R.AUT, true), annullato: segna('econfig'),
});
registra({
  id: R.AUT_SQUADRA, nome: 'Report del mese (collaboratori)', area: 'campagna',
  descr: "Sul telefono o sul computer di un collaboratore salva il report del mese finito senza i Conti. Dal titolare lo fa già «Report del mese».",
  raccolte: ['config'], propri, apriPagina: { tab: 'report' },
  pronta: () => !contiVisibili(),
  esegui: giro(R.AUT_SQUADRA, false), annullato: segna('config'),
});

// Copia di sicurezza sul PC (1.80.0, piano del 26/11/2026): una volta alla settimana l'app aperta sul PC del titolare
// manda tutte le registrazioni e gli allegati al ponte dell'archivio (porta 1236), che li salva in
// %USERPROFILE%\ArchivioAzienda\copie-sicurezza (fuori da Supabase: strumenti/archivio/copie.py).
// Una volta al mese chiede anche la prova di ripristino (strumenti/copie/prova-ripristino.mjs): l'ultima copia rimessa
// in un browser vuoto, non collegato, e contata. L'esito di tutte e due sta in econfig "copia-pc" (riservato al titolare,
// così si vede in La mia azienda → Dati anche dal telefono).
import { S, COLS } from './state.js';
import * as store from './store.js';
import { today, isoOf } from './util.js';
import { VERSION } from './version.js';
import { allegatiDi, dovuta } from './copia-conta.js';
import { registra, controllaPonte } from './automazioni.js';
import { contiVisibili } from './views/conti.js';

export const OGNI_COPIA = 7, OGNI_PROVA = 30, ID = 'copia-pc';
export const stato = () => S.econfig.find(x => x.id === ID) || null;
const giornoDi = iso => { const d = new Date(iso); return isNaN(d) ? String(iso).slice(0, 10) : isoOf(d); };   // giorno italiano, non quello in UTC
const base64 = b => { let s = ''; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000)); return btoa(s); };

async function salvaStato(agg) {
  const { id, ...prima } = stato() || {};
  await store.put('econfig', ID, Object.assign({ tipo: 'copia-pc' }, prima, agg));
}

/** Il ponte sa fare le copie? (versione 5 o più) → true | testo che spiega perché no */
async function ponteAdatto() {
  const AD = await import('./views/archivio-dati.js');
  if (AD.conf().prova) return "Con i dati di prova dell'archivio la copia sul PC non si fa.";
  let s; try { s = await AD.chiamaPonte('/stato', { tempo: 4000 }); } catch (e) { return e.spento ? 'Il ponte del PC è spento.' : 'Il ponte del PC non risponde: ' + e.message; }
  if (!s || !(s.versione >= 5)) return 'Il ponte del PC è di una versione vecchia: riaccendilo con "Archivio - ponte riaccendi.bat".';
  return true;
}

/** Legge dal ponte l'elenco delle copie e l'ultima prova di ripristino, e la ricorda. */
export async function aggiornaDalPC() {
  const AD = await import('./views/archivio-dati.js');
  const e = await AD.chiamaPonte('/copie', { tempo: 15000 });
  const r = e.ripristino, ora = stato() || {};
  const agg = { copiePC: e.copie.length, cartella: e.cartella, allegatiPC: e.allegati_salvati, provaInCorso: !!e.prova_in_corso };
  if (r && r.quando && r.quando !== (ora.ripristino || {}).quando) agg.ripristino = { quando: r.quando, giorno: giornoDi(r.quando), esito: r.esito, copia: r.copia, attese: r.registrazioni && r.registrazioni.attese, trovate: r.registrazioni && r.registrazioni.trovate, diverse: r.diverse || [], allegati: r.allegati || null, errore: r.errore || '' };
  if (!agg.provaInCorso) agg.provaChiesta = null;
  await salvaStato(agg);
  return e;
}

/** Fa la copia adesso: registrazioni, poi gli allegati che il PC non ha ancora. → { registrazioni, allegati, inviati, mancati, file } */
export async function copiaSulPC({ prova = 'se-serve' } = {}) {
  // dati scaricati del tutto: una copia a metà della sincronizzazione prenderebbe il posto di quella buona dello stesso giorno
  if (store.sync.mode === 'cloud' && (!store.sync.farm || store.sync.status !== 'ok' || store.sync.pending)) throw new Error("Prima collega l'azienda e aspetta la fine della sincronizzazione.");
  const ok = await ponteAdatto(); if (ok !== true) throw new Error(ok);
  const AD = await import('./views/archivio-dati.js');
  const dati = Object.fromEntries(COLS.map(c => [c, S[c]]));   // come store.exportAll (Scarica copia)
  const r = await AD.chiamaPonte('/copia', { metodo: 'POST', corpo: { dati, versione: VERSION, quando: new Date().toISOString() }, tempo: 180000 });
  const tot = Object.keys(allegatiDi(dati)).length;
  // la copia delle registrazioni c'è già: si segna subito, così un allegato difficile non la fa rifare a ogni giro
  await salvaStato({ quando: new Date().toISOString(), giorno: today(), file: r.file, registrazioni: r.registrazioni, allegati: tot, inviati: 0, mancati: (r.mancanti || []).length, versione: VERSION });
  let inviati = 0; const mancati = [];
  if (r.mancanti && r.mancanti.length) {
    const ALL = await import('./allegati.js');
    for (const a of r.mancanti) {
      try {
        const blob = await ALL.apri({ id: a.id, tipo: a.tipo, nome: a.id });
        await AD.chiamaPonte('/copia/allegato', { metodo: 'POST', corpo: { id: a.id, tipo: blob.type || a.tipo || '', dati: base64(new Uint8Array(await blob.arrayBuffer())) }, tempo: 120000 });
        inviati++;
      } catch (e) {
        if (e.spento) { let vivo = false; try { await AD.chiamaPonte('/stato', { tempo: 4000 }); vivo = true; } catch (x) { } if (!vivo) { await salvaStato({ giorno: null }); throw e; } }   // ponte spento davvero: la copia si rifà al giro dopo
        mancati.push(a.id);   // non trovato, o troppo lento (si riprova alla copia della settimana dopo)
      }
    }
  }
  await salvaStato({ inviati, mancati: mancati.length });
  // prova di ripristino: una al mese, dopo una copia riuscita
  const st = stato() || {}, rip = st.ripristino;
  if (prova === 'sempre' || (prova === 'se-serve' && !st.provaChiesta && dovuta(rip && rip.giorno, today(), OGNI_PROVA))) {
    try { const p = await AD.chiamaPonte('/copia/prova', { metodo: 'POST', corpo: {}, tempo: 10000 }); if (p.avviata || p.in_corso) await salvaStato({ provaChiesta: new Date().toISOString(), provaErrore: '' }); }
    catch (e) { await salvaStato({ provaErrore: e.message }); }
  }
  return { registrazioni: r.registrazioni, allegati: tot, inviati, mancati: mancati.length, file: r.file, tolte: r.tolte || [] };
}

/* ---------- nel Centro automatico: ogni settimana, solo sul PC del titolare con il ponte acceso ---------- */
registra({
  id: 'copia-pc', nome: 'Copia di sicurezza sul PC', area: 'archivio',
  descr: 'Una volta alla settimana tutte le registrazioni e gli allegati in una copia sul PC (fuori da internet); una volta al mese la prova che la copia si rimette davvero',
  raccolte: [],          // scrive solo il suo stato: niente nel diario
  async pronta(ctx) {
    if (!contiVisibili()) return false;
    const st = stato() || {};
    const daFare = dovuta(st.giorno, today(), OGNI_COPIA), aspettaProva = !!st.provaChiesta;
    if (ctx.auto && !daFare && !aspettaProva) return false;
    if (store.sync.mode === 'cloud' && (!store.sync.farm || store.sync.status !== 'ok' || store.sync.pending)) return ctx.auto ? false : "Prima collega l'azienda e aspetta la fine della sincronizzazione.";
    if ((await controllaPonte(!ctx.auto)) !== 'acceso') return ctx.auto ? false : 'Il ponte del PC è spento: la copia si fa solo dal PC con il ponte acceso.';
    return true;
  },
  async esegui(ctx) {
    const st = stato() || {};
    if (!ctx.auto || dovuta(st.giorno, today(), OGNI_COPIA)) {
      const c = await copiaSulPC();
      return { note: `${c.registrazioni} registrazioni e ${c.allegati} allegati nella copia ${c.file}` + (c.inviati ? ` (${c.inviati} allegati nuovi)` : '') + (c.mancati ? `; ${c.mancati} allegati non trovati` : '') + (stato().provaChiesta ? '; prova di ripristino avviata' : '') };
    }
    const e = await aggiornaDalPC(), r = (stato() || {}).ripristino;
    return { note: e.prova_in_corso ? 'prova di ripristino in corso' : r ? `prova di ripristino del ${r.giorno}: ${r.esito === 'ok' ? 'riuscita' : 'non riuscita'}` : 'nessuna prova di ripristino' };
  },
  dubbi: () => {
    const st = stato(), r = st && st.ripristino;
    if (!r || r.esito === 'ok') return [];
    return [{ id: 'copia-pc:' + r.quando, area: 'archivio', testo: 'Prova di ripristino della copia sul PC del ' + r.giorno, proposta: r.errore || ('Registrazioni diverse in: ' + (r.diverse || []).join(', ')) }];
  },
});

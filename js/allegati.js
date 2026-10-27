// Allegati (fatture e foto degli interventi): copia sul dispositivo nella cache 'ces-allegati-1',
// copia online nello spazio file di Supabase (bucket privato 'allegati', cartella = id dell'azienda, regole in supabase/aggiornamento-allegati.sql).
// Nelle registrazioni resta solo { id, nome, tipo, kb }: i file si scaricano quando si aprono, non a ogni sincronizzazione.
import { uid, lsGet, lsSet } from './util.js';
import { sync, cloudClient } from './store.js';

const CACHE = 'ces-allegati-1', BUCKET = 'allegati', CODA = 'ces.allegatiDaInviare';
export const MAX_MB = 12;
const chiave = id => new URL('./allegati/' + id, location.href).href;
const percorso = id => sync.farm.id + '/' + id;
export const stato = { archivio: null }; // null = non provato, true = attivo, false = manca il bucket (SQL da eseguire)

async function salvaLocale(id, blob, tipo) {
  try { const c = await caches.open(CACHE); await c.put(chiave(id), new Response(blob, { headers: { 'content-type': tipo || blob.type || 'application/octet-stream' } })); } catch (e) { console.warn('allegato non salvato in locale', e); }
}
async function leggiLocale(id) { try { const c = await caches.open(CACHE); const r = await c.match(chiave(id)); return r ? await r.blob() : null; } catch (e) { return null; } }

// Foto ridotte a 2200 px in JPEG (una fattura resta leggibile e pesa 300-600 kB); i PDF restano come sono
async function riduci(file) {
  if (!/^image\//.test(file.type) || file.type === 'image/gif') return file;
  let img;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { return file; }
  const k = Math.min(1, 2200 / Math.max(img.width, img.height));
  if (k === 1 && file.size < 900e3) return file;
  const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  const b = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.82));
  return b || file;
}

// Aggiunge un file: copia locale subito, invio online appena possibile. Restituisce i dati da tenere nella registrazione.
export async function aggiungi(file, nome) {
  if (file.size > MAX_MB * 1e6 && !/^image\//.test(file.type)) throw new Error(`Il file supera ${MAX_MB} MB: riducilo o fotografa le pagine.`);
  const blob = await riduci(file), id = uid();
  const tipo = blob.type || file.type || 'application/octet-stream';
  let n = nome || file.name || 'allegato'; if (tipo === 'image/jpeg' && !/\.jpe?g$/i.test(n)) n = n.replace(/\.[^.]+$/, '') + '.jpg';
  await salvaLocale(id, blob, tipo);
  lsSet(CODA, [...lsGet(CODA, []), id]);
  inviaInSospeso();
  return { id, nome: n, tipo, kb: Math.round(blob.size / 1024) };
}
export const daInviare = () => lsGet(CODA, []).length;
// Controlla una volta se l'archivio online esiste (il bucket si crea con supabase/aggiornamento-allegati.sql)
export async function prova() {
  const sb = cloudClient(); if (!sb || !sync.user || !sync.farm || stato.archivio !== null) return stato.archivio;
  const { error } = await sb.storage.from(BUCKET).list(sync.farm.id, { limit: 1 });
  stato.archivio = error ? (/not found/i.test(error.message || '') ? false : null) : true;
  return stato.archivio;
}

let invio = null;
export function inviaInSospeso() {
  if (invio) return invio;
  invio = (async () => {
    const sb = cloudClient();
    if (!sb || !sync.user || !sync.farm || !navigator.onLine) return;
    for (const id of lsGet(CODA, [])) {
      const blob = await leggiLocale(id);
      if (blob) {
        const { error } = await sb.storage.from(BUCKET).upload(percorso(id), blob, { contentType: blob.type, upsert: true });
        if (error) { if (/bucket not found|not found|row-level security|violates/i.test(error.message || '')) stato.archivio = false; console.warn('allegato non inviato', error); return; }
        stato.archivio = true;
      }
      lsSet(CODA, lsGet(CODA, []).filter(x => x !== id));
    }
  })().catch(e => console.warn(e)).finally(() => { invio = null; });
  return invio;
}
window.addEventListener('online', () => inviaInSospeso());

// Il file: dalla copia locale, altrimenti dall'archivio online (e da quel momento resta anche sul dispositivo)
export async function apri(a) {
  let blob = await leggiLocale(a.id);
  if (!blob) {
    const sb = cloudClient();
    if (!sb || !sync.farm) throw new Error('Il file è su un altro dispositivo: collega l\'azienda per scaricarlo.');
    const { data, error } = await sb.storage.from(BUCKET).download(percorso(a.id));
    if (error || !data) throw new Error(navigator.onLine ? 'File non trovato nell\'archivio online: forse il dispositivo che l\'ha caricato non l\'ha ancora inviato.' : 'Sei offline e il file non è su questo dispositivo.');
    blob = data.type ? data : new Blob([data], { type: a.tipo });
    await salvaLocale(a.id, blob, a.tipo);
  }
  return blob.type ? blob : new Blob([blob], { type: a.tipo });
}
// Vista dentro l'app: le foto come immagini, i PDF disegnati pagina per pagina con pdf.js
// (Chrome su Android non mostra i PDF in una scheda: li scaricherebbe soltanto)
let urlAperto = null;
export async function mostra(a, el) {
  const blob = await apri(a);
  if (urlAperto) URL.revokeObjectURL(urlAperto);
  urlAperto = URL.createObjectURL(blob);
  const scarica = `<a class="btn ghost sm" href="${urlAperto}" download="${a.nome.replace(/"/g, '')}">Scarica il file</a>`;
  if (!/pdf/i.test(blob.type || a.tipo)) { el.innerHTML = `<img class="all-img" src="${urlAperto}" alt="">${scarica}`; return; }
  el.innerHTML = `<div class="all-pdf"></div>${scarica}`;
  const { pdfLibrary } = await import('./conti/pdftext.js');
  const lib = await pdfLibrary(), pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise, box = el.querySelector('.all-pdf');
  const w = Math.min(1600, (box.clientWidth || 360) * Math.min(2, devicePixelRatio || 1));
  for (let i = 1; i <= Math.min(pdf.numPages, 12) && box.isConnected; i++) {
    const p = await pdf.getPage(i), vp = p.getViewport({ scale: w / p.getViewport({ scale: 1 }).width });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); box.appendChild(c);
    await p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
}
export async function elimina(id) {
  try { const c = await caches.open(CACHE); await c.delete(chiave(id)); } catch (e) { }
  lsSet(CODA, lsGet(CODA, []).filter(x => x !== id));
  const sb = cloudClient();
  if (sb && sync.farm && navigator.onLine) await sb.storage.from(BUCKET).remove([percorso(id)]).catch(() => { });
}
// Da base64 (la foto che arriva dalla pagina di lettura delle fatture) a file
export function daBase64(b64, tipo, nome) {
  const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new File([u8], nome || 'fattura.jpg', { type: tipo || 'image/jpeg' });
}

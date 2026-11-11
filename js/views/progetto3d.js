// Stalla → Progetto 3D: il modello del progetto della stalla (render Twinmotion estratto, vedi strumenti/render-stalla).
// Dalla 1.29.1 il modello sta nel repository (modelli/stalla-progetto-3d.glb, scelta di Marco dell'11/11/2026) e si apre da solo.
// Si può ancora caricare un altro modello: diventa un allegato (js/allegati.js), con il riferimento nella registrazione config 'progetto3d'.
import { get, bus } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { toast, arm } from '../ui.js';
import * as store from '../store.js';
import { puoAllegati } from '../store.js';
import { aggiungi, apri, elimina } from '../allegati.js';

const MODELLO = new URL('../../modelli/stalla-progetto-3d.glb', import.meta.url).href;
const rec = () => get('config', 'progetto3d');
// modello caricato a mano (allegato) se c'è e si può vedere, altrimenti quello pubblicato con l'app
const proprio = () => { const r = rec(); return r && r.file && puoAllegati() ? r : null; };

export function progettoView() {
  const r = proprio(), f = r && r.file;
  setTimeout(monta3d, 0);
  const desc = f ? `${esc(r.titolo || f.nome)} · ${nf(f.kb / 1024, 1)} MB${r.caricato ? ' · caricato il ' + fd(r.caricato.slice(0, 10)) : ''}` : 'Progetto stalla (render aprile 2026) · 3,5 MB';
  const carica = puoAllegati() ? `<label class="btn ghost sm">${ic('file-up')}${f ? 'Sostituisci il modello' : 'Carica un altro modello'}<input type="file" accept=".glb,model/gltf-binary" data-act="p3dFile" hidden></label>` : '';
  return `<section class="card lib3d-card"><div id="stalla3d" class="lib3d s3d"><div class="loading"><span class="spinner"></span>Carico il modello 3D…</div></div></section>
  <section class="card"><div class="card-h"><h2>${ic('warehouse')}Modello</h2></div>
  <p class="muted small pad-x">${desc}. Trascina per girare, due dita o rotella per avvicinarti, tocca un pezzo per sapere a che gruppo appartiene.</p>
  <div class="btns pad-x" style="padding-bottom:12px">${carica}${f ? `<button class="btn ghost sm" data-act="p3dTogli">${ic('rotate-ccw')}Torna al modello del progetto</button>` : ''}</div></section>`;
}

async function monta3d() {
  const el = document.getElementById('stalla3d'); if (!el) return;
  const r = proprio();
  try {
    let blob, firma;
    if (r) { blob = await apri(r.file); firma = r.file.id; }
    else {
      const res = await fetch(MODELLO);
      if (!res.ok) throw new Error('Modello 3D non trovato: controlla la connessione.');
      blob = await res.blob(); firma = 'progetto';
    }
    const x = await import('../stalla3d.js'); usato = true;
    if (el.isConnected) await x.monta(el, blob, firma);
  } catch (e) { console.warn(e); if (el.isConnected) el.innerHTML = `<div class="empty">${esc(e.message || 'Modello non caricato')}</div>`; }
}

export async function caricaModello(file) {
  if (!/\.glb$/i.test(file.name)) throw new Error('Serve un file .glb (modello 3D).');
  const testa = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...testa) !== 'glTF') throw new Error('Il file non è un modello .glb valido.');
  const vecchio = rec() && rec().file;
  const a = await aggiungi(new File([file], file.name, { type: 'model/gltf-binary' }), file.name);
  await store.put('config', 'progetto3d', { file: a, titolo: file.name.replace(/\.glb$/i, ''), caricato: new Date().toISOString() });
  if (vecchio && vecchio.id !== a.id) elimina(vecchio.id).catch(() => { });
  toast('Modello caricato'); bus.render();
}

export function p3dAct(a, b) {
  if (a === 'p3dTogli') return arm(b, 'Conferma: torna al modello del progetto', async () => {
    const r = rec(); if (r && r.file) await elimina(r.file.id).catch(() => { });
    await store.remove('config', 'progetto3d'); toast('Modello del progetto ripristinato'); bus.render();
  });
}
// Fuori dalla pagina il disegno si ferma
let usato = false;
export function sospendi3d() { if (usato) import('../stalla3d.js').then(x => x.sospendi()).catch(() => { }); }

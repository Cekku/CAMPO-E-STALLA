// Stalla → Progetto 3D: il modello del progetto della stalla (render Twinmotion estratto, vedi strumenti/render-stalla).
// Il file .glb è un allegato privato (js/allegati.js); il riferimento sta nella registrazione config 'progetto3d'.
import { get, bus } from '../state.js';
import { esc, nf, fd } from '../util.js';
import { ic } from '../icons.js';
import { empty, toast, arm } from '../ui.js';
import * as store from '../store.js';
import { puoAllegati } from '../store.js';
import { aggiungi, apri, elimina } from '../allegati.js';

const rec = () => get('config', 'progetto3d');

export function progettoView() {
  const r = rec(), f = r && r.file;
  if (!puoAllegati()) return `<section class="card">${empty('warehouse', 'Progetto della stalla in 3D', 'Il modello è tra gli allegati dell\'azienda: chiedi al titolare il permesso di vedere gli allegati.')}</section>`;
  if (!f) return `<section class="card">${empty('warehouse', 'Progetto della stalla in 3D', 'Carica il modello 3D del progetto (file .glb ricavato dal render). Resta privato: lo vedono solo le persone dell\'azienda con il permesso sugli allegati.',
    `<label class="btn primary">${ic('file-up')}Carica il modello<input type="file" accept=".glb,model/gltf-binary" data-act="p3dFile" hidden></label>`)}</section>`;
  setTimeout(monta3d, 0);
  return `<section class="card lib3d-card"><div id="stalla3d" class="lib3d s3d"><div class="loading"><span class="spinner"></span>Carico il modello 3D…</div></div></section>
  <section class="card"><div class="card-h"><h2>${ic('warehouse')}Modello</h2></div>
  <p class="muted small pad-x">${esc(r.titolo || f.nome)} · ${nf(f.kb / 1024, 1)} MB${r.caricato ? ' · caricato il ' + fd(r.caricato.slice(0, 10)) : ''}. Trascina per girare, due dita o rotella per avvicinarti, tocca un pezzo per sapere a che gruppo appartiene.</p>
  <div class="btns pad-x" style="padding-bottom:12px"><label class="btn ghost sm">${ic('file-up')}Sostituisci il modello<input type="file" accept=".glb,model/gltf-binary" data-act="p3dFile" hidden></label><button class="btn ghost sm" data-act="p3dTogli">${ic('trash-2')}Togli il modello</button></div></section>`;
}

async function monta3d() {
  const el = document.getElementById('stalla3d'), r = rec(); if (!el || !r || !r.file) return;
  try {
    const blob = await apri(r.file);
    const x = await import('../stalla3d.js'); usato = true;
    if (el.isConnected) await x.monta(el, blob, r.file.id);
  } catch (e) { console.warn(e); if (el.isConnected) el.innerHTML = `<div class="empty">${esc(e.message || 'Modello non caricato')}</div>`; }
}

export async function caricaModello(file) {
  if (!/\.glb$/i.test(file.name)) throw new Error('Serve un file .glb (modello 3D).');
  const testa = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (String.fromCharCode(...testa) !== 'glTF') throw new Error('Il file non è un modello .glb valido.');
  const vecchio = rec() && rec().file;
  const a = await aggiungi(new File([file], file.name, { type: 'model/gltf-binary' }), file.name);
  await store.put('config', 'progetto3d', { file: a, titolo: 'Progetto stalla (render aprile 2026)', caricato: new Date().toISOString() });
  if (vecchio && vecchio.id !== a.id) elimina(vecchio.id).catch(() => { });
  toast('Modello caricato'); bus.render();
}

export function p3dAct(a, b) {
  if (a === 'p3dTogli') return arm(b, 'Conferma: togli il modello', async () => {
    const r = rec(); if (r && r.file) await elimina(r.file.id).catch(() => { });
    await store.remove('config', 'progetto3d'); toast('Modello tolto'); bus.render();
  });
}
// Fuori dalla pagina il disegno si ferma
let usato = false;
export function sospendi3d() { if (usato) import('../stalla3d.js').then(x => x.sospendi()).catch(() => { }); }

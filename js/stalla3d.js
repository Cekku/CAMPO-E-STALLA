// Progetto della stalla in 3D (three.js r128 in vendor/three, caricato solo quando si apre la pagina).
// Il modello viene dal render Unreal/Twinmotion del progetto (aprile 2026), estratto e alleggerito con
// strumenti/render-stalla (LEGGIMI): nodi di primo livello sotto "stalla" = gruppi del disegno (ESISTENTE, PORTONI_INTERNI…).
// Il file non sta nel repository (che è pubblico): si carica dall'app ed è un allegato privato dell'azienda (js/allegati.js).
import { esc } from './util.js';

const BASE = new URL('../', import.meta.url).href;

// Gruppi mostrati nell'app: chiave → nome, nodi del modello che ne fanno parte, acceso all'apertura
export const GRUPPI = {
  nuova: { nome: 'Nuova stalla', nodi: /^(nuova_carpenteria|omega_e_tetto|TOTALE)$/, on: true },
  cuccette: { nome: 'Cuccette', nodi: /^CUCCETTE/, on: true },
  portoni: { nome: 'Portoni e cancelli', nodi: /^PORTONI/, on: true },
  esistente: { nome: 'Stalle esistenti', nodi: /^(ESISTENTE|esistente_.*|muro_.*)$/, on: true },
  concimaia: { nome: 'Concimaia e vasche', nodi: /^(CONCIMAIA|nuove_vasche)$/, on: true },
  tetti: { nome: 'Tetti', nodi: /^(tetto|vetro_tetto)$/, on: true, materiali: /Roof_covering|BrickGlass|AutoCAD_132/ },
  fotovoltaico: { nome: 'Fotovoltaico', nodi: /^$/, on: true, materiali: /AutoCAD_5$|Matt_chrome_2/ },
  fondazioni: { nome: 'Fondazioni', nodi: /^FONDAZIONE$/, on: false },
  terreno: { nome: 'Terreno', nodi: /^(Terreno.*|ghiaia|rencinto|altro)$/, on: true },
};
// Viste pronte: direzione da cui si guarda (x est, y su, z sud) e quanto lontano rispetto all'ingombro
const VISTE = {
  insieme: { nome: 'Insieme', dir: [-0.9, 0.75, 0.6], d: 0.62 },
  alto: { nome: 'Dall\'alto', dir: [0.001, 1, 0.02], d: 0.72 },
  // la stalla nuova sta dove sono cuccette, cancelli e fondazioni (circa 80 × 115 m)
  nuova: { nome: 'Nuova stalla', dir: [-0.7, 0.55, 0.9], su: ['cuccette', 'portoni', 'fondazioni'] },
};

const G = { pronto: null, dirty: true, loop: false, gruppi: {}, meshes: [], sel: null, tetti: true };

function script(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Libreria 3D non caricata: controlla la connessione.')); document.head.appendChild(s); }); }
async function librerie() {
  if (!window.THREE) await script(BASE + 'vendor/three/three.min.js');
  await Promise.all([THREE.GLTFLoader ? 0 : script(BASE + 'vendor/three/GLTFLoader.js'), THREE.OrbitControls ? 0 : script(BASE + 'vendor/three/OrbitControls.js'), THREE.RoomEnvironment ? 0 : script(BASE + 'vendor/three/RoomEnvironment.js')]);
}

// Posizioni quantizzate (interi) → numeri veri, poi tutto in coordinate della scena: così i pezzi si possono unire
function geomMondo(o) {
  const g = o.geometry.clone(), a = g.attributes.position;
  if (a.normalized || !(a.array instanceof Float32Array)) {
    // gltfpack scrive interi non normalizzati (la scala sta nel nodo); se normalizzati vanno divisi per il massimo del tipo
    const div = !a.normalized ? 1 : a.array instanceof Int16Array ? 32767 : a.array instanceof Int8Array ? 127 : a.array instanceof Uint16Array ? 65535 : a.array instanceof Uint8Array ? 255 : 1;
    const f = new Float32Array(a.count * 3), lim = div === 1 ? -Infinity : -1;
    for (let i = 0; i < a.count; i++) { f[i * 3] = Math.max(a.getX(i) / div, lim); f[i * 3 + 1] = Math.max(a.getY(i) / div, lim); f[i * 3 + 2] = Math.max(a.getZ(i) / div, lim); }
    g.setAttribute('position', new THREE.BufferAttribute(f, 3));
  }
  const n = g.attributes.normal;
  if (n && (n.normalized || !(n.array instanceof Float32Array))) {
    const div = !n.normalized ? 1 : n.array instanceof Int8Array ? 127 : n.array instanceof Int16Array ? 32767 : 1, f = new Float32Array(n.count * 3);
    for (let i = 0; i < n.count; i++) { f[i * 3] = n.getX(i) / div; f[i * 3 + 1] = n.getY(i) / div; f[i * 3 + 2] = n.getZ(i) / div; }
    g.setAttribute('normal', new THREE.BufferAttribute(f, 3));
  }
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  g.applyMatrix4(o.matrixWorld);
  if (o.matrixWorld.determinant() < 0 && g.index) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } }
  return g.index ? g : g.setIndex([...Array(g.attributes.position.count).keys()]);
}
function unisci(geoms) {
  let nv = 0, ni = 0; for (const g of geoms) { nv += g.attributes.position.count; ni += g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const g of geoms) {
    pos.set(g.attributes.position.array, ov * 3); if (g.attributes.normal) nor.set(g.attributes.normal.array, ov * 3);
    const ix = g.index.array; for (let i = 0; i < ix.length; i++) idx[oi + i] = ix[i] + ov;
    ov += g.attributes.position.count; oi += ix.length; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingBox(); out.computeBoundingSphere();
  return out;
}

function chiaveGruppo(nodo, mat) {
  for (const [k, d] of Object.entries(GRUPPI)) if (d.materiali && d.materiali.test(mat)) return k;
  for (const [k, d] of Object.entries(GRUPPI)) if (d.nodi.test(nodo)) return k;
  return 'terreno';
}

async function prepara(blob) {
  await librerie();
  const tela = document.createElement('div'); tela.style.cssText = 'position:absolute;inset:0';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const phone = matchMedia('(pointer: coarse)').matches;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, phone ? 1.75 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  tela.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f80, 0.35));
  const sole = new THREE.DirectionalLight(0xfff4e0, 1.1); sole.position.set(-60, 120, 80); scene.add(sole);
  const camera = new THREE.PerspectiveCamera(40, 1, 0.3, 4000);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.1; controls.maxPolarAngle = Math.PI * 0.49; controls.screenSpacePanning = false;
  controls.addEventListener('change', () => { G.dirty = true; });
  Object.assign(G, { renderer, scene, camera, controls, tela });

  const url = URL.createObjectURL(blob);
  let gltf;
  try { gltf = await new Promise((res, rej) => new THREE.GLTFLoader().load(url, res, undefined, rej)); }
  catch (e) { throw new Error('Il file del modello non si legge: serve un .glb.'); }
  finally { URL.revokeObjectURL(url); }
  const root = gltf.scene; root.updateMatrixWorld(true);
  // un disegno per gruppo e materiale (da ~1.600 pezzi a qualche decina): il telefono regge
  const pezzi = {};
  root.traverse(o => {
    if (!o.isMesh) return;
    let p = o; while (p.parent && p.parent.parent && p.parent !== root && p.parent.name !== 'stalla') p = p.parent;
    const k = chiaveGruppo(p.name, o.material.name), mk = k + '|' + o.material.name;
    (pezzi[mk] = pezzi[mk] || { k, mat: o.material, g: [] }).g.push(geomMondo(o));
  });
  for (const k of Object.keys(GRUPPI)) { const grp = new THREE.Group(); grp.name = k; grp.visible = GRUPPI[k].on; scene.add(grp); G.gruppi[k] = grp; }
  for (const { k, mat, g } of Object.values(pezzi)) {
    const mt = mat.clone(); mt.side = THREE.DoubleSide; // copia: l'evidenziazione di un gruppo non deve colorare gli altri
    const m = new THREE.Mesh(unisci(g), mt); m.userData.gruppo = k; m.userData.em = mt.emissive ? mt.emissive.clone() : null;
    G.gruppi[k].add(m); G.meshes.push(m);
  }
  const box = new THREE.Box3(); for (const k of Object.keys(GRUPPI)) if (k !== 'terreno' && k !== 'fondazioni') box.expandByObject(G.gruppi[k]);
  G.box = box; G.raggio = box.getSize(new THREE.Vector3()).length() / 2;
  camera.far = G.raggio * 12; camera.near = Math.max(0.2, G.raggio / 2000); camera.updateProjectionMatrix();
  controls.maxDistance = G.raggio * 4; controls.minDistance = 2;
  tocchi();
  new ResizeObserver(adatta).observe(tela);
}

export function vista(nome) {
  const v = VISTE[nome] || VISTE.insieme, { camera, controls } = G;
  const b = v.su ? v.su.reduce((b, k) => { for (const m of G.gruppi[k].children) { m.geometry.computeBoundingBox(); b.union(m.geometry.boundingBox); } return b; }, new THREE.Box3()) : G.box;
  if (b.isEmpty()) return;
  const c = b.getCenter(new THREE.Vector3()), r = v.su ? b.getSize(new THREE.Vector3()).length() / 2 : G.raggio;
  const vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const d = r / Math.sin(Math.min(vf, hf) / 2) * (v.su ? 0.9 : v.d * 1.4);
  camera.position.copy(c).addScaledVector(new THREE.Vector3(...v.dir).normalize(), d); controls.target.copy(c); controls.update(); G.dirty = true; G.vista = nome;
  G.ui && G.ui.querySelectorAll('[data-s3v]').forEach(b => b.setAttribute('aria-pressed', b.dataset.s3v === nome));
}
function adatta() { const { renderer, camera, tela } = G; const w = tela.clientWidth, h = tela.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); G.dirty = true; }

function evidenzia(k) {
  const acc = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#24507A');
  for (const m of G.meshes) if (m.material.emissive) { if (k && m.userData.gruppo === k) m.material.emissive.copy(acc).multiplyScalar(0.5); else if (m.userData.em) m.material.emissive.copy(m.userData.em); }
  G.dirty = true;
}
function scegli(k) {
  G.sel = k; evidenzia(k);
  const info = G.ui && G.ui.querySelector('.lib3d-info'); if (!info) return;
  info.innerHTML = k ? `<div><b>${esc(GRUPPI[k].nome)}</b><small>Tocca un altro punto per cambiare, fuori dal modello per togliere.</small></div>` : '';
}
function tocchi() {
  const el = G.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2(); let giu = null;
  el.addEventListener('pointerdown', e => { giu = [e.clientX, e.clientY]; });
  el.addEventListener('pointerup', e => {
    if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 6) return; giu = null;
    const r = el.getBoundingClientRect(); v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, G.camera);
    const hit = ray.intersectObjects(G.meshes.filter(m => m.parent.visible), false).find(h => !h.object.material.transparent || h.object.material.opacity > 0.6);
    scegli(hit && hit.object.userData.gruppo !== 'terreno' ? hit.object.userData.gruppo : null);
  });
}
function ciclo() {
  if (!G.loop) return;
  if (!G.tela.isConnected) { G.loop = false; return; } // pagina cambiata: niente disegno in sottofondo
  requestAnimationFrame(ciclo);
  if (G.controls.update() || G.dirty) { G.renderer.render(G.scene, G.camera); G.dirty = false; }
}

// el: riquadro .lib3d; blob: il file .glb; firma: per ricaricare se il file cambia
export async function monta(el, blob, firma) {
  if (G.firma !== firma) { if (G.renderer) { G.loop = false; G.renderer.dispose(); } Object.assign(G, { pronto: null, gruppi: {}, meshes: [], sel: null, inquadrato: false }); G.firma = firma; }
  if (!G.pronto) G.pronto = prepara(blob);
  try { await G.pronto; } catch (e) { G.pronto = null; G.firma = null; throw e; }
  if (!el.isConnected) return;
  el.innerHTML = `<div class="lib3d-info"></div>
  <div class="s3d-bar"><div class="s3d-viste">${Object.entries(VISTE).map(([k, v]) => `<button class="btn sm ghost" data-s3v="${k}" aria-pressed="false">${esc(v.nome)}</button>`).join('')}</div>
  <div class="s3d-gruppi">${Object.entries(GRUPPI).map(([k, d]) => `<button class="s3d-chip" data-s3g="${k}" aria-pressed="${G.gruppi[k].visible}">${esc(d.nome)}</button>`).join('')}</div></div>`;
  el.prepend(G.tela); G.ui = el; adatta();
  if (!G.inquadrato && G.tela.clientWidth) { G.inquadrato = true; vista('insieme'); } else vista(G.vista || 'insieme');
  el.querySelectorAll('[data-s3v]').forEach(b => b.onclick = () => vista(b.dataset.s3v));
  el.querySelectorAll('[data-s3g]').forEach(b => b.onclick = () => { const g = G.gruppi[b.dataset.s3g]; g.visible = !g.visible; b.setAttribute('aria-pressed', g.visible); if (!g.visible && G.sel === b.dataset.s3g) scegli(null); G.dirty = true; });
  if (G.sel) scegli(G.sel);
  G.dirty = true;
  if (!G.loop) { G.loop = true; ciclo(); }
}
export function sospendi() { G.loop = false; }
// Solo per le prove in locale
if (location.hostname === 'localhost') window.__stalla3d = { G, vista, scegli };

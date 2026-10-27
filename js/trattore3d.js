// Modello 3D esploso del trattore (three.js r128 in vendor/three, caricato solo quando si apre la scheda 3D).
// Modello: "John Deere 8360r" di Miamux02 su Sketchfab, CC BY 4.0, lavorato con strumenti/modello-trattore (nodi "<gruppo>__…").
// Il disegno resta vivo tra un aggiornamento e l'altro della pagina: monta() sposta la stessa tela nel nuovo riquadro.
import { COMP } from './trattori.js';
import { esc } from './util.js';

const BASE = new URL('../', import.meta.url).href;
const MODELLO = BASE + 'modelli/trattore.glb';
export const CREDITO = '"John Deere 8360r" di Miamux02 · CC BY 4.0';

// Gruppi del modello: verso e distanza dello spostamento nell'esploso (metri; +x avanti, +y su, +z destra) e fase sulla linea 0-1
export const GRUPPI3D = {
  cofano: { v: [0.2, 1.8, 0], f: [0, 0.4] },
  cabina: { v: [-0.2, 1.5, 0], f: [0.15, 0.55] },
  zavorra: { v: [1.0, 0, 0], f: [0, 0.3] },
  ruota_ant_sx: { v: [0, 0, -1.0], f: [0.1, 0.45] }, ruota_ant_dx: { v: [0, 0, 1.0], f: [0.1, 0.45] },
  ruota_post_sx: { v: [0, 0, -1.2], f: [0.1, 0.45] }, ruota_post_dx: { v: [0, 0, 1.2], f: [0.1, 0.45] },
  parafanghi: { v: [0, 0.9, 0], f: [0.2, 0.55] },
  serbatoio: { v: [0, -0.1, -1.0], f: [0.35, 0.75] },
  scarico: { v: [0.2, 1.4, 0], f: [0.3, 0.7] },
  motore: { v: [0.6, 0.8, 0], f: [0.45, 0.9] },
  radiatori: { v: [1.2, 0.5, 0], f: [0.45, 0.9] },
  assale_ant: { v: [0.4, -0.5, 0], f: [0.5, 1] },
  trasmissione: { v: [0, -0.4, 0], f: [0.6, 1] },
  sollevatore: { v: [-1.0, 0.2, 0], f: [0.5, 0.95] },
  luci: { v: [0, 0.6, 0], f: [0.2, 0.6] },
  telaio: { v: [0, 0, 0], f: [0, 1] },
};
// Pezzi del libretto → gruppi del modello (si evidenziano al tocco del pezzo; toccando il modello si vedono i pezzi del gruppo)
export const COMP3D = {
  olio_motore: ['motore'], gioco_valvole: ['motore'], refrigerante: ['radiatori'], cinghia: ['motore'], radiatori: ['radiatori'], turbo: ['motore'],
  iniettori: ['motore'], filtro_gasolio: ['motore'], filtro_aria: ['motore'], filtro_aria_sic: ['motore'], serbatoio: ['serbatoio'], adblue: ['serbatoio'], scarico: ['scarico'],
  olio_trasm: ['trasmissione'], filtri_trasm: ['trasmissione'], assale_ant: ['assale_ant'], frizione: ['trasmissione'], pto: ['sollevatore'],
  sollevatore: ['sollevatore'], distributori: ['sollevatore'], pompa_idr: ['trasmissione'], idroguida: ['assale_ant'],
  ingrassaggio: ['assale_ant', 'sollevatore'], pneumatici: ['ruota_ant_sx', 'ruota_ant_dx', 'ruota_post_sx', 'ruota_post_dx'], mozzi: ['ruota_ant_sx', 'ruota_ant_dx'], freni: ['trasmissione'],
  filtro_cabina: ['cabina'], clima: ['cabina'], cabina: ['cabina'], batteria: ['motore'], alternatore: ['motore'], luci: ['luci', 'cabina'],
};
const NOMI3D = { cofano: 'Cofano', cabina: 'Cabina', zavorra: 'Zavorra anteriore', ruota_ant_sx: 'Ruota anteriore sinistra', ruota_ant_dx: 'Ruota anteriore destra', ruota_post_sx: 'Ruota posteriore sinistra', ruota_post_dx: 'Ruota posteriore destra', parafanghi: 'Parafanghi', serbatoio: 'Serbatoio', scarico: 'Scarico', motore: 'Motore', radiatori: 'Radiatori', assale_ant: 'Assale anteriore', trasmissione: 'Trasmissione', sollevatore: 'Sollevatore e attacco a tre punti', luci: 'Luci', telaio: 'Telaio' };

const G = { pronto: null, t: 0, tTarget: 0, sel: null, stati: {}, m: null, gruppi: {}, meshes: [], loop: false, dirty: true };

function script(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Libreria 3D non caricata: controlla la connessione.')); document.head.appendChild(s); }); }
async function librerie() {
  if (!window.THREE) await script(BASE + 'vendor/three/three.min.js');
  await Promise.all([THREE.GLTFLoader ? 0 : script(BASE + 'vendor/three/GLTFLoader.js'), THREE.OrbitControls ? 0 : script(BASE + 'vendor/three/OrbitControls.js'), THREE.RoomEnvironment ? 0 : script(BASE + 'vendor/three/RoomEnvironment.js')]);
}
const colore = v => { const s = getComputedStyle(document.documentElement).getPropertyValue(v).trim(); return new THREE.Color(s || '#888'); };

// Il modello arriva con posizioni quantizzate (interi): three r128 le disegna ma tocchi e ingombri leggono gli interi grezzi
function dequantizza(root) {
  root.traverse(o => {
    if (!o.isMesh) return; const a = o.geometry.attributes.position;
    if (!a || !a.normalized || a.array instanceof Float32Array) return;
    const div = a.array instanceof Int16Array ? 32767 : a.array instanceof Int8Array ? 127 : a.array instanceof Uint16Array ? 65535 : 255;
    const f = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) { f[i * 3] = Math.max(a.getX(i) / div, -1); f[i * 3 + 1] = Math.max(a.getY(i) / div, -1); f[i * 3 + 2] = Math.max(a.getZ(i) / div, -1); }
    o.geometry.setAttribute('position', new THREE.BufferAttribute(f, 3)); o.geometry.computeBoundingBox(); o.geometry.computeBoundingSphere();
  });
}

async function prepara() {
  await librerie();
  const tela = document.createElement('div'); tela.className = 'lib3d-host'; tela.style.cssText = 'position:absolute;inset:0';
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  const gl = renderer.getContext(), dbg = gl.getExtension('WEBGL_debug_renderer_info'), gpu = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : '';
  const phone = matchMedia('(pointer: coarse)').matches;
  // modo leggero solo per le schede grafiche vecchie (es. Mi 5): il Pixel 9 Pro tiene la qualità piena
  G.lite = phone && (/Adreno \(TM\) [2-5]\d\d|Mali-(4|T)\d|PowerVR/i.test(gpu) || (navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 4);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, G.lite ? 1.5 : 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95;
  tela.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  if (!G.lite) { const pm = new THREE.PMREMGenerator(renderer); scene.environment = pm.fromScene(new THREE.RoomEnvironment(), 0.04).texture; pm.dispose(); }
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 120);
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.09; controls.minDistance = 3; controls.maxDistance = 26; controls.maxPolarAngle = Math.PI * 0.495;
  controls.addEventListener('change', () => { G.dirty = true; });
  const env = !!scene.environment;
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a9099, env ? 0.3 : 0.8));
  const key = new THREE.DirectionalLight(0xffffff, env ? 0.85 : 0.95); key.position.set(4, 10, 5); key.castShadow = true;
  const sm = G.lite ? 1024 : 2048; key.shadow.mapSize.set(sm, sm); Object.assign(key.shadow.camera, { left: -6, right: 6, top: 6, bottom: -6, near: 1, far: 30 }); key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe8ff, env ? 0.25 : 0.45); fill.position.set(-6, 4, -5); scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.2 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
  const grid = new THREE.GridHelper(24, 48); grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
  Object.assign(G, { renderer, scene, camera, controls, tela, key });

  const gltf = await new Promise((res, rej) => new THREE.GLTFLoader().load(MODELLO, res, undefined, () => rej(new Error('Il modello 3D del trattore non è ancora stato pubblicato.'))));
  const root = gltf.scene; dequantizza(root); scene.add(root);
  // gruppi dal nome dei nodi "<gruppo>__…": ogni gruppo si sposta tutto insieme
  root.traverse(o => {
    const g = String(o.name).split('__')[0];
    if (GRUPPI3D[g] && !G.gruppi[g] && o.name.includes('__')) G.gruppi[g] = { obj: o, base: o.position.clone(), nome: NOMI3D[g] || g };
    if (o.isMesh) { o.castShadow = true; o.receiveShadow = !G.lite; G.meshes.push(o); o.material = o.material.clone(); o.userData.em = o.material.emissive ? o.material.emissive.clone() : null; }
  });
  const box = new THREE.Box3().setFromObject(root), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  G.centro = new THREE.Vector3(c.x, size.y * 0.42, c.z); G.raggio = size.length() / 2;
  vistaIniziale();
  tocchi();
  new ResizeObserver(adatta).observe(tela);
}
// distanza scelta perché il trattore stia tutto nel riquadro anche sul telefono in verticale (conta l'angolo di vista più stretto)
function vistaIniziale() {
  const { camera, controls } = G, vf = camera.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * camera.aspect);
  const d = G.raggio / Math.sin(Math.min(vf, hf) / 2) * 0.92, dir = new THREE.Vector3(1.6, 0.85, 1.9).normalize();
  camera.position.copy(G.centro).addScaledVector(dir, d); controls.target.copy(G.centro); controls.maxDistance = d * 2; controls.update(); G.dirty = true;
}
function adatta() { const { renderer, camera, tela } = G; const w = tela.clientWidth, h = tela.clientHeight; if (!w || !h) return; renderer.setSize(w, h, false); renderer.domElement.style.width = w + 'px'; renderer.domElement.style.height = h + 'px'; camera.aspect = w / h; camera.updateProjectionMatrix(); G.dirty = true; }

const ease = x => x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
function esplodi() {
  for (const [g, o] of Object.entries(G.gruppi)) {
    const d = GRUPPI3D[g], k = ease(Math.max(0, Math.min(1, (G.t - d.f[0]) / (d.f[1] - d.f[0]))));
    // lo spostamento è nelle coordinate della scena: il genitore del gruppo non è scalato dalla lavorazione (metri)
    o.obj.position.set(o.base.x + d.v[0] * k, o.base.y + d.v[1] * k, o.base.z + d.v[2] * k);
  }
  G.renderer.shadowMap.needsUpdate = true; G.dirty = true;
}

function evidenzia(gruppi) {
  const set = new Set(gruppi || []), acc = colore('--accent');
  for (const m of G.meshes) {
    if (!m.material.emissive) continue;
    let p = m, g = null; while (p && !g) { const n = String(p.name).split('__')[0]; if (G.gruppi[n] && G.gruppi[n].obj === p) g = n; p = p.parent; }
    if (set.size && g && set.has(g)) { m.material.emissive.copy(acc).multiplyScalar(0.45); }
    else if (m.userData.em) m.material.emissive.copy(m.userData.em);
    m.material.transparent = !!set.size && !(g && set.has(g)); m.material.opacity = m.material.transparent ? 0.35 : 1; m.material.depthWrite = !m.material.transparent;
  }
  G.dirty = true;
}
function gruppoDi(o) { while (o) { const n = String(o.name).split('__')[0]; if (G.gruppi[n] && G.gruppi[n].obj === o) return n; o = o.parent; } return null; }
function tocchi() {
  const el = G.renderer.domElement, ray = new THREE.Raycaster(), v = new THREE.Vector2(); let giu = null;
  el.addEventListener('pointerdown', e => { giu = [e.clientX, e.clientY]; });
  el.addEventListener('pointerup', e => {
    if (!giu || Math.hypot(e.clientX - giu[0], e.clientY - giu[1]) > 6) return; giu = null;
    const r = el.getBoundingClientRect(); v.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(v, G.camera); const hit = ray.intersectObjects(G.meshes, false).find(h => h.object.material.opacity > 0.5 || !h.object.material.transparent);
    scegli(hit ? gruppoDi(hit.object) : null);
  });
}
function scegli(g, comp) {
  G.sel = g; const info = G.ui && G.ui.querySelector('.lib3d-info');
  if (!g) { evidenzia(null); if (info) info.innerHTML = ''; return; }
  const gs = comp ? COMP3D[comp] || [g] : [g]; evidenzia(gs);
  const pezzi = Object.entries(COMP3D).filter(([id, l]) => l.some(x => gs.includes(x)) && G.stati[id]).map(([id]) => id);
  const ord = { bad: 0, warn: 1, none: 2, ok: 3, free: 4 }; pezzi.sort((a, b) => ord[G.stati[a]] - ord[G.stati[b]]);
  const lbl = { bad: 'scaduto', warn: 'in scadenza', none: 'da registrare', ok: 'in regola', free: '' };
  if (info) info.innerHTML = `<div><b>${esc(comp ? COMP[comp].nome : G.gruppi[g].nome)}</b>${pezzi.length ? `<small>${pezzi.slice(0, 6).map(id => esc(COMP[id].nome) + (lbl[G.stati[id]] ? ' · ' + lbl[G.stati[id]] : '')).join('<br>')}</small><div class="btns" style="margin-top:6px">${pezzi.slice(0, 3).map(id => `<button class="btn sm ghost" data-act="lib-comp" data-id="${G.m.id}" data-c="${id}">${esc(COMP[id].nome.split(' (')[0])}</button>`).join('')}</div>` : ''}</div>`;
}

function ciclo() {
  if (!G.loop) return;
  requestAnimationFrame(ciclo);
  if (Math.abs(G.t - G.tTarget) > 0.001) { G.t += (G.tTarget - G.t) * 0.12; if (Math.abs(G.t - G.tTarget) < 0.002) G.t = G.tTarget; esplodi(); cursore(G.t * 100); }
  if (G.controls.update() || G.dirty) { G.renderer.render(G.scene, G.camera); G.dirty = false; }
}
function cursore(v) { const s = G.ui && G.ui.querySelector('.lib3d-slider'); if (!s) return; v = Math.max(0, Math.min(100, Math.round(v))); s.setAttribute('aria-valuenow', v); s.firstElementChild.style.width = v + '%'; s.lastElementChild.style.left = v + '%'; const b = G.ui.querySelector('[data-x3d=esplodi]'); if (b) b.textContent = G.tTarget > 0.5 ? 'Ricomponi' : 'Esplodi'; }

export async function monta(el, m, stati) {
  G.m = m; G.stati = stati || {};
  if (!G.pronto) G.pronto = prepara();
  try { await G.pronto; } catch (e) { G.pronto = null; throw e; }
  if (!el.isConnected) return;
  el.innerHTML = `<div class="lib3d-info"></div><div class="lib3d-credit">${esc(CREDITO)}</div><div class="lib3d-bar"><button class="btn sm" data-x3d="esplodi">${G.tTarget > 0.5 ? 'Ricomponi' : 'Esplodi'}</button><div class="lib3d-slider" role="slider" tabindex="0" aria-label="Esploso" aria-valuemin="0" aria-valuemax="100"><i></i><b></b></div><button class="btn sm ghost" data-x3d="vista" style="width:auto">Vista</button></div>`;
  el.prepend(G.tela); G.ui = el; adatta(); cursore(G.t * 100);
  if (!G.inquadrato && G.tela.clientWidth) { G.inquadrato = true; vistaIniziale(); }
  const s = el.querySelector('.lib3d-slider'); let drag = null;
  const at = x => { const r = s.getBoundingClientRect(); return (x - r.left) / r.width; };
  const muovi = x => { G.t = G.tTarget = Math.max(0, Math.min(1, at(x))); esplodi(); cursore(G.t * 100); };
  s.addEventListener('pointerdown', e => { if (drag !== null) return; drag = e.pointerId; s.setPointerCapture(e.pointerId); e.preventDefault(); muovi(e.clientX); });
  s.addEventListener('pointermove', e => { if (e.pointerId === drag) muovi(e.clientX); });
  const fine = e => { if (e.pointerId === drag) drag = null; }; s.addEventListener('pointerup', fine); s.addEventListener('pointercancel', fine);
  s.addEventListener('keydown', e => { const k = { ArrowRight: 0.05, ArrowUp: 0.05, ArrowLeft: -0.05, ArrowDown: -0.05 }[e.key]; if (k) { e.preventDefault(); G.tTarget = Math.max(0, Math.min(1, G.tTarget + k)); } });
  el.querySelector('[data-x3d=esplodi]').onclick = () => { G.tTarget = G.tTarget > 0.5 ? 0 : 1; cursore(G.t * 100); };
  el.querySelector('[data-x3d=vista]').onclick = () => { vistaIniziale(); scegli(null); };
  const UIf = (await import('./state.js')).UI;
  if (UIf.f.lib3dComp) { const c = UIf.f.lib3dComp; UIf.f.lib3dComp = null; const gs = COMP3D[c]; if (gs) { if (gs.some(g => ['motore', 'trasmissione', 'assale_ant', 'radiatori'].includes(g)) && G.tTarget < 0.5) G.tTarget = 1; scegli(gs[0], c); } }
  else if (G.sel) scegli(G.sel);
  G.renderer.shadowMap.needsUpdate = true; G.dirty = true;
  if (!G.loop) { G.loop = true; ciclo(); }
}
// Solo per le prove in locale: posa dell'esploso e disegno di un fotogramma senza animazione
if (location.hostname === 'localhost') window.__trattore3d = { G, posa: t => { G.t = G.tTarget = t; esplodi(); G.renderer.render(G.scene, G.camera); }, scegli };
// Fuori dalla scheda 3D il disegno si ferma (niente batteria consumata in sottofondo)
export function sospendi() { G.loop = false; }

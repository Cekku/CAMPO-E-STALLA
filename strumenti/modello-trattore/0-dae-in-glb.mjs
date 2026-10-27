// Collada (.dae) → glb, con three.js in Node: DOMParser da xmldom, FileReader ridotto all'essenziale
import fs from 'node:fs';
import { DOMParser } from '@xmldom/xmldom';
globalThis.DOMParser = DOMParser;
globalThis.FileReader = class { readAsArrayBuffer(b) { b.arrayBuffer().then(r => { this.result = r; this.onloadend && this.onloadend(); this.onload && this.onload({ target: this }); }); } readAsDataURL(b) { b.arrayBuffer().then(r => { this.result = 'data:' + (b.type || 'application/octet-stream') + ';base64,' + Buffer.from(r).toString('base64'); this.onloadend && this.onloadend(); }); } };
globalThis.self = globalThis;
// le immagini delle texture non servono (il modello ha solo colori): un'immagine finta che non si carica mai
globalThis.document = { createElementNS: () => ({ addEventListener() { }, removeEventListener() { }, style: {} }) };
const THREE = await import('three');
const { ColladaLoader } = await import('three/examples/jsm/loaders/ColladaLoader.js');
const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
const [src, out] = process.argv.slice(2);
const text = fs.readFileSync(src, 'utf8');
const res = new ColladaLoader().parse(text, '');
const scene = res.scene;
const mapsTolte = new Set(); scene.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k of ['map', 'normalMap', 'specularMap', 'bumpMap', 'emissiveMap', 'alphaMap', 'aoMap', 'lightMap']) if (m[k]) { mapsTolte.add(m.name + ':' + k); m[k] = null; } }); });
console.log('texture tolte', [...mapsTolte].join(' '));
let n = 0, tri = 0; scene.traverse(o => { if (o.isMesh) { n++; const g = o.geometry; tri += (g.index ? g.index.count : g.attributes.position.count) / 3; } });
console.log('up', res.kinematics ? 'k' : '', 'meshes', n, 'tri', Math.round(tri), 'unit', JSON.stringify(scene.scale), 'rot', JSON.stringify(scene.rotation.toArray()));
const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
fs.writeFileSync(out, Buffer.from(glb));
console.log('scritto', out, fs.statSync(out).size);

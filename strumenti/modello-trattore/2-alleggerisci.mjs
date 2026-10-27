// Libretto trattori, modello 3D, passo 2 (Node): saldatura, semplificazione, compressione dei vertici.
//   node 2-alleggerisci.mjs trattore_gruppi.glb trattore.glb
// Pacchetti: @gltf-transform/core, extensions, functions 4.1.1 e meshoptimizer 0.22.0 (come per il Q5).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, simplify, simplifyPrimitive, quantize, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(process.argv[2]);
await MeshoptSimplifier.ready;
await doc.transform(prune(), dedup(), weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.2, error: 0.006 }));
// gomme e tasselli sono la parte più fitta: sullo schermo del telefono reggono con molto meno
for (const m of doc.getRoot().listMeshes()) if (/^ruota_/.test(m.getName())) for (const p of m.listPrimitives()) simplifyPrimitive(p, { simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.012 });
await doc.transform(prune(), quantize({ quantizeNormal: 8, quantizePosition: 14 }));
let tris = 0, prims = 0;
for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) { prims++; tris += (p.getIndices() ? p.getIndices().getCount() : p.getAttribute("POSITION").getCount()) / 3; }
console.log('nodi', doc.getRoot().listNodes().length, 'primitive', prims, 'triangoli', tris);
await io.write(process.argv[3], doc);

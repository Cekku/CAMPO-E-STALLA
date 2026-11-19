// Dubbi scartati in Da controllare (1.63): si ricordano in econfig (id dz-<codice>) e non si ripropongono più.
// Un record per dubbio, così due dispositivi che scartano insieme non si cancellano a vicenda.
import { S } from '../state.js';
import * as store from '../store.js';
import { today } from '../util.js';

export const PRE_SCARTO = 'dz-';
const hash = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36) + s.length.toString(36); };
export const idScarto = id => PRE_SCARTO + hash(String(id));
let C = null, CK = null;
const scarti = () => { if (C && CK === S.econfig) return C; CK = S.econfig; C = new Set(S.econfig.filter(x => x.tipo === 'dubbioScartato').map(x => x.dubbio)); return C; };
/** Il dubbio con questo codice è stato scartato? */
export const scartato = id => scarti().has(id);
/** Ricorda che il dubbio è stato scartato (area 'personale' o 'conti', testo per ricordare cos'era). */
export async function scarta(id, area = '', testo = '') { await store.put('econfig', idScarto(id), { tipo: 'dubbioScartato', dubbio: id, area, testo: String(testo).slice(0, 200), quando: today() }); }
/** Lo ripropone (annulla lo scarto). */
export async function ripristina(id) { await store.remove('econfig', idScarto(id)); }

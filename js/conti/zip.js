// Archivi ZIP minimi (lettura e scrittura) per i file Excel, senza librerie esterne
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }

async function stream(bytes, ctor, fmt) {
  const s = new Blob([bytes]).stream().pipeThrough(new ctor(fmt));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
const inflate = b => stream(b, DecompressionStream, 'deflate-raw');
const deflate = b => stream(b, CompressionStream, 'deflate-raw');

/** Legge uno ZIP: ritorna Map nome -> Uint8Array. */
export async function unzip(data) {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let e = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Il file non è un archivio valido (ZIP/XLSX).');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = new Map(); const dec = new TextDecoder();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const metodo = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const ln = dv.getUint16(p + 28, true), lx = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const nome = dec.decode(b.subarray(p + 46, p + 46 + ln));
    const lln = dv.getUint16(off + 26, true), llx = dv.getUint16(off + 28, true);
    const dati = b.subarray(off + 30 + lln + llx, off + 30 + lln + llx + csize);
    if (!nome.endsWith('/')) out.set(nome, metodo === 0 ? dati.slice() : metodo === 8 ? await inflate(dati) : null);
    p += 46 + ln + lx + lc;
  }
  return out;
}

/** Crea uno ZIP da un elenco [nome, contenuto (stringa o Uint8Array)]. */
export async function zip(files) {
  const enc = new TextEncoder(); const parti = []; const centrale = []; let off = 0;
  const comprimi = typeof CompressionStream !== 'undefined';
  for (const [nome, cont] of files) {
    const raw = typeof cont === 'string' ? enc.encode(cont) : cont;
    const nb = enc.encode(nome); const crc = crc32(raw);
    let dati = raw, metodo = 0;
    if (comprimi && raw.length > 64) { try { const z = await deflate(raw); if (z.length < raw.length) { dati = z; metodo = 8; } } catch (e) { } }
    const h = new Uint8Array(30 + nb.length); const v = new DataView(h.buffer);
    v.setUint32(0, 0x04034b50, true); v.setUint16(4, 20, true); v.setUint16(6, 0x0800, true); v.setUint16(8, metodo, true); v.setUint16(10, 0, true); v.setUint16(12, 0x21, true);
    v.setUint32(14, crc, true); v.setUint32(18, dati.length, true); v.setUint32(22, raw.length, true); v.setUint16(26, nb.length, true); h.set(nb, 30);
    const c = new Uint8Array(46 + nb.length); const w = new DataView(c.buffer);
    w.setUint32(0, 0x02014b50, true); w.setUint16(4, 20, true); w.setUint16(6, 20, true); w.setUint16(8, 0x0800, true); w.setUint16(10, metodo, true); w.setUint16(14, 0x21, true);
    w.setUint32(16, crc, true); w.setUint32(20, dati.length, true); w.setUint32(24, raw.length, true); w.setUint16(28, nb.length, true); w.setUint32(42, off, true); c.set(nb, 46);
    parti.push(h, dati); centrale.push(c); off += h.length + dati.length;
  }
  const cs = centrale.reduce((t, c) => t + c.length, 0);
  const end = new Uint8Array(22); const v = new DataView(end.buffer);
  v.setUint32(0, 0x06054b50, true); v.setUint16(8, files.length, true); v.setUint16(10, files.length, true); v.setUint32(12, cs, true); v.setUint32(16, off, true);
  return new Blob([...parti, ...centrale, end], { type: 'application/zip' });
}

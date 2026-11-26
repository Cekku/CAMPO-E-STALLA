// Conti della copia di sicurezza sul PC (1.80.0): senza import, così li usano sia l'app (copia-pc.js)
// sia la prova di ripristino in Node (strumenti/copie/prova-ripristino.mjs) e le prove (prove/copia-pc.test.mjs).

const ID_ALLEGATO = /^(conti\/)?[A-Za-z0-9_-]{1,100}$/;

/** Allegati nominati dalle registrazioni: { id: tipo }. Campo "allegati" [{id, tipo}] di ogni raccolta e originali
 *  dei Conti con la copia nell'app (econfig "do-<impronta>", copia: true → "conti/<impronta>").
 *  Uguale ad allegati_di di strumenti/archivio/copie.py. */
export function allegatiDi(dati) {
  const visti = {};
  for (const [col, righe] of Object.entries(dati || {})) {
    if (!Array.isArray(righe)) continue;
    for (const r of righe) {
      if (!r || typeof r !== 'object') continue;
      if (Array.isArray(r.allegati)) for (const a of r.allegati) if (a && typeof a.id === 'string' && ID_ALLEGATO.test(a.id) && !(a.id in visti)) visti[a.id] = a.tipo || '';
      if (col === 'econfig' && String(r.id || '').startsWith('do-') && r.copia === true && typeof r.impronta === 'string') {
        const id = 'conti/' + r.impronta; if (ID_ALLEGATO.test(id) && !(id in visti)) visti[id] = r.mime || '';
      }
    }
  }
  return visti;
}

/** Quante registrazioni deve rimettere "Carica copia" (app.js, restore): tutte quelle con l'id, tranne gli errori dell'app. */
export function attesi(dati, cols) {
  const o = {};
  for (const c of cols) if (c !== 'errori') o[c] = (Array.isArray(dati && dati[c]) ? dati[c] : []).filter(x => x && x.id).length;
  return o;
}

/** Confronto fra le registrazioni attese e quelle trovate dopo il ripristino, raccolta per raccolta. */
export function confronta(att, trov) {
  const righe = Object.keys(att).map(col => ({ col, attesi: att[col], trovati: (trov && trov[col]) || 0 })).map(r => Object.assign(r, { ok: r.attesi === r.trovati }));
  const somma = k => righe.reduce((s, r) => s + r[k], 0);
  return { ok: righe.every(r => r.ok), righe, diverse: righe.filter(r => !r.ok).map(r => r.col), attese: somma('attesi'), trovate: somma('trovati') };
}

/** È ora di rifarla? ultima = "AAAA-MM-GG" o null; ogni = giorni. */
export function dovuta(ultima, oggi, ogni) {
  if (!ultima) return true;
  const g = Math.round((Date.parse(oggi + 'T12:00:00Z') - Date.parse(String(ultima).slice(0, 10) + 'T12:00:00Z')) / 864e5);
  return !(g < ogni);
}

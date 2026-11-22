// Particelle catastali del campo, dati PAC e impianto di irrigazione, dati della coltura (voci prese da xFarm, 21/11/2026).
// `campo.particelle` = [{ comune, foglio, particella, sub, areaCat, areaUsata, proprietario, gestione, qualita, pac }].
// Il vecchio testo `campo.catasto` ("Fg. 12 mapp. 45, 46; Fg. 13 mapp. 7") resta: si legge per proporre le righe
// e, quando le righe ci sono, si riscrive come riassunto (lo usano ricerca, registro, import e mappa).
import { N } from './util.js';

export const GESTIONI = ['Proprietà', 'Preso in affitto', 'Comproprietà', 'Concessione', 'Condivisione del profitto', 'Preso da permuta', 'Dato in affitto', 'Dato in permuta', "Comodato d'uso"];
export const QUALITA_CAT = ['Seminativo', 'Seminativo irriguo', 'Seminativo arborato', 'Seminativo irriguo arborato', 'Prato', 'Prato irriguo', 'Prato arborato', 'Prato irriguo arborato', 'Pascolo', 'Pascolo arborato', 'Pascolo cespugliato', 'Bosco ceduo', "Bosco d'alto fusto", 'Bosco misto', 'Vigneto', 'Frutteto', 'Uliveto', 'Agrumeto', 'Orto', 'Orto irriguo', 'Orto arborato', 'Incolto produttivo', 'Incolto sterile', 'Canneto', 'Pioppeto', 'Castagneto da frutto', 'Gelseto', 'Noceto', 'Vivaio', 'Fabbricato rurale', 'Area rurale'];
export const ECOSCHEMI = [['1', 'Eco 1 · benessere animale e meno antibiotici'], ['2', 'Eco 2 · inerbimento delle colture arboree'], ['3', 'Eco 3 · olivi di valore paesaggistico'], ['4', 'Eco 4 · sistemi foraggeri estensivi'], ['5', 'Eco 5 · piante per gli impollinatori']];
export const COPERTURE = ['Nessuna', 'Serra', 'Serra stagionale', 'Serra tunnel', 'Tunnel', 'Tettoia', 'Rete antigrandine', 'Agrotessile', 'Campane o cappucci'];
export const IRRIGAZIONI = ['Pivot', 'Rotolo', 'A goccia', 'Subirrigazione', 'Scorrimento', 'Aspersione (sprinkler)', 'A solchi', 'Micro-aspersione', 'Ala avanzante (rainger)', 'Spruzzatori sottochioma'];
export const FONTI = ['Pozzo', 'Invaso', 'Fiume, roggia o canale', 'Consorzio di bonifica'];
export const ENERGIE = ['Elettricità', 'Gasolio con biocarburante', 'Gasolio', 'Per caduta (gravità)'];
export const UNITA_PORTATA = ['l/s', 'm³/h', 'l/min', 'l/h', 'mm'];
export const LOTTE = ['Integrata volontaria', 'Integrata obbligatoria', 'Biologico'];
export const PERIODI = ['Non specificato', 'Primavera', 'Inverno'];
export const UNITA_RESA = ['t/ha', 'q/ha', 'kg/ha'];
// voci del fascicolo aziendale / domanda PAC (suggerimenti, si può scrivere altro)
export const DESTINAZIONI = ['Alimentazione della stalla', 'Vendita', 'Biogas', 'Seme', 'Sovescio'];
export const USI = ['Granella', 'Trinciato', 'Insilato', 'Pastone', 'Fieno', 'Da foraggio', 'Erba fresca', 'Paglia', 'Seme'];
export const QUALITA_COLT = ['Convenzionale', 'Biologico', 'In conversione al biologico', 'Da seme certificato', 'DOP / IGP'];

const s = v => String(v ?? '').trim();

// "Fg. 12 mapp. 45, 46; Fg. 13 mapp. 7/2" -> righe. Testo che non si capisce -> [] (il testo resta com'è)
export function particelleDa(testo, comune) {
  const out = [];
  for (const pezzo of s(testo).split(/;|\n/)) {
    const fg = pezzo.match(/f(?:o?glio|g)\.?\s*([0-9A-Za-z]+)/i); if (!fg) continue;
    const dopo = pezzo.slice(fg.index + fg[0].length);
    const mp = dopo.match(/(?:\bmapp?(?:al[ei])?|\bpart(?:icell[ae])?|\bn(?=\.))\.?\s*(.+)$/i);
    const nums = mp ? mp[1].replace(/\s*\bsub\.?\s*/gi, '/').split(/[,;\s]+/).filter(x => /^\d/.test(x)) : [];
    if (!nums.length) { out.push(riga(comune, fg[1], '', '')); continue; }
    nums.forEach(n => { const [p, sub] = n.split('/'); out.push(riga(comune, fg[1], p, sub || '')); });
  }
  return out;
}
const riga = (comune, foglio, particella, sub) => ({ comune: s(comune), foglio: s(foglio), particella: s(particella), sub: s(sub), areaCat: null, areaUsata: null, proprietario: '', gestione: '', qualita: '', pac: '' });

// righe -> testo riassunto "Fg. 12 mapp. 45, 46; Fg. 13 mapp. 7/2" (stesso foglio insieme, nell'ordine delle righe)
// con particelle di più comuni il nome del comune va davanti al foglio, così lo stesso foglio di due comuni non si mescola
export function catastoDa(righe) {
  const fogli = new Map(); const rr = (righe || []).filter(Boolean);
  const piuComuni = new Set(rr.map(r => s(r.comune).toLowerCase()).filter(Boolean)).size > 1;
  rr.forEach(r => { const f = s(r.foglio); const p = s(r.particella) + (s(r.sub) ? '/' + s(r.sub) : ''); if (!f && !p) return; const k = (piuComuni ? s(r.comune) : '') + '|' + (f || '?'); if (!fogli.has(k)) fogli.set(k, []); if (p && !fogli.get(k).includes(p)) fogli.get(k).push(p); });
  return [...fogli.entries()].map(([k, ps]) => { const [com, f] = k.split('|'); return (com ? com + ' ' : '') + (f === '?' ? '' : 'Fg. ' + f) + (ps.length ? (f === '?' ? '' : ' ') + 'mapp. ' + ps.join(', ') : ''); }).join('; ');
}
// il testo dice le stesse cose delle righe? (spazi, punti e maiuscole non contano)
const piatto = t => s(t).toLowerCase().replace(/foglio/g, 'fg').replace(/mappali|mappale|particelle|particella|part/g, 'mapp').replace(/[^0-9a-z]/g, '');
export const testoUguale = (testo, righe) => piatto(testo) === piatto(catastoDa(righe));

// righe salvate, oppure lette dal testo vecchio (solo per mostrarle: non si salva niente)
export const particelleDi = c => Array.isArray(c && c.particelle) && c.particelle.length ? c.particelle : particelleDa(c && c.catasto, c && c.comune);

// riassunto per la scheda del campo
export function sommaParticelle(righe) {
  const r = righe || [];
  const usata = r.reduce((t, x) => t + (N(x.areaUsata) || 0), 0), cat = r.reduce((t, x) => t + (N(x.areaCat) || 0), 0);
  return { n: r.length, usata, cat, pac: r.filter(x => x.pac === 'Sì').length };
}

// particelle aggiunte dal catasto (map.js) a un campo che ha già le righe: { particelle, catasto } oppure null
// (senza righe il campo tiene solo il testo, come prima). nuove = [{ comune, foglio, particella, areaUsata }]
export function conParticelle(c, nuove) {
  if (!Array.isArray(c.particelle) || !c.particelle.length) return null;
  const righe = c.particelle.slice();
  (nuove || []).forEach(x => { if (righe.some(r => s(r.foglio) === s(x.foglio) && s(r.particella) === s(x.particella))) return; righe.push(Object.assign(riga(x.comune || c.comune, x.foglio, x.particella, ''), N(x.areaUsata) ? { areaUsata: x.areaUsata } : {})); });
  return { particelle: righe, catasto: catastoDa(righe) };
}

export const ecoTesto = a => (Array.isArray(a) ? a : []).map(x => 'Eco ' + x).join(', ');
export const portataTesto = c => N(c.portata) ? String(c.portata).replace('.', ',') + ' ' + (c.portataUnita || 'l/s') : '';
export const irrigTesto = c => c.irriguo === 'Sì' ? [c.irrigazione, c.fonteAcqua, c.energia, portataTesto(c)].filter(Boolean).join(' · ') || 'Sì' : (c.irriguo || '');

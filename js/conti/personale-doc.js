// Lettori dei documenti del personale e delle scadenze (1.66.0): solo funzioni pure sul testo già estratto
// dall'archivio del PC (GET /testo del ponte, anche OCR). Leggono soltanto quello che è scritto accanto alla sua
// etichetta: un campo che non si trova resta vuoto, non si indovina. Provati con documenti finti costruiti sui formati veri:
//  - avviso del consulente del lavoro ("versamento trattenute e contributi dei dipendenti", data e importo dell'addebito);
//  - modello F24 telematico (importi in centesimi senza virgola, totali di sezione "debito credito+ saldo", saldo finale
//    accanto alla firma, data a cifre separate) e delega F24 dell'home banking (importi "1.109 00");
//  - comunicazione obbligatoria UNILAV, contratto di lavoro o sua modifica, permesso di soggiorno (mod. 209, ricevuta
//    postale del rinnovo), polizza (decorrenza e scadenza, periodo pagato);
//  - descrizione della banca per la rata di un mutuo ("PAGAMENTO RATA MUTUO Mutuo n. … Rata n.… Quota capitale …").

const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const r2 = v => Math.round(v * 100) / 100;
const pad = n => String(n).padStart(2, '0');
/** "16/11/2026", "16.11.26", "16-11-2026" → "2026-11-16" (null se non è una data vera). */
export function dataIt(s) {
  const m = String(s || '').match(/(\d{1,2})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{2,4})/); if (!m) return null;
  let [, g, me, a] = m.map(Number); if (a < 100) a += 2000;
  return dataOk(a, me, g);
}
function dataOk(a, me, g) {
  if (!(a >= 1990 && a <= 2100 && me >= 1 && me <= 12 && g >= 1 && g <= 31)) return null;
  const d = new Date(Date.UTC(a, me - 1, g)); if (d.getUTCMonth() !== me - 1) return null;
  return `${a}-${pad(me)}-${pad(g)}`;
}
/** "16 novembre 2026" → "2026-11-16". */
function dataLettere(s) {
  const m = String(s || '').toLowerCase().match(/(\d{1,2})\s+(gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre)\s+(\d{4})/);
  return m ? dataOk(+m[3], MESI.indexOf(m[2]) + 1, +m[1]) : null;
}
/** "2.308,35" → 2308.35 */
export const euro = s => { const v = parseFloat(String(s || '').replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.')); return isFinite(v) ? r2(v) : null; };
const righe = t => String(t || '').split(/\r?\n/).map(x => x.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean);
const piatto = t => String(t || '').replace(/[ \t \r\n]+/g, ' ');
const D = '(\\d{1,2}[/.]\\d{1,2}[/.]\\d{4})';

/* ---------------- codici fiscali ---------------- */
// cifre o lettere dell'omocodia (L M N P Q R S T U V al posto di 0-9)
const RE_CF = /^[A-Z]{6}[0-9L-V]{2}[A-EHLMPRST][0-9L-V]{2}[A-Z][0-9L-V]{3}[A-Z]$/;
// l'OCR scambia a volte O/0 e I/1 nelle posizioni delle cifre: si correggono solo lì (L è una lettera dell'omocodia)
const POS_CIFRE = [6, 7, 9, 10, 12, 13, 14];
function sistemaCf(s) { const a = s.split(''); for (const i of POS_CIFRE) a[i] = a[i] === 'O' ? '0' : a[i] === 'I' ? '1' : a[i]; return a.join(''); }
/** Codici fiscali di persona trovati nel testo (anche con le lettere separate da spazi, come nei moduli F24). */
export function codiciFiscali(t) {
  const out = []; const visti = new Set();
  const metti = c => { c = sistemaCf(c.toUpperCase()); if (RE_CF.test(c) && !visti.has(c)) { visti.add(c); out.push(c); } };
  for (const m of String(t || '').toUpperCase().matchAll(/\b[A-Z]{6}[0-9OIL-V]{2}[A-Z][0-9OIL-V]{2}[A-Z][0-9OIL-V]{3}[A-Z]\b/g)) metti(m[0]);
  for (const l of righe(t)) { const s = l.replace(/ /g, ''); if (/^([A-Z0-9] ){15}[A-Z0-9]$/i.test(l) && s.length === 16) metti(s); }
  return out;
}
const cfAzienda = l => { const s = l.replace(/ /g, ''); return /^(\d ){10}\d$/.test(l) && s.length === 11 ? s : null; };

/* ---------------- avviso di addebito del consulente del lavoro ---------------- */
/** { genere: 'avviso', data, totale, persona, destinatario, scritto } oppure null se non è un avviso. */
export function leggiAvviso(t) {
  const P = piatto(t);
  if (!/versamento\s+(delle\s+)?trattenute\s+e\s+contributi|addebito\s+telematico/i.test(P)) return null;
  const iOgg = P.search(/oggetto\s*:/i);
  const dest = (iOgg > 0 ? P.slice(0, iOgg) : '').trim().slice(-160);
  const pers = /\b(egregi[oa]|gentil[ei]ssim[oa]|gentile|sig\.?(ra)?|signor[ae]?)\b/i.test(dest) && !/\bs\.\s?s\.?(?=\s|$)|\bs\.?r\.?l\b|\bs\.?n\.?c\b|soc(iet[aà]|\.)|az(ienda)?\.?\s*agr|\bditta\b/i.test(dest);
  const dopo = iOgg >= 0 ? P.slice(iOgg) : P;
  const mD = dopo.match(/in\s+data\s*:?\s*(\d{1,2}\s+[a-z]+\s+\d{4}|\d{1,2}[/.]\d{1,2}[/.]\d{2,4})/i);
  const data = mD ? dataLettere(mD[1]) || dataIt(mD[1]) : null;
  const mI = dopo.match(/importo\s+(?:di|pari\s+a)\s*:?\s*(?:€|euro|eur)?\s*([\d.]+,\d{2})/i);
  const mS = P.match(/\bl[iì]\s*,?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  return { genere: 'avviso', data, totale: mI ? euro(mI[1]) : null, persona: pers, destinatario: dest.replace(/^.*?\b(spett\.?le|egregi[oa]|gentil\w*)\b/i, '$1').trim(), scritto: mS ? dataIt(mS[1]) : null };
}

/* ---------------- modello F24 ---------------- */
// codici tributo delle paghe (ritenute, addizionali, conguagli 730, crediti in compensazione del sostituto d'imposta)
export const CODICI_PAGHE = new Set(['1001', '1002', '1004', '1012', '1013', '1018', '1019', '1627', '1628', '1631', '1655', '1701', '1704', '1712', '1713', '1989', '1990', '1993', '1994', '1998', '3796', '3801', '3802', '3803', '3816', '3817', '3843', '3844', '3846', '3847', '3848', '8901', '8902', '8926']);
export const NOMI_CODICI = { 1001: 'ritenute sugli stipendi', 1004: 'ritenute sulle altre retribuzioni', 1012: 'ritenute sul TFR', 1040: 'ritenute sui compensi dei lavoratori autonomi', 1038: 'ritenute sugli interessi', 1655: 'recupero dei rimborsi 730 (a credito)', 1631: 'credito per i rimborsi 730', 1701: 'credito del bonus cuneo fiscale', 1712: 'acconto imposta sostitutiva sul TFR', 1713: 'saldo imposta sostitutiva sul TFR', 3802: 'addizionale regionale', 3847: 'acconto addizionale comunale', 3848: 'saldo addizionale comunale', 6001: 'IVA di gennaio', 6099: 'IVA annuale', 3918: 'IMU', 4001: 'IRPEF a saldo', 4033: 'primo acconto IRPEF', 4034: 'secondo acconto IRPEF' };
const SEZIONI = { erario: 'Erario', inps: 'INPS', regioni: 'Regioni', locali: 'IMU e tributi locali', altri: 'Altri enti (INAIL)' };
export const nomeSezione = k => SEZIONI[k] || k;
// una riga di ogni sezione, nel modello telematico (importo in centesimi alla fine)
const R_TEL = [
  ['erario', /^([0-9]{4}|[A-Z0-9]{4})\s+(\d{4})\s+(\d{4})\s+(\d+)$/, m => ({ codice: m[1], rif: m[2], anno: m[3], importo: +m[4] / 100 })],
  ['inps', /^(\d{4})\s+([A-Z]{2,5})\s+(\S+)\s+(\d{6})(?:\s+(\d{6}))?\s+(\d+)$/, m => ({ sede: m[1], causale: m[2], matricola: m[3], da: m[4], a: m[5] || '', importo: +m[6] / 100 })],
  ['regioni', /^(\d)\s?(\d)\s+(\d{4})\s+(\d{4})\s+(\d{4})\s+(\d+)$/, m => ({ regione: m[1] + m[2], codice: m[3], rif: m[4], anno: m[5], importo: +m[6] / 100 })],
  ['locali', /^([A-Z])\s?(\d)\s?(\d)\s?(\d)\s+(\w{4})\s+(\d{4})\s+(\d{4})\s+(\d+)$/, m => ({ comune: m[1] + m[2] + m[3] + m[4], codice: m[5], rif: m[6], anno: m[7], importo: +m[8] / 100 })],
];
// nella delega dell'home banking gli importi sono "euro centesimi" a debito e a credito
const IMP = '([\\d.]+)\\s(\\d{2})';
const R_BANCA = [
  ['erario', new RegExp(`^(\\w{4})\\s+(\\d{4})\\s+(\\d{4})\\s+${IMP}\\s+${IMP}$`), m => ({ codice: m[1], rif: m[2], anno: m[3], debito: imp2(m[4], m[5]), credito: imp2(m[6], m[7]) })],
  ['regioni', new RegExp(`^(\\d)\\s(\\d)\\s+(\\d{4})\\s+(\\d{4})\\s+(\\d{4})\\s+${IMP}\\s+${IMP}$`), m => ({ regione: m[1] + m[2], codice: m[3], rif: m[4], anno: m[5], debito: imp2(m[6], m[7]), credito: imp2(m[8], m[9]) })],
  ['locali', new RegExp(`^([A-Z])\\s?(\\d)\\s?(\\d)\\s?(\\d)\\s+(\\w{4})\\s+(\\d{4})\\s+(\\d{4})\\s+${IMP}\\s+${IMP}$`), m => ({ comune: m[1] + m[2] + m[3] + m[4], codice: m[5], rif: m[6], anno: m[7], debito: imp2(m[8], m[9]), credito: imp2(m[10], m[11]) })],
  ['inps', new RegExp(`^(\\d{4})\\s+([A-Z]{2,5})\\s+(\\S+)\\s+(\\d{6})(?:\\s+(\\d{6}))?\\s+${IMP}\\s+${IMP}$`), m => ({ sede: m[1], causale: m[2], matricola: m[3], da: m[4], a: m[5] || '', debito: imp2(m[6], m[7]), credito: imp2(m[8], m[9]) })],
];
function imp2(e, c) { return r2(+String(e).replace(/\./g, '') + +c / 100); }
const data8 = l => { const m = l.match(/^(\d) (\d) (\d) (\d) (\d) (\d) (\d) (\d)(?:\s+\d{5}\s+\d{5})?$/); return m ? dataOk(+(m[5] + m[6] + m[7] + m[8]), +(m[3] + m[4]), +(m[1] + m[2])) : null; };

/** Modello F24. { genere: 'f24', formato, data, cf, azienda, sezioni: [{ sez, righe, debito, credito, saldo }], saldo,
 *  controllo (la somma delle sezioni torna con il saldo finale), stato ('richiesto' per una delega non ancora pagata) } */
export function leggiF24(t) {
  const L = righe(t); const P = piatto(t);
  if (!/Mod\.?\s*F24|MODELLO DI PAGAMENTO|DELEGA IRREVOCABILE/i.test(P)) return null;
  const banca = /Stato delega|Delega stampata da/i.test(P);
  const out = { genere: 'f24', formato: banca ? 'banca' : 'telematico', data: null, cf: '', azienda: false, sezioni: [], saldo: null, controllo: false, stato: null };
  // contribuente: la prima riga fatta solo di un codice fiscale (11 cifre = società, 16 caratteri = persona)
  for (const l of L) { const az = cfAzienda(l); if (az) { out.cf = az; out.azienda = true; break; } const p = codiciFiscali(l)[0]; if (p && l.replace(/ /g, '').length === 16) { out.cf = p; break; } }
  if (banca) {
    const st = P.match(/Stato delega\s*:\s*([A-Za-zàè]+)/i); out.stato = st ? st[1].toLowerCase() : null;
    const per = new Map();
    for (const l of L) for (const [sez, re, fa] of R_BANCA) { const m = l.match(re); if (m) { const r = fa(m); const s = per.get(sez) || { sez, righe: [], debito: 0, credito: 0 }; s.righe.push(r); s.debito = r2(s.debito + r.debito); s.credito = r2(s.credito + r.credito); per.set(sez, s); break; } }
    out.sezioni = [...per.values()].map(s => Object.assign(s, { saldo: r2(s.debito - s.credito) }));
    const iSt = L.findIndex(l => /Stato delega/i.test(l));
    const saldoL = L.slice(Math.max(0, iSt)).find(l => /^[\d.]+ \d{2}$/.test(l));
    out.saldo = saldoL ? imp2(...saldoL.split(' ')) : null;
    const date = L.map(data8).filter(Boolean); out.data = date[date.length - 1] || null;
  } else {
    let buf = [], kind = null, misto = false;
    for (const l of L) {
      const d = data8(l); if (d && out.sezioni.length) { out.data = d; break; } // la prima copia del modello basta
      let preso = false;
      for (const [sez, re, fa] of R_TEL) { const m = l.match(re); if (m) { if (kind && kind !== sez) misto = true; kind = kind || sez; buf.push(fa(m)); preso = true; break; } }
      if (preso) continue;
      const tm = l.match(/^(\d+)\s+(?:(\d+)\s*)?\+\s*(-?\d+)$/);
      if (tm && buf.length) {
        const s = { sez: misto ? 'misto' : kind, righe: buf, debito: +tm[1] / 100, credito: (+tm[2] || 0) / 100, saldo: +tm[3] / 100 };
        // le righe del modello non dicono se un importo è a debito o a credito: tornano i totali?
        s.torna = Math.abs(r2(buf.reduce((a, r) => a + r.importo, 0)) - r2(s.debito + s.credito)) < 0.005 && Math.abs(r2(s.debito - s.credito) - s.saldo) < 0.005;
        out.sezioni.push(s); buf = []; kind = null; misto = false;
      }
    }
    // saldo finale: il numero (in centesimi) accanto alla firma, uguale alla somma dei saldi delle sezioni
    const somma = Math.round(out.sezioni.reduce((a, s) => a + s.saldo, 0) * 100);
    const fine = L.findIndex(l => data8(l) === out.data);
    for (const l of L.slice(0, fine < 0 ? L.length : fine).reverse()) { const m = l.match(/(?:^|\s)(\d{3,})$/); if (m && +m[1] === somma && !/[+]/.test(l)) { out.saldo = somma / 100; break; } }
  }
  const tot = r2(out.sezioni.reduce((a, s) => a + s.saldo, 0));
  out.controllo = out.saldo != null && out.sezioni.length > 0 && Math.abs(tot - out.saldo) < 0.005 && out.sezioni.every(s => s.sez !== 'misto' && s.torna !== false);
  return out;
}
/** Parti di un F24: ritenute (erario, regioni, tributi locali), contributi INPS, altro; e i codici che non sono delle paghe. */
export function partiF24(f) {
  const s = k => r2(f.sezioni.filter(x => x.sez === k).reduce((a, x) => a + x.saldo, 0));
  const codici = f.sezioni.filter(x => ['erario', 'regioni', 'locali'].includes(x.sez)).flatMap(x => x.righe.map(r => r.codice));
  const estranei = [...new Set(codici.filter(c => !CODICI_PAGHE.has(c)))];
  const ritenute = r2(s('erario') + s('regioni') + s('locali'));
  // con codici che non sono delle paghe (IVA, IMU, ritenute sugli autonomi…): la parte delle paghe, contando quelle righe a debito
  const fuori = r2(f.sezioni.filter(x => ['erario', 'regioni', 'locali'].includes(x.sez)).flatMap(x => x.righe).filter(r => !CODICI_PAGHE.has(r.codice)).reduce((a, r) => a + (r.importo ?? (r.debito - r.credito)), 0));
  return { ritenute, ritPaghe: r2(ritenute - fuori), inps: s('inps'), altri: r2(s('altri') + s('misto')), estranei };
}

/* ---------------- documenti del dipendente ---------------- */
/** Comunicazione obbligatoria UNILAV: assunzione, proroga, trasformazione, cessazione. */
export function leggiUnilav(t) {
  const P = piatto(t);
  if (!/UNILAV|Comunicazione Obbligatoria/i.test(P)) return null;
  const i = P.search(/Sezione Lavoratore/i); const lav = i >= 0 ? P.slice(i) : P;
  const cf = codiciFiscali(lav)[0] || '';
  const d = re => { const m = lav.match(re); return m ? dataIt(m[1]) : null; };
  const tip = (lav.match(/tipologia contrattuale\s+(?:[A-Z]\.\d{2}\.\d{2}\s+)?([A-Z][A-Z ,'()-]{5,60}?)(?=\s+(?:socio|tipo orario|ore|qualifica|$))/i) || [])[1] || '';
  const qual = (lav.match(/qualifica professionale\s*\(ISTAT\)\s+[\d.]+\s+(.+?)(?=\s+(?:contratto collettivo|livello|retribuzione)\b)/i) || [])[1] || '';
  const liv = (lav.match(/livello di inquadramento\s+([A-Z0-9]{1,8})\b/i) || [])[1] || '';
  let scadP = d(new RegExp('scadenza permesso di soggiorno[ :]*' + D, 'i')); if (scadP === '1900-01-01' || (scadP && scadP < '1990')) scadP = null;
  const ces = d(new RegExp('data cessazione[ :]*' + D, 'i')), pro = d(new RegExp('data fine proroga[ :]*' + D, 'i'));
  const tra = d(new RegExp('data trasformazione[ :]*' + D, 'i'));
  const campi = {};
  const ini = d(new RegExp('data inizio[ :]*' + D, 'i')); if (ini && !ces && !pro) campi.inizio = ini;
  const tipo = /\bINDETERMINATO\b/i.test(tip) ? 'TI' : /\bDETERMINATO\b/i.test(tip) ? 'TD' : null; if (tipo) campi.tipo = tipo;
  const fine = pro || d(new RegExp('data fine[ :]*' + D, 'i'));
  if (fine && tipo !== 'TI' && !ces) campi.scadContratto = fine;
  if (tra) { campi.tipo = 'TI'; delete campi.scadContratto; }
  if (ces) campi.cessazione = ces;
  if (qual) campi.qualificaIstat = qual.trim();
  if (liv) campi.livello = liv.replace(/^0+(?=\d)/, '');
  if (scadP) campi.scadPermesso = scadP;
  const invio = d(new RegExp('data invio[ :]*' + D, 'i'));
  return { genere: 'unilav', cf, campi, evento: ces ? 'cessazione' : pro ? 'proroga' : tra ? 'trasformazione' : 'assunzione', data: invio };
}

/** Contratto di lavoro (o modifica, proroga): solo frasi chiare con la data scritta accanto. */
export function leggiContratto(t) {
  const P = piatto(t);
  if (!/contratt[oi]\s+(?:individuale\s+)?di\s+lavoro|assunzion|lettera\s+di\s+assunzione|proroga/i.test(P)) return null;
  const campi = {}; const dubbi = [];
  const tutte = re => [...P.matchAll(re)].map(m => dataIt(m[1])).filter(Boolean);
  const uno = (k, vals) => { const u = [...new Set(vals)]; if (u.length === 1) campi[k] = u[0]; else if (u.length > 1) dubbi.push(k); };
  const modifica = /modifica\s+(?:del\s+)?contratto|effetto\s+novativo/i.test(P);
  const ces = tutte(new RegExp('cess[ai]\\w*\\s+a\\s+far\\s+data\\s+dal\\s*' + D, 'gi'));
  const proroga = tutte(new RegExp('prorogat[oa]\\s+(?:fino\\s+)?al\\s*' + D, 'gi'));
  const dalAl = [...P.matchAll(new RegExp('dal\\s*' + D + '\\s*al\\s*' + D, 'gi'))].map(m => [dataIt(m[1]), dataIt(m[2])]).filter(x => x[0] && x[1]);
  if (ces.length) uno('cessazione', ces);
  else if (proroga.length) { uno('scadContratto', proroga); campi.tipo = 'TD'; }
  else {
    const scad = tutte(new RegExp('(?:scadenza|termine)\\s+(?:al|il)\\s*' + D, 'gi'));
    uno('scadContratto', [...scad, ...dalAl.map(x => x[1])]);
    if (!modifica) uno('inizio', [...tutte(new RegExp('(?:con\\s+decorrenza|a\\s+decorrere|assunt[oa]\\w*[^.]{0,60}?)\\s+dal\\s*' + D, 'gi')), ...dalAl.map(x => x[0])]);
  }
  const td = /a\s+tempo\s+determinato/i.test(P), ti = /a\s+tempo\s+indeterminato/i.test(P);
  if (!campi.tipo && !modifica && td !== ti) campi.tipo = td ? 'TD' : 'TI';
  const q = P.match(/(?:qualifica|mansion[ei])\s+(?:di\s+)?["“]?([A-Za-zÀ-ú' ]{3,40}?)["”]?\s*(?:[,.;:]|\s+(?:livello|area|con|e\s+livello))/i);
  if (q && !/^(?:del|della|dei|delle|indicat|suddett|attual)/i.test(q[1].trim())) campi.qualifica = q[1].trim();
  return { genere: 'contratto', cf: '', cfs: codiciFiscali(P), campi, dubbi, modifica };
}

/** Permesso di soggiorno, richiesta (mod. 209) o ricevuta postale del rinnovo. */
export function leggiPermesso(t) {
  const P = piatto(t);
  const campi = {};
  // la data deve stare sulla stessa riga dell'etichetta: nel mod. 209 sotto c'è la scadenza del passaporto
  const sullaRiga = re => { for (const l of righe(t)) { const m = l.match(re); if (m) { const v = dataIt(m[1]); if (v && v > '1990') return v; } } return null; };
  const scad = sullaRiga(new RegExp('scadenza\\s+del\\s+permesso[ :]*' + D, 'i')) || sullaRiga(new RegExp('scadenza permesso di soggiorno[ :]*' + D, 'i'))
    || (/PERMESSO\s+DI\s+SOGGIORNO/i.test(P) && !/PASSAPORTO|VISTO|RICEVUTA/i.test(P) ? sullaRiga(new RegExp('(?:valido\\s+fino\\s+al|data\\s+di\\s+scadenza|scadenza|expiry)[ :]*' + D, 'i')) : null);
  if (scad) campi.scadPermesso = scad;
  const ric = sullaRiga(new RegExp('scadenza\\s+ricevuta\\s*22\\s*A\\w*[ :]*' + D, 'i')); if (ric) campi.ricevutaFino = ric;
  const pres = sullaRiga(new RegExp('data\\s+presentazione[ :]*' + D, 'i')); if (pres && /rinnovo/i.test(P)) campi.rinnovoChiesto = pres;
  return { genere: 'permesso', cf: codiciFiscali(P)[0] || '', campi };
}

/* ---------------- polizze ---------------- */
/** { numero, decorrenza, scadenza, pagatoDal, pagatoFino, tacito, premio } con solo i campi letti con certezza. */
export function leggiPolizza(t) {
  const P = piatto(t); const o = {};
  const num = P.match(/(?:N\.?|n°|numero)\s*polizza\s*:?\s*([A-Z0-9][A-Z0-9/.-]{4,})/i) || P.match(/polizza\s*(?:n\.?|n°|nr\.?|numero)\s*:?\s*([A-Z0-9][A-Z0-9/.-]{4,})/i);
  if (num) o.numero = num[1].replace(/[.-]$/, '');
  const dec = P.match(new RegExp('Decorrenza\\s+Scadenza[\\s\\S]{0,160}?' + D + '\\s+' + D + '(?:\\s+(SI|NO)\\b)?', 'i'));
  const scads = [];
  if (dec) { o.decorrenza = dataIt(dec[1]); scads.push(dataIt(dec[2])); if (dec[3]) o.tacito = dec[3].toUpperCase() === 'SI'; }
  for (const m of P.matchAll(new RegExp('scadenza\\s*(?:della\\s+polizza|del\\s+contratto|polizza)?\\s*:\\s*' + D, 'gi'))) scads.push(dataIt(m[1]));
  for (const m of P.matchAll(new RegExp('(?:con\\s+effetto|decorrenza|validit[aà])\\s+dal\\s*' + D + '\\s*al\\s*' + D, 'gi'))) { o.decorrenza = o.decorrenza || dataIt(m[1]); scads.push(dataIt(m[2])); }
  const u = [...new Set(scads.filter(Boolean))]; if (u.length === 1) o.scadenza = u[0]; else if (u.length > 1) o.scadenze = u;
  const per = P.match(/DALLE\s*ORE[^A-Z]{0,12}DEL\s*(\d{1,2}[./]\d{1,2}[./]\d{4})\s*ALLE\s*ORE[^A-Z]{0,14}DEL\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/i);
  if (per) { o.pagatoDal = dataIt(per[1]); o.pagatoFino = dataIt(per[2]); }
  const sino = P.match(new RegExp('premio\\s+pagato[^0-9]{0,20}?sino\\s+al\\s*' + D, 'i')); if (sino && !o.pagatoFino) o.pagatoFino = dataIt(sino[1]);
  if (o.tacito === undefined) { const tr = P.match(/tacito\s+rinnovo\s*:?\s*(SI|NO)\b/i); if (tr) o.tacito = tr[1].toUpperCase() === 'SI'; }
  const pr = P.match(/\bLordo\s+([\d.]+,\d{2})\b/); if (pr) o.premio = euro(pr[1]);
  return o;
}
/** Righe di una fattura che parlano di una polizza con il periodo coperto: { numero?, dal, al }. */
export function polizzaDaRiga(descr) {
  const s = String(descr || ''); if (!/polizz|premio\s+assicurativ|assicurazion/i.test(s)) return null;
  const m = s.match(new RegExp('dal\\s*' + D + '\\s*al\\s*' + D, 'i')); if (!m) return null;
  const n = s.match(/polizza\s*(?:n\.?|n°|nr\.?)?\s*([A-Z0-9][A-Z0-9/.-]{4,})/i);
  return { numero: n && /\d/.test(n[1]) ? n[1] : '', dal: dataIt(m[1]), al: dataIt(m[2]) };
}

/* ---------------- rate di mutui e finanziamenti dalla descrizione della banca ---------------- */
/** { numero, rata, scadenza, residuo, capitale, interessi } (i campi che ci sono) oppure null se non è una rata. */
export function rataMutuo(descr) {
  const s = piatto(descr).toUpperCase();
  if (/PRELIEV\w*\.?\s+SOCI|PREL\.\s*SOCI/.test(s)) return null;
  if (!/RATA|MUTUO|FINANZIAM|PRESTITO|AMMORTAMENTO/.test(s)) return null;
  const o = {};
  const n = s.match(/(?:MUTUO|FINANZIAMENTO|FINANZ\.|PRESTITO|PRATICA|CONTRATTO)\s*(?:N\.?|NR\.?|NUM\.?|NUMERO|N°)\s*([A-Z0-9/-]{4,})/); if (n) o.numero = n[1];
  const r = s.match(/RATA\s*(?:N\.?|NR\.?|N°)\s*0*(\d{1,4})/); if (r) o.rata = +r[1];
  const sc = s.match(/SCADENZA\s*:?\s*(\d{1,2}[./]\d{1,2}[./]\d{4})/); if (sc) o.scadenza = dataIt(sc[1]);
  const res = s.match(/SCADENZA\s*:?\s*\d{1,2}[./]\d{1,2}[./]\d{4}\s*E\s*([\d.]+,\d{2})\s*QUOTA/); if (res) o.residuo = euro(res[1]);
  const cap = s.match(/QUOTA\s+CAPITALE\s*E?\s*([\d.]+,\d{2})/); if (cap) o.capitale = euro(cap[1]);
  const int = s.match(/QUOTA\s+INTERESSI[^0-9]{0,12}([\d.]+,\d{2})/); if (int) o.interessi = euro(int[1]);
  if (!o.numero && !/\bRATA\b.*\b(MUTUO|FINANZ|PRESTITO)|\b(MUTUO|FINANZ\w*|PRESTITO)\b.*\bRATA\b|AMMORTAMENTO/.test(s)) return null;
  return o;
}

/* ---------------- date ---------------- */
/** Giorno del versamento: se il 16 cade di sabato o domenica si paga il lunedì dopo. */
export function giornoUtile(iso) {
  // proroga di agosto: i versamenti in scadenza dal 1° al 20 agosto si fanno entro il 20
  if (/-08-(0[1-9]|1\d|20)$/.test(iso)) iso = iso.slice(0, 8) + '20';
  const d = new Date(iso + 'T00:00:00Z'); const g = d.getUTCDay();
  if (g === 6) d.setUTCDate(d.getUTCDate() + 2); else if (g === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
/** Aggiunge dei mesi a una data; con fineMese va all'ultimo giorno del mese, altrimenti al giorno indicato (o all'ultimo se manca). */
export function piuMesi(iso, mesi, giorno = null, fineMese = false) {
  const [y, m] = iso.split('-').map(Number); const t = (m - 1) + mesi; const yy = y + Math.floor(t / 12), mm = ((t % 12) + 12) % 12 + 1;
  const ult = new Date(Date.UTC(yy, mm, 0)).getUTCDate(); const g = fineMese ? ult : Math.min(giorno || +iso.slice(8), ult);
  return `${yy}-${pad(mm)}-${pad(g)}`;
}
export const mesiFra = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };

// Archivio documenti: collegamento al ponte sul PC (strumenti/archivio/ponte-archivio.py, porta 1236) e dati di prova.
// Le risposte seguono il contratto scritto in CLAUDE.md ("Archivio documenti" → "Archivio nell'app"). I dati di prova
// sono inventati: servono a vedere la sezione senza il ponte acceso, mai nomi o documenti veri.
import { bus } from '../state.js';
import { lsGet, lsSet } from '../util.js';

export const PONTE_PREDEFINITO = 'http://127.0.0.1:1236';
export const conf = () => Object.assign({ url: PONTE_PREDEFINITO, prova: false }, lsGet('ces.archivio', {}) || {});
/** stato del collegamento: ignoto (mai chiesto), ok, spento (il ponte non risponde), prova (dati inventati) */
export const stato = { v: 'ignoto', err: '' };
const cache = new Map();
export function svuota() { cache.clear(); stato.v = 'ignoto'; stato.err = ''; }
export function salvaConf(c) { lsSet('ces.archivio', Object.assign(conf(), c)); svuota(); }

/** Parametri dell'indirizzo, senza quelli vuoti. */
export function qs(o) {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? '?' + p.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&') : '';
}

async function chiama(percorso, { metodo = 'GET', corpo, tempo = 8000 } = {}) {
  const c = conf();
  if (c.prova) { await new Promise(r => setTimeout(r, 90)); return prova(percorso, metodo, corpo); }
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), tempo);
  let r;
  try {
    r = await fetch(String(c.url || PONTE_PREDEFINITO).replace(/\/+$/, '') + percorso, { method: metodo, signal: ctl.signal, cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : undefined, body: corpo ? JSON.stringify(corpo) : undefined });
  } catch (e) {
    throw Object.assign(new Error(e.name === 'AbortError' ? 'Il ponte non risponde' : 'Ponte non raggiungibile'), { spento: true });
  } finally { clearTimeout(t); }
  let j = null; try { j = await r.json(); } catch (e) { }
  if (!r.ok) throw Object.assign(new Error((j && j.errore) || 'Errore ' + r.status), { codice: r.status });
  return j;
}

/** Lettura per la vista: risponde subito con quello che c'è (carico/dati/err) e ridisegna quando arriva la risposta. */
export function leggi(percorso) {
  let e = cache.get(percorso);
  if (!e) {
    e = { carico: true, dati: null, err: null }; cache.set(percorso, e);
    chiama(percorso).then(d => { e.dati = d; stato.v = conf().prova ? 'prova' : 'ok'; stato.err = ''; },
      err => { e.err = err; if (err.spento) { stato.v = 'spento'; stato.err = err.message; } })
      .finally(() => { e.carico = false; if (bus.render) bus.render(); });
  }
  return e;
}
/** Come leggi, ma si aspetta la risposta (per la scheda aperta nel foglio sul telefono). */
export async function aspetta(percorso) { const e = leggi(percorso); while (e.carico) await new Promise(r => setTimeout(r, 40)); if (e.err) throw e.err; return e.dati; }

export const apri = (id, percorso, cartella) => chiama('/apri', { metodo: 'POST', corpo: Object.assign({ id }, percorso ? { percorso } : {}, cartella ? { cartella: true } : {}) });
/** correzioni nel formato del ponte: { "<id>": { a, t, d, c, p, x, n } }; {} = confermato così com'è */
export async function correggi(corr) { const r = await chiama('/correzioni', { metodo: 'POST', corpo: corr }); cache.clear(); return r; }

/* ------------------------------------------------------------ dati di prova (inventati) ------------------------------------------------------------ */
const AREE = [
  ['01', 'Società e soci', ['Visura e atti societari', 'Documenti dei soci', 'Deleghe e mandati', 'DURC, antimafia e dichiarazioni', 'Camera di commercio e PEC']],
  ['02', 'Fisco e contabilità', ['Dichiarazioni dei redditi', 'IVA', 'F24 e F23', 'CU', 'Bilanci e bilancini', 'Cassetto fiscale e avvisi', 'Tributi e imposte locali', 'Parcelle dei professionisti']],
  ['03', 'Fatture', ['Acquisti', 'Vendite', 'DDT e proforma']],
  ['04', 'Banche e finanziamenti', ['Estratti conto', 'Bonifici e contabili', 'Finanziamenti e mutui']],
  ['05', 'Personale', ['Dipendenti', 'Buste paga e bilancini paghe', 'Contributi e F24 del personale', 'Ispettorato, LUL e comunicazioni', 'Sicurezza e visite mediche', 'Stage', 'Alloggi']],
  ['06', 'Contratti, fornitori e utenze', ['Contratti di fornitura e servizi', 'Utenze', 'Preventivi']],
  ['07', 'Assicurazioni e sinistri', ['Polizze', 'Sinistri e danni']],
  ['08', 'Contributi e bandi', ['PAC e fascicolo AGEA', 'PSR', 'ISI INAIL', 'ISMEA', 'Transizione 4.0', 'Gasolio agricolo (UMA)', 'Altri contributi e statistiche']],
  ['09', 'Terreni e fabbricati', ['Compravendite', 'Contratti di affitto', 'Visure e catasto', 'Demanio e concessioni', 'Progetti, permessi e lavori']],
  ['10', 'Energia', ['Fotovoltaico', 'Agrivoltaico', 'Biometano', 'Allacciamenti Enel']],
  ['11', 'Stalla e animali', ['Anagrafe, registro e passaporti', 'Controlli AIA e Si@lleva', 'Veterinario e ASUFC', 'Latte e Parmalat', 'Alimentazione e materie prime', 'Benessere e ClassyFarm', 'Movimentazione animali (UVAC)']],
  ['12', 'Campagna', ['Quaderno di campagna', 'Fitofarmaci e concimi', 'Analisi', 'Mappe e xFarm']],
  ['13', 'Mezzi e attrezzature', ['Trattori', 'Auto e veicoli', 'Revisioni e verifiche periodiche', 'Manutenzioni e rapportini', 'Telepass e multe']],
  ['14', 'Ambiente, sicurezza e controlli', ['AUA e PUA', 'Rifiuti (FIR e RENTRI)', 'Sicurezza sul lavoro', 'Certificazioni', 'Verbali e ispezioni', 'Autorizzazioni varie']],
  ['15', 'Corsi e formazione', []],
  ['16', 'Privato soci', []],
  ['99', 'Varie e da smistare', ['Da verificare', 'Foto non documenti', 'Manuali e programmi']],
];
const CODICI = {};
AREE.forEach(([c, n, ss]) => { CODICI[c] = [c + ' ' + n, null]; ss.forEach((s, i) => { CODICI[c + '.' + (i + 1)] = [c + ' ' + n, s]; }); });
const codiceDi = (a, s) => Object.keys(CODICI).find(k => CODICI[k][0] === a && CODICI[k][1] === (s || null)) || (a ? a.slice(0, 2) : null);

// [codice, tipo, controparte, descrizione, estensione, persona]
const MODELLI = [
  ['03.1', 'Fattura', 'Consorzio Agrario Esempio', 'Mangime vacche in lattazione', '.pdf'],
  ['03.1', 'Fattura', 'Officina Meccanica Esempio', 'Tagliando trattore 1000 ore', '.pdf'],
  ['03.1', 'Fattura', 'Petroli Esempio', 'Gasolio agricolo', '.xml'],
  ['03.1', 'Fattura', 'Sementi Esempio', 'Seme di frumento tenero', '.pdf'],
  ['03.1', 'Fattura', 'Studio Veterinario Esempio', 'Visite e farmaci', '.p7m'],
  ['03.1', 'Fattura', 'Energia Esempio', 'Energia elettrica', '.pdf'],
  ['03.2', 'Fattura', 'Latteria Esempio', 'Latte conferito', '.xml'],
  ['03.2', 'Fattura', 'Commercio Bestiame Esempio', 'Vendita vitelli', '.pdf'],
  ['04.1', 'Estratto conto', 'Banca Esempio', 'Estratto conto trimestrale', '.pdf'],
  ['04.2', 'Contabile di bonifico', 'Banca Esempio', 'Bonifico a fornitore', '.pdf'],
  ['02.3', 'F24', 'Agenzia delle Entrate', 'Versamento imposte', '.pdf'],
  ['02.2', 'Dichiarazione IVA', 'Agenzia delle Entrate', 'Modello IVA', '.pdf'],
  ['02.5', 'Bilancino', 'Studio Commercialista Esempio', 'Bilancino di verifica', '.pdf'],
  ['05.2', 'Cedolino', 'Studio Paghe Esempio', 'Buste paga del mese', '.pdf'],
  ['05.1', 'Contratto di lavoro', 'Studio Paghe Esempio', 'Assunzione a tempo determinato', '.pdf', 'Dipendente A'],
  ['05.1', 'Visita medica', 'Medicina del Lavoro Esempio', 'Idoneità alla mansione', '.pdf', 'Dipendente B'],
  ['08.6', 'Libretto UMA', 'Regione FVG', 'Assegnazione carburante agevolato', '.pdf'],
  ['08.1', 'Domanda PAC', 'Centro Assistenza Agricola Esempio', 'Domanda unica', '.pdf'],
  ['11.2', 'Controllo funzionale', 'Associazione Allevatori Esempio', 'Sintetico ultimo controllo', '.pdf'],
  ['11.3', 'Ricetta veterinaria', 'Studio Veterinario Esempio', 'Ricetta elettronica', '.pdf'],
  ['12.3', 'Analisi del terreno', 'Laboratorio Esempio', 'Analisi chimica del terreno', '.pdf'],
  ['13.1', 'Libretto del trattore', 'Concessionaria Esempio', 'Manuale e libretto di uso', '.pdf'],
  ['13.3', 'Revisione', 'Motorizzazione', 'Revisione periodica', '.jpg'],
  ['07.1', 'Polizza', 'Assicurazioni Esempio', 'Polizza responsabilità civile', '.pdf'],
  ['06.2', 'Bolletta', 'Acquedotto Esempio', 'Acqua della stalla', '.pdf'],
  ['09.2', 'Contratto di affitto', 'Proprietario Esempio', 'Affitto di fondo rustico', '.docx'],
  ['14.2', 'Formulario rifiuti', 'Smaltimenti Esempio', 'Ritiro oli esausti', '.pdf'],
  ['15', 'Attestato', 'Ente di Formazione Esempio', 'Patentino fitosanitari', '.pdf'],
  ['99.1', 'Documento', null, 'Scansione senza titolo', '.pdf'],
];
const pulisci = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
let DOCS = null;
function docs() {
  if (DOCS) return DOCS;
  DOCS = []; let id = 100, seme = 7;
  const caso = n => { seme = (seme * 9301 + 49297) % 233280; return Math.floor(seme / 233280 * n); };
  for (const anno of [2026, 2025, 2024, 2023]) {
    MODELLI.forEach((m, k) => {
      const volte = m[0].startsWith('03.1') ? 3 : 1;
      for (let v = 0; v < volte; v++) {
        const [cod, tipo, contro, descr, est, pers] = m;
        const mese = 1 + caso(anno === 2026 ? 10 : 12), giorno = 1 + caso(27);
        const data = `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
        const [area, sotto] = CODICI[cod];
        const r = caso(20);
        const st = cod === '99.1' || r === 0 ? 'da_rivedere' : r < 4 ? 'proposto' : 'confermato';
        const nomeFile = r % 3 === 0 ? `scansione${String(40 + id).padStart(4, '0')}${est}` : `${tipo.split(' ')[0]} ${100 + caso(900)} del ${giorno}-${mese}-${String(anno).slice(2)}${est}`;
        const cartella = r % 2 ? 'C:\\Users\\esempio\\Downloads' : `C:\\Users\\esempio\\Desktop\\AZIENDA\\${area.slice(3)}\\${anno}`;
        const copie = r % 5 === 1 ? [cartella, 'C:\\Users\\esempio\\Downloads\\vecchi'] : [cartella];
        const contoP = cod.startsWith('05') && pers ? pers : contro;
        DOCS.push({
          id: id++, impronta: (id * 2654435761 % 4294967296).toString(16).padStart(8, '0').repeat(8),
          nome_file: nomeFile, cartella, estensione: est, genere: est === '.jpg' ? 'immagine' : 'documento', dimensione: 40000 + caso(900000),
          area, sotto, codice: codiceDi(area, sotto), tipo, data, anno, controparte: contro, persona: pers || null, descrizione: descr,
          confidenza: st === 'da_rivedere' ? 'bassa' : st === 'proposto' ? 'media' : 'alta', stato: k === 15 && anno === 2024 ? 'riservato' : st,
          classificato_da: st === 'confermato' ? (r % 2 ? 'cartella' : 'claude') : st === 'proposto' ? 'regole' : 'llm',
          aggiornato: `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}T10:00:00`,
          nome_proposto: `${data}_${pulisci(tipo)}_${pulisci(contoP || 'Varie')}_${pulisci(descr)}${est}`,
          copie_p: copie.map(c => c + '\\' + nomeFile),
          testo: `${tipo} — ${contro || ''}\n${descr} ${anno}.\nDocumento di prova inventato: serve solo a vedere l'archivio senza il ponte acceso.`,
        });
      }
    });
  }
  return DOCS;
}
const pubblico = (d, princ = 'AZIENDA') => ({
  id: d.id, impronta: d.impronta, nome: d.nome_proposto || d.nome_file, nome_proposto: d.nome_proposto, nome_file: d.nome_file, cartella: d.cartella,
  estensione: d.estensione, genere: d.genere, dimensione: d.dimensione, codice: d.codice, area: d.area, sotto: d.sotto, tipo: d.tipo, data: d.data, anno: d.anno,
  controparte: d.controparte, persona: d.persona, descrizione: d.descrizione, confidenza: d.confidenza, stato: d.stato, classificato_da: d.classificato_da,
  aggiornato: d.aggiornato, copie: d.copie_p.length, in_archivio: d.copie_p.some(p => p.includes('\\' + princ + '\\')),
});
function filtra(q) {
  let L = docs();
  if (q.area) { const [a, s] = CODICI[q.area] || []; if (!a) throw Object.assign(new Error('area sconosciuta: ' + q.area), { codice: 400 }); L = L.filter(d => d.area === a && (!s || d.sotto === s)); }
  for (const k of ['tipo', 'controparte', 'persona', 'stato', 'classificato_da']) if (q[k]) L = L.filter(d => q[k] === '-' ? d[k] == null : d[k] === q[k]);
  if (q.anno) L = L.filter(d => String(d.anno) === q.anno);
  if (q.dove === 'azienda') L = L.filter(d => d.copie_p.some(p => p.includes('\\AZIENDA\\')));
  if (q.dove === 'fuori') L = L.filter(d => !d.copie_p.some(p => p.includes('\\AZIENDA\\')));
  return L;
}
function prova(percorso, metodo, corpo) {
  const u = new URL(percorso, 'http://prova'); const q = Object.fromEntries(u.searchParams);
  const L = docs();
  if (metodo === 'POST' && u.pathname === '/apri') { const d = L.find(x => x.id === +corpo.id); if (!d) throw Object.assign(new Error('documento non trovato'), { codice: 404 }); return { aperto: corpo.percorso || d.copie_p[0], cartella: !!corpo.cartella, prova: true }; }
  if (metodo === 'POST' && u.pathname === '/correzioni') {
    const aggiornati = [], errori = {};
    for (const [id, c] of Object.entries(corpo || {})) {
      const d = L.find(x => String(x.id) === id); if (!d) { errori[id] = 'documento non trovato'; continue; }
      if (c.a) { if (!CODICI[c.a]) { errori[id] = 'area sconosciuta'; continue; } [d.area, d.sotto] = CODICI[c.a]; d.codice = c.a; }
      if ('t' in c) d.tipo = c.t || null; if ('c' in c) d.controparte = c.c || null; if ('p' in c) d.persona = c.p || null; if ('x' in c) d.descrizione = c.x || null;
      if ('d' in c) { d.data = c.d || null; if (c.d) d.anno = +c.d.slice(0, 4); }
      d.nome_proposto = c.n || `${d.data || d.anno}_${pulisci(d.tipo)}_${pulisci(d.controparte || 'Varie')}_${pulisci(d.descrizione)}${d.estensione}`;
      if (d.stato !== 'riservato') d.stato = 'confermato'; d.classificato_da = 'utente'; d.confidenza = 'alta'; d.aggiornato = new Date().toISOString().slice(0, 19);
      aggiornati.push(pubblico(d));
    }
    return { aggiornati, errori };
  }
  if (u.pathname === '/stato') {
    const per = {}; L.forEach(d => { per[d.stato] = (per[d.stato] || 0) + 1; });
    const da = {}; L.forEach(d => { da[d.classificato_da] = (da[d.classificato_da] || 0) + 1; });
    return { versione: 1, prova: true, contenuti: L.length, file_presenti: L.reduce((t, d) => t + d.copie_p.length, 0), file_spariti: 3, per_stato: per, per_classificato_da: da, ultima_scansione: '2026-11-10T09:12:00', ultimo_aggiornamento: null };
  }
  if (u.pathname === '/aree') {
    const conta = k => { const v = { n: 0, da_rivedere: 0, fuori: 0 }; filtra({ area: k }).forEach(d => { v.n++; v.da_rivedere += d.stato === 'da_rivedere'; v.fuori += !d.copie_p.some(p => p.includes('\\AZIENDA\\')); }); return v; };
    return { aree: AREE.map(([c, n, ss]) => Object.assign({ codice: c, nome: n }, conta(c), { sotto: ss.map((s, i) => Object.assign({ codice: c + '.' + (i + 1), nome: s }, conta(c + '.' + (i + 1)))) })), senza_area: 0 };
  }
  if (u.pathname === '/valori') {
    const F = filtra({ area: q.area, dove: q.dove });
    const grp = (k, num) => { const m = new Map(); F.forEach(d => { if (d[k] != null) m.set(d[k], (m.get(d[k]) || 0) + 1); }); return [...m].map(([v, n]) => ({ v, n })).sort(num ? (a, b) => b.v - a.v : (a, b) => b.n - a.n || String(a.v).localeCompare(b.v)); };
    return { anni: grp('anno', true), tipi: grp('tipo'), controparti: grp('controparte'), persone: grp('persona'), stati: grp('stato'), codici: Object.entries(CODICI).map(([codice, [area, sotto]]) => ({ codice, area, sotto })) };
  }
  const m = u.pathname.match(/^\/documenti\/(\w+)$/);
  if (m) {
    const d = L.find(x => String(x.id) === m[1] || x.impronta === m[1]); if (!d) throw Object.assign(new Error('documento non trovato'), { codice: 404 });
    return Object.assign(pubblico(d), {
      copie_elenco: d.copie_p.map((p, i) => ({ percorso: p, nome: p.split('\\').pop(), cartella: p.slice(0, p.lastIndexOf('\\')), sorgente: p.includes('Downloads') ? 'Downloads' : 'Desktop', presente: true, modificato: d.aggiornato, in_archivio: p.includes('\\AZIENDA\\') && i === 0 })),
      fonte: d.classificato_da === 'cartella' ? 'cartella' : 'testo', primo_visto: '2026-11-10T09:12:00',
      testo: d.stato === 'riservato' ? { esito: 'riservato', riservato: true } : { esito: 'ok', metodo: d.estensione === '.jpg' ? 'ocr' : 'pdf', pagine: 1 + (d.id % 3), caratteri: d.testo.length, inizio: d.testo },
      registro: [{ quando: '2026-11-10T09:12:00', chi: 'scansione', azione: 'trovato', percorso: d.copie_p[0], dettagli: null }],
    });
  }
  if (u.pathname === '/documenti') {
    let F = filtra(q); const parole = (q.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    if (parole.length) F = F.filter(d => { const t = (d.testo + ' ' + d.nome_file + ' ' + d.nome_proposto).toLowerCase(); return parole.every(p => t.includes(p)); });
    const o = q.ordina || '-data';
    F = [...F].sort((a, b) => o === 'nome' ? a.nome_proposto.localeCompare(b.nome_proposto) : o === 'aggiornato' ? b.aggiornato.localeCompare(a.aggiornato) : (o === 'data' ? 1 : -1) * String(a.data).localeCompare(String(b.data)));
    const lim = Math.min(500, +q.limite || 50), ini = +q.inizio || 0;
    return { totale: F.length, inizio: ini, limite: lim, documenti: F.slice(ini, ini + lim).map(d => { const p = pubblico(d); if (parole.length) { const t = d.testo.replace(/\s+/g, ' '); const i = Math.max(0, t.toLowerCase().indexOf(parole[0]) - 40); p.estratto = (i ? '… ' : '') + t.slice(i, i + 140).replace(new RegExp('(' + parole.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi'), '[$1]') + ' …'; p.trovato_nel_nome = parole.some(x => d.nome_file.toLowerCase().includes(x)); } return p; }) };
  }
  throw Object.assign(new Error('richiesta sconosciuta'), { codice: 404 });
}

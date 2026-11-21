// Prove del lettore della fattura del latte (js/latte-fattura.js) con fatture FINTE costruite sul formato vero.
// Nessun dato vero: nomi, numeri, litri e prezzi sono inventati.
// Uso: node strumenti/prove/latte.mjs   (dalla cartella del progetto)
import { eFatturaLatte, leggiFatturaLatte } from '../../js/latte-fattura.js';

let errori = 0;
const ok = (cond, msg) => { if (!cond) { errori++; console.log('  NO  ' + msg); } else console.log('  ok  ' + msg); };
const it = (v, d = 2) => v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
const r2 = v => Math.round(v * 100) / 100;

// Costruisce il testo di una fattura come lo dà il ponte (righe con a capo, righe vuote in mezzo).
function finta({ anno = 2026, mese = 3, numero = '0999999/03', righe, giorni, analisi = true, togliDdt = [], storpia = {} }) {
  const gg = new Date(anno, mese, 0).getDate(); const aa = String(anno).slice(2); const mm = String(mese).padStart(2, '0');
  const L = giorni || Array.from({ length: gg }, (_, i) => 9000 + ((i * 137) % 900));
  const tot = L.reduce((s, v) => s + v, 0); const q = tot / 1000;
  const rr = righe || [['Latte Vaccino Crudo', q, 480], [`PREMIO QUALITÀ 01/${mm}/${aa} - ${gg}/${mm}/${aa}`, q, 20.5]];
  const linee = rr.map(([d, qq, p]) => [d, qq, p, r2(qq * p)]);
  const imp = storpia.imponibile ?? r2(linee.reduce((s, x) => s + x[3], 0)); const iva = r2(imp * 0.1);
  const out = ['999999-01 (999999)', '', 'AZIENDA AGRICOLA FINTA S.S.', '', 'Spett.le', '', 'CASEIFICIO FINTO SPA', '',
    `Fattura n. ${numero} del ${gg}/${mm}/${anno}`, '', `Periodo: 01/${mm}/${aa} - ${gg}/${mm}/${aa}`, '',
    "Descrizione U.M. Quantita' Prezzo U. IVA Imponibile", ''];
  for (const [d, qq, p, im] of linee) out.push(`${d} 1000 L ${it(qq, 3)} ${it(p, p % 1 && String(p).split('.')[1].length > 2 ? 4 : 2)} 10 ${im < 0 ? '-' : ''}${it(Math.abs(im))}`, '');
  out.push(`Totale Imponibile ${it(imp)}`, '', `Totale Iva ${it(iva)}`, '', `TOTALE FATTURA (euro) ${it(r2(imp + iva))}`, '', 'Modalità pagamento: Bonifico Bancario', '');
  if (analisi) {
    out.push(`Mese di Mar ${anno} 03/${mm}/${aa} 12/${mm}/${aa} 21/${mm}/${aa} Media Premio/penale `, '',
      'grasso 4,10 4,05 4,12 4,09 9,50 ', '', 'proteine 3,45 3,40 3,48 3,44 5,10 ', '',
      'carica batterica 9000 12000 10500 0 ', '',                                   // un prelievo senza valore
      'cellule somatiche 180000 210000 195000 195000 -1,5 ', '',                   // penale
      'premio quantità 10200 5 ', '', 'PREMIO CERT.A.Q. CONFERENTI FINTI 4,00 ', '');
  }
  out.push('data n.doc. L data n.doc. L data n.doc. L', '');
  const col = Math.ceil(gg / 3);
  for (let r = 0; r < col; r++) {
    const cel = [];
    for (let c = 0; c < 3; c++) { const i = r + c * col; if (i >= gg) continue; const ddt = togliDdt.includes(i + 1) ? '' : ' ' + (5000 + i * 4); cel.push(`${String(i + 1).padStart(r + c * col < 9 ? 2 : 1, ' ')}/${mm}/${aa}${ddt} ${storpia.giorno === i + 1 ? L[i] + 100 : L[i]}`); }
    out.push(cel.join(' ') + (r === col - 1 ? ` media/gg ${Math.round(tot / gg)}` : ''), '');
  }
  out.push('Prot.0000000000', '', 'Documento con valenza esclusivemente commerciale');
  return { testo: out.join('\n'), tot };
}

// Con --json <file>: scrive i documenti finti per il ponte finto (strumenti/prove/ponte-finto-latte.py) ed esce.
if (process.argv[2] === '--json') {
  const fs = await import('node:fs');
  const mk = (id, nome, data, o) => ({ id, impronta: 'f'.repeat(56) + String(id).padStart(8, '0'), nome, data, estensione: '.pdf', tipo: 'Fattura', controparte: 'Caseificio-Finto', testo: finta(o).testo });
  const docs = [
    mk(1, '2026-07-31_Fattura_Caseificio-Finto_n-0999999-07.pdf', '2026-07-31', { mese: 7, numero: '0999999/07', storpia: { imponibile: 1000 } }),
    mk(2, '2026-08-31_Fattura_Caseificio-Finto_n-0999999-08.pdf', '2026-08-31', { mese: 8, numero: '0999999/08', storpia: { giorno: 10 } }),
    mk(3, '2026-09-30_Fattura_Caseificio-Finto_n-0999999-09.pdf', '2026-09-30', { mese: 9, numero: '0999999/09', togliDdt: [3] }),
    mk(4, '2026-10-31_Fattura_Caseificio-Finto_n-0999999-10.pdf', '2026-10-31', { mese: 10, numero: '0999999/10' }),
    mk(5, '2026-10-31_Fattura_Caseificio-Finto_copia-scansione.pdf', '2026-10-31', { mese: 10, numero: '0999999/10' }),
    { id: 6, impronta: 'e'.repeat(64), nome: '2026-10-05_Fattura_Mangimi-Finti_n-12.pdf', data: '2026-10-05', estensione: '.pdf', tipo: 'Fattura', controparte: 'Mangimi-Finti', testo: ['Fattura n. 12 del 05/10/2026', 'Mangime latte vaccino crudo 25 kg 10,00'].join('\n') },
  ];
  fs.writeFileSync(process.argv[3], JSON.stringify(docs, null, 1));
  console.log('scritti', docs.length, 'documenti finti in', process.argv[3]);
  process.exit(0);
}

console.log('1. fattura normale');
let { testo, tot } = finta({});
let f = leggiFatturaLatte(testo);
ok(eFatturaLatte(testo), 'riconosciuta come fattura del latte');
ok(f.numero === '0999999/03' && f.data === '2026-03-31' && f.mese === '2026-03', 'numero, data e mese');
ok(f.giorni.length === 31 && f.litri === tot, `31 giorni e ${tot} litri`);
ok(f.ok, 'tutti i controlli tornano');
ok(f.giorni[0].ddt === '5000' && f.giorni[0].data === '2026-03-01', 'primo giorno con il n. del documento');
ok(f.qualita.grasso.media === 4.09 && f.qualita.grasso.premio === 9.5 && f.qualita.grasso.valori.length === 3, 'grasso: media, premio e prelievi');
ok(f.qualita.cbt.media === 10500 && !f.qualita.cbt.valori, 'carica batterica con un prelievo mancante: media sì, prelievi no');
ok(f.qualita.cellule.premio === -1.5, 'penale delle cellule negativa');
ok(f.qualita.quantita.premio === 5 && f.qualita.cert.premio === 4, 'premio quantità e certificazione');
ok(f.analisi.length === 3 && f.prezzoBase === 480, 'date delle analisi e prezzo base');

console.log('2. n. del documento mancante in due giorni');
({ testo, tot } = finta({ togliDdt: [1, 25] }));
f = leggiFatturaLatte(testo);
ok(f.ok && f.giorni.length === 31 && f.litri === tot, 'giorni letti lo stesso, i litri tornano');
ok(f.giorni[0].ddt === null && f.giorni[0].litri > 0, 'il giorno senza documento ha i litri giusti');

console.log('3. un giorno letto male (somma che non torna)');
({ testo } = finta({ storpia: { giorno: 10 } }));
f = leggiFatturaLatte(testo);
const c0 = f.controlli.find(c => c.voce.startsWith('Litri'));
ok(!f.ok && !c0.ok && c0.letto - c0.atteso === 100, 'controllo dei litri sbagliato di 100 l');

console.log('4. imponibile che non torna con le righe');
({ testo } = finta({ storpia: { imponibile: 1000 } }));
f = leggiFatturaLatte(testo);
ok(!f.controlli.find(c => c.voce.startsWith('Righe')).ok, 'controllo dell\'imponibile sbagliato');
ok(f.controlli.find(c => c.voce.startsWith('Litri')).ok, 'i litri invece tornano (le quantità si possono salvare)');

console.log('5. più righe: latte A.Q. + normale, esubero, premio benessere, recupero e trattenuta');
const g5 = Array.from({ length: 30 }, () => 10000); const q5 = 300;
({ testo } = finta({ mese: 4, numero: '0999999/04', giorni: g5, righe: [['Latte Vaccino Crudo A.Q.', 250, 480], ['Latte Vaccino Crudo', 49.5, 480], ['Latte in esubero rispetto a 2025', 0.5, 400], ['PREMIO QUALITÀ 01/04/26 - 30/04/26', q5, 20.5], ['PREMIO CERT.BENESSERE 01/04/26 - 30/04/26', q5, 5], ['RECUPERO QUALITÀ CBT MAR26', 290, 2.5], ['Trattenuta contributo finto', q5, -1]] }));
f = leggiFatturaLatte(testo);
ok(f.litri === 300000 && f.ok, '300.000 litri dalle tre righe di latte, controlli ok');
ok(f.righe.length === 7 && f.premi > 0 && f.trattenute === 300, 'premi e 300 € di trattenute');
ok(Math.abs(f.valoreLatte + f.premi - f.trattenute - f.imponibile) < 0.011, 'latte + premi − trattenute = imponibile');

console.log('6. fattura vecchia senza analisi');
({ testo } = finta({ analisi: false }));
f = leggiFatturaLatte(testo);
ok(f.ok && !Object.keys(f.qualita).length, 'controlli ok, nessuna analisi');

console.log('7. altri documenti');
ok(!eFatturaLatte('Fattura n. 12 del 01/02/2026\nConcime 25 kg 10,00'), 'una fattura di concime non è del latte');
ok(!eFatturaLatte(''), 'testo vuoto');

console.log(errori ? `\n${errori} prove non riuscite` : '\nTutte le prove riuscite');
process.exit(errori ? 1 : 0);

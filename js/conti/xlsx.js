// File Excel: lettura dei valori (per importare il vecchio modello) e scrittura di fogli impaginati
import { unzip, zip } from './zip.js';

/* ---------------- lettura ---------------- */
const unesc = s => s.replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
const attr = (tag, n) => { const m = new RegExp('\\b' + n + '="([^"]*)"').exec(tag); return m ? unesc(m[1]) : null; };
export const colNum = l => { let n = 0; for (const c of l) n = n * 26 + c.charCodeAt(0) - 64; return n; };
export const colLett = n => { let s = ''; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

export async function leggiXlsx(data) {
  const z = await unzip(data); const dec = new TextDecoder();
  const T = n => z.has(n) ? dec.decode(z.get(n)) : '';
  const wb = T('xl/workbook.xml'); if (!wb) throw new Error('Il file non è un file Excel (.xlsx).');
  const rels = {}; for (const m of T('xl/_rels/workbook.xml.rels').matchAll(/<Relationship\b[^>]*>/g)) rels[attr(m[0], 'Id')] = attr(m[0], 'Target');
  const shared = [...T('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map(m => unesc([...m[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join('')));
  const fogli = {};
  for (const m of wb.matchAll(/<sheet\b[^>]*\/>/g)) {
    const nome = attr(m[0], 'name'); const rid = attr(m[0], 'r:id');
    let t = rels[rid] || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const xml = T(t); const celle = {};
    for (const c of xml.matchAll(/<c r="([A-Z]+)(\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, col, row, a, corpo = ''] = c; const tipo = (/\bt="([^"]+)"/.exec(a) || [])[1] || 'n';
      let v;
      if (tipo === 'inlineStr') v = unesc([...corpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(x => x[1]).join(''));
      else { const vm = /<v>([\s\S]*?)<\/v>/.exec(corpo); if (!vm) continue; v = vm[1]; if (tipo === 's') v = shared[+v]; else if (tipo === 'str' || tipo === 'e') v = unesc(v); else if (tipo === 'b') v = v === '1'; else { const n = parseFloat(v); v = isFinite(n) ? n : v; } }
      celle[col + row] = v;
    }
    fogli[nome] = celle;
  }
  return fogli;
}
export const serialeAData = n => { if (typeof n !== 'number') return null; const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5); return d.toISOString().slice(0, 10); };

/* ---------------- scrittura ---------------- */
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');
const EUR = '"€ "';
const FMT = {
  eur: `${EUR}#,##0;\\(${EUR}#,##0\\);\\-`, eur2: `${EUR}#,##0.00;\\(${EUR}#,##0.00\\);\\-`, eur3: `${EUR}#,##0.000;\\(${EUR}#,##0.000\\);\\-`, eur4: `${EUR}#,##0.0000;\\(${EUR}#,##0.0000\\);\\-`,
  num: '#,##0;\\(#,##0\\);\\-', num1: '#,##0.0;\\(#,##0.0\\);\\-', num2: '#,##0.00;\\(#,##0.00\\);\\-', int: '0', pct: '0.0%;\\(0.0%\\);\\-', date: 'dd/mm/yyyy',
};
const FMT_ID = Object.fromEntries(Object.keys(FMT).map((k, i) => [k, 164 + i]));
// font: 0 normale, 1 grassetto, 2 titolo, 3 nota, 4 bianco grassetto, 5 verde (sezione chiara)
const FONTS = ['<font><sz val="10"/><color rgb="FF16201B"/><name val="Arial"/><family val="2"/></font>', '<font><b/><sz val="10"/><color rgb="FF16201B"/><name val="Arial"/><family val="2"/></font>',
  '<font><b/><sz val="15"/><color rgb="FF1E4D3A"/><name val="Arial"/><family val="2"/></font>', '<font><i/><sz val="9"/><color rgb="FF6B7A72"/><name val="Arial"/><family val="2"/></font>',
  '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/><family val="2"/></font>', '<font><b/><sz val="10"/><color rgb="FF1E4D3A"/><name val="Arial"/><family val="2"/></font>'];
const FILLS = ['<fill><patternFill patternType="none"/></fill>', '<fill><patternFill patternType="gray125"/></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FF1E4D3A"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFCFE3D6"/><bgColor indexed="64"/></patternFill></fill>', '<fill><patternFill patternType="solid"><fgColor rgb="FF3F7D5A"/><bgColor indexed="64"/></patternFill></fill>',
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE6F0EA"/><bgColor indexed="64"/></patternFill></fill>'];
const BORDERS = ['<border><left/><right/><top/><bottom/><diagonal/></border>', '<border><left/><right/><top/><bottom style="hair"><color rgb="FFC9D3CE"/></bottom><diagonal/></border>',
  '<border><left/><right/><top style="thin"><color rgb="FF9DBFA9"/></top><bottom style="thin"><color rgb="FF9DBFA9"/></bottom><diagonal/></border>'];
// tipi di cella: [font, fill, bordo]
const KIND = { d: [0, 0, 1], b: [1, 0, 1], tot: [1, 3, 2], h: [4, 2, 0], sez: [4, 4, 0], sub: [5, 5, 1], tit: [2, 0, 0], nota: [3, 0, 0] };

class Stili {
  constructor() { this.xf = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']; this.map = {}; }
  id(kind = 'd', fmt = '', ind = 0, wrap = false, h = '') {
    const k = [kind, fmt, ind, wrap, h].join('|'); if (k in this.map) return this.map[k];
    const [f, fi, b] = KIND[kind] || KIND.d; const nf = fmt ? FMT_ID[fmt] || 0 : 0;
    const al = `<alignment vertical="center"${h ? ` horizontal="${h}"` : ''}${ind ? ` indent="${ind}"` : ''}${wrap ? ' wrapText="1"' : ''}/>`;
    this.xf.push(`<xf numFmtId="${nf}" fontId="${f}" fillId="${fi}" borderId="${b}" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"${nf ? ' applyNumberFormat="1"' : ''}>${al}</xf>`);
    return (this.map[k] = this.xf.length - 1);
  }
  xml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="${Object.keys(FMT).length}">${Object.entries(FMT).map(([k, v]) => `<numFmt numFmtId="${FMT_ID[k]}" formatCode="${esc(v)}"/>`).join('')}</numFmts><fonts count="${FONTS.length}">${FONTS.join('')}</fonts><fills count="${FILLS.length}">${FILLS.join('')}</fills><borders count="${BORDERS.length}">${BORDERS.join('')}</borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="${this.xf.length}">${this.xf.join('')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  }
}
const serial = iso => { const [y, m, d] = iso.split('-').map(Number); return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 864e5; };
const isNum = v => typeof v === 'number' && isFinite(v);

/**
 * Crea un file Excel. sheets: [{ name, title, subtitle, cols: [{ h, w, fmt, align }], rows: [array | { cells, kind, ind } | { sez: 'testo' }], note: [testi] }]
 * kind della riga: 'd' (normale), 'b' (grassetto), 'tot' (totale), 'sub' (sottosezione).
 */
export async function scriviXlsx(sheets) {
  const st = new Stili(); const files = []; const nomi = []; const defs = [];
  sheets.forEach((sh, si) => {
    let nome = String(sh.name || 'Foglio').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31).trim() || 'Foglio';
    while (nomi.includes(nome)) nome = nome.slice(0, 28) + ' ' + (si + 1);
    nomi.push(nome);
    const cols = sh.cols; const nc = cols.length; const out = []; let r = 0;
    const cell = (c, v, s, fmt) => {
      const ref = colLett(c) + r;
      if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${s}"/>`;
      if (fmt === 'date' && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return `<c r="${ref}" s="${s}"><v>${serial(v)}</v></c>`;
      if (isNum(v)) return `<c r="${ref}" s="${s}"><v>${v}</v></c>`;
      return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    };
    const row = (fn, ht) => { r++; out.push(`<row r="${r}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${fn().join('')}</row>`); };
    row(() => [cell(1, sh.title || nome, st.id('tit'))], 22);
    if (sh.subtitle) row(() => [cell(1, sh.subtitle, st.id('nota'))]); else r++;
    r++;
    const hr = r + 1;
    row(() => cols.map((c, i) => cell(i + 1, c.h, st.id('h', '', 0, true, c.fmt && c.fmt !== 'text' ? 'center' : ''))), 30);
    const first = r + 1;
    for (const x of sh.rows) {
      if (x && x.sez !== undefined) { r++; out.push(`<row r="${r}" ht="18" customHeight="1">${cols.map((c, i) => cell(i + 1, i === 0 ? x.sez : null, st.id('sez'))).join('')}</row>`); continue; }
      const cells = Array.isArray(x) ? x : x.cells; const kind = Array.isArray(x) ? 'd' : x.kind || 'd'; const ind = Array.isArray(x) ? 0 : x.ind || 0;
      r++;
      out.push(`<row r="${r}">${cols.map((c, i) => { const fmt = (x.fmts && x.fmts[i]) || (c.fmt && c.fmt !== 'text' ? c.fmt : ''); return cell(i + 1, cells[i], st.id(kind, fmt, i === 0 ? ind : 0, !!c.wrap, c.align || ''), fmt); }).join('')}</row>`);
    }
    const last = r;
    r++; for (const n of sh.note || []) row(() => [cell(1, n, st.id('nota'))]);
    const widths = cols.map((c, i) => {
      if (c.w) return c.w;
      let m = String(c.h || '').length * 0.9;
      for (const x of sh.rows) { const cells = Array.isArray(x) ? x : x.cells; if (!cells) continue; const v = cells[i]; const s = isNum(v) ? (c.fmt && c.fmt.startsWith('eur') ? v.toFixed(c.fmt === 'eur' ? 0 : 2).length * 1.3 + 3 : String(v).length * 1.2) : c.fmt === 'date' ? 10 : String(v ?? '').length; m = Math.max(m, s); }
      return Math.min(Math.max(m + 2, 8), c.max || 60);
    });
    const filtro = sh.filter !== false && last >= first && nc > 1;
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"${si === 0 ? ' tabSelected="1"' : ''}><pane${sh.freezeCols ? ` xSplit="${sh.freezeCols}"` : ''} ySplit="${hr}" topLeftCell="${colLett((sh.freezeCols || 0) + 1)}${hr + 1}" activePane="${sh.freezeCols ? 'bottomRight' : 'bottomLeft'}" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w.toFixed(1)}" customWidth="1"/>`).join('')}</cols><sheetData>${out.join('')}</sheetData>${filtro ? `<autoFilter ref="A${hr}:${colLett(nc)}${last}"/>` : ''}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="${nc > 6 ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;L&amp;"Arial"&amp;8Campo e Stalla&amp;C&amp;"Arial"&amp;8&amp;A&amp;R&amp;"Arial"&amp;8Pagina &amp;P di &amp;N</oddFooter></headerFooter></worksheet>`;
    files.push([`xl/worksheets/sheet${si + 1}.xml`, xml]);
    defs.push(`<definedName name="_xlnm.Print_Titles" localSheetId="${si}">'${nome.replace(/'/g, "''")}'!$${hr}:$${hr}</definedName>` + (filtro ? `<definedName name="_xlnm._FilterDatabase" localSheetId="${si}" hidden="1">'${nome.replace(/'/g, "''")}'!$A$${hr}:$${colLett(nc)}$${last}</definedName>` : ''));
  });
  const n = sheets.length;
  files.unshift(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${Array.from({ length: n }, (_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>'],
    ['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Campo e Stalla</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${nomi.map((s, i) => `<sheet name="${esc(s)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets><definedNames>${defs.join('')}</definedNames><calcPr calcId="191029"/></workbook>`],
    ['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nomi.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  files.push(['xl/styles.xml', st.xml()]);
  const blob = await zip(files);
  return new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

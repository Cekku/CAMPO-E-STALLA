// Bilancio dell'azoto (direttiva nitrati): azoto della stalla, azoto distribuito per campo e confronto con i limiti.
// Valori di partenza indicativi (DM 25/02/2016 e regolamento regionale): l'utente li controlla con il tecnico e li cambia in Impostazioni.
import { S, get } from './state.js';
import { N, yearOf } from './util.js';
import { cropOf, campoHa, capoI, COLTURE } from './domain.js';

// Limite di azoto da effluenti zootecnici, kg N per ettaro all'anno (media sulla superficie aziendale)
export const LIMITI = { ZVN: 170, Ordinaria: 340 };
// Azoto al campo per capo all'anno (kg), per stato del capo: peso medio × kg N per tonnellata di peso vivo
export const CAPI_DEF = { 'In lattazione': 83, 'Asciutta': 83, 'Manza': 42, 'Vitella': 14, 'Vitello': 14, 'Maschio': 34 };
// Massimo apporto di azoto efficiente per coltura, kg N/ha all'anno (indicativo)
export const MAS_DEF = { 'Mais da granella': 280, 'Mais trinciato': 280, 'Frumento tenero': 180, 'Frumento duro': 180, 'Orzo': 150, 'Triticale': 150, 'Soia': 0, 'Erba medica': 0, 'Prato polifita': 180, 'Loiessa': 210, 'Sorgo': 220, 'Girasole': 120, 'Colza': 160, 'Barbabietola': 160, 'Vite': 70, 'Pomodoro da industria': 170, 'Riposo': 0 };
// Efficienza dell'azoto degli effluenti, se il prodotto non la dice (%)
export const EFF_DEF = 50;

export const CATS_N = ['Concime', 'Effluente'];

export function nitConfig() {
  const c = S.config.find(x => x.id === 'nitrati') || {};
  return { zona: c.zona === 'Ordinaria' ? 'Ordinaria' : 'ZVN', capi: Object.assign({}, CAPI_DEF, c.capi || {}), mas: Object.assign({}, MAS_DEF, c.mas || {}) };
}

// MAS della coltura: nome esatto, poi per somiglianza (es. "Granturco (Mais)" → mais), altrimenti null (sconosciuto)
export function masDi(coltura, cfg = nitConfig()) {
  if (!coltura) return null;
  if (cfg.mas[coltura] !== undefined && cfg.mas[coltura] !== null && cfg.mas[coltura] !== '') return N(cfg.mas[coltura]);
  const s = coltura.toLowerCase();
  const k = /mais|granturco/.test(s) ? (/granella/.test(s) ? 'Mais da granella' : 'Mais trinciato') : /frumento|grano/.test(s) ? 'Frumento tenero' : /orzo/.test(s) ? 'Orzo' : /triticale|segale|avena|miscuglio/.test(s) ? 'Triticale' : /medica/.test(s) ? 'Erba medica' : /loiessa|loietto/.test(s) ? 'Loiessa' : /prato|erba/.test(s) ? 'Prato polifita' : /soia/.test(s) ? 'Soia' : /sorgo/.test(s) ? 'Sorgo' : null;
  return k ? N(cfg.mas[k]) : null;
}

// Quantità del prodotto in kg (concimi: litri contati come kg)
const inKg = (q, u) => q * ({ q: 100, t: 1000, 'm³': 1000 }[u] || 1);

// Azoto, fosforo e potassio portati da un'attività. Concime: titolo in % sul peso. Effluente: kg per unità (m³ o t).
export function nutrientiOp(o) {
  const p = o && o.prodottoId ? get('prodotti', o.prodottoId) : null;
  if (!p || !CATS_N.includes(p.categoria)) return null;
  const c = get('campi', o.campoId);
  const q = N(o.quantita) || (c ? N(o.dose) * campoHa(c) : 0);
  if (!q) return null;
  if (p.categoria === 'Effluente') {
    const n = q * N(p.kgN), eff = p.effN !== undefined && p.effN !== null && p.effN !== '' ? N(p.effN) : EFF_DEF;
    return { n, nEff: n * eff / 100, nZoo: n, p: q * N(p.kgP), k: q * N(p.kgK) };
  }
  const kg = inKg(q, p.unita);
  const n = kg * N(p.titN) / 100;
  return { n, nEff: n, nZoo: 0, p: kg * N(p.titP) / 100, k: kg * N(p.titK) / 100 };
}

const r1 = x => Math.round(x * 10) / 10;

// Una riga per campo con coltura o con apporti nell'annata
export function bilancioCampi(anno, cfg = nitConfig()) {
  const ops = S.operazioni.filter(o => o.stato !== 'Pianificata' && yearOf(o.data) === +anno);
  const per = new Map();
  for (const o of ops) {
    const x = nutrientiOp(o); if (!x) continue;
    const t = per.get(o.campoId) || { n: 0, nEff: 0, nZoo: 0, p: 0, k: 0, nOp: 0 };
    t.n += x.n; t.nEff += x.nEff; t.nZoo += x.nZoo; t.p += x.p; t.k += x.k; t.nOp++;
    per.set(o.campoId, t);
  }
  return S.campi.filter(c => cropOf(c, anno) || per.has(c.id)).map(c => {
    const ha = campoHa(c), t = per.get(c.id) || { n: 0, nEff: 0, nZoo: 0, p: 0, k: 0, nOp: 0 };
    const coltura = cropOf(c, anno), mas = masDi(coltura, cfg);
    const effHa = ha ? t.nEff / ha : 0;
    const quota = mas ? effHa / mas : (effHa > 0 && mas === 0 ? Infinity : null);
    const stato = !ha && t.nOp ? 'Manca la superficie' : mas === null ? (effHa > 0 ? 'Coltura senza limite' : '—') : quota === Infinity || quota > 1 ? 'Oltre il limite' : quota > 0.9 ? 'Vicino al limite' : 'Nel limite';
    return { id: c.id, nome: c.nome, coltura: coltura || '—', ha: Math.round(ha * 100) / 100, nTot: r1(t.n), nEffHa: r1(effHa), nZooHa: r1(ha ? t.nZoo / ha : 0), pHa: r1(ha ? t.p / ha : 0), kHa: r1(ha ? t.k / ha : 0), mas, quota: quota === Infinity ? null : quota, stato, nOp: t.nOp, _nZoo: t.nZoo, _ha: ha };
  });
}

// Azoto prodotto dalla stalla con i capi presenti oggi, e confronto con la superficie dell'azienda
export function azotoStalla(anno, cfg = nitConfig()) {
  const conta = {};
  for (const c of S.capi) { const i = capoI(c); const st = i && i.stato; if (!st || st === 'Uscita') continue; conta[st] = (conta[st] || 0) + 1; }
  const righe = Object.keys(cfg.capi).map(st => ({ stato: st, capi: conta[st] || 0, kg: N(cfg.capi[st]), tot: (conta[st] || 0) * N(cfg.capi[st]) }));
  for (const st of Object.keys(conta)) if (!(st in cfg.capi)) righe.push({ stato: st, capi: conta[st], kg: 0, tot: 0 });
  const prodotto = righe.reduce((s, r) => s + r.tot, 0);
  const sau = S.campi.reduce((s, c) => s + campoHa(c), 0);
  const limite = LIMITI[cfg.zona];
  const distribuito = bilancioCampi(anno, cfg).reduce((s, r) => s + r._nZoo, 0);
  return { righe, prodotto, sau, limite, carico: sau ? prodotto / sau : 0, haMinimi: prodotto / limite, distribuito, distribuitoHa: sau ? distribuito / sau : 0, zona: cfg.zona };
}

export const coltureMas = () => [...new Set([...COLTURE, ...Object.keys(nitConfig().mas)])];

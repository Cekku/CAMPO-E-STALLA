// Stato condiviso dell'app: dati, interfaccia, valori derivati
import { lsGet } from './util.js';

export const COLS = ['campi', 'operazioni', 'prodotti', 'movimenti', 'mezzi', 'manutenzioni', 'capi', 'eventi', 'latte', 'razioni', 'config'];
export const S = {};
COLS.forEach(c => (S[c] = []));

const saved = lsGet('ces.ui', {});
export const UI = {
  tab: 'oggi',
  sub: Object.assign({ campi: 'elenco', stalla: 'mandria', magazzino: 'prodotti', altro: 'menu' }, saved.sub || {}),
  detail: null,
  hist: [],
  anno: new Date().getFullYear(),
  f: {},
  loaded: false,
};

export const D = {}; // dati derivati, ricalcolati a ogni render

export const bus = {
  render: () => {},
  mapUpdate: () => {},
};

export const get = (c, id) => S[c].find(x => x.id === id);
export const azienda = () => S.config.find(c => c.id === 'azienda') || {};

// Stato condiviso dell'app: dati, interfaccia, valori derivati
import { lsGet } from './util.js';

export const COLS = ['campi', 'operazioni', 'prodotti', 'movimenti', 'mezzi', 'manutenzioni', 'capi', 'eventi', 'latte', 'razioni', 'note', 'config'];
export const S = {};
COLS.forEach(c => (S[c] = []));

const saved = lsGet('ces.ui', {});
export const UI = {
  tab: 'oggi',
  area: saved.area === 'stalla' ? 'stalla' : 'campagna',
  sub: Object.assign({ campi: 'elenco', stalla: 'mandria', magazzino: 'prodotti', attivita: 'completate' }, saved.sub || {}),
  view: saved.view || 'griglia',
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

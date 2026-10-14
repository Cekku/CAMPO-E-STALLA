// Archivio local-first: IndexedDB sul dispositivo, sincronizzazione con Supabase quando configurata
import { S, COLS, UI, bus } from './state.js';
import { uid, lsGet, lsSet, debounce } from './util.js';
import { CONFIG } from './config.js';

const DBN = 'campoestalla', VER = 1;
let idb = null;
const mem = {}; COLS.forEach(c => (mem[c] = new Map()));
const listeners = new Set();
export const onSync = fn => { listeners.add(fn); return () => listeners.delete(fn); };

export const sync = { mode: 'local', status: 'idle', pending: 0, lastSync: null, user: null, farm: null, members: [], error: '' };
const emitSync = () => listeners.forEach(f => { try { f(sync); } catch (e) { } });

function openIDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, VER);
    r.onupgradeneeded = () => { const db = r.result; db.createObjectStore('records', { keyPath: 'k' }); db.createObjectStore('outbox', { keyPath: 'k' }); db.createObjectStore('meta'); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
const P = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
function tx(stores, mode, fn) {
  return new Promise((res, rej) => { const t = idb.transaction(stores, mode); let out; Promise.resolve(fn(t)).then(v => (out = v)); t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); });
}
const getAll = name => tx([name], 'readonly', t => P(t.objectStore(name).getAll()));
const metaGet = k => tx(['meta'], 'readonly', t => P(t.objectStore('meta').get(k)));
const metaSet = (k, v) => tx(['meta'], 'readwrite', t => { t.objectStore('meta').put(v, k); });

function rebuild(cols) { (cols || COLS).forEach(c => { S[c] = [...mem[c].values()]; }); }
const schedule = () => bus.render();
const clean = o => { const r = {}; for (const k in o) { if (k === 'id' || o[k] === undefined) continue; r[k] = o[k]; } return JSON.parse(JSON.stringify(r)); };

export async function initStore() {
  try { idb = await openIDB(); } catch (e) { console.warn('IndexedDB non disponibile', e); }
  if (idb) {
    const recs = await getAll('records');
    recs.forEach(r => { if (!r.deleted && mem[r.col]) mem[r.col].set(r.id, Object.assign({}, r.data, { id: r.id })); });
    sync.pending = (await getAll('outbox')).length;
    sync.lastSync = await metaGet('lastSync') || null;
    const farm = await metaGet('farm'); if (farm) sync.farm = farm;
  }
  rebuild(); UI.loaded = true; schedule();
  initCloud();
}

async function writeLocal(col, id, data, deleted) {
  const k = col + '/' + id; const rec = { k, col, id, data, deleted, ts: Date.now() };
  if (deleted) mem[col].delete(id); else mem[col].set(id, Object.assign({}, data, { id }));
  rebuild([col]); schedule();
  if (idb) {
    await tx(['records', 'outbox'], 'readwrite', t => { t.objectStore('records').put(rec); if (sync.farm) t.objectStore('outbox').put(rec); });
    if (sync.farm) { sync.pending = (await getAll('outbox')).length; emitSync(); syncSoon(); }
  }
}
export async function put(col, id, data) { const nid = id || uid(); await writeLocal(col, nid, clean(data), false); return nid; }
export async function remove(col, id) { await writeLocal(col, id, {}, true); }

// Importazione in blocco (backup o dati di esempio)
export async function bulkPut(rows) {
  rows.forEach(({ col, id, data }) => mem[col].set(id, Object.assign({}, data, { id })));
  rebuild(); schedule();
  if (!idb) return;
  const ts = Date.now();
  await tx(['records', 'outbox'], 'readwrite', t => { rows.forEach(({ col, id, data }) => { const rec = { k: col + '/' + id, col, id, data: clean(data), deleted: false, ts }; t.objectStore('records').put(rec); if (sync.farm) t.objectStore('outbox').put(rec); }); });
  if (sync.farm) { sync.pending = (await getAll('outbox')).length; emitSync(); syncSoon(); }
}

/* ---------------- Cloud ---------------- */
let sb = null, channel = null, syncing = false, again = false;
export function cloudConfig() { const o = lsGet('ces.cloud', null); if (o && o.url && o.key) return o; if (CONFIG.supabaseUrl && CONFIG.supabaseKey) return { url: CONFIG.supabaseUrl, key: CONFIG.supabaseKey, fromConfig: true }; return null; }
export function setCloudConfig(url, key) { if (!url) { try { localStorage.removeItem('ces.cloud'); } catch (e) { } } else lsSet('ces.cloud', { url: url.trim().replace(/\/$/, ''), key: key.trim() }); location.reload(); }
export const cloudReady = () => !!sb;

async function initCloud() {
  const cfg = cloudConfig();
  if (!cfg || !window.supabase) { sync.mode = 'local'; emitSync(); return; }
  try {
    sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  } catch (e) { sync.mode = 'local'; sync.error = 'Configurazione cloud non valida'; emitSync(); return; }
  sync.mode = 'cloud';
  const { data } = await sb.auth.getSession();
  sync.user = data.session ? data.session.user : null;
  sb.auth.onAuthStateChange((ev, s) => { const was = sync.user && sync.user.id; sync.user = s ? s.user : null; emitSync(); if (sync.user && sync.user.id !== was) afterLogin(); });
  emitSync();
  if (sync.user) afterLogin();
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') syncNow(); });
  setInterval(() => syncNow(), 90000);
}
async function afterLogin() {
  if (!sync.farm) { emitSync(); return; }
  try {
    const { data, error } = await sb.from('farms').select('id,name,join_code').eq('id', sync.farm.id).maybeSingle();
    if (error) throw error;
    if (!data) { sync.error = 'Non fai più parte dell\'azienda collegata.'; emitSync(); return; }
    sync.farm = data; await metaSet('farm', data);
    loadMembers();
  } catch (e) { /* offline: si usa la copia locale */ }
  startRealtime(); syncNow();
}
export async function loadMembers() {
  if (!sb || !sync.farm) return;
  const { data } = await sb.from('farm_members').select('user_id,email,role,joined_at').eq('farm_id', sync.farm.id).order('joined_at');
  sync.members = data || []; emitSync();
}
export async function signIn(email, password) { const { error } = await sb.auth.signInWithPassword({ email, password }); if (error) throw error; }
export async function signUp(email, password) { const { data, error } = await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }); if (error) throw error; return data; }
export async function resetPassword(email) { const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname }); if (error) throw error; }
export async function signOut() { await sb.auth.signOut(); stopRealtime(); }

export async function createFarm(name) {
  const { data, error } = await sb.rpc('create_farm', { farm_name: name }); if (error) throw error;
  await attachFarm(data, true);
}
export async function joinFarm(code) {
  const { data, error } = await sb.rpc('join_farm', { code }); if (error) throw error;
  await attachFarm(data, false);
}
async function attachFarm(farmId, uploadLocal) {
  const { data } = await sb.from('farms').select('id,name,join_code').eq('id', farmId).single();
  sync.farm = data; sync.lastSync = null;
  await metaSet('farm', data); await metaSet('lastSync', null);
  if (uploadLocal) {
    const recs = await getAll('records');
    await tx(['outbox'], 'readwrite', t => recs.forEach(r => t.objectStore('outbox').put(r)));
  } else {
    // entrando in un'azienda esistente, i dati locali vengono sostituiti da quelli condivisi
    await tx(['records', 'outbox'], 'readwrite', t => { t.objectStore('records').clear(); t.objectStore('outbox').clear(); });
    COLS.forEach(c => mem[c].clear()); rebuild(); schedule();
  }
  sync.pending = (await getAll('outbox')).length;
  loadMembers(); startRealtime(); await syncNow();
}
export async function leaveFarm() {
  if (sb && sync.farm && sync.user) await sb.from('farm_members').delete().eq('farm_id', sync.farm.id).eq('user_id', sync.user.id);
  stopRealtime();
  sync.farm = null; sync.members = []; await metaSet('farm', null); await metaSet('lastSync', null);
  await tx(['outbox'], 'readwrite', t => t.objectStore('outbox').clear()); sync.pending = 0; emitSync();
}
export async function removeMember(userId) { const { error } = await sb.from('farm_members').delete().eq('farm_id', sync.farm.id).eq('user_id', userId); if (error) throw error; loadMembers(); }
export async function newJoinCode() { const { data, error } = await sb.rpc('new_join_code', { f: sync.farm.id }); if (error) throw error; sync.farm.join_code = data; await metaSet('farm', sync.farm); emitSync(); }
export async function renameFarm(name) { const { error } = await sb.from('farms').update({ name }).eq('id', sync.farm.id); if (error) throw error; sync.farm.name = name; await metaSet('farm', sync.farm); emitSync(); }

function startRealtime() {
  if (!sb || !sync.farm || channel) return;
  channel = sb.channel('farm-' + sync.farm.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'records', filter: 'farm_id=eq.' + sync.farm.id }, p => { if (p.new && p.new.col) applyRemote([p.new]); })
    .subscribe();
}
function stopRealtime() { if (channel) { sb.removeChannel(channel); channel = null; } }

const syncSoon = debounce(() => syncNow(), 900);
export async function syncNow() {
  if (!sb || !sync.user || !sync.farm || !idb) return;
  if (syncing) { again = true; return; }
  if (!navigator.onLine) { sync.status = 'offline'; emitSync(); return; }
  syncing = true; sync.status = 'syncing'; emitSync();
  try { await push(); await pull(); sync.status = 'ok'; sync.error = ''; }
  catch (e) { sync.status = navigator.onLine ? 'error' : 'offline'; sync.error = e.message || String(e); console.warn('sync', e); }
  syncing = false; sync.pending = (await getAll('outbox')).length; emitSync();
  if (again) { again = false; syncNow(); }
}
async function push() {
  const items = await getAll('outbox'); if (!items.length) return;
  for (let i = 0; i < items.length; i += 300) {
    const chunk = items.slice(i, i + 300);
    const rows = chunk.map(r => ({ farm_id: sync.farm.id, col: r.col, id: r.id, data: r.data, deleted: !!r.deleted }));
    const { error } = await sb.from('records').upsert(rows, { onConflict: 'farm_id,col,id' });
    if (error) throw error;
    await tx(['outbox'], 'readwrite', t => { const os = t.objectStore('outbox'); chunk.forEach(r => { const g = os.get(r.k); g.onsuccess = () => { if (g.result && g.result.ts === r.ts) os.delete(r.k); }; }); });
  }
}
async function pull() {
  let since = sync.lastSync ? new Date(Date.parse(sync.lastSync) - 15000).toISOString() : '1970-01-01T00:00:00Z';
  let maxTs = sync.lastSync;
  for (let guard = 0; guard < 200; guard++) {
    const { data, error } = await sb.from('records').select('col,id,data,deleted,updated_at').eq('farm_id', sync.farm.id).gt('updated_at', since).order('updated_at', { ascending: true }).limit(1000);
    if (error) throw error;
    if (!data.length) break;
    await applyRemote(data);
    since = data[data.length - 1].updated_at; if (!maxTs || since > maxTs) maxTs = since;
    if (data.length < 1000) break;
  }
  if (maxTs) { sync.lastSync = maxTs; await metaSet('lastSync', maxTs); }
}
async function applyRemote(rows) {
  if (!idb) return;
  const pend = new Set((await getAll('outbox')).map(r => r.k));
  const touched = new Set();
  const recs = [];
  rows.forEach(r => {
    if (!mem[r.col]) return; const k = r.col + '/' + r.id; if (pend.has(k)) return;
    if (r.deleted) mem[r.col].delete(r.id); else mem[r.col].set(r.id, Object.assign({}, r.data, { id: r.id }));
    touched.add(r.col); recs.push({ k, col: r.col, id: r.id, data: r.data, deleted: !!r.deleted, ts: Date.parse(r.updated_at) || Date.now() });
  });
  if (!recs.length) return;
  await tx(['records'], 'readwrite', t => recs.forEach(r => t.objectStore('records').put(r)));
  rebuild([...touched]); schedule();
}

export async function exportAll() { const o = {}; COLS.forEach(c => (o[c] = S[c])); return o; }
export async function wipeLocal() {
  await tx(['records', 'outbox', 'meta'], 'readwrite', t => { t.objectStore('records').clear(); t.objectStore('outbox').clear(); t.objectStore('meta').clear(); });
  location.reload();
}

/**
 * Data layer: Firestore is the source of truth, with a local JSON mirror so
 * the app keeps working (and survives a restart) when Firebase is unreachable.
 *
 * This mirrors the Sales Trail store approach but only for the two collections
 * this app needs: `users` (shared login accounts) and `salons` (captured cards).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  firebaseStatus,
  firebaseConfig,
  listCollection,
  getDoc,
  setDoc,
  deleteDoc,
} from './firebase.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'data');
export const CACHE_DIR = path.join(DATA_DIR, 'cache');
export const SECRETS_FILE = path.join(DATA_DIR, 'secrets.json');
const MEMO_MS = 4000;
const COLLECTIONS = ['users', 'salons'];

const ensureDirs = () => {
  for (const dir of [DATA_DIR, CACHE_DIR]) fs.mkdirSync(dir, { recursive: true });
};

const state = {
  mode: firebaseConfig.projectId ? 'firebase' : 'local',
  ready: false,
  lastSyncAt: null,
  lastError: null,
  syncing: false,
};

const cache = new Map();
const memo = new Map();
const pendingWrites = [];

/* --------------------------------- files --------------------------------- */

const cacheFile = (name) => path.join(CACHE_DIR, `${name}.json`);

const readFileJson = (file, fallback) => {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
};

const writeFileJson = (file, value) => {
  try {
    ensureDirs();
    fs.writeFileSync(file, JSON.stringify(value, null, 2));
  } catch {
    /* disk unavailable - keep going in memory */
  }
};

/* -------------------------------- secrets -------------------------------- */

export const readSecrets = () => readFileJson(SECRETS_FILE, {});

export const writeSecrets = (patch) => {
  const next = { ...readSecrets(), ...patch };
  writeFileJson(SECRETS_FILE, next);
  return next;
};

export const secretsConfigured = () => {
  const s = readSecrets();
  return {
    smtp: Boolean(s.smtp?.host && s.smtp?.user),
    resend: Boolean(s.resend?.apiKey),
  };
};

/* ------------------------------ firestore io ----------------------------- */

export const hydrate = async (force = false) => {
  if (!firebaseConfig.projectId) {
    state.mode = 'local';
    state.ready = true;
    return storeStatus();
  }
  if (state.syncing) return storeStatus();
  state.syncing = true;
  try {
    const results = await Promise.allSettled(COLLECTIONS.map((name) => listCollection(name)));
    let failures = 0;
    results.forEach((result, index) => {
      const name = COLLECTIONS[index];
      if (result.status === 'fulfilled') {
        cache.set(name, result.value);
        writeFileJson(cacheFile(name), result.value);
      } else {
        failures += 1;
        if (!cache.has(name)) cache.set(name, readFileJson(cacheFile(name), []));
      }
    });

    state.mode = failures === 0 ? 'firebase' : 'degraded';
    state.lastError = failures === 0 ? null : firebaseStatus().lastError;
    state.lastSyncAt = new Date().toISOString();
    for (const key of [...memo.keys()]) memo.delete(key);
  } finally {
    state.ready = true;
    state.syncing = false;
    if (force) {
      for (const key of [...memo.keys()]) memo.delete(key);
    }
  }
  return storeStatus();
};

const fresh = async (name) => {
  const hit = memo.get(name);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.rows;

  if (firebaseConfig.projectId) {
    try {
      const rows = await listCollection(name);
      cache.set(name, rows);
      writeFileJson(cacheFile(name), rows);
      state.mode = 'firebase';
      state.lastError = null;
      memo.set(name, { at: Date.now(), rows });
      return rows;
    } catch (error) {
      state.mode = 'degraded';
      state.lastError = error.message;
      if (!cache.has(name)) cache.set(name, readFileJson(cacheFile(name), []));
    }
  } else if (!cache.has(name)) {
    cache.set(name, readFileJson(cacheFile(name), []));
  }

  const rows = cache.get(name) || [];
  memo.set(name, { at: Date.now(), rows });
  return rows;
};

export const invalidate = (name) => {
  if (name) memo.delete(name);
  else memo.clear();
};

export const all = async (name) => {
  const rows = await fresh(name);
  return rows.slice();
};

export const get = async (name, id) => {
  const rows = await fresh(name);
  return rows.find((row) => row.id === id) || null;
};

const persist = async (name, doc) => {
  const rows = cache.get(name) || (await fresh(name)).slice();
  const index = rows.findIndex((row) => row.id === doc.id);
  if (index >= 0) rows[index] = doc;
  else rows.push(doc);
  cache.set(name, rows);
  memo.set(name, { at: Date.now(), rows });
  writeFileJson(cacheFile(name), rows);
};

export const create = async (name, doc) => {
  const record = { ...doc, id: doc.id || crypto.randomUUID() };
  const now = new Date().toISOString();
  record.createdAt = record.createdAt || now;
  record.updatedAt = now;
  await persist(name, record);

  if (firebaseConfig.projectId) {
    try {
      await setDoc(name, record.id, record, { merge: true });
      state.mode = 'firebase';
      state.lastError = null;
    } catch (error) {
      state.mode = 'degraded';
      state.lastError = error.message;
      pendingWrites.push({ name, id: record.id, at: now, error: error.message });
    }
  }
  return record;
};

export const update = async (name, id, patch) => {
  const existing = await get(name, id);
  if (!existing) return null;
  const record = { ...existing, ...patch, id, updatedAt: new Date().toISOString() };
  await persist(name, record);

  if (firebaseConfig.projectId) {
    try {
      await setDoc(name, id, patch, { merge: true });
      state.mode = 'firebase';
      state.lastError = null;
    } catch (error) {
      state.mode = 'degraded';
      state.lastError = error.message;
      pendingWrites.push({ name, id, at: record.updatedAt, error: error.message });
    }
  }
  return record;
};

export const remove = async (name, id) => {
  const rows = (cache.get(name) || []).filter((row) => row.id !== id);
  cache.set(name, rows);
  memo.set(name, { at: Date.now(), rows });
  writeFileJson(cacheFile(name), rows);

  if (firebaseConfig.projectId) {
    try {
      await deleteDoc(name, id);
      state.mode = 'firebase';
      state.lastError = null;
    } catch (error) {
      state.mode = 'degraded';
      state.lastError = error.message;
    }
  }
  return true;
};

/* --------------------------------- status -------------------------------- */

export const storeStatus = () => ({
  mode: state.mode,
  ready: state.ready,
  lastSyncAt: state.lastSyncAt,
  lastError: state.lastError,
  pendingWrites: pendingWrites.length,
  firebase: firebaseStatus(),
  secrets: secretsConfigured(),
  dataDir: DATA_DIR,
  counts: COLLECTIONS.reduce((acc, name) => {
    acc[name] = (cache.get(name) || readFileJson(cacheFile(name), [])).length;
    return acc;
  }, {}),
});

export { firebaseStatus, firebaseConfig };

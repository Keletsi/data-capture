/**
 * Minimal Firebase layer built on Node's crypto + fetch.
 *
 * - Signs a service-account JWT (RS256) and exchanges it for an OAuth token.
 * - Talks to Firestore over the REST API (no SDK, no dependencies).
 * - Encodes/decodes Firestore's typed JSON so the rest of the app can use
 *   plain JS objects.
 *
 * The service account lives in secrets/serviceAccount.json and is never
 * exposed over HTTP or committed to git.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CANDIDATES = [
  process.env.FIREBASE_SERVICE_ACCOUNT,
  path.join(ROOT, 'secrets', 'serviceAccount.json'),
  'C:/Users/Administrator/Downloads/sales-e3bda-firebase-adminsdk-fbsvc-dc8538b61f.json',
].filter(Boolean);

const SCOPES = [
  'https://www.googleapis.com/auth/datastore',
  'https://www.googleapis.com/auth/cloud-platform',
].join(' ');

const parseServiceAccount = (raw, source) => {
  const attempts = [raw];
  try {
    attempts.push(Buffer.from(raw, 'base64').toString('utf8'));
  } catch {
    /* not base64 - only the raw JSON attempt matters */
  }
  for (const candidate of attempts) {
    try {
      const json = JSON.parse(candidate);
      if (json.client_email && json.private_key) return { account: json, source };
    } catch {
      /* try the next shape */
    }
  }
  return null;
};

const fromEnvironment = (() => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  return parseServiceAccount(raw, 'env:FIREBASE_SERVICE_ACCOUNT_JSON');
})();

const loadServiceAccount = () => {
  if (fromEnvironment) return fromEnvironment;
  for (const candidate of CANDIDATES) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = parseServiceAccount(fs.readFileSync(candidate, 'utf8'), candidate);
      if (parsed) return parsed;
    } catch {
      /* try the next candidate */
    }
  }
  return { account: null, source: null };
};

const { account, source } = loadServiceAccount();

export const firebaseConfig = {
  projectId: account?.project_id || null,
  clientEmail: account?.client_email || null,
  credentialSource: source
    ? String(source).startsWith('env:')
      ? source
      : path.relative(ROOT, source).replace(/\\/g, '/')
    : null,
};

const state = {
  token: null,
  expiresAt: 0,
  lastError: null,
  lastOkAt: null,
  writes: 0,
  reads: 0,
};

const b64url = (value) => Buffer.from(value).toString('base64url');

const signJwt = () => {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: account.private_key_id };
  const payload = {
    iss: account.client_email,
    scope: SCOPES,
    aud: account.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const signature = crypto.createSign('RSA-SHA256').update(unsigned).sign(account.private_key);
  return `${unsigned}.${b64url(signature)}`;
};

export const getAccessToken = async () => {
  if (!account) throw new Error('No Firebase service account found (secrets/serviceAccount.json)');
  if (state.token && Date.now() < state.expiresAt - 60_000) return state.token;

  const res = await fetch(account.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: signJwt(),
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    state.lastError = `auth ${res.status}: ${json.error_description || json.error || 'failed'}`;
    throw new Error(state.lastError);
  }
  state.token = json.access_token;
  state.expiresAt = Date.now() + (Number(json.expires_in) || 3600) * 1000;
  state.lastOkAt = new Date().toISOString();
  return state.token;
};

const BASE = () =>
  `https://firestore.googleapis.com/v1/projects/${account.project_id}/databases/(default)/documents`;

/* ------------------------------ value codec ------------------------------ */

export const encodeValue = (value) => {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  if (typeof value === 'object') {
    const fields = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested === undefined) continue;
      fields[key] = encodeValue(nested);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(value) };
};

export const decodeValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decodeValue);
  if ('mapValue' in value) {
    const out = {};
    for (const [key, nested] of Object.entries(value.mapValue.fields || {})) out[key] = decodeValue(nested);
    return out;
  }
  if ('geoPointValue' in value) return value.geoPointValue;
  return null;
};

export const encodeDoc = (object) => {
  const fields = {};
  for (const [key, value] of Object.entries(object || {})) {
    if (value === undefined) continue;
    fields[key] = encodeValue(value);
  }
  return { fields };
};

export const decodeDoc = (doc) => {
  if (!doc) return null;
  const out = {};
  for (const [key, value] of Object.entries(doc.fields || {})) out[key] = decodeValue(value);
  out.id = String(doc.name || '').split('/').pop();
  if (doc.createTime) out.createdAt = out.createdAt || doc.createTime;
  if (doc.updateTime) out.updatedAt = doc.updateTime;
  return out;
};

/* ------------------------------- requests -------------------------------- */

const request = async (url, options = {}) => {
  const token = await getAccessToken();
  const res = await fetch(url, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    state.lastError = `firestore ${res.status}: ${json?.error?.message || text.slice(0, 200)}`;
    const error = new Error(state.lastError);
    error.status = res.status;
    throw error;
  }
  state.lastOkAt = new Date().toISOString();
  state.lastError = null;
  return json;
};

/* --------------------------------- reads --------------------------------- */

export const listCollection = async (collection, { pageSize = 400 } = {}) => {
  if (!account) throw new Error('Firebase is not configured');
  const docs = [];
  let pageToken = null;
  do {
    const url = new URL(`${BASE()}/${encodeURIComponent(collection)}`);
    url.searchParams.set('pageSize', String(pageSize));
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const json = await request(url.toString());
    state.reads += 1;
    for (const doc of json.documents || []) docs.push(decodeDoc(doc));
    pageToken = json.nextPageToken || null;
  } while (pageToken);
  return docs;
};

export const getDoc = async (collection, id) => {
  if (!account) throw new Error('Firebase is not configured');
  try {
    const json = await request(`${BASE()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`);
    state.reads += 1;
    return decodeDoc(json);
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
};

/* --------------------------------- writes -------------------------------- */

const updateMask = (object) =>
  Object.keys(object)
    .filter((key) => object[key] !== undefined)
    .map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`)
    .join('&');

export const setDoc = async (collection, id, object, { merge = true } = {}) => {
  if (!account) throw new Error('Firebase is not configured');
  const body = encodeDoc(object);
  const mask = merge ? updateMask(object) : '';
  const url = `${BASE()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}${mask ? `?${mask}` : ''}`;
  const json = await request(url, { method: 'PATCH', body: JSON.stringify(body) });
  state.writes += 1;
  return decodeDoc(json);
};

export const deleteDoc = async (collection, id) => {
  if (!account) throw new Error('Firebase is not configured');
  await request(`${BASE()}/${encodeURIComponent(collection)}/${encodeURIComponent(id)}`, { method: 'DELETE' });
  state.writes += 1;
  return true;
};

/* -------------------------------- status --------------------------------- */

export const firebaseStatus = () => ({
  configured: Boolean(account),
  projectId: firebaseConfig.projectId,
  clientEmail: firebaseConfig.clientEmail,
  credentialSource: firebaseConfig.credentialSource,
  lastOkAt: state.lastOkAt,
  lastError: state.lastError,
  reads: state.reads,
  writes: state.writes,
});

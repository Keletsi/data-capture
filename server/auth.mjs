/**
 * Authentication - copied from the current Sales Trail method.
 *
 * - Passwords are scrypt-hashed with a per-user salt.
 * - Sessions are HMAC-SHA256 signed tokens in an HttpOnly cookie (7 days).
 * - The signing key lives in data/session.key (generated on first boot).
 * - Users live in the local `users` collection (data/cache/users.json).
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './store.mjs';
import * as store from './store.mjs';

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const KEY_FILE = path.join(DATA_DIR, 'session.key');

const ADMIN_ROLES = new Set(['admin', 'superadmin']);

/** True for any role with admin-level access (admin or superadmin). */
export const isAdminRole = (role) => ADMIN_ROLES.has(String(role || '').trim().toLowerCase());

/**
 * The developer account. Immutable seed: it is always an admin and cannot be
 * demoted, deactivated or removed through the API. Override with SUPER_ADMIN_EMAIL.
 */
export const SUPER_ADMIN_EMAIL = String(process.env.SUPER_ADMIN_EMAIL || 'thabisokeletsi@gmail.com')
  .trim()
  .toLowerCase();
export const isSuperAdminUser = (user) =>
  isAdminRole(user?.role) && String(user?.email || '').trim().toLowerCase() === SUPER_ADMIN_EMAIL;

const sessionKey = () => {
  try {
    if (fs.existsSync(KEY_FILE)) return fs.readFileSync(KEY_FILE, 'utf8').trim();
  } catch {
    /* create below */
  }
  const key = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
  } catch {
    /* ephemeral key if the disk is read-only */
  }
  return key;
};

const KEY = sessionKey();

export const hashPassword = (password, salt = crypto.randomBytes(16).toString('hex')) => ({
  salt,
  hash: crypto.scryptSync(String(password), salt, 64).toString('hex'),
});

export const verifyPassword = (password, user) => {
  if (!user?.passwordHash || !user?.salt) return false;
  const candidate = crypto.scryptSync(String(password), user.salt, 64);
  const expected = Buffer.from(user.passwordHash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
};

const sign = (payload) => crypto.createHmac('sha256', KEY).update(payload).digest('base64url');

export const issueToken = (user) => {
  const payload = {
    uid: user.id,
    role: user.role,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
};

export const readToken = (token) => {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = sign(body);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
};

export const cookieName = 'sc_session';

export const parseCookies = (header = '') => {
  const out = {};
  for (const part of String(header).split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    out[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return out;
};

export const tokenFromRequest = (req) => {
  const auth = String(req.headers.authorization || '');
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  return parseCookies(req.headers.cookie || '')[cookieName] || null;
};

export const publicUser = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  phone: user.phone || '',
  role: isAdminRole(user.role) ? (String(user.role).trim().toLowerCase() === 'superadmin' ? 'superadmin' : 'admin') : 'rep',
  active: user.active !== false,
  color: user.color || '#f2a8c4',
  createdAt: user.createdAt,
  authProvider: user.authProvider || 'password',
  passwordSet: user.passwordSet !== false,
});

export const currentUser = async (req) => {
  const payload = readToken(tokenFromRequest(req));
  if (!payload) return null;
  const user = await store.get('users', payload.uid);
  if (!user || user.active === false) return null;
  return user;
};

export const requireUser = async (req, res) => {
  const user = await currentUser(req);
  if (!user) {
    res.writeHead(401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Sign in to continue' }));
    return null;
  }
  return user;
};

export const requireAdmin = async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return null;
  if (!isAdminRole(user.role)) {
    res.writeHead(403, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'Admin access required' }));
    return null;
  }
  return user;
};

export const createUser = async ({ name, email, password, role = 'rep', phone = '' }) => {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean.includes('@')) throw new Error('A valid email is required');
  if (String(password || '').length < 8) throw new Error('Password must be at least 8 characters');
  const users = await store.all('users');
  if (users.some((user) => String(user.email).toLowerCase() === clean)) {
    throw new Error('That email already has an account');
  }
  const { salt, hash } = hashPassword(password);
  const palette = ['#f2a8c4', '#f5c76b', '#a78bfa', '#67d8c4', '#f08a8a', '#8ec5ff'];
  return store.create('users', {
    name: String(name || clean.split('@')[0]).trim(),
    email: clean,
    phone: String(phone || '').trim(),
    role: ['admin', 'superadmin'].includes(String(role).trim().toLowerCase()) ? String(role).trim().toLowerCase() : 'rep',
    salt,
    passwordHash: hash,
    active: true,
    color: palette[Math.floor(Math.random() * palette.length)],
  });
};

export const bootstrap = async () => {
  const users = await store.all('users');
  let result = { created: false, superAdminCreated: false, email: null, password: null };

  if (users.length === 0) {
    const email = process.env.ADMIN_EMAIL || 'admin@saloncards.app';
    const password = process.env.ADMIN_PASSWORD || 'salon1234';
    await createUser({ name: 'Salon Desk Admin', email, password, role: 'admin' });
    result = { ...result, created: true, email, password };
  }

  // Ensure the developer super admin exists (idempotent, runs on every boot).
  const all = await store.all('users');
  const superUser = all.find((user) => String(user.email).trim().toLowerCase() === SUPER_ADMIN_EMAIL);
  if (!superUser) {
    const password = process.env.SUPER_ADMIN_PASSWORD || 'trail1234';
    await createUser({ name: 'Thabiso (Dev)', email: SUPER_ADMIN_EMAIL, password, role: 'superadmin' });
    result.superAdminCreated = true;
    result.superAdminEmail = SUPER_ADMIN_EMAIL;
    result.superAdminPassword = password;
  } else if (String(superUser.role).toLowerCase() !== 'superadmin') {
    await store.update('users', superUser.id, { role: 'superadmin' });
    result.superAdminUpgraded = true;
    result.superAdminEmail = SUPER_ADMIN_EMAIL;
  }

  return result;
};

export { SESSION_TTL_SEC };

/**
 * Salon Cards server.
 *
 * - Serves the API (auth + salons + exports) and the built React app.
 * - Auth is the same method as Sales Trail: scrypt passwords, HMAC session
 *   cookies, first-run admin bootstrap and a developer super admin.
 * - Every card is owned by the user who captured it. Reps see their own
 *   cards; admins see the whole desk. Exports respect the same visibility.
 */
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as auth from './auth.mjs';
import * as store from './store.mjs';
import { buildCsv, buildText, exportStamp } from './export.mjs';
import { firebaseWebConfig, lookupIdToken } from './firebase-web.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const STARTED = new Date();
const IS_SERVERLESS = Boolean(process.env.VERCEL);
const SECURE_COOKIE = IS_SERVERLESS || process.env.COOKIE_SECURE === 'true' ? ' Secure;' : '';

const argPort = (() => {
  const index = process.argv.indexOf('--port');
  return index >= 0 ? Number(process.argv[index + 1]) : Number(process.env.PORT || 0);
})();
const PORT = argPort || 5194;
const SESSION_COOKIE = auth.cookieName;

/* -------------------------------- helpers -------------------------------- */

const json = (res, status, body, headers = {}) => {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(body));
};

const text = (value, max = 200) =>
  String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const readBody = (req, limit = 1024 * 1024) =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('Request body is too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const cleanSalon = (body, existing = null) => {
  const salonName = text(body.salonName ?? existing?.salonName, 120);
  const ownerName = text(body.ownerName ?? existing?.ownerName, 120);
  const contactNumber = text(body.contactNumber ?? existing?.contactNumber, 40);
  const email = text(body.email ?? existing?.email, 160).toLowerCase();
  const address = text(body.address ?? existing?.address, 260);
  const notes = text(body.notes ?? existing?.notes, 600);
  const rawMeeting = text(body.meetingAt ?? existing?.meetingAt, 40);
  let meetingAt = '';
  if (rawMeeting) {
    const when = new Date(rawMeeting);
    if (Number.isNaN(when.getTime())) throw new Error('Add a valid meeting date and time');
    meetingAt = when.toISOString();
  }

  if (salonName.length < 2) throw new Error('Add the salon name');
  if (ownerName.length < 2) throw new Error("Add the owner's name");
  if (contactNumber.replace(/\D/g, '').length < 9) throw new Error('Add a valid contact number');
  if (!EMAIL_RE.test(email)) throw new Error('Add a valid email address');
  if (address.length < 5) throw new Error('Add the salon address');

  return { salonName, ownerName, contactNumber, email, address, notes, meetingAt };
};

const canSee = (user, salon) => auth.isAdminRole(user.role) || salon.capturedById === user.id;

const visible = (user, salons) => salons.filter((salon) => canSee(user, salon));

const matchesQuery = (salon, query) => {
  if (!query) return true;
  const haystack = [salon.salonName, salon.ownerName, salon.contactNumber, salon.email, salon.address, salon.notes, salon.capturedBy]
    .join(' ')
    .toLowerCase();
  return haystack.includes(query.toLowerCase());
};

const byNewest = (a, b) => String(b.createdAt).localeCompare(String(a.createdAt));

const scopedSalons = async (user, { q = '', scope = '' } = {}) => {
  const all = await store.all('salons');
  const own = scope === 'mine' ? all.filter((salon) => salon.capturedById === user.id) : visible(user, all);
  return own.filter((salon) => matchesQuery(salon, q)).sort(byNewest);
};

const computeStats = (visibleSalons, allSalons, user) => {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const mine = allSalons.filter((salon) => salon.capturedById === user.id);
  const last = visibleSalons.reduce((latest, salon) => {
    const at = new Date(salon.createdAt).getTime();
    return Number.isNaN(at) || at <= latest ? latest : at;
  }, 0);
  return {
    total: visibleSalons.length,
    mine: mine.length,
    thisWeek: visibleSalons.filter((salon) => new Date(salon.createdAt).getTime() >= weekAgo).length,
    contactable: visibleSalons.filter((salon) => EMAIL_RE.test(salon.email || '') && salon.contactNumber).length,
    meetings: visibleSalons.filter(
      (salon) => salon.meetingAt && new Date(salon.meetingAt).getTime() >= Date.now()
    ).length,
    lastCaptureAt: last ? new Date(last).toISOString() : null,
  };
};

/* ------------------------------ login limits ----------------------------- */

const loginAttempts = new Map();
const rateLimited = (ip) => {
  const entry = loginAttempts.get(ip);
  if (!entry) return false;
  if (Date.now() > entry.resetAt) {
    loginAttempts.delete(ip);
    return false;
  }
  return entry.count >= 12;
};
const noteAttempt = (ip) => {
  const entry = loginAttempts.get(ip) || { count: 0, resetAt: Date.now() + 15 * 60 * 1000 };
  entry.count += 1;
  loginAttempts.set(ip, entry);
};

let bootstrapInfo = { created: false, email: null, password: null };
let lastBootstrap = null;

const googleStatus = () => ({
  enabled: process.env.GOOGLE_SIGNIN_ENABLED === 'true',
  provider: 'google',
  projectId: firebaseWebConfig.projectId,
  note:
    process.env.GOOGLE_SIGNIN_ENABLED === 'true'
      ? 'Google sign-in is enabled.'
      : 'Add your Google provider in Firebase console → Authentication → Sign-in method, then set GOOGLE_SIGNIN_ENABLED=true.',
});

/* -------------------------------- static --------------------------------- */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const serveStatic = (res, pathname) => {
  if (pathname === '/' || pathname === '') pathname = '/index.html';
  const decoded = decodeURIComponent(pathname.split('?')[0]);
  const target = path.normalize(path.join(DIST, decoded));
  if (!target.startsWith(DIST)) {
    res.writeHead(403);
    res.end('Forbidden');
    return true;
  }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(DIST, 'index.html');
  if (!fs.existsSync(file)) return false;
  res.writeHead(200, {
    'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
    'cache-control': file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600',
  });
  fs.createReadStream(file).pipe(res);
  return true;
};

/* -------------------------------- routing -------------------------------- */

let readyPromise = null;

/**
 * Hydrate Firestore and bootstrap accounts once per process. On Vercel the
 * app refuses to run without the runtime secrets so a public deployment never
 * silently falls back to the default local accounts.
 */
const ensureReady = async () => {
  if (!readyPromise) {
    const run = (async () => {
      if (IS_SERVERLESS) {
        const missing = [];
        if (!store.firebaseConfig.projectId) missing.push('FIREBASE_SERVICE_ACCOUNT_JSON');
        if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.trim().length < 32) {
          missing.push('SESSION_SECRET (at least 32 characters)');
        }
        if (missing.length) {
          const error = new Error(
            `This deployment is not configured yet. Add ${missing.join(' and ')} in Vercel → Settings → Environment Variables, then redeploy.`
          );
          error.status = 503;
          throw error;
        }
      }
      const status = await store.hydrate();
      const info = await auth.bootstrap();
      bootstrapInfo = { created: info.created, email: info.email, password: info.password };
      lastBootstrap = info;
      return status;
    })();
    readyPromise = run.catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
};

export const handler = async (req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);
  const method = req.method || 'GET';

  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'same-origin');
  res.setHeader('x-frame-options', 'SAMEORIGIN');

  if (method === 'OPTIONS') {
    res.writeHead(204, { allow: 'GET,POST,PATCH,PUT,DELETE,OPTIONS' });
    res.end();
    return;
  }

  try {
    await ensureReady();

    /* ------------------------------- public ------------------------------ */

    if (pathname === '/api/health') {
      const [salons, users] = await Promise.all([store.all('salons'), store.all('users')]);
      return json(res, 200, {
        ok: true,
        service: 'salon-cards',
        version: '1.0.0',
        uptimeSec: Math.round((Date.now() - STARTED.getTime()) / 1000),
        now: new Date().toISOString(),
        counts: { salons: salons.length, users: users.length },
        secrets: store.secretsConfigured(),
        store: store.storeStatus(),
      });
    }

    if (pathname === '/api/auth/status') {
      const users = await store.all('users');
      return json(res, 200, {
        bootstrapped: users.length > 0,
        firstRun: bootstrapInfo.created,
        firstRunCredentials: bootstrapInfo.created
          ? { email: bootstrapInfo.email, password: bootstrapInfo.password }
          : null,
        mode: 'local',
        google: googleStatus(),
      });
    }

    if (pathname === '/api/auth/login' && method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (rateLimited(ip)) return json(res, 429, { error: 'Too many attempts - try again in a few minutes' });
      const body = await readBody(req);
      const email = text(body.email, 160).toLowerCase();
      const password = String(body.password || '');
      const users = await store.all('users');
      const user = users.find((row) => String(row.email).toLowerCase() === email);
      if (!user || user.active === false || !auth.verifyPassword(password, user)) {
        noteAttempt(ip);
        return json(res, 401, { error: 'Email or password is incorrect' });
      }
      loginAttempts.delete(ip);
      const token = auth.issueToken(user);
      return json(res, 200, { user: auth.publicUser(user) }, {
        'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/;${SECURE_COOKIE} Max-Age=${auth.SESSION_TTL_SEC}`,
      });
    }

    if (pathname === '/api/auth/logout' && method === 'POST') {
      return json(res, 200, { ok: true }, {
        'set-cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/;${SECURE_COOKIE} Max-Age=0`,
      });
    }

    if (pathname === '/api/firebase/web-config') {
      return json(res, 200, { config: firebaseWebConfig, google: googleStatus() });
    }

    if (pathname === '/api/auth/google' && method === 'POST') {
      const ip = req.socket.remoteAddress || 'unknown';
      if (rateLimited(ip)) return json(res, 429, { error: 'Too many attempts - try again in a few minutes' });
      const body = await readBody(req);
      const idToken = String(body.idToken || '').trim();
      if (!idToken) return json(res, 400, { error: 'Missing idToken' });

      let googleUser;
      try {
        googleUser = await lookupIdToken(idToken);
      } catch (error) {
        const code = error?.code || '';
        if (code === 'INVALID_ID_TOKEN' || code === 'TOKEN_EXPIRED') {
          return json(res, 401, { error: 'Google rejected the sign-in token - please try again' });
        }
        return json(res, 502, { error: `Google verification failed (${code || error.message})` });
      }

      // Find the app account for this Google email, or provision one.
      const users = await store.all('users');
      let user = users.find((row) => String(row.email).toLowerCase() === googleUser.email);
      let provisioned = false;

      if (!user) {
        const role = googleUser.email === auth.SUPER_ADMIN_EMAIL ? 'superadmin' : 'rep';
        const { salt, hash } = auth.hashPassword(crypto.randomBytes(24).toString('hex'));
        user = await store.create('users', {
          name: googleUser.name,
          email: googleUser.email,
          phone: '',
          role,
          salt,
          passwordHash: hash,
          passwordSet: false,
          authProvider: 'google',
          googleUid: googleUser.localId,
          photoUrl: googleUser.photoUrl,
          active: true,
          color: role === 'superadmin' ? '#c8a8ff' : '#f2a8c4',
        });
        provisioned = true;
      } else if (user.active === false) {
        return json(res, 403, { error: 'This account has been deactivated - ask the desk admin to re-enable it' });
      } else if (!user.googleUid) {
        await store.update('users', user.id, { googleUid: googleUser.localId, authProvider: user.authProvider || 'google' });
      }

      loginAttempts.delete(ip);
      const token = auth.issueToken(user);
      return json(res, 200, { user: auth.publicUser(user), provisioned }, {
        'set-cookie': `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/;${SECURE_COOKIE} Max-Age=${auth.SESSION_TTL_SEC}`,
      });
    }

    if (pathname === '/api/auth/me') {
      const user = await auth.currentUser(req);
      return json(res, 200, { user: user ? auth.publicUser(user) : null });
    }

    /* ------------------------------ session ------------------------------ */

    if (pathname === '/api/bootstrap') {
      const user = await auth.requireUser(req, res);
      if (!user) return;

      const [allSalons, users] = await Promise.all([store.all('salons'), store.all('users')]);
      const salons = visible(user, allSalons).sort(byNewest);

      return json(res, 200, {
        user: auth.publicUser(user),
        salons,
        stats: computeStats(salons, allSalons, user),
        users: users.map(auth.publicUser),
        secrets: store.secretsConfigured(),
        store: store.storeStatus(),
      });
    }

    if (pathname === '/api/auth/profile' && (method === 'PATCH' || method === 'POST')) {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const patch = {};
      if (body.name !== undefined) patch.name = text(body.name, 80) || user.name;
      if (body.phone !== undefined) patch.phone = text(body.phone, 40);
      if (body.color !== undefined) patch.color = text(body.color, 16);
      const updated = await store.update('users', user.id, patch);
      // Keep the denormalised "captured by" label in sync with a rename.
      if (patch.name) {
        const salons = await store.all('salons');
        for (const salon of salons) {
          if (salon.capturedById === user.id) {
            await store.update('salons', salon.id, { capturedBy: patch.name });
          }
        }
      }
      return json(res, 200, { user: auth.publicUser(updated) });
    }

    if (pathname === '/api/auth/password' && method === 'POST') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      const knownPassword = user.passwordSet !== false;
      if (knownPassword && !auth.verifyPassword(String(body.current || ''), user)) {
        return json(res, 400, { error: 'Current password is incorrect' });
      }
      const next = String(body.next || '');
      if (next.length < 8) return json(res, 400, { error: 'New password must be at least 8 characters' });
      const { salt, hash } = auth.hashPassword(next);
      await store.update('users', user.id, { salt, passwordHash: hash, passwordSet: true });
      return json(res, 200, { ok: true });
    }

    /* -------------------------------- cards ------------------------------ */

    if (pathname === '/api/salons' && method === 'GET') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const q = text(url.searchParams.get('q'), 160);
      const scope = url.searchParams.get('scope') === 'mine' ? 'mine' : '';
      const salons = await scopedSalons(user, { q, scope });
      const allSalons = await store.all('salons');
      return json(res, 200, { items: salons, stats: computeStats(salons, allSalons, user) });
    }

    if (pathname === '/api/salons' && method === 'POST') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const body = await readBody(req);
      try {
        const clean = cleanSalon(body);
        const salon = await store.create('salons', {
          ...clean,
          capturedById: user.id,
          capturedBy: user.name,
        });
        return json(res, 201, { salon });
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
    }

    const salonMatch = /^\/api\/salons\/([\w-]+)$/.exec(pathname);
    if (salonMatch && (method === 'PATCH' || method === 'PUT')) {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const existing = await store.get('salons', salonMatch[1]);
      if (!existing || !canSee(user, existing)) return json(res, 404, { error: 'Card not found' });
      if (existing.capturedById !== user.id && !auth.isAdminRole(user.role)) {
        return json(res, 403, { error: 'You can only edit your own cards' });
      }
      const body = await readBody(req);
      try {
        const clean = cleanSalon(body, existing);
        const updated = await store.update('salons', existing.id, clean);
        return json(res, 200, { salon: updated });
      } catch (error) {
        return json(res, 400, { error: error.message });
      }
    }

    if (salonMatch && method === 'DELETE') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const existing = await store.get('salons', salonMatch[1]);
      if (!existing || !canSee(user, existing)) return json(res, 404, { error: 'Card not found' });
      if (existing.capturedById !== user.id && !auth.isAdminRole(user.role)) {
        return json(res, 403, { error: 'You can only delete your own cards' });
      }
      await store.remove('salons', existing.id);
      return json(res, 200, { ok: true });
    }

    /* ------------------------------- exports ----------------------------- */

    if (pathname === '/api/export.csv' && method === 'GET') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const q = text(url.searchParams.get('q'), 160);
      const scope = url.searchParams.get('scope') === 'mine' ? 'mine' : '';
      const salons = await scopedSalons(user, { q, scope });
      res.writeHead(200, {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="salon-cards-${exportStamp()}.csv"`,
        'cache-control': 'no-store',
      });
      res.end(buildCsv(salons));
      return;
    }

    if (pathname === '/api/export.txt' && method === 'GET') {
      const user = await auth.requireUser(req, res);
      if (!user) return;
      const q = text(url.searchParams.get('q'), 160);
      const scope = url.searchParams.get('scope') === 'mine' ? 'mine' : '';
      const salons = await scopedSalons(user, { q, scope });
      res.writeHead(200, {
        'content-type': 'text/plain; charset=utf-8',
        'content-disposition': `attachment; filename="salon-cards-${exportStamp()}.txt"`,
        'cache-control': 'no-store',
      });
      res.end(buildText(salons));
      return;
    }

    /* ------------------------------- static ------------------------------ */

    if (pathname.startsWith('/api/')) return json(res, 404, { error: 'Not found' });
    if (method === 'GET' && serveStatic(res, pathname)) return;
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[salon-cards]', error);
    return json(res, error.status || 500, {
      error: error.message || 'Server error',
      requestPath: pathname,
      requestQuery: url.search,
    });
  }
};

const server = http.createServer(handler);

/* --------------------------------- start --------------------------------- */

const start = async () => {
  // Firestore is the source of truth; hydrate the local mirror before the
  // bootstrap check so existing accounts/cards are recognised immediately.
  const status = await ensureReady();

  console.log('\n  Salon Cards');
  console.log('  -----------');
  console.log(`  Store mode: ${status.mode}${status.firebase.projectId ? ` (Firebase ${status.firebase.projectId})` : ''}`);
  if (status.lastError) console.log(`  Firebase note: ${status.lastError}`);
  const info = lastBootstrap || {};
  if (info.created) {
    console.log(`  First-run admin: ${info.email} / ${info.password}`);
  }
  if (info.superAdminCreated) {
    console.log(`  Super admin:     ${info.superAdminEmail} / ${info.superAdminPassword}`);
  }
  console.log(`  API   http://localhost:${PORT}/api/health`);
  console.log(`  App   http://localhost:${PORT}  (production build)\n`);

  server.listen(PORT, () => {
    console.log(`  Listening on http://localhost:${PORT}`);
  });
};

const isCli = (() => {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return path.resolve(entry) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isCli) void start();

/** Typed client for the Salon Cards server. All requests send cookies. */
import type {
  AuthStatus,
  BootstrapPayload,
  GoogleStatus,
  HealthPayload,
  PublicUser,
  Salon,
  SalonInput,
  Stats,
} from './types';

const BASE = '';

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: {
        ...(init?.body ? { 'content-type': 'application/json' } : {}),
        ...(init?.headers || {}),
      },
    });
  } catch (error) {
    throw new Error(
      `Cannot reach the Salon Cards server. Is it running on port 5194/5195? (${
        error instanceof Error ? error.message : String(error)
      })`
    );
  }
  const raw = await res.text();
  let body: unknown = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = raw;
  }
  if (!res.ok) {
    const message =
      body && typeof body === 'object' && 'error' in body
        ? String((body as { error: unknown }).error)
        : `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return body as T;
};

const fetchText = async (path: string): Promise<string> => {
  const res = await fetch(`${BASE}${path}`, { credentials: 'same-origin' });
  const raw = await res.text();
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const parsed = JSON.parse(raw);
      if (parsed?.error) message = String(parsed.error);
    } catch {
      /* plain text error */
    }
    throw new Error(message);
  }
  return raw;
};

export interface LoginResult {
  user: PublicUser;
}

export type Scope = 'all' | 'mine';

const queryString = (q: string, scope: Scope) => {
  const params = new URLSearchParams();
  if (q.trim()) params.set('q', q.trim());
  if (scope === 'mine') params.set('scope', 'mine');
  const value = params.toString();
  return value ? `?${value}` : '';
};

export const api = {
  health: () => request<HealthPayload>('/api/health'),

  authStatus: () => request<AuthStatus>('/api/auth/status'),

  login: (email: string, password: string) =>
    request<LoginResult>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  firebaseWebConfig: () =>
    request<{
      config: {
        projectId: string;
        appId: string;
        apiKey: string;
        authDomain: string;
        storageBucket: string;
        messagingSenderId: string;
      };
      google: GoogleStatus;
    }>('/api/firebase/web-config'),

  loginWithGoogle: (idToken: string) =>
    request<{ user: PublicUser; provisioned: boolean }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ idToken }),
    }),

  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: PublicUser | null }>('/api/auth/me'),

  updateProfile: (patch: Partial<Pick<PublicUser, 'name' | 'phone' | 'color'>>) =>
    request<{ user: PublicUser }>('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(patch) }),

  changePassword: (current: string, next: string) =>
    request<{ ok: boolean }>('/api/auth/password', { method: 'POST', body: JSON.stringify({ current, next }) }),

  bootstrap: () => request<BootstrapPayload>('/api/bootstrap'),

  salons: (q = '', scope: Scope = 'all') =>
    request<{ items: Salon[]; stats: Stats }>(`/api/salons${queryString(q, scope)}`),

  createSalon: (input: SalonInput) =>
    request<{ salon: Salon }>('/api/salons', { method: 'POST', body: JSON.stringify(input) }),

  updateSalon: (id: string, input: Partial<SalonInput>) =>
    request<{ salon: Salon }>(`/api/salons/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    }),

  deleteSalon: (id: string) =>
    request<{ ok: boolean }>(`/api/salons/${encodeURIComponent(id)}`, { method: 'DELETE' }),

  exportText: (q = '', scope: Scope = 'all') => fetchText(exportUrl('txt', q, scope)),
};

export const exportUrl = (kind: 'csv' | 'txt', q = '', scope: Scope = 'all') =>
  `/api/export.${kind}${queryString(q, scope)}`;

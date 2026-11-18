import { useEffect, useState, type FormEvent } from 'react';
import { AlertTriangle, ArrowRight, Database, FileSpreadsheet, IdCard, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import type { AuthStatus } from '../api/types';
import { useAppStore } from '../store/appStore';
import { Logo } from './ui';

export const Login = () => {
  const { login, loginWithGoogle, loginError } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<AuthStatus | null>(null);

  useEffect(() => {
    void api.authStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-shell">
      <div className="login-grid">
        <div className="login-side">
          <div className="row" style={{ gap: 12 }}>
            <Logo size={52} />
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>Salon Cards</div>
              <div className="brand-sub">Capture · Card · Send</div>
            </div>
          </div>

          <h1 className="login-headline">
            One salon.
            <br />
            <span className="grad-text">One card.</span>
            <br />
            <span style={{ color: 'var(--gold)' }}>Ready to send.</span>
          </h1>
          <p className="login-copy">
            Capture the salon name, owner, contact number, email and address in one pass. Every entry becomes a card
            saved to your profile — then send it as a text block or a spreadsheet.
          </p>

          <div className="login-features">
            <div className="login-feature">
              <div className="login-feature-icon"><IdCard size={16} /></div>
              <div><b>Five fields, one card.</b><br />Salon, owner, phone, email and address — validated and stored against your account.</div>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon"><FileSpreadsheet size={16} /></div>
              <div><b>Send it your way.</b><br />Copy a card as text, copy the whole set, or download a CSV that opens straight in Excel or Sheets.</div>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon"><Database size={16} /></div>
              <div><b>Saved on Firebase.</b><br />Accounts and cards persist to Firestore through the server, with a local mirror if the network drops.</div>
            </div>
            <div className="login-feature">
              <div className="login-feature-icon"><ShieldCheck size={16} /></div>
              <div><b>Same auth as Sales Trail.</b><br />Scrypt-hashed passwords, HMAC-signed session cookies and a 7-day HttpOnly session.</div>
            </div>
          </div>

          <div className="login-foot">
            <ArrowRight size={13} /> Your cards stay private to your login; admins can see the whole desk.
          </div>
        </div>

        <form className="login-form-col" onSubmit={submit}>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Sign in</div>
          <p style={{ color: 'var(--muted)', fontSize: 12, margin: '4px 0 18px', lineHeight: 1.6 }}>
            Use the same account style as the rest of the desk. New users are created by an admin.
          </p>

          {status && !status.bootstrapped && (
            <div className="login-demo">
              <b>First-run setup.</b><br />
              The server is creating the first admin. Refresh in a few seconds and check the server console for the
              credentials.
            </div>
          )}
          {status?.firstRun && status.firstRunCredentials && (
            <div className="login-demo">
              <b>First-run admin created.</b><br />
              Email: <code>{status.firstRunCredentials.email}</code><br />
              Password: <code>{status.firstRunCredentials.password}</code><br />
              Change it under Profile → Security after signing in.
            </div>
          )}

          {loginError && (
            <div className="login-error">
              <AlertTriangle size={15} style={{ flex: '0 0 auto' }} />
              <span>{loginError}</span>
            </div>
          )}

          <label className="field-label" htmlFor="email">Email</label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="email"
            placeholder="you@company.co.za"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />

          <div style={{ height: 12 }} />

          <label className="field-label" htmlFor="password">Password</label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete="current-password"
            placeholder="••••••••"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          <button className="btn" type="submit" disabled={busy} style={{ marginTop: 18, justifyContent: 'center', height: 44, fontSize: 13 }}>
            {busy ? <span className="spinner" /> : null}
            {busy ? 'Signing in…' : 'Sign in to Salon Cards'}
          </button>

          <div className="login-divider">
            <span>or</span>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void loginWithGoogle().finally(() => setBusy(false));
            }}
            style={{ justifyContent: 'center', height: 44, fontSize: 12.5 }}
          >
            <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.5 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.6-.4-3.9z" />
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.9 18.9 12 24 12c3.1 0 5.9 1.2 8 3l5.7-5.7C34.3 6.1 29.5 4 24 4 16.1 4 9.3 8.4 6.3 14.7z" />
              <path fill="#4CAF50" d="M24 44c5.4 0 10.3-2.1 14-5.4l-6.5-5.5C29.6 34.7 27 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.2 39.6 16.1 44 24 44z" />
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3c-.8 2.4-2.4 4.5-4.4 6.1l6.5 5.5C37 39.4 44 34 44 24c0-1.3-.1-2.6-.4-3.9z" />
            </svg>
            Continue with Google
          </button>

          {status?.google && !status.google.enabled ? (
            <div className="faint" style={{ fontSize: 9.5, marginTop: 8, lineHeight: 1.6 }}>
              The Google button is wired; enable the Google provider in Firebase Authentication and set
              GOOGLE_SIGNIN_ENABLED=true on the server to advertise it.
            </div>
          ) : null}

          <div style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 14, lineHeight: 1.7 }}>
            Sessions are HttpOnly cookies valid for 7 days; passwords are scrypt-hashed. Salon records are written to
            Firestore by the local server — the browser never sees the service account.
          </div>
        </form>
      </div>
    </div>
  );
};

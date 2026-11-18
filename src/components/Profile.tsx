import { useState, type FormEvent } from 'react';
import { Check, Database, KeyRound, LogOut, Save, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import { KPI, formatDate, initials, isAdminUser, roleLabel } from './ui';

const COLORS = ['#f2a8c4', '#f5c76b', '#a78bfa', '#67d8c4', '#f08a8a', '#8ec5ff'];

export const Profile = () => {
  const { user, stats, store, secrets, updateProfile, showToast, logout } = useAppStore();
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [color, setColor] = useState(user?.color || COLORS[0]);
  const [saving, setSaving] = useState(false);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [changing, setChanging] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    try {
      await updateProfile({ name, phone, color });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (changing) return;
    setPasswordError(null);
    if (next.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setChanging(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      showToast('Password changed');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : String(error));
    } finally {
      setChanging(false);
    }
  };

  return (
    <div className="view-enter">
      <div className="section-head">
        <div>
          <h1>Your profile</h1>
          <p>Cards are saved against this account. Keep your details current so hand-offs carry the right name.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>
          <LogOut size={13} /> Sign out
        </button>
      </div>

      <section className="profile-hero card">
        <span className="profile-avatar" style={{ background: color }}>{initials(user?.name || '')}</span>
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <b style={{ fontSize: 19, letterSpacing: '-0.02em' }}>{user?.name}</b>
            <span className="chip orange">{roleLabel(user?.role)}</span>
            {isAdminUser(user) ? <span className="chip cyan">whole desk</span> : null}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{user?.email}</div>
          <div className="faint" style={{ fontSize: 10.5, marginTop: 4 }}>
            Member since {formatDate(user?.createdAt)} · {stats.mine} card{stats.mine === 1 ? '' : 's'} captured
          </div>
        </div>
        <div className="kpi-mini">
          <KPI label="Your cards" value={stats.mine} tone="rose" />
          <KPI label="This week" value={stats.thisWeek} tone="gold" />
        </div>
      </section>

      <div className="settings-grid">
        <form className="card" onSubmit={save}>
          <h2 className="card-title"><Save size={13} /> Profile details</h2>
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="profileName">Name</label>
              <input id="profileName" className="field" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div>
              <label className="field-label" htmlFor="profileEmail">Email (login)</label>
              <input id="profileEmail" className="field" value={user?.email || ''} disabled />
            </div>
            <div className="span-2">
              <label className="field-label" htmlFor="profilePhone">Phone</label>
              <input
                id="profilePhone"
                className="field"
                type="tel"
                placeholder="082 555 0000"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </div>
            <div className="span-2">
              <span className="field-label">Avatar colour</span>
              <div className="swatches">
                {COLORS.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    className={`swatch ${color === swatch ? 'active' : ''}`}
                    style={{ background: swatch }}
                    onClick={() => setColor(swatch)}
                    aria-label={`Use ${swatch}`}
                  >
                    {color === swatch ? <Check size={12} /> : null}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="row between" style={{ marginTop: 16 }}>
            <span className="faint" style={{ fontSize: 10.5 }}>Renaming updates the “captured by” label on your cards.</span>
            <button className="btn btn-sm" type="submit" disabled={saving}>
              {saving ? <span className="spinner" /> : <Save size={13} />} {saving ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </form>

        <form className="card" onSubmit={changePassword}>
          <h2 className="card-title"><KeyRound size={13} /> Security</h2>
          {passwordError ? <div className="inline-error">{passwordError}</div> : null}
          <label className="field-label" htmlFor="currentPassword">Current password</label>
          <input
            id="currentPassword"
            className="field"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(event) => setCurrent(event.target.value)}
            required
          />
          <div style={{ height: 10 }} />
          <label className="field-label" htmlFor="nextPassword">New password</label>
          <input
            id="nextPassword"
            className="field"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            required
          />
          <div style={{ height: 10 }} />
          <label className="field-label" htmlFor="confirmPassword">Confirm new password</label>
          <input
            id="confirmPassword"
            className="field"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            required
          />
          <button className="btn btn-sm" type="submit" disabled={changing} style={{ marginTop: 14 }}>
            {changing ? <span className="spinner" /> : <ShieldCheck size={13} />} {changing ? 'Changing…' : 'Change password'}
          </button>
          <p className="faint" style={{ fontSize: 10, marginTop: 10, lineHeight: 1.6 }}>
            Same method as Sales Trail: scrypt hash, per-user salt, 7-day HMAC session cookie.
          </p>
        </form>

        <section className="card span-full">
          <h2 className="card-title"><Database size={13} /> Data &amp; persistence</h2>
          <div className="setting-row">
            <div>
              <b>Storage mode</b>
              <small>Firestore is the source of truth; a local cache mirrors it when the network drops.</small>
            </div>
            <span className={`chip ${store?.mode === 'firebase' ? 'green' : store?.mode === 'degraded' ? 'gold' : 'red'}`}>
              {store?.mode || 'local'}
            </span>
          </div>
          <div className="setting-row">
            <div>
              <b>Firebase project</b>
              <small>{store?.firebase.lastError || 'Service account credentials stay on the server.'}</small>
            </div>
            <span className="chip">{store?.firebase.projectId || 'not configured'}</span>
          </div>
          <div className="setting-row">
            <div>
              <b>Last sync</b>
              <small>{store?.pendingWrites ? `${store.pendingWrites} write(s) pending` : 'All changes written through'}</small>
            </div>
            <span className="chip">{store?.lastSyncAt ? formatDate(store.lastSyncAt) : 'not synced yet'}</span>
          </div>
          <div className="setting-row">
            <div>
              <b>secrets.json</b>
              <small>Copied from the current app. SMTP is only reported here; this app exports rather than emails.</small>
            </div>
            <span className={`chip ${secrets.smtp ? 'green' : ''}`}>{secrets.smtp ? 'SMTP configured' : 'no SMTP'}</span>
          </div>
        </section>
      </div>
    </div>
  );
};

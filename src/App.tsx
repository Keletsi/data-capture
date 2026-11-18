import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from './api/client';
import { Dashboard } from './components/Dashboard';
import { Login } from './components/Login';
import { Profile } from './components/Profile';
import { SalonForm } from './components/SalonForm';
import { TopBar } from './components/TopBar';
import { Logo } from './components/ui';
import { useAppStore } from './store/appStore';
import type { Salon } from './api/types';

const App = () => {
  const { user, authChecked, ready, initError, init, view, logout, toast } = useAppStore();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Salon | null>(null);
  const initedFor = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { user: sessionUser } = await api.me();
        if (!cancelled && sessionUser) useAppStore.setState({ user: sessionUser });
      } catch {
        /* the login screen surfaces the connection problem on attempt */
      } finally {
        if (!cancelled) useAppStore.setState({ authChecked: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user && initedFor.current !== user.id) {
      initedFor.current = user.id;
      void init();
    }
    if (!user) initedFor.current = null;
  }, [user, init]);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  if (!authChecked) {
    return (
      <div className="splash">
        <Logo size={54} />
        <span className="spinner" />
      </div>
    );
  }

  if (!user) return <Login />;

  return (
    <div className="app-shell">
      <TopBar onNew={openNew} />
      <main className="content">
        {!ready && initError ? (
          <div className="card error-card">
            <AlertTriangle size={20} style={{ color: 'var(--red)' }} />
            <h2>Could not load your cards</h2>
            <p>{initError}</p>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-sm" onClick={() => void init()}>
                <RefreshCw size={13} /> Retry
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => void logout()}>Sign out</button>
            </div>
          </div>
        ) : !ready ? (
          <div className="splash-inline">
            <span className="spinner" />
            <span>Loading your desk…</span>
          </div>
        ) : view === 'profile' ? (
          <Profile />
        ) : (
          <Dashboard
            onNew={openNew}
            onEdit={(salon) => {
              setEditing(salon);
              setFormOpen(true);
            }}
          />
        )}
      </main>

      {formOpen ? (
        <SalonForm
          salon={editing}
          onClose={() => {
            setFormOpen(false);
            setEditing(null);
          }}
        />
      ) : null}

      {toast ? <div className="toast">{toast}</div> : null}
    </div>
  );
};

export default App;

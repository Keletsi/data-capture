import { IdCard, LogOut, Plus, UserRound } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import { initials, isAdminUser, roleLabel } from './ui';

export const TopBar = ({ onNew }: { onNew: () => void }) => {
  const { user, view, setView, logout } = useAppStore();

  return (
    <header className="topbar">
      <div className="topbar-brand">
        <span className="topbar-mark"><IdCard size={16} /></span>
        <div>
          <b>Salon Cards</b>
          <span>{isAdminUser(user) ? 'Whole desk' : 'Your capture book'}</span>
        </div>
      </div>

      <nav className="topnav">
        <button className={view === 'cards' ? 'active' : ''} onClick={() => setView('cards')}>
          Cards
        </button>
        <button className={view === 'profile' ? 'active' : ''} onClick={() => setView('profile')}>
          <UserRound size={13} /> Profile
        </button>
      </nav>

      <div className="spacer" />

      <button className="btn btn-sm" onClick={onNew}>
        <Plus size={14} /> New salon
      </button>

      <button className="user-chip" onClick={() => setView('profile')} title="Open your profile">
        <span className="avatar-dot" style={{ background: user?.color || 'var(--accent)' }}>
          {initials(user?.name || '')}
        </span>
        <span className="uc-text">
          <span className="uc-name">{user?.name}</span>
          <span className="uc-role">{roleLabel(user?.role)}</span>
        </span>
      </button>

      <button className="icon-btn sm" onClick={() => void logout()} title="Sign out" aria-label="Sign out">
        <LogOut size={14} />
      </button>
    </header>
  );
};

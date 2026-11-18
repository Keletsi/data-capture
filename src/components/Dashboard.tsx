import { useMemo, useState } from 'react';
import {
  ClipboardCopy,
  Download,
  FileSpreadsheet,
  FileText,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import { api, exportUrl, type Scope } from '../api/client';
import { cardText, salonInitials } from '../lib/cardText';
import { useAppStore } from '../store/appStore';
import type { Salon } from '../api/types';
import { SalonCard } from './SalonCard';
import { EmptyState, KPI, isAdminUser } from './ui';

export const Dashboard = ({
  onNew,
  onEdit,
}: {
  onNew: () => void;
  onEdit: (salon: Salon) => void;
}) => {
  const { user, salons, stats, showToast, deleteSalon } = useAppStore();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>(isAdminUser(user) ? 'all' : 'mine');
  const [copying, setCopying] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return salons
      .filter((salon) => (scope === 'mine' ? salon.capturedById === user?.id : true))
      .filter((salon) => {
        if (!needle) return true;
        return [salon.salonName, salon.ownerName, salon.contactNumber, salon.email, salon.address, salon.notes, salon.capturedBy]
          .join(' ')
          .toLowerCase()
          .includes(needle);
      });
  }, [salons, query, scope, user?.id]);

  const copyAll = async () => {
    if (copying) return;
    setCopying(true);
    try {
      const text = filtered.length ? filtered.map(cardText).join('\n\n----------------------------------------\n\n') : await api.exportText(query, scope);
      if (!text.trim()) {
        showToast('There are no cards to copy yet');
        return;
      }
      try {
        await navigator.clipboard.writeText(text);
        showToast(`${filtered.length || 'All'} card${filtered.length === 1 ? '' : 's'} copied as text`);
      } catch {
        window.prompt('Copy these cards', text);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error));
    } finally {
      setCopying(false);
    }
  };

  return (
    <div className="view-enter">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={12} /> Capture desk</span>
          <h1>Salons worth a follow-up.</h1>
          <p>
            Capture the five essentials once. Each salon becomes a card saved to your profile, ready to hand over as
            text or a spreadsheet.
          </p>
          <div className="row wrap" style={{ gap: 8 }}>
            <button className="btn" onClick={onNew}><Plus size={14} /> Capture a salon</button>
            <span className="hero-note">{stats.total} visible · {stats.contactable} ready to send</span>
          </div>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-card">
            <div className="orbit-avatar">{salonInitials(filtered[0]?.salonName || 'Salon Card')}</div>
            <div>
              <b>{filtered[0]?.salonName || 'Your first card'}</b>
              <span>{filtered[0]?.ownerName || 'Owner name'}</span>
              <small>{filtered[0]?.contactNumber || 'Contact number'}</small>
            </div>
          </div>
        </div>
      </section>

      <section className="kpi-grid">
        <KPI label="Visible cards" value={stats.total} foot="Your access scope" tone="rose" />
        <KPI label="Captured by you" value={stats.mine} foot="On your profile" tone="gold" />
        <KPI label="Added this week" value={stats.thisWeek} foot="Last 7 days" tone="violet" />
        <KPI label="Meetings booked" value={stats.meetings} foot="Upcoming, from the form" tone="gold" />
        <KPI label="Ready to send" value={stats.contactable} foot="Phone + email present" tone="mint" />
      </section>

      <section className="toolbar card-flat">
        <div className="search-wrap">
          <Search size={14} />
          <input
            className="field"
            placeholder="Search salon, owner, phone, email, address…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>

        {isAdminUser(user) ? (
          <div className="segmented" role="group" aria-label="Card scope">
            <button className={scope === 'all' ? 'active' : ''} onClick={() => setScope('all')}>
              <Users size={12} /> All cards
            </button>
            <button className={scope === 'mine' ? 'active' : ''} onClick={() => setScope('mine')}>
              Mine
            </button>
          </div>
        ) : null}

        <div className="toolbar-exports">
          <button className="btn btn-ghost btn-sm" onClick={() => void copyAll()} disabled={copying}>
            <ClipboardCopy size={13} /> {copying ? 'Copying…' : 'Copy text'}
          </button>
          <a className="btn btn-ghost btn-sm" href={exportUrl('txt', query, scope)} download>
            <FileText size={13} /> .txt
          </a>
          <a className="btn btn-cyan btn-sm" href={exportUrl('csv', query, scope)} download>
            <FileSpreadsheet size={13} /> Spreadsheet
          </a>
        </div>
      </section>

      <div className="list-head">
        <div>
          <b>{filtered.length} card{filtered.length === 1 ? '' : 's'}</b>
          <span>{query ? ` matching “${query}”` : ' · newest first'}</span>
        </div>
        <span className="faint" style={{ fontSize: 10 }}>
          <Download size={11} style={{ verticalAlign: -1 }} /> exports follow the current search and scope
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={salons.length ? 'No cards match that search' : 'No salons captured yet'}
            hint={salons.length ? 'Try a different name, owner, number or address.' : 'Capture the salon name, owner, contact number, email and address to create your first card.'}
            icon={<Plus size={22} style={{ color: 'var(--accent)', marginBottom: 8 }} />}
          />
        </div>
      ) : (
        <section className="cards-grid">
          {filtered.map((salon) => (
            <SalonCard
              key={salon.id}
              salon={salon}
              isMine={salon.capturedById === user?.id}
              onEdit={() => onEdit(salon)}
              onDelete={() => {
                if (window.confirm(`Delete the card for ${salon.salonName}? This also removes it from Firebase.`)) {
                  void deleteSalon(salon.id);
                }
              }}
            />
          ))}
        </section>
      )}
    </div>
  );
};

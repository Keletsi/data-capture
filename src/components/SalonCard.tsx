import { Mail, MapPin, Pencil, Phone, Trash2, UserRound } from 'lucide-react';
import type { Salon } from '../api/types';
import { cardText, salonInitials } from '../lib/cardText';
import { CopyButton, formatDay } from './ui';

const mapsUrl = (address: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

export const SalonCard = ({
  salon,
  isMine,
  onEdit,
  onDelete,
}: {
  salon: Salon;
  isMine: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <article className="salon-card">
    <header className="salon-head">
      <span className="salon-avatar" style={{ background: isMine ? 'var(--accent-grad)' : 'var(--panel-soft)' }}>
        {salonInitials(salon.salonName)}
      </span>
      <div className="salon-title">
        <b>{salon.salonName}</b>
        <span>{isMine ? 'On your profile' : `Captured by ${salon.capturedBy}`}</span>
      </div>
      <span className="chip">{formatDay(salon.createdAt)}</span>
    </header>

    <dl className="salon-details">
      <div>
        <dt><UserRound size={13} /> Owner</dt>
        <dd>{salon.ownerName}</dd>
      </div>
      <div>
        <dt><Phone size={13} /> Contact</dt>
        <dd><a href={`tel:${salon.contactNumber.replace(/\s+/g, '')}`}>{salon.contactNumber}</a></dd>
      </div>
      <div>
        <dt><Mail size={13} /> Email</dt>
        <dd><a href={`mailto:${salon.email}`}>{salon.email}</a></dd>
      </div>
      <div>
        <dt><MapPin size={13} /> Address</dt>
        <dd><a href={mapsUrl(salon.address)} target="_blank" rel="noreferrer">{salon.address}</a></dd>
      </div>
    </dl>

    {salon.notes ? <p className="salon-notes">{salon.notes}</p> : null}

    <footer className="salon-foot">
      <span className="faint">by {salon.capturedBy}</span>
      <div className="row" style={{ gap: 6 }}>
        <CopyButton value={cardText(salon)} label="Copy card" className="btn btn-ghost btn-xs" />
        <button className="icon-btn sm" onClick={onEdit} title="Edit card" aria-label="Edit card">
          <Pencil size={13} />
        </button>
        <button className="icon-btn sm danger" onClick={onDelete} title="Delete card" aria-label="Delete card">
          <Trash2 size={13} />
        </button>
      </div>
    </footer>
  </article>
);

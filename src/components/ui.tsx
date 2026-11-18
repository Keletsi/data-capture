/** Presentational atoms shared across views. */
import { useEffect, useState, type ReactNode } from 'react';
import { Check, Copy, X } from 'lucide-react';
import type { PublicUser } from '../api/types';

export const isAdminUser = (user: PublicUser | null | undefined) =>
  user?.role === 'admin' || user?.role === 'superadmin';

export const roleLabel = (role: string | null | undefined) =>
  role === 'superadmin' ? 'Super admin' : role === 'admin' ? 'Desk admin' : 'Capturer';

export const formatDate = (iso: string | null | undefined) => {
  if (!iso) return 'not yet';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
};

export const formatDay = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return String(iso);
  return date.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'SC';

export const Logo = ({ size = 40 }: { size?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 40 40"
    fill="none"
    role="img"
    aria-label="Salon Cards logo"
    className="logo-mark"
  >
    <rect width="40" height="40" rx="11" fill="#1d1420" />
    <rect x="0.5" y="0.5" width="39" height="39" rx="10.5" stroke="#f0a6c3" strokeOpacity="0.65" />
    <circle cx="14.5" cy="14.5" r="3.1" stroke="#f0a6c3" strokeWidth="2" />
    <circle cx="25.5" cy="14.5" r="3.1" stroke="#f0a6c3" strokeWidth="2" />
    <path
      d="M10.5 24.5 L14 26 L17 23 M23 23 L26 26 L29.5 24.5"
      stroke="#f5c76b"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M20 8.5 V31.5" stroke="#f0a6c3" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.8" />
    <path d="M17 31.5 H23" stroke="#f0a6c3" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const CopyButton = ({ value, label = 'Copy', className = 'btn btn-ghost btn-sm' }: { value: string; label?: string; className?: string }) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1600);
        } catch {
          window.prompt('Copy this', value);
        }
      }}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : label}
    </button>
  );
};

export const Modal = ({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="row between" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontSize: 17 }}>{title}</h2>
          <button className="icon-btn sm" onClick={onClose} aria-label="Close">
            <X size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

export const KPI = ({
  label,
  value,
  foot,
  tone,
}: {
  label: string;
  value: ReactNode;
  foot?: string;
  tone?: 'rose' | 'gold' | 'mint' | 'violet';
}) => (
  <div className={`kpi ${tone ? `kpi-${tone}` : ''}`}>
    <div className="kpi-label">{label}</div>
    <div className="kpi-value">{value}</div>
    {foot ? <div className="kpi-foot">{foot}</div> : null}
  </div>
);

export const EmptyState = ({ title, hint, icon }: { title: string; hint?: string; icon?: ReactNode }) => (
  <div className="empty">
    {icon}
    <p style={{ fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>{title}</p>
    {hint ? <p style={{ fontSize: 12, margin: 0 }}>{hint}</p> : null}
  </div>
);

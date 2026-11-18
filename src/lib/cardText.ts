import type { Salon } from '../api/types';

const isoDay = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

export const dateTimeLabel = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
};

/** The same text block the server exports, so per-card copy is instant. */
export const cardText = (salon: Salon) => {
  const lines = [
    salon.salonName,
    `Owner: ${salon.ownerName}`,
    `Contact: ${salon.contactNumber}`,
    `Email: ${salon.email}`,
    `Address: ${salon.address}`,
  ];
  if (salon.meetingAt) lines.push(`Meeting: ${dateTimeLabel(salon.meetingAt)}`);
  if (salon.notes) lines.push(`Notes: ${salon.notes}`);
  lines.push(`Captured by: ${salon.capturedBy || 'Unknown'} on ${isoDay(salon.createdAt)}`);
  return lines.join('\n');
};

export const salonInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || 'SC';

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
  const lines = [salon.salonName || 'Untitled salon'];
  if (salon.ownerName) lines.push(`Owner: ${salon.ownerName}`);
  if (salon.contactNumber) lines.push(`Contact: ${salon.contactNumber}`);
  if (salon.email) lines.push(`Email: ${salon.email}`);
  if (salon.address) lines.push(`Address: ${salon.address}`);
  if (salon.interest) lines.push(`Interest: ${salon.interest}`);
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

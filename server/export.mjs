/** Text and spreadsheet exports for salon cards. */

const isoDay = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
};

const dateTimeLabel = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
};

export const csvEscape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const CARD_HEADER = [
  'Salon Name',
  'Owner Name',
  'Contact Number',
  'Email',
  'Address',
  'Interest',
  'Meeting',
  'Notes',
  'Captured By',
  'Captured At',
];

/** A single salon as a plain-text block, ready to paste into WhatsApp/email. */
export const cardText = (salon) => {
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

const SEPARATOR = '\n\n----------------------------------------\n\n';

export const buildText = (salons) => salons.map(cardText).join(SEPARATOR);

export const buildCsv = (salons) => {
  const lines = [CARD_HEADER.map(csvEscape).join(',')];
  for (const salon of salons) {
    lines.push(
      [
        salon.salonName,
        salon.ownerName,
        salon.contactNumber,
        salon.email,
        salon.address,
        salon.interest || '',
        dateTimeLabel(salon.meetingAt),
        salon.notes || '',
        salon.capturedBy || '',
        isoDay(salon.createdAt),
      ]
        .map(csvEscape)
        .join(',')
    );
  }
  // The BOM keeps Excel happy with UTF-8 names.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
};

export const exportStamp = () => isoDay(new Date().toISOString());

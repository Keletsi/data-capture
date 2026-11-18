import { useState, type FormEvent } from 'react';
import { AlertTriangle, Save } from 'lucide-react';
import { useAppStore } from '../store/appStore';
import type { Salon, SalonInput } from '../api/types';
import { Modal } from './ui';

const EMPTY: SalonInput = {
  salonName: '',
  ownerName: '',
  contactNumber: '',
  email: '',
  address: '',
  interest: '',
  notes: '',
  meetingAt: '',
};

const pad = (value: number) => String(value).padStart(2, '0');

const toLocalInput = (iso?: string) => {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const SalonForm = ({ salon, onClose }: { salon: Salon | null; onClose: () => void }) => {
  const { createSalon, updateSalon } = useAppStore();
  const [form, setForm] = useState<SalonInput>(
    salon
      ? {
          salonName: salon.salonName,
          ownerName: salon.ownerName,
          contactNumber: salon.contactNumber,
          email: salon.email,
          address: salon.address,
          interest: salon.interest || '',
          notes: salon.notes || '',
          meetingAt: toLocalInput(salon.meetingAt),
        }
      : EMPTY
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: keyof SalonInput) => (value: string) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const payload: SalonInput = {
        ...form,
        meetingAt: form.meetingAt ? new Date(form.meetingAt).toISOString() : '',
      };
      const saved = salon ? await updateSalon(salon.id, payload) : await createSalon(payload);
      if (saved) onClose();
      else setError('Could not save the card — check the details and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={salon ? `Edit ${salon.salonName}` : 'Capture a salon'} onClose={onClose}>
      <form onSubmit={submit}>
        <p className="modal-hint">
          Only the salon name is needed. Fill in whatever the owner shares — empty fields simply stay blank on the
          card and in the spreadsheet.
        </p>

        {error ? (
          <div className="login-error" style={{ margin: '0 0 14px' }}>
            <AlertTriangle size={15} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className="form-grid">
          <div>
            <label className="field-label" htmlFor="salonName">Salon name</label>
            <input
              id="salonName"
              className="field"
              placeholder="Glow Hair Studio"
              value={form.salonName}
              onChange={(event) => set('salonName')(event.target.value)}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="field-label" htmlFor="ownerName">Owner name</label>
            <input
              id="ownerName"
              className="field"
              placeholder="Nomsa Dlamini"
              value={form.ownerName}
              onChange={(event) => set('ownerName')(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="contactNumber">Contact number</label>
            <input
              id="contactNumber"
              className="field"
              type="tel"
              placeholder="082 555 0182"
              value={form.contactNumber}
              onChange={(event) => set('contactNumber')(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="email">Email</label>
            <input
              id="email"
              className="field"
              type="email"
              placeholder="owner@salon.co.za"
              value={form.email}
              onChange={(event) => set('email')(event.target.value)}
            />
          </div>
          <div className="span-2">
            <label className="field-label" htmlFor="address">Address</label>
            <input
              id="address"
              className="field"
              placeholder="14 Jacaranda Street, Brackenfell, Cape Town"
              value={form.address}
              onChange={(event) => set('address')(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label" htmlFor="interest">Interest</label>
            <select
              id="interest"
              className="field"
              value={form.interest || ''}
              onChange={(event) => set('interest')(event.target.value)}
            >
              <option value="">Not captured</option>
              <option value="Interested">Interested</option>
              <option value="Not interested">Not interested</option>
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="meetingAt">Meeting schedule</label>
            <input
              id="meetingAt"
              className="field"
              type="datetime-local"
              value={form.meetingAt || ''}
              onChange={(event) => set('meetingAt')(event.target.value)}
            />
            <span className="field-hint">Date and time carry through to the card and exports.</span>
          </div>
          <div className="span-2">
            <label className="field-label" htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              className="field"
              placeholder="Best time to call, package interest, follow-up date…"
              value={form.notes}
              onChange={(event) => set('notes')(event.target.value)}
            />
          </div>
        </div>

        <div className="row between" style={{ marginTop: 18 }}>
          <span className="faint" style={{ fontSize: 10.5 }}>
            Saved to your profile and written to Firebase.
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-subtle btn-sm" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="btn btn-sm" disabled={busy}>
              {busy ? <span className="spinner" /> : <Save size={13} />}
              {busy ? 'Saving…' : salon ? 'Save changes' : 'Save card'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};

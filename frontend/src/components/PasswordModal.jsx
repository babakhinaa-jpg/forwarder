import { useState } from 'react';
import { api } from '../api.js';

export default function PasswordModal({ onClose }) {
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) return setError('New passwords do not match');
    if (form.next.length < 6) return setError('Password must be at least 6 characters');
    setLoading(true);
    try {
      await api.changePassword(form.current, form.next);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>Change Password</h2>
        <p className="subtitle">Update your login credentials</p>
        {error && <div className="alert alert-error">{error}</div>}
        {success ? (
          <>
            <div className="alert alert-success">Password changed successfully!</div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onClose}>Close</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>Current Password</label>
              <input type="password" required value={form.current} onChange={e => set('current', e.target.value)} placeholder="••••••••" autoFocus />
            </div>
            <div className="field">
              <label>New Password</label>
              <input type="password" required value={form.next} onChange={e => set('next', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="field">
              <label>Confirm New Password</label>
              <input type="password" required value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Saving…' : 'Change Password'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

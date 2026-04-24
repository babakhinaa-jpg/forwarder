import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

export default function PasswordModal({ onClose }) {
  const { t } = useI18n();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (form.next !== form.confirm) return setError(t('err_pwd_mismatch'));
    if (form.next.length < 6) return setError(t('err_pwd_short'));
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
        <h2>{t('pwd_title')}</h2>
        <p className="subtitle">{t('pwd_subtitle')}</p>
        {error && <div className="alert alert-error">{error}</div>}
        {success ? (
          <>
            <div className="alert alert-success">{t('pwd_success')}</div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={onClose}>{t('btn_close')}</button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="field">
              <label>{t('pwd_current')}</label>
              <input type="password" required value={form.current} onChange={e => set('current', e.target.value)} placeholder="••••••••" autoFocus />
            </div>
            <div className="field">
              <label>{t('pwd_new')}</label>
              <input type="password" required value={form.next} onChange={e => set('next', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="field">
              <label>{t('pwd_confirm')}</label>
              <input type="password" required value={form.confirm} onChange={e => set('confirm', e.target.value)} placeholder="••••••••" />
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-ghost" onClick={onClose}>{t('btn_cancel')}</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? t('btn_saving') : t('btn_change_pwd')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

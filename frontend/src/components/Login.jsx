import { useState } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import LangPicker from './LangPicker.jsx';

export default function Login({ onLogin }) {
  const { t } = useI18n();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login(username, password);
      localStorage.setItem('pf_token', data.token);
      onLogin(data.username);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-wrap">
      {/* Language picker top-right */}
      <div style={{ position: 'fixed', top: 16, right: 16 }}>
        <LangPicker />
      </div>

      <div className="login-card">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            background: 'white', borderRadius: 16, width: 72, height: 72,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', marginBottom: 16,
            boxShadow: '0 4px 24px rgba(0,0,0,.25)',
          }}>
            <img src="/logo.jpg" alt="logo" style={{ width: 70, height: 70, objectFit: 'cover' }} />
          </div>
          <h1>{t('app_name')}</h1>
          <p>{t('login_subtitle')}</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>{t('login_username')}</label>
            <input
              value={username} onChange={e => setUsername(e.target.value)}
              placeholder="admin" autoComplete="username" autoFocus
            />
          </div>
          <div className="field">
            <label>{t('login_password')}</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password"
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? t('login_submitting') : t('login_submit')}
          </button>
        </form>
        <p style={{ marginTop: 16, fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          {t('login_hint')}
        </p>
      </div>
    </div>
  );
}

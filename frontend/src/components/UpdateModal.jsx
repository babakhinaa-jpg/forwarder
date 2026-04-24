import { useState, useEffect, useRef } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';

export default function UpdateModal({ onClose }) {
  const { t } = useI18n();
  const [info, setInfo] = useState(null);
  const [checkResult, setCheckResult] = useState(null);
  const [phase, setPhase] = useState('idle'); // idle | checking | updating | done | error | restarting
  const [log, setLog] = useState('');
  const logRef = useRef(null);

  useEffect(() => {
    api.systemInfo().then(setInfo).catch(() => {});
  }, []);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  async function handleCheck() {
    setPhase('checking');
    setCheckResult(null);
    try {
      const r = await api.checkUpdate();
      setCheckResult(r);
    } catch (e) {
      setCheckResult({ available: false, error: e.message });
    } finally {
      setPhase('idle');
    }
  }

  async function handleUpdate() {
    setPhase('updating');
    setLog('');
    try {
      const res = await api.startUpdate();
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setLog(d.error || `HTTP ${res.status}`);
        setPhase('error');
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const ev = JSON.parse(line.slice(6));
              if (ev.type === 'log') setLog(l => l + ev.text);
              if (ev.type === 'done') setPhase(ev.success ? 'done' : 'error');
            } catch {}
          }
        }
      }
    } catch (e) {
      setLog(l => l + '\n' + e.message);
      setPhase('error');
    }
  }

  async function handleRestart() {
    setPhase('restarting');
    try {
      await api.restartService();
      // Poll until server is back
      let attempts = 0;
      const poll = setInterval(async () => {
        attempts++;
        try {
          const r = await fetch('/api/system/info', { headers: { Authorization: `Bearer ${localStorage.getItem('pf_token')}` } });
          if (r.ok) { clearInterval(poll); window.location.reload(); }
        } catch {}
        if (attempts > 30) { clearInterval(poll); setPhase('done'); }
      }, 1500);
    } catch (e) {
      setPhase('done');
    }
  }

  const canUpdate = info?.installed !== false;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }}>
        <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          {t('upd_title')}
        </h2>
        <p className="subtitle" style={{ marginBottom: 20 }}>GitHub: babakhinaa-jpg/forwarder</p>

        {/* Version info */}
        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16 }}>
          {info ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13 }}>
              <div style={{ color: 'var(--text-muted)' }}>{t('upd_current')}</div>
              <div style={{ fontFamily: 'monospace', color: info.commit ? 'var(--primary)' : 'var(--text-muted)' }}>
                {info.commit || t('upd_no_git')}
              </div>
              {info.branch && <>
                <div style={{ color: 'var(--text-muted)' }}>{t('upd_branch')}</div>
                <div style={{ fontFamily: 'monospace' }}>{info.branch}</div>
              </>}
              {info.commitDate && <>
                <div style={{ color: 'var(--text-muted)' }}>{t('upd_date')}</div>
                <div>{info.commitDate}</div>
              </>}
              {!info.installed && (
                <div style={{ gridColumn: '1/-1', color: 'var(--warning)', fontSize: 12, marginTop: 4 }}>
                  ⚠ {t('upd_not_installed')}
                </div>
              )}
            </div>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('loading')}</div>
          )}
        </div>

        {/* Check result */}
        {checkResult && (
          <div className={`alert ${checkResult.available ? 'alert-success' : 'alert-error'}`} style={{ marginBottom: 12 }}>
            {checkResult.available
              ? `${t('upd_available')}: ${checkResult.local} → ${checkResult.remote}`
              : checkResult.error
                ? `Error: ${checkResult.error}`
                : t('upd_up_to_date')}
          </div>
        )}

        {/* Log output */}
        {log && (
          <div ref={logRef} style={{
            background: '#0a0f1a', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: 12, marginBottom: 12,
            fontFamily: 'monospace', fontSize: 11, lineHeight: 1.6,
            color: '#a3e635', maxHeight: 220, overflowY: 'auto',
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {log}
          </div>
        )}

        {/* Status messages */}
        {phase === 'done' && !log.includes('error') && (
          <div className="alert alert-success" style={{ marginBottom: 12 }}>{t('upd_done')}</div>
        )}
        {phase === 'error' && (
          <div className="alert alert-error" style={{ marginBottom: 12 }}>{t('upd_failed')}</div>
        )}
        {phase === 'restarting' && (
          <div className="alert alert-success" style={{ marginBottom: 12 }}>
            {t('upd_restarting')}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn btn-ghost" onClick={onClose}>{t('btn_close')}</button>

          {phase === 'idle' && (
            <button className="btn btn-ghost" onClick={handleCheck} disabled={!info}>
              {t('upd_btn_check')}
            </button>
          )}
          {phase === 'checking' && (
            <button className="btn btn-ghost" disabled>{t('upd_checking')}</button>
          )}

          {(phase === 'idle' || phase === 'error') && canUpdate && (
            <button className="btn btn-primary" onClick={handleUpdate}>
              {t('upd_btn_now')}
            </button>
          )}
          {phase === 'updating' && (
            <button className="btn btn-primary" disabled>{t('upd_running')}</button>
          )}
          {phase === 'done' && info?.installed && (
            <button className="btn btn-primary" onClick={handleRestart}>
              {t('upd_btn_restart')}
            </button>
          )}
          {phase === 'restarting' && (
            <button className="btn btn-primary" disabled>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
              </svg>
              Restarting…
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

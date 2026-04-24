import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import { useI18n } from '../i18n.jsx';
import RuleModal from './RuleModal.jsx';
import PasswordModal from './PasswordModal.jsx';
import LangPicker from './LangPicker.jsx';
import UpdateModal from './UpdateModal.jsx';

function formatBytes(b) {
  if (!b) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function ProtoTag({ proto }) {
  const colors = {
    TCP:  { bg: 'rgba(59,130,246,.15)', color: '#60a5fa' },
    UDP:  { bg: 'rgba(168,85,247,.15)', color: '#c084fc' },
    BOTH: { bg: 'rgba(34,197,94,.12)',  color: '#4ade80' },
  };
  const c = colors[proto] || colors.TCP;
  return (
    <span style={{ background: c.bg, color: c.color, padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, fontFamily: 'monospace' }}>
      {proto === 'BOTH' ? 'TCP+UDP' : proto}
    </span>
  );
}

function StatusBadge({ rule, t }) {
  if (!rule.enabled) return <span className="badge badge-disabled"><span className="badge-dot" />{t('status_disabled')}</span>;
  if (rule.running)  return <span className="badge badge-running"><span className="badge-dot" />{t('status_running')}</span>;
  return <span className="badge badge-stopped"><span className="badge-dot" />{t('status_stopped')}</span>;
}

function RuleStats({ stats, proto }) {
  if (!stats) return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
  const tcp = stats.tcp;
  const udp = stats.udp;
  if (proto === 'TCP' && tcp) return (
    <div>
      <div style={{ fontSize: 12 }}>↓ {formatBytes(tcp.bytesIn)} ↑ {formatBytes(tcp.bytesOut)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{tcp.connections} / {tcp.activeConnections} active</div>
    </div>
  );
  if (proto === 'UDP' && udp) return (
    <div>
      <div style={{ fontSize: 12 }}>↓ {formatBytes(udp.bytesIn)} ↑ {formatBytes(udp.bytesOut)}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{udp.packets} pkts / {udp.sessions} sess</div>
    </div>
  );
  if (proto === 'BOTH') return (
    <div>
      {tcp && <div style={{ fontSize: 11 }}><span style={{ color: '#60a5fa' }}>TCP</span> ↓{formatBytes(tcp.bytesIn)} ↑{formatBytes(tcp.bytesOut)} ({tcp.activeConnections} active)</div>}
      {udp && <div style={{ fontSize: 11 }}><span style={{ color: '#c084fc' }}>UDP</span> ↓{formatBytes(udp.bytesIn)} ↑{formatBytes(udp.bytesOut)} ({udp.sessions} sess)</div>}
    </div>
  );
  return <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>—</span>;
}

export default function Dashboard({ username, onLogout }) {
  const { t } = useI18n();
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');
  const [toast, setToast] = useState(null);

  const fetchRules = useCallback(async () => {
    try {
      const data = await api.getRules();
      setRules(data);
    } catch (err) {
      if (err.message.includes('401') || err.message.includes('token')) onLogout();
    } finally {
      setLoading(false);
    }
  }, [onLogout]);

  useEffect(() => {
    fetchRules();
    const iv = setInterval(fetchRules, 5000);
    return () => clearInterval(iv);
  }, [fetchRules]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCreate(form) {
    setSaving(true); setModalError('');
    try { await api.createRule(form); await fetchRules(); setShowAdd(false); showToast(t('toast_created')); }
    catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  async function handleUpdate(form) {
    setSaving(true); setModalError('');
    try { await api.updateRule(editRule.id, form); await fetchRules(); setEditRule(null); showToast(t('toast_updated')); }
    catch (err) { setModalError(err.message); }
    finally { setSaving(false); }
  }

  async function handleDelete(rule) {
    const msg = t('delete_confirm').replace('%s', rule.name);
    if (!confirm(msg)) return;
    try { await api.deleteRule(rule.id); await fetchRules(); showToast(t('toast_deleted'), 'error'); }
    catch (err) { showToast(err.message, 'error'); }
  }

  async function handleToggle(rule) {
    try { await api.toggleRule(rule.id); await fetchRules(); }
    catch (err) { showToast(err.message, 'error'); }
  }

  const activeCount = rules.filter(r => r.running).length;
  const totalBytes = rules.reduce((acc, r) => {
    if (!r.stats) return acc;
    const tcp = r.stats.tcp ? r.stats.tcp.bytesIn + r.stats.tcp.bytesOut : 0;
    const udp = r.stats.udp ? r.stats.udp.bytesIn + r.stats.udp.bytesOut : 0;
    return acc + tcp + udp;
  }, 0);
  const totalConns = rules.reduce((acc, r) => {
    if (!r.stats) return acc;
    return acc + (r.stats.tcp?.connections || 0) + (r.stats.udp?.packets || 0);
  }, 0);

  return (
    <div className="layout">
      <header className="header">
        <div className="header-logo">
          <div style={{
            background: 'white', borderRadius: 8, width: 36, height: 36,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden', flexShrink: 0,
            boxShadow: '0 0 0 1px rgba(255,255,255,.15)',
          }}>
            <img src="/logo.jpg" alt="logo" style={{ width: 34, height: 34, objectFit: 'cover' }} />
          </div>
          {t('app_name')}
        </div>
        <div className="header-actions">
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>{username}</span>
          <LangPicker />
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setShowUpdate(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            {t('btn_update')}
          </button>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setShowPassword(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            {t('btn_password')}
          </button>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            {t('btn_logout')}
          </button>
        </div>
      </header>

      <main className="main">
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-label">{t('stat_total')}</div>
            <div className="stat-value">{rules.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stat_active')}</div>
            <div className="stat-value" style={{ color: activeCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>{activeCount}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stat_traffic')}</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{formatBytes(totalBytes)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">{t('stat_conns')}</div>
            <div className="stat-value">{totalConns.toLocaleString()}</div>
          </div>
        </div>

        <div className="table-wrap">
          <div className="table-header">
            <h2>{t('rules_title')}</h2>
            <button className="btn btn-primary" onClick={() => { setModalError(''); setShowAdd(true); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              {t('btn_add_rule')}
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>{t('loading')}</div>
          ) : rules.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <p>{t('empty_title')}</p>
              <small>{t('empty_hint')}</small>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t('col_status')}</th>
                  <th>{t('col_name')}</th>
                  <th>{t('col_proto')}</th>
                  <th>{t('col_route')}</th>
                  <th>{t('col_stats')}</th>
                  <th>{t('col_on')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    <td><StatusBadge rule={rule} t={t} /></td>
                    <td style={{ fontWeight: 600 }}>{rule.name}</td>
                    <td><ProtoTag proto={rule.protocol || 'TCP'} /></td>
                    <td>
                      <div className="route">
                        <span style={{ color: 'var(--text-muted)' }}>:</span>
                        <span className="route-port">
                          {rule.listenPort}{rule.portRangeEnd ? `–${rule.portRangeEnd}` : ''}
                        </span>
                        <span className="route-arrow">→</span>
                        <span className="route-host">
                          {rule.targetHost}:{rule.targetPort}
                          {rule.portRangeEnd ? `–${rule.targetPort + (rule.portRangeEnd - rule.listenPort)}` : ''}
                        </span>
                      </div>
                    </td>
                    <td><RuleStats stats={rule.stats} proto={rule.protocol || 'TCP'} /></td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={rule.enabled} onChange={() => handleToggle(rule)} />
                        <span className="slider"></span>
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button className="btn btn-ghost" style={{ padding: '5px 10px' }} onClick={() => { setModalError(''); setEditRule(rule); }} title="Edit">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="btn btn-ghost" style={{ padding: '5px 10px', color: 'var(--danger)' }} onClick={() => handleDelete(rule)} title="Delete">
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                            <path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </main>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24,
          padding: '12px 20px', borderRadius: 'var(--radius)',
          background: toast.type === 'success' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)',
          border: `1px solid ${toast.type === 'success' ? 'rgba(34,197,94,.4)' : 'rgba(239,68,68,.4)'}`,
          color: toast.type === 'success' ? 'var(--success)' : '#fca5a5',
          fontWeight: 600, fontSize: 13, zIndex: 200,
          boxShadow: '0 8px 24px rgba(0,0,0,.3)',
        }}>
          {toast.msg}
        </div>
      )}

      {showAdd      && <RuleModal onSave={handleCreate} onClose={() => setShowAdd(false)} loading={saving} error={modalError} />}
      {editRule     && <RuleModal rule={editRule} onSave={handleUpdate} onClose={() => setEditRule(null)} loading={saving} error={modalError} />}
      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}
      {showUpdate   && <UpdateModal onClose={() => setShowUpdate(false)} />}
    </div>
  );
}

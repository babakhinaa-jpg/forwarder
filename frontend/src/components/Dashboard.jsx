import { useState, useEffect, useCallback } from 'react';
import { api } from '../api.js';
import RuleModal from './RuleModal.jsx';
import PasswordModal from './PasswordModal.jsx';

function formatBytes(b) {
  if (b === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return (b / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function StatusBadge({ rule }) {
  if (!rule.enabled) return <span className="badge badge-disabled"><span className="badge-dot" />Disabled</span>;
  if (rule.running) return <span className="badge badge-running"><span className="badge-dot" />Running</span>;
  return <span className="badge badge-stopped"><span className="badge-dot" />Stopped</span>;
}

export default function Dashboard({ username, onLogout }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editRule, setEditRule] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
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
    const interval = setInterval(fetchRules, 5000);
    return () => clearInterval(interval);
  }, [fetchRules]);

  function showToast(msg, type = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function handleCreate(form) {
    setSaving(true);
    setModalError('');
    try {
      await api.createRule(form);
      await fetchRules();
      setShowAdd(false);
      showToast('Rule created');
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(form) {
    setSaving(true);
    setModalError('');
    try {
      await api.updateRule(editRule.id, form);
      await fetchRules();
      setEditRule(null);
      showToast('Rule updated');
    } catch (err) {
      setModalError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(rule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return;
    try {
      await api.deleteRule(rule.id);
      await fetchRules();
      showToast('Rule deleted', 'error');
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleToggle(rule) {
    try {
      await api.toggleRule(rule.id);
      await fetchRules();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const activeCount = rules.filter(r => r.running).length;
  const totalBytes = rules.reduce((acc, r) => acc + (r.stats?.bytesIn || 0) + (r.stats?.bytesOut || 0), 0);
  const totalConns = rules.reduce((acc, r) => acc + (r.stats?.connections || 0), 0);

  return (
    <div className="layout">
      {/* Header */}
      <header className="header">
        <div className="header-logo">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
          Port Forwarder
        </div>
        <div className="header-actions">
          <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {username}
          </span>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={() => setShowPassword(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            Password
          </button>
          <button className="btn btn-ghost" style={{ padding: '6px 12px' }} onClick={onLogout}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        </div>
      </header>

      <main className="main">
        {/* Stats */}
        <div className="stats-bar">
          <div className="stat-card">
            <div className="stat-label">Total Rules</div>
            <div className="stat-value">{rules.length}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Active</div>
            <div className="stat-value" style={{ color: activeCount > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
              {activeCount}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Traffic</div>
            <div className="stat-value" style={{ fontSize: 20 }}>{formatBytes(totalBytes)}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Connections</div>
            <div className="stat-value">{totalConns}</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-wrap">
          <div className="table-header">
            <h2>Forwarding Rules</h2>
            <button className="btn btn-primary" onClick={() => { setModalError(''); setShowAdd(true); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Rule
            </button>
          </div>

          {loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
          ) : rules.length === 0 ? (
            <div className="empty-state">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
              <p>No forwarding rules yet</p>
              <small>Click "Add Rule" to create your first rule</small>
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Name</th>
                  <th>Route</th>
                  <th>Traffic</th>
                  <th>Connections</th>
                  <th>Enabled</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    <td><StatusBadge rule={rule} /></td>
                    <td style={{ fontWeight: 600 }}>{rule.name}</td>
                    <td>
                      <div className="route">
                        <span style={{ color: 'var(--text-muted)' }}>:</span>
                        <span className="route-port">{rule.listenPort}</span>
                        <span className="route-arrow">→</span>
                        <span className="route-host">{rule.targetHost}:{rule.targetPort}</span>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>↓ {formatBytes(rule.stats?.bytesIn || 0)}</div>
                      <div style={{ fontSize: 13 }}>↑ {formatBytes(rule.stats?.bytesOut || 0)}</div>
                    </td>
                    <td>
                      <div style={{ fontSize: 13 }}>{rule.stats?.connections || 0} total</div>
                      <div style={{ fontSize: 13, color: rule.stats?.activeConnections > 0 ? 'var(--success)' : 'var(--text-muted)' }}>
                        {rule.stats?.activeConnections || 0} active
                      </div>
                    </td>
                    <td>
                      <label className="switch">
                        <input type="checkbox" checked={rule.enabled} onChange={() => handleToggle(rule)} />
                        <span className="slider"></span>
                      </label>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 10px' }}
                          onClick={() => { setModalError(''); setEditRule(rule); }}
                          title="Edit"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button
                          className="btn btn-ghost"
                          style={{ padding: '5px 10px', color: 'var(--danger)' }}
                          onClick={() => handleDelete(rule)}
                          title="Delete"
                        >
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

      {/* Toast */}
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

      {/* Modals */}
      {showAdd && (
        <RuleModal
          onSave={handleCreate}
          onClose={() => setShowAdd(false)}
          loading={saving}
          error={modalError}
        />
      )}
      {editRule && (
        <RuleModal
          rule={editRule}
          onSave={handleUpdate}
          onClose={() => setEditRule(null)}
          loading={saving}
          error={modalError}
        />
      )}
      {showPassword && <PasswordModal onClose={() => setShowPassword(false)} />}
    </div>
  );
}

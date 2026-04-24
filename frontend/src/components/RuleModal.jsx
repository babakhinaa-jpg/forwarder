import { useState } from 'react';

const PROTOCOLS = [
  { value: 'TCP', label: 'TCP', desc: 'Stream — HTTP, SSH, databases' },
  { value: 'UDP', label: 'UDP', desc: 'Datagram — DNS, games, VoIP' },
  { value: 'BOTH', label: 'TCP + UDP', desc: 'Both protocols on same port' },
];

export default function RuleModal({ rule, onSave, onClose, loading, error }) {
  const [form, setForm] = useState({
    name: rule?.name || '',
    listenPort: rule?.listenPort || '',
    targetHost: rule?.targetHost || '',
    targetPort: rule?.targetPort || '',
    protocol: rule?.protocol || 'TCP',
    enabled: rule?.enabled !== false,
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({ ...form, listenPort: Number(form.listenPort), targetPort: Number(form.targetPort) });
  }

  const isEdit = !!rule;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{isEdit ? 'Edit Rule' : 'New Rule'}</h2>
        <p className="subtitle">{isEdit ? 'Update forwarding configuration' : 'Configure a port forwarding rule'}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>

          <div className="field">
            <label>Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Server" />
          </div>

          {/* Protocol selector */}
          <div className="field">
            <label>Protocol</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PROTOCOLS.map(p => (
                <label
                  key={p.value}
                  style={{
                    flex: 1, cursor: 'pointer',
                    padding: '10px 12px',
                    borderRadius: 'var(--radius)',
                    border: `1.5px solid ${form.protocol === p.value ? 'var(--primary)' : 'var(--border)'}`,
                    background: form.protocol === p.value ? 'rgba(59,130,246,.12)' : 'var(--bg)',
                    transition: 'all .15s',
                  }}
                >
                  <input
                    type="radio" name="protocol" value={p.value}
                    checked={form.protocol === p.value}
                    onChange={() => set('protocol', p.value)}
                    style={{ display: 'none' }}
                  />
                  <div style={{ fontWeight: 700, fontSize: 13, color: form.protocol === p.value ? 'var(--primary)' : 'var(--text)' }}>
                    {p.label}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.desc}</div>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Listen Port</label>
              <input type="number" min="1" max="65535" required value={form.listenPort} onChange={e => set('listenPort', e.target.value)} placeholder="8080" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Target Host</label>
              <input required value={form.targetHost} onChange={e => set('targetHost', e.target.value)} placeholder="10.0.0.5" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Target Port</label>
              <input type="number" min="1" max="65535" required value={form.targetPort} onChange={e => set('targetPort', e.target.value)} placeholder="80" />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
            <label className="switch">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Enable immediately</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Start forwarding traffic when saved</div>
            </div>
          </div>

          {form.listenPort && form.targetHost && form.targetPort && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(59,130,246,.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(59,130,246,.2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Preview</div>
              <div className="route">
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>{form.protocol}</span>
                <span>0.0.0.0:</span><span className="route-port">{form.listenPort}</span>
                <span className="route-arrow">→</span>
                <span className="route-host">{form.targetHost}:{form.targetPort}</span>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Saving…' : isEdit ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

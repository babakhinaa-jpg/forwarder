import { useState } from 'react';

export default function RuleModal({ rule, onSave, onClose, loading, error }) {
  const [form, setForm] = useState({
    name: rule?.name || '',
    listenPort: rule?.listenPort || '',
    targetHost: rule?.targetHost || '',
    targetPort: rule?.targetPort || '',
    enabled: rule?.enabled !== false,
  });

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleSubmit(e) {
    e.preventDefault();
    onSave({
      ...form,
      listenPort: Number(form.listenPort),
      targetPort: Number(form.targetPort),
    });
  }

  const isEdit = !!rule;

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{isEdit ? 'Edit Rule' : 'New Rule'}</h2>
        <p className="subtitle">
          {isEdit ? 'Update forwarding configuration' : 'Configure a port forwarding rule'}
        </p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Name <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(optional)</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Server" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Listen Port</label>
              <input
                type="number" min="1" max="65535" required
                value={form.listenPort} onChange={e => set('listenPort', e.target.value)}
                placeholder="8080"
              />
            </div>
            <div className="field" style={{ margin: 0, gridColumn: 'span 1' }}>
              <label>Target Host</label>
              <input
                required value={form.targetHost} onChange={e => set('targetHost', e.target.value)}
                placeholder="10.0.0.5"
              />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Target Port</label>
              <input
                type="number" min="1" max="65535" required
                value={form.targetPort} onChange={e => set('targetPort', e.target.value)}
                placeholder="80"
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
            <label className="switch">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>Enable immediately</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                Start forwarding traffic when saved
              </div>
            </div>
          </div>

          {form.listenPort && form.targetHost && form.targetPort && (
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(59,130,246,.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(59,130,246,.2)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>Preview</div>
              <div className="route">
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

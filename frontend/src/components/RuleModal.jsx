import { useState } from 'react';
import { useI18n } from '../i18n.jsx';

export default function RuleModal({ rule, onSave, onClose, loading, error }) {
  const { t } = useI18n();
  const [form, setForm] = useState({
    name: rule?.name || '',
    listenPort: rule?.listenPort || '',
    portRangeEnd: rule?.portRangeEnd || '',
    targetHost: rule?.targetHost || '',
    targetPort: rule?.targetPort || '',
    protocol: rule?.protocol || 'TCP',
    enabled: rule?.enabled !== false,
  });
  const [rangeMode, setRangeMode] = useState(!!(rule?.portRangeEnd));

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      listenPort: Number(form.listenPort),
      targetPort: Number(form.targetPort),
      portRangeEnd: rangeMode && form.portRangeEnd ? Number(form.portRangeEnd) : undefined,
    };
    onSave(payload);
  }

  const isEdit = !!rule;
  const isRange = rangeMode && form.portRangeEnd && Number(form.portRangeEnd) > Number(form.listenPort);
  const rangeSize = isRange ? Number(form.portRangeEnd) - Number(form.listenPort) + 1 : null;

  const PROTOCOLS = [
    { value: 'TCP',  label: 'TCP',     desc: t('proto_tcp_desc') },
    { value: 'UDP',  label: 'UDP',     desc: t('proto_udp_desc') },
    { value: 'BOTH', label: 'TCP+UDP', desc: t('proto_both_desc') },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <h2>{isEdit ? t('rule_edit_title') : t('rule_new_title')}</h2>
        <p className="subtitle">{isEdit ? t('rule_edit_subtitle') : t('rule_new_subtitle')}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>

          <div className="field">
            <label>{t('field_name')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('field_optional')}</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Server" />
          </div>

          {/* Protocol */}
          <div className="field">
            <label>{t('field_protocol')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {PROTOCOLS.map(p => (
                <label key={p.value} style={{
                  flex: 1, cursor: 'pointer', padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: `1.5px solid ${form.protocol === p.value ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.protocol === p.value ? 'rgba(59,130,246,.12)' : 'var(--bg)',
                  transition: 'all .15s',
                }}>
                  <input type="radio" name="protocol" value={p.value}
                    checked={form.protocol === p.value} onChange={() => set('protocol', p.value)}
                    style={{ display: 'none' }} />
                  <div style={{ fontWeight: 700, fontSize: 13, color: form.protocol === p.value ? 'var(--primary)' : 'var(--text)' }}>{p.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{p.desc}</div>
                </label>
              ))}
            </div>
          </div>

          {/* Port range toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <label className="switch">
              <input type="checkbox" checked={rangeMode} onChange={e => { setRangeMode(e.target.checked); if (!e.target.checked) set('portRangeEnd', ''); }} />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('range_mode')}</span>
            {rangeSize && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>({rangeSize} {t('range_ports')})</span>}
          </div>

          {/* Ports */}
          <div style={{ display: 'grid', gridTemplateColumns: rangeMode ? '1fr 1fr 2fr 1fr' : '1fr 2fr 1fr', gap: 12 }}>
            <div className="field" style={{ margin: 0 }}>
              <label>{rangeMode ? t('range_from') : t('field_listen_port')}</label>
              <input type="number" min="1" max="65535" required value={form.listenPort} onChange={e => set('listenPort', e.target.value)} placeholder="8080" />
            </div>
            {rangeMode && (
              <div className="field" style={{ margin: 0 }}>
                <label>{t('range_to')}</label>
                <input type="number" min="1" max="65535" required={rangeMode} value={form.portRangeEnd} onChange={e => set('portRangeEnd', e.target.value)} placeholder="8090" />
              </div>
            )}
            <div className="field" style={{ margin: 0 }}>
              <label>{t('field_target_host')}</label>
              <input required value={form.targetHost} onChange={e => set('targetHost', e.target.value)} placeholder="10.0.0.5" />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>{t('field_target_port')}</label>
              <input type="number" min="1" max="65535" required value={form.targetPort} onChange={e => set('targetPort', e.target.value)} placeholder="80" />
            </div>
          </div>

          {/* Enable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, padding: '12px 16px', background: 'var(--surface2)', borderRadius: 'var(--radius)' }}>
            <label className="switch">
              <input type="checkbox" checked={form.enabled} onChange={e => set('enabled', e.target.checked)} />
              <span className="slider"></span>
            </label>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{t('enable_label')}</div>
              <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>{t('enable_hint')}</div>
            </div>
          </div>

          {/* Preview */}
          {form.listenPort && form.targetHost && form.targetPort && (
            <div style={{ marginTop: 12, padding: '10px 14px', background: 'rgba(59,130,246,.1)', borderRadius: 'var(--radius)', border: '1px solid rgba(59,130,246,.2)' }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>{t('preview_label')}</div>
              <div className="route">
                <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'var(--surface2)', padding: '1px 6px', borderRadius: 4, marginRight: 4 }}>{form.protocol}</span>
                <span>:</span>
                <span className="route-port">
                  {form.listenPort}{isRange ? `-${form.portRangeEnd}` : ''}
                </span>
                <span className="route-arrow">→</span>
                <span className="route-host">
                  {form.targetHost}:{form.targetPort}{isRange ? `-${Number(form.targetPort) + rangeSize - 1}` : ''}
                </span>
              </div>
            </div>
          )}

          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={onClose}>{t('btn_cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? t('btn_saving') : isEdit ? t('btn_update_rule') : t('btn_create_rule')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

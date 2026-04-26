import { useState, useEffect } from 'react';
import { api } from '../api.js';
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
    rangeTarget: rule?.rangeTarget || 'expand',
    mode: rule?.mode || 'socket',
  });
  const [rangeMode, setRangeMode] = useState(!!(rule?.portRangeEnd));
  const [ipFwd, setIpFwd] = useState(null); // null=checking, true=on, false=off
  const [ipFwdForm, setIpFwdForm] = useState(false);
  const [ipFwdPwd, setIpFwdPwd] = useState('');
  const [ipFwdBusy, setIpFwdBusy] = useState(false);
  const [ipFwdErr, setIpFwdErr] = useState('');
  const [ipFwdOk, setIpFwdOk] = useState(false);

  useEffect(() => {
    if (form.mode !== 'iptables') { setIpFwd(null); setIpFwdForm(false); setIpFwdOk(false); return; }
    api.checkIpForward().then(r => setIpFwd(r.enabled)).catch(() => setIpFwd(false));
  }, [form.mode]);

  async function handleEnableIpFwd(e) {
    e.preventDefault();
    setIpFwdBusy(true); setIpFwdErr('');
    try {
      await api.enableIpForward(ipFwdPwd);
      setIpFwd(true); setIpFwdOk(true); setIpFwdForm(false); setIpFwdPwd('');
    } catch (err) {
      setIpFwdErr(err.message);
    } finally {
      setIpFwdBusy(false);
    }
  }

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function handleSubmit(e) {
    e.preventDefault();
    const payload = {
      ...form,
      listenPort: Number(form.listenPort),
      targetPort: Number(form.targetPort),
      portRangeEnd: rangeMode && form.portRangeEnd ? Number(form.portRangeEnd) : undefined,
      rangeTarget: rangeMode ? form.rangeTarget : undefined,
      mode: form.mode,
    };
    onSave(payload);
  }

  const isEdit = !!rule;
  const isRange = rangeMode && form.portRangeEnd && Number(form.portRangeEnd) > Number(form.listenPort);
  const rangeSize = isRange ? Number(form.portRangeEnd) - Number(form.listenPort) + 1 : null;

  const MODES = [
    { value: 'socket',   label: t('mode_socket'),   desc: t('mode_socket_desc') },
    { value: 'iptables', label: t('mode_iptables'),  desc: t('mode_iptables_desc') },
  ];

  const PROTOCOLS = [
    { value: 'TCP',  label: 'TCP',     desc: t('proto_tcp_desc') },
    { value: 'UDP',  label: 'UDP',     desc: t('proto_udp_desc') },
    { value: 'BOTH', label: 'TCP+UDP', desc: t('proto_both_desc') },
  ];

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={rangeMode ? { maxWidth: 580 } : {}}>
        <h2>{isEdit ? t('rule_edit_title') : t('rule_new_title')}</h2>
        <p className="subtitle">{isEdit ? t('rule_edit_subtitle') : t('rule_new_subtitle')}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>

          <div className="field">
            <label>{t('field_name')} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{t('field_optional')}</span></label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="My Server" />
          </div>

          {/* Forwarding Mode */}
          <div className="field">
            <label>{t('mode_label')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {MODES.map(m => (
                <label key={m.value} style={{
                  flex: 1, cursor: 'pointer', padding: '10px 12px',
                  borderRadius: 'var(--radius)',
                  border: `1.5px solid ${form.mode === m.value ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.mode === m.value ? 'rgba(59,130,246,.12)' : 'var(--bg)',
                  transition: 'all .15s',
                }}>
                  <input type="radio" name="mode" value={m.value}
                    checked={form.mode === m.value} onChange={() => set('mode', m.value)}
                    style={{ display: 'none' }} />
                  <div style={{ fontWeight: 700, fontSize: 13, color: form.mode === m.value ? 'var(--primary)' : 'var(--text)' }}>{m.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{m.desc}</div>
                </label>
              ))}
            </div>
            {form.mode === 'iptables' && (
              <div style={{ marginTop: 8, padding: '8px 12px', background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.3)', borderRadius: 'var(--radius)', fontSize: 12, color: '#fbbf24' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                  <span>{t('mode_iptables_info')}</span>
                  {ipFwd === null && (
                    <span style={{ color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{t('ipfwd_checking')}</span>
                  )}
                  {ipFwd === true && (
                    <span style={{ background: 'rgba(34,197,94,.2)', color: '#4ade80', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                      ✓ {t('ipfwd_on')}
                    </span>
                  )}
                  {ipFwd === false && !ipFwdForm && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <span style={{ background: 'rgba(239,68,68,.2)', color: '#fca5a5', padding: '2px 8px', borderRadius: 4, fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                        ✗ {t('ipfwd_off')}
                      </span>
                      <button type="button"
                        onClick={() => { setIpFwdForm(true); setIpFwdErr(''); }}
                        style={{ background: 'rgba(59,130,246,.2)', color: '#60a5fa', border: '1px solid rgba(59,130,246,.4)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {t('ipfwd_enable_btn')}
                      </button>
                    </div>
                  )}
                </div>
                {ipFwd === false && ipFwdForm && (
                  <form onSubmit={handleEnableIpFwd} style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="password"
                      autoFocus
                      value={ipFwdPwd}
                      onChange={e => setIpFwdPwd(e.target.value)}
                      placeholder={t('ipfwd_pwd_hint')}
                      style={{ flex: 1, minWidth: 160, padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)' }}
                    />
                    <button type="submit" disabled={ipFwdBusy || !ipFwdPwd}
                      style={{ background: 'rgba(59,130,246,.8)', color: '#fff', border: 'none', borderRadius: 4, padding: '4px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {ipFwdBusy ? t('ipfwd_enabling') : t('ipfwd_enable_btn')}
                    </button>
                    <button type="button" onClick={() => { setIpFwdForm(false); setIpFwdErr(''); setIpFwdPwd(''); }}
                      style={{ background: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 12 }}>✕</button>
                    {ipFwdErr && <div style={{ width: '100%', color: '#fca5a5', marginTop: 2 }}>{ipFwdErr}</div>}
                  </form>
                )}
                {ipFwdOk && ipFwd === true && (
                  <div style={{ marginTop: 4, color: '#4ade80', fontSize: 11 }}>✓ {t('ipfwd_enable_ok')}</div>
                )}
              </div>
            )}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <label className="switch">
              <input type="checkbox" checked={rangeMode} onChange={e => { setRangeMode(e.target.checked); if (!e.target.checked) set('portRangeEnd', ''); }} />
              <span className="slider"></span>
            </label>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{t('range_mode')}</span>
            {rangeSize && <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 4 }}>({rangeSize} {t('range_ports')})</span>}
          </div>

          {/* Range target mode */}
          {rangeMode && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {[
                { value: 'expand', icon: '↔', label: t('range_expand_label'), example: '8000–8010 → 9000–9010' },
                { value: 'single', icon: '→', label: t('range_single_label'), example: '8000–8010 → 9000' },
              ].map(opt => (
                <label key={opt.value} style={{
                  flex: 1, cursor: 'pointer', padding: '8px 12px',
                  borderRadius: 'var(--radius)',
                  border: `1.5px solid ${form.rangeTarget === opt.value ? 'var(--primary)' : 'var(--border)'}`,
                  background: form.rangeTarget === opt.value ? 'rgba(59,130,246,.12)' : 'var(--bg)',
                  transition: 'all .15s',
                }}>
                  <input type="radio" name="rangeTarget" value={opt.value}
                    checked={form.rangeTarget === opt.value}
                    onChange={() => set('rangeTarget', opt.value)}
                    style={{ display: 'none' }} />
                  <div style={{ fontWeight: 700, fontSize: 12, color: form.rangeTarget === opt.value ? 'var(--primary)' : 'var(--text)' }}>
                    {opt.icon} {opt.label}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'monospace' }}>
                    {opt.example}
                  </div>
                </label>
              ))}
            </div>
          )}

          {/* Ports */}
          {/* expand mode: 5 columns (listen from | listen to | host | target from | target to readonly) */}
          {/* single mode: 4 columns (listen from | listen to | host | target port) */}
          {/* no range:    3 columns (listen | host | target) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: rangeMode && form.rangeTarget === 'expand'
              ? 'minmax(70px,1fr) minmax(70px,1fr) minmax(110px,2fr) minmax(70px,1fr) minmax(70px,1fr)'
              : rangeMode
                ? 'minmax(80px,1fr) minmax(80px,1fr) minmax(120px,2fr) minmax(80px,1fr)'
                : '1fr 2fr 1fr',
            gap: 12,
          }}>
            {/* Listen port start */}
            <div className="field" style={{ margin: 0 }}>
              <label style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{rangeMode ? t('range_from') : t('field_listen_port')}</label>
              <input type="number" min="1" max="65535" required value={form.listenPort} onChange={e => set('listenPort', e.target.value)} placeholder="8080" />
            </div>
            {/* Listen port end */}
            {rangeMode && (
              <div className="field" style={{ margin: 0 }}>
                <label style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('range_to')}</label>
                <input type="number" min="1" max="65535" required={rangeMode} value={form.portRangeEnd} onChange={e => set('portRangeEnd', e.target.value)} placeholder="8090" />
              </div>
            )}
            {/* Target host */}
            <div className="field" style={{ margin: 0 }}>
              <label style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('field_target_host')}</label>
              <input required value={form.targetHost} onChange={e => set('targetHost', e.target.value)} placeholder="10.0.0.5" />
            </div>
            {/* Target port start */}
            <div className="field" style={{ margin: 0 }}>
              <label style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {rangeMode && form.rangeTarget === 'expand' ? t('range_from') : t('field_target_port')}
              </label>
              <input type="number" min="1" max="65535" required value={form.targetPort} onChange={e => set('targetPort', e.target.value)} placeholder="80" />
            </div>
            {/* Target port end — calculated, read-only, only in expand mode */}
            {rangeMode && form.rangeTarget === 'expand' && (
              <div className="field" style={{ margin: 0 }}>
                <label style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t('range_to')}</label>
                <input
                  type="number" readOnly tabIndex={-1}
                  value={isRange && form.targetPort ? Number(form.targetPort) + rangeSize - 1 : ''}
                  placeholder="—"
                  style={{ background: 'var(--surface2)', color: 'var(--text-muted)', cursor: 'default' }}
                />
              </div>
            )}
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
                  {form.targetHost}:{form.targetPort}
                  {isRange && form.rangeTarget !== 'single' ? `-${Number(form.targetPort) + rangeSize - 1}` : ''}
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

import { useI18n } from '../i18n.jsx';

export default function AboutModal({ onClose }) {
  const { t } = useI18n();
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
          <div style={{
            background: 'var(--primary)', borderRadius: 12, width: 48, height: 48,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
          </div>
          <div>
            <h2 style={{ marginBottom: 2 }}>{t('about_title')}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>v1.0 · babakhinaa-jpg/forwarder</p>
          </div>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
          {t('about_desc')}
        </p>

        <div style={{ background: 'var(--surface2)', borderRadius: 'var(--radius)', padding: '14px 16px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px 0', fontSize: 13 }}>
            {[
              [t('about_feat_label'), t('about_feat_val')],
              [t('about_proto_label'), 'TCP / UDP / TCP+UDP'],
              [t('about_mode_label'), `Socket · iptables DNAT`],
              [t('about_range_label'), t('about_range_val')],
              [t('about_i18n_label'), 'EN · RU · ZH · ES · DE · FR · PT · UK · JA'],
            ].map(([k, v]) => (
              <>
                <div style={{ color: 'var(--text-muted)', paddingRight: 12 }}>{k}</div>
                <div style={{ fontWeight: 600 }}>{v}</div>
              </>
            ))}
          </div>
        </div>

        <div style={{
          borderTop: '1px solid var(--border)', paddingTop: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ fontSize: 13 }}>
            <div style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 2 }}>{t('about_dev_label')}</div>
            <div style={{ fontWeight: 700 }}>Александр Бабахин</div>
          </div>
          <button className="btn btn-primary" onClick={onClose}>{t('btn_close')}</button>
        </div>
      </div>
    </div>
  );
}

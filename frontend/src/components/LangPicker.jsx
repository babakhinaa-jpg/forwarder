import { useState, useRef, useEffect } from 'react';
import { useI18n } from '../i18n.jsx';

export default function LangPicker() {
  const { lang, setLang, languages } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost"
        style={{ padding: '6px 10px', fontSize: 13, gap: 4 }}
        onClick={() => setOpen(o => !o)}
        title="Language"
      >
        <span style={{ fontSize: 16 }}>{languages[lang].flag}</span>
        <span style={{ color: 'var(--text-muted)' }}>{lang.toUpperCase()}</span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', right: 0,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius)', minWidth: 160, zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,.35)', overflow: 'hidden',
        }}>
          {Object.entries(languages).map(([code, { name, flag }]) => (
            <button
              key={code}
              onClick={() => { setLang(code); setOpen(false); }}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                width: '100%', padding: '9px 14px',
                background: code === lang ? 'rgba(59,130,246,.12)' : 'transparent',
                border: 'none', cursor: 'pointer', color: 'var(--text)',
                fontSize: 13, textAlign: 'left',
                borderLeft: code === lang ? '2px solid var(--primary)' : '2px solid transparent',
              }}
            >
              <span style={{ fontSize: 16 }}>{flag}</span>
              <span>{name}</span>
              {code === lang && (
                <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

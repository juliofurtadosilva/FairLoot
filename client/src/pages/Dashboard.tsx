import React from 'react'
import { useApp } from '../context/AppContext'

export default function Dashboard() {
  const { t } = useApp()

  return (
    <div className="tab-content">
      <div className="card tab-card" style={{ maxWidth: 700, textAlign: 'center', gap: 20 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{t('dash.welcome')}</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>{t('dash.subtitle')}</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, width: '100%', textAlign: 'left' }}>
          <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--accent)' }}>1. {t('dash.step1Title')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('dash.step1Desc')}</div>
          </div>
          <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--accent)' }}>2. {t('dash.step2Title')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('dash.step2Desc')}</div>
          </div>
          <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4, color: 'var(--accent)' }}>3. {t('dash.step3Title')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{t('dash.step3Desc')}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

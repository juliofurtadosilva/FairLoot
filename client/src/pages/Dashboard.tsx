import React from 'react'
import { useApp } from '../context/AppContext'

const v1Features = [
  { icon: '🎯', titleKey: 'dash.feat.loot' as const, descKey: 'dash.feat.lootDesc' as const },
  { icon: '📋', titleKey: 'dash.feat.wishlist' as const, descKey: 'dash.feat.wishlistDesc' as const },
  { icon: '⚖️', titleKey: 'dash.feat.priority' as const, descKey: 'dash.feat.priorityDesc' as const },
  { icon: '📜', titleKey: 'dash.feat.history' as const, descKey: 'dash.feat.historyDesc' as const },
  { icon: '👥', titleKey: 'dash.feat.members' as const, descKey: 'dash.feat.membersDesc' as const },
  { icon: '🌐', titleKey: 'dash.feat.i18n' as const, descKey: 'dash.feat.i18nDesc' as const },
]

const changelog = [
  {
    version: 'v1.0.0',
    dateKey: 'dash.v1date' as const,
    items: [
      'dash.v1.item1' as const,
      'dash.v1.item2' as const,
      'dash.v1.item3' as const,
      'dash.v1.item4' as const,
      'dash.v1.item5' as const,
      'dash.v1.item6' as const,
    ],
  },
]

export default function Dashboard() {
  const { t } = useApp()

  return (
    <div className="tab-content">
      <div className="card tab-card" style={{ maxWidth: 760, textAlign: 'center', gap: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{t('dash.welcome')}</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>{t('dash.subtitle')}</p>

        {/* v1 Features */}
        <div style={{ width: '100%', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{t('dash.featTitle')}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
            {v1Features.map((f, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>{f.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>{t(f.titleKey)}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{t(f.descKey)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Changelog */}
        <div style={{ width: '100%', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{t('dash.changelog')}</h3>
          {changelog.map((release, ri) => (
            <div key={ri} style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-gold, var(--accent))' }}>{release.version}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>— {t(release.dateKey)}</span>
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {release.items.map((item, ii) => (
                  <li key={ii} style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{t(item)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

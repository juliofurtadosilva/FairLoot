import React, { useEffect, useState } from 'react'
import { useApp } from '../context/AppContext'
import { isDemoMode, getOutdatedWarnings } from '../services/demoData'
import api from '../services/api'
import { getClassIconUrl } from '../services/classIcons'
import './Dashboard.scss'

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
    version: 'v2.0.0',
    date: 'Abr 2026',
    items: [
      'Dashboard mostra jogadores com SimC desatualizado, com ícone da classe e dificuldades afetadas',
      'Histórico de novidades do sistema direto no painel',
      'Melhorias de layout e responsividade em todas as telas',
      'Refinamentos no fluxo de distribuição de loot',
    ],
  },
  {
    version: 'v1.0.0',
    date: 'Mar 2026',
    items: [
      'Controle de loot com sugestões automáticas de distribuição',
      'Integração com WowAudit (wishlists e personagens)',
      'Algoritmo de prioridade com 3 fatores configuráveis (α, β, γ)',
      'Detecção automática de transmog',
      'Histórico completo de distribuições com opção de reverter',
      'Gestão de membros com aprovação e roles',
      'Suporte a Português e Inglês, tema claro e escuro',
    ],
  },
]

export default function Dashboard() {
  const { t } = useApp()
  const [outdated, setOutdated] = useState<{ name: string; diffs: string[]; lastOutdatedTs?: number; className?: string }[]>([])
  const [carouselIndex, setCarouselIndex] = useState(0)

  // no auto-advance — user prefers manual control

  useEffect(() => {
    const load = async () => {
      if (isDemoMode()) {
        // demo helper returns enriched warnings; map into expected shape
        const demo = getOutdatedWarnings()
        setOutdated(demo.map(d => ({ name: d.name, diffs: ['unknown'], lastOutdatedTs: d.lastOutdatedTs, className: d.className })))
      } else {
        try {
          const [r, charsRes] = await Promise.all([
            api.get('/api/guild/wowaudit/wishlists').catch(() => ({ data: {} })),
            api.get('/api/guild/characters').catch(() => ({ data: [] })),
          ])
          const characters = r.data?.raw?.characters || []
          const dbChars = charsRes.data || []
          const classMap: Record<string, string> = {}
          for (const dc of dbChars) { if (dc && dc.name && dc.class) classMap[dc.name] = dc.class }

          const warnings: { name: string; diffs: string[]; lastOutdatedTs?: number; className?: string }[] = []
          for (const c of characters) {
            const diffsSet = new Set<string>()
            let latestOutdatedTs: number | undefined
            for (const inst of (c.instances || [])) {
              for (const diff of (inst.difficulties || [])) {
                const diffName = (diff.difficulty || '').toString().trim().toLowerCase()
                const wl = diff.wishlist || {}
                // also consider wishlist-level timestamps
                if (wl.updated_at) {
                  for (const tsVal of Object.values(wl.updated_at)) {
                    if (tsVal) {
                      const ts = new Date(tsVal as string).getTime()
                      if (!isNaN(ts)) latestOutdatedTs = Math.max(latestOutdatedTs || 0, ts)
                    }
                  }
                }
                for (const enc of (wl.encounters || [])) {
                  for (const item of (enc.items || [])) {
                    for (const wish of (item.wishes || [])) {
                      if (wish.outdated && wish.outdated.old && wish.outdated.new) {
                        diffsSet.add(diffName || 'unknown')
                        if (wish.timestamp) {
                          const ts = new Date(wish.timestamp).getTime()
                          if (!isNaN(ts)) latestOutdatedTs = Math.max(latestOutdatedTs || 0, ts)
                        }
                      }
                    }
                  }
                }
              }
            }
            if (diffsSet.size > 0) warnings.push({ name: c.name, diffs: Array.from(diffsSet), lastOutdatedTs: latestOutdatedTs, className: classMap[c.name] })
          }
          // sort by number of difficulties affected (desc) then name
          setOutdated(warnings.sort((a, b) => b.diffs.length - a.diffs.length || a.name.localeCompare(b.name)))
        } catch {}
      }
    }
    load()
  }, [])

  return (
    <div className="tab-content">
      <div className="card tab-card" style={{textAlign: 'center', gap: 24 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: 'var(--accent)' }}>{t('dash.welcome')}</h2>
        <p style={{ margin: 0, color: 'var(--muted)', fontSize: 14, lineHeight: 1.7 }}>{t('dash.subtitle')}</p>

        {/* Outdated SimC Warnings — first thing after welcome */}
        {outdated.length > 0 && (
          <div className="outdated-section">
            <h3 className="outdated-title">{t('dash.outdatedTitle')}</h3>
            <p className="outdated-desc">{t('dash.outdatedDesc')}</p>
            <div className="outdated-grid">
              {outdated.map((w, i) => {
                const daysAgo = w.lastOutdatedTs ? Math.max(1, Math.floor((Date.now() - w.lastOutdatedTs) / (1000*60*60*24))) : null
                const classIcon = getClassIconUrl(w.className)
                return (
                  <div key={i} className="outdated-card">
                    <div className="outdated-top">
                      {classIcon ? (
                        <img src={classIcon} alt={w.className || ''} className="outdated-class-icon" draggable={false} />
                      ) : (
                        <div className="outdated-class-icon outdated-class-icon--empty" />
                      )}
                      <div className="outdated-name">{w.name}</div>
                    </div>
                    <div className="outdated-bottom">
                      <div className="outdated-badges">
                        {w.diffs.map((d, di) => (
                          <span key={di} className={`badge badge-diff badge-diff--${d}`}>{d ? d.toUpperCase() : 'UNK'}</span>
                        ))}
                      </div>
                      {daysAgo !== null && (
                        <div className="outdated-days">{daysAgo} {daysAgo === 1 ? t('dash.outdatedDay') : t('dash.outdatedDays')}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* v1 Features */}
        <div style={{ width: '100%', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 15, fontWeight: 700, color: 'var(--accent)' }}>{t('dash.featTitle')}</h3>
          <div className="features-grid">
            {v1Features.map((f, i) => (
              <div key={i} className="feature-card">
                <span className="feature-icon">{f.icon}</span>
                <div className="feature-text">
                  <div className="feature-title">{t(f.titleKey)}</div>
                  <div className="feature-desc">{t(f.descKey)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Changelog carousel */}
        <div className="changelog-section">
          <h3 className="changelog-title">{t('dash.changelog')}</h3>
          <div className="carousel">
            <button className="carousel-btn" onClick={() => setCarouselIndex((carouselIndex - 1 + changelog.length) % changelog.length)}>‹</button>
            <div className="carousel-item">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--color-gold, var(--accent))' }}>{changelog[carouselIndex].version}</span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{changelog[carouselIndex].date}</span>
              </div>
              <ul className="carousel-list">
                {changelog[carouselIndex].items.map((item, ii) => (
                  <li key={ii}>{item}</li>
                ))}
              </ul>
            </div>
            <button className="carousel-btn" onClick={() => setCarouselIndex((carouselIndex + 1) % changelog.length)}>›</button>
          </div>
          <div className="carousel-dots">
            {changelog.map((_, i) => (
              <button key={i} className={`dot ${i === carouselIndex ? 'active' : ''}`} onClick={() => setCarouselIndex(i)} />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

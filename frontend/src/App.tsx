import { useEffect, useState } from 'react'
import { api, isAdmin, ROLE_LABEL, setOnUnauthorized, type Me, type Station } from './api'
import Login from './Login'
import MapPage from './MapPage'
import Dashboard from './Dashboard'
import Users from './Users'
import { IconDashboard, IconLogOut, IconMap, IconShield, IconUsers } from './icons'

type Page = 'map' | 'dashboard' | 'users'

export default function App() {
  const [me, setMe] = useState<Me | null | undefined>(undefined)
  const [stations, setStations] = useState<Station[]>([])
  const [page, setPage] = useState<Page>('map')

  const loadMe = () =>
    api<Me>('/me')
      .then(setMe)
      .catch(() => setMe(null))

  useEffect(() => {
    setOnUnauthorized(() => setMe(null))
    loadMe()
  }, [])

  useEffect(() => {
    if (me) api<Station[]>('/stations').then(setStations)
  }, [me])

  if (me === undefined) {
    return (
      <div className="center magic-dots">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div className="brand-icon-loading">
            <div className="brand-icon" style={{ width: 48, height: 48 }}>
              <IconShield width={24} height={24} />
            </div>
          </div>
          <div className="loading-badge-pill">
            <span className="spinner-mini" />
            <span>กำลังเชื่อมต่อระบบสารสนเทศภูมิศาสตร์สืบสวน…</span>
          </div>
        </div>
      </div>
    )
  }

  if (me === null) return <Login onLogin={loadMe} />

  const logout = async () => {
    await api('/logout', 'POST').catch(() => {})
    setMe(null)
    setPage('map')
  }

  const tabs: { key: Page; label: string; shortLabel: string; icon: React.ReactNode }[] = [
    { key: 'map', label: 'แผนที่ติดตาม', shortLabel: 'แผนที่', icon: <IconMap width={18} height={18} /> },
    { key: 'dashboard', label: 'แดชบอร์ดสรุปผล', shortLabel: 'แดชบอร์ด', icon: <IconDashboard width={18} height={18} /> },
    ...(isAdmin(me)
      ? [{ key: 'users' as Page, label: 'จัดการผู้ใช้งาน', shortLabel: 'ผู้ใช้งาน', icon: <IconUsers width={18} height={18} /> }]
      : []),
  ]

  const userInitial = me.full_name ? me.full_name.trim().charAt(0) : 'U'

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon" aria-hidden="true">
            <IconShield width={18} height={18} />
          </div>
          <div className="brand-text">
            <span>
              ติดตามผู้ต้องหา <b>ภ.จว.อ่างทอง</b>
            </span>
            <span className="brand-badge hide-mobile">
              <span className="live-dot" /> ระบบสารสนเทศภูมิศาสตร์สืบสวน
            </span>
          </div>
        </div>

        {/* Desktop Header Navigation */}
        <nav className="desktop-nav hide-mobile" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={page === t.key}
              className={page === t.key ? 'tab active' : 'tab'}
              onClick={() => setPage(t.key)}
            >
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="who">
          <div className="user-profile">
            <div className="user-avatar" aria-hidden="true">
              {userInitial}
            </div>
            <div className="user-meta hide-mobile">
              <span className="user-name">{me.full_name}</span>
              <span className="user-role-badge">
                {ROLE_LABEL[me.role]}
                {me.station_name ? ` · ${me.station_name}` : ''}
              </span>
            </div>
          </div>
          <button className="btn ghost small logout-btn" onClick={logout} title="ออกจากระบบ">
            <IconLogOut width={15} height={15} />
            <span className="hide-mobile">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      <main className="main-content">
        {page === 'map' && <MapPage me={me} stations={stations} />}
        {page === 'dashboard' && <Dashboard me={me} />}
        {page === 'users' && isAdmin(me) && <Users me={me} stations={stations} />}
      </main>

      {/* Mobile Floating Bottom Navigation Dock */}
      <nav className="bottom-nav hide-desktop" role="navigation" aria-label="แถบเมนูด้านล่าง">
        <div className="bottom-nav-dock">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={page === t.key}
              className={page === t.key ? 'bottom-nav-item active' : 'bottom-nav-item'}
              onClick={() => setPage(t.key)}
            >
              <div className="bottom-nav-icon">{t.icon}</div>
              <span className="bottom-nav-label">{t.shortLabel}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

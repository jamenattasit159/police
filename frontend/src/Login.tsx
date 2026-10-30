import { useState, type FormEvent } from 'react'
import { api, type SystemSettings } from './api'
import { IconLock, IconShield, IconUser } from './icons'

export default function Login({ onLogin, settings }: { onLogin: () => void; settings?: SystemSettings }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api('/login', 'POST', { username, password })
      onLogin()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap magic-dots">
      <form className="login-card" onSubmit={submit}>
        <div className="login-header">
          <div className="login-badge" aria-hidden="true">
            {settings?.system_badge_url ? (
              <img
                src={settings.system_badge_url}
                alt="ตราสัญลักษณ์"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <IconShield width={24} height={24} />
            )}
          </div>
          <h1>{settings?.system_title ? `${settings.system_title}` : 'ระบบติดตามผู้ต้องหา'}</h1>
          <p className="subtitle">{settings?.system_org || 'ตำรวจภูธรจังหวัดอ่างทอง'}</p>
        </div>

        <label>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <IconUser width={14} height={14} style={{ opacity: 0.6 }} />
            ชื่อผู้ใช้งาน
          </span>
          <input
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="กรอกชื่อผู้ใช้"
            required
          />
        </label>

        <label>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}>
            <IconLock width={14} height={14} style={{ opacity: 0.6 }} />
            รหัสผ่าน
          </span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="กรอกรหัสผ่าน"
            required
          />
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <button className="btn primary" disabled={busy} style={{ minHeight: 42, marginTop: 4 }}>
          {busy ? 'กำลังตรวจสอบสิทธิ์…' : 'เข้าสู่ระบบ'}
        </button>

        <div className="login-footer-badge">
          <IconLock width={12} height={12} />
          <span>ระบบสารสนเทศความมั่นคง ใช้เฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต</span>
        </div>
      </form>
    </div>
  )
}

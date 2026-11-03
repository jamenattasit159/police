import { useState, type FormEvent } from 'react'
import { api, type SystemSettings } from './api'
import { IconLock, IconShield, IconUser } from './icons'

export default function Login({ onLogin, settings }: { onLogin: () => void; settings?: SystemSettings }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [contact, setContact] = useState('')
  const [sent, setSent] = useState('')

  const requestReset = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api<{ message: string }>('/password-reset-requests', 'POST', { username, contact })
      setSent(r.message)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (forgot)
    return (
      <div className="login-wrap magic-dots">
        <form className="login-card" onSubmit={requestReset}>
          <div className="login-header">
            <div className="login-badge" aria-hidden="true">
              <IconLock width={24} height={24} />
            </div>
            <h1>ลืมรหัสผ่าน</h1>
            <p className="subtitle">ส่งคำขอให้เจ้าหน้าที่ที่เกี่ยวข้องออกรหัสผ่านชั่วคราวให้ แล้วตั้งรหัสใหม่เมื่อเข้าระบบ</p>
          </div>
          {sent ? (
            <p role="status" style={{ margin: 0 }}>{sent}</p>
          ) : (
            <>
              <label>
                ชื่อผู้ใช้งาน
                <input autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} required maxLength={100} />
              </label>
              <label>
                ยศ-ชื่อ และเบอร์ติดต่อกลับ
                <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="เช่น ด.ต.สมชาย 08x-xxx-xxxx" maxLength={200} />
              </label>
              {error && (
                <p className="error" role="alert">
                  {error}
                </p>
              )}
              <button className="btn primary" disabled={busy} style={{ minHeight: 42 }}>
                {busy ? 'กำลังส่ง…' : 'ส่งคำขอรีเซ็ตรหัสผ่าน'}
              </button>
            </>
          )}
          <button type="button" className="link" onClick={() => { setForgot(false); setSent(''); setError('') }}>
            กลับไปหน้าเข้าสู่ระบบ
          </button>
        </form>
      </div>
    )

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

        <button type="button" className="link" onClick={() => { setForgot(true); setError('') }}>
          ลืมรหัสผ่าน?
        </button>

        <div className="login-footer-badge">
          <IconLock width={12} height={12} />
          <span>ระบบสารสนเทศความมั่นคง ใช้เฉพาะเจ้าหน้าที่ที่ได้รับอนุญาต</span>
        </div>
      </form>
    </div>
  )
}

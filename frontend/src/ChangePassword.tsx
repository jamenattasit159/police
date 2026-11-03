import { useState, type FormEvent } from 'react'
import { api, type Me } from './api'
import { IconCheck, IconLock, IconLogOut, IconShield } from './icons'

// forced: first login / after an admin reset — the server blocks everything else until this succeeds.
export default function ChangePassword({
  me,
  forced,
  onDone,
  onLogout,
}: {
  me: Me
  forced?: boolean
  onDone: () => void
  onLogout?: () => void
}) {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (next !== confirm) return setError('รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน')
    setBusy(true)
    try {
      await api('/password', 'POST', { current_password: current, new_password: next })
      setCurrent('')
      setNext('')
      setConfirm('')
      if (forced) onDone()
      else setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const form = (
    <form className={forced ? 'login-card' : 'card user-form'} onSubmit={submit} style={forced ? undefined : { maxWidth: 480 }}>
      {forced ? (
        <div className="login-header">
          <div className="login-badge" aria-hidden="true">
            <IconShield width={24} height={24} />
          </div>
          <h1>ตั้งรหัสผ่านใหม่ของท่าน</h1>
          <p className="subtitle">
            {me.full_name} — เพื่อความปลอดภัย กรุณาเปลี่ยนรหัสผ่านที่ได้รับจากผู้ดูแลก่อนเริ่มใช้งาน
          </p>
        </div>
      ) : (
        <h3 style={{ margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <IconLock width={18} height={18} />
          <span>เปลี่ยนรหัสผ่าน</span>
        </h3>
      )}

      <label>
        {forced ? 'รหัสผ่านที่ได้รับ (รหัสปัจจุบัน)' : 'รหัสผ่านปัจจุบัน'}
        <input type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
      </label>
      <label>
        รหัสผ่านใหม่ (อย่างน้อย 8 ตัวอักษร)
        <input type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} minLength={8} maxLength={72} required />
      </label>
      <label>
        พิมพ์รหัสผ่านใหม่อีกครั้ง
        <input type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} maxLength={72} required />
      </label>
      <p className="muted small" style={{ margin: 0 }}>
        แนะนำ: ผสมตัวอักษรและตัวเลข ไม่ใช้วันเกิดหรือเบอร์โทร และไม่ใช้ร่วมกับบัญชีอื่น
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {done && (
        <p className="success-text" role="status" style={{ margin: 0, color: 'var(--success)' }}>
          เปลี่ยนรหัสผ่านเรียบร้อย อุปกรณ์อื่นที่เคยเข้าสู่ระบบไว้ถูกออกจากระบบแล้ว
        </p>
      )}

      <button className="btn primary" disabled={busy} style={{ minHeight: 42 }}>
        <IconCheck width={15} height={15} />
        <span>{busy ? 'กำลังบันทึก…' : 'บันทึกรหัสผ่านใหม่'}</span>
      </button>
      {forced && onLogout && (
        <button type="button" className="btn ghost" onClick={onLogout}>
          <IconLogOut width={15} height={15} />
          <span>ออกจากระบบ</span>
        </button>
      )}
    </form>
  )

  return forced ? <div className="login-wrap magic-dots">{form}</div> : <div className="page">{form}</div>
}

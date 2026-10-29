import { useEffect, useState, type FormEvent } from 'react'
import { api, ROLE_LABEL, type Me, type Role, type Station, type UserRow } from './api'
import { IconCheck, IconEdit, IconLock, IconPlus, IconUser, IconUsers, IconX } from './icons'

type Form = {
  id?: number
  username: string
  password: string
  full_name: string
  role: Role
  station_id: number | null
  active: boolean
}

const empty: Form = { username: '', password: '', full_name: '', role: 'officer', station_id: null, active: true }

export default function Users({ me, stations }: { me: Me; stations: Station[] }) {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<Form | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = () => {
    api<UserRow[]>('/users')
      .then(setUsers)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setError('')
    try {
      const body = { ...form, station_id: form.role === 'officer' ? form.station_id : null }
      if (form.id) await api(`/users/${form.id}`, 'PUT', body)
      else await api('/users', 'POST', body)
      setForm(null)
      await load()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const set = <K extends keyof Form>(k: K, v: Form[K]) => form && setForm({ ...form, [k]: v })

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">
          <h2>จัดการบัญชีผู้ใช้งานระบบ</h2>
          <p>กำหนดสิทธิ์การเข้าถึง บัญชีผู้กำกับ สารวัตร และเจ้าหน้าที่ประจำ สภ.</p>
        </div>
        {!form && (
          <button className="btn primary" onClick={() => setForm({ ...empty })}>
            <IconPlus width={16} height={16} />
            <span>เพิ่มผู้ใช้งานใหม่</span>
          </button>
        )}
      </div>

      {error && (
        <p className="error" role="alert">
          <span>{error}</span>
          <button className="link" onClick={() => setError('')}>
            ปิด
          </button>
        </p>
      )}

      {form && (
        <form className="card user-form" onSubmit={save} style={{ marginBottom: 24 }}>
          <div className="row between" style={{ marginBottom: 12 }}>
            <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              <IconUser width={18} height={18} />
              <span>{form.id ? `แก้ไขข้อมูล: ${form.username}` : 'เพิ่มผู้ใช้งานใหม่'}</span>
            </h3>
            <button
              type="button"
              className="btn ghost small"
              onClick={() => setForm(null)}
            >
              <IconX width={16} height={16} />
            </button>
          </div>

          <div className="grid2">
            <label>
              ชื่อผู้ใช้ (Username สำหรับเข้าสู่ระบบ)
              <input
                value={form.username}
                onChange={(e) => set('username', e.target.value)}
                disabled={!!form.id}
                placeholder="เช่น officer_mueang"
                required
              />
            </label>

            <label>
              ชื่อ-นามสกุล / ยศ-ตำแหน่ง
              <input
                value={form.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                placeholder="เช่น พ.ต.ท. สมชาย หมายมั่น"
                required
              />
            </label>

            <label>
              ระดับบทบาท (Role)
              <select value={form.role} onChange={(e) => set('role', e.target.value as Role)}>
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </label>

            {form.role === 'officer' && (
              <label>
                สังกัดสถานีตำรวจภูธร (สภ.)
                <select
                  value={form.station_id ?? ''}
                  onChange={(e) => set('station_id', Number(e.target.value))}
                  required
                >
                  <option value="" disabled>
                    เลือก สภ. ประจำการ
                  </option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <IconLock width={13} height={13} />
                {form.id ? 'รหัสผ่านใหม่ (เว้นว่างถ้าไม่ต้องการเปลี่ยน)' : 'รหัสผ่าน (อย่างน้อย 8 ตัวอักษร)'}
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => set('password', e.target.value)}
                required={!form.id}
                minLength={8}
                placeholder={form.id ? '••••••••' : 'ระบุรหัสผ่าน'}
              />
            </label>

            {form.id && form.id !== me.id && (
              <div style={{ display: 'flex', alignItems: 'center', paddingTop: 20 }}>
                <label className="check">
                  <input type="checkbox" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
                  <span>เปิดใช้งานบัญชีนี้ในระบบ</span>
                </label>
              </div>
            )}
          </div>

          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" disabled={busy}>
              <IconCheck width={15} height={15} />
              <span>{busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูลผู้ใช้'}</span>
            </button>
            <button type="button" className="btn" onClick={() => setForm(null)}>
              ยกเลิก
            </button>
          </div>
        </form>
      )}

      <div className="table-card">
        <div className="table-header-bar">
          <h3>
            <IconUsers width={16} height={16} style={{ verticalAlign: 'middle', marginRight: 8, opacity: 0.6 }} />
            รายชื่อผู้ใช้งานทั้งหมด ({users.length} บัญชี)
          </h3>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ชื่อผู้ใช้งาน</th>
                <th>ชื่อ-สกุล / ยศ</th>
                <th>บทบาท</th>
                <th>สังกัด สภ.</th>
                <th>สถานะ</th>
                <th style={{ textAlign: 'right' }}>การจัดการ</th>
              </tr>
            </thead>
            <tbody>
              {loading && users.length === 0
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="skeleton-line" style={{ width: 80 }} /></td>
                      <td><div className="skeleton-line" style={{ width: 140 }} /></td>
                      <td><div className="skeleton-line" style={{ width: 70 }} /></td>
                      <td><div className="skeleton-line" style={{ width: 110 }} /></td>
                      <td><div className="skeleton-line" style={{ width: 60 }} /></td>
                      <td style={{ textAlign: 'right' }}><div className="skeleton-line" style={{ width: 50, marginLeft: 'auto' }} /></td>
                    </tr>
                  ))
                : users.map((u) => (
                  <tr key={u.id} className={u.active ? '' : 'inactive'}>
                  <td>
                    <code style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-main)' }}>
                      {u.username}
                    </code>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div className="user-avatar" style={{ width: 26, height: 26, fontSize: '0.74rem' }}>
                        {u.full_name ? u.full_name.charAt(0) : 'U'}
                      </div>
                      <span style={{ fontWeight: 500 }}>{u.full_name}</span>
                    </div>
                  </td>
                  <td>
                    <span className={`role-badge ${u.role}`}>{ROLE_LABEL[u.role]}</span>
                  </td>
                  <td>{u.station_name ?? <span className="muted">—</span>}</td>
                  <td>
                    <span className={`status-badge ${u.active ? 'active' : 'inactive'}`}>
                      <span className="live-dot" style={{ background: u.active ? 'var(--success)' : '#a1a1aa' }} />
                      <span>{u.active ? 'ใช้งานอยู่' : 'ระงับการใช้งาน'}</span>
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn small"
                      onClick={() =>
                        setForm({
                          id: u.id,
                          username: u.username,
                          password: '',
                          full_name: u.full_name,
                          role: u.role,
                          station_id: u.station_id,
                          active: u.active,
                        })
                      }
                    >
                      <IconEdit width={13} height={13} />
                      <span>แก้ไข</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

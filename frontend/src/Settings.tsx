import { useRef, useState, type FormEvent } from 'react'
import { api, isAdmin, ROLE_LABEL, type Me, type Station, type SystemSettings } from './api'
import {
  IconBuilding,
  IconCheck,
  IconEdit,
  IconImage,
  IconPhone,
  IconPlus,
  IconRotateCcw,
  IconSettings,
  IconShield,
  IconTrash,
  IconUpload,
  IconX,
} from './icons'

interface SettingsProps {
  me: Me
  stations: Station[]
  settings: SystemSettings
  onUpdateSettings: (newSettings: SystemSettings) => void
  onUpdateStations: (newStations: Station[]) => void
}

// Preset SVG police badges as clean Data URLs
const PRESET_BADGES = [
  {
    id: 'default',
    label: 'ตราโล่มาตรฐาน (Default)',
    url: '',
    preview: (
      <div className="preset-preview-box">
        <IconShield width={24} height={24} />
      </div>
    ),
  },
  {
    id: 'star8',
    label: 'ตราดาวเงิน 8 แฉก',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><polygon points="50,5 61,35 95,35 68,55 79,88 50,68 21,88 32,55 5,35 39,35" fill="%23f59e0b" stroke="%23b45309" stroke-width="3"/><circle cx="50" cy="50" r="18" fill="%23b91c1c" stroke="%23fbbf24" stroke-width="2"/><circle cx="50" cy="50" r="8" fill="%23fef3c7"/></svg>',
    preview: (
      <div className="preset-preview-box">
        <svg viewBox="0 0 100 100" width={24} height={24}>
          <polygon points="50,5 61,35 95,35 68,55 79,88 50,68 21,88 32,55 5,35 39,35" fill="#f59e0b" stroke="#b45309" strokeWidth="3"/>
          <circle cx="50" cy="50" r="18" fill="#b91c1c" stroke="#fbbf24" strokeWidth="2"/>
        </svg>
      </div>
    ),
  },
  {
    id: 'shield_gold',
    label: 'ตราโล่ทองเกียรติยศ',
    url: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M50 92 C25 80 12 55 12 25 L50 8 L88 25 C88 55 75 80 50 92 Z" fill="%23b45309" stroke="%23f59e0b" stroke-width="4"/><path d="M50 82 C30 72 20 50 20 28 L50 16 L80 28 C80 50 70 72 50 82 Z" fill="%231e3a8a"/><polygon points="50,26 56,42 74,42 60,53 65,70 50,60 35,70 40,53 26,42 44,42" fill="%23fbbf24"/></svg>',
    preview: (
      <div className="preset-preview-box">
        <svg viewBox="0 0 100 100" width={24} height={24}>
          <path d="M50 92 C25 80 12 55 12 25 L50 8 L88 25 C88 55 75 80 50 92 Z" fill="#b45309" stroke="#f59e0b" strokeWidth="4"/>
          <path d="M50 82 C30 72 20 50 20 28 L50 16 L80 28 C80 50 70 72 50 82 Z" fill="#1e3a8a"/>
          <polygon points="50,26 56,42 74,42 60,53 65,70 50,60 35,70 40,53 26,42 44,42" fill="#fbbf24"/>
        </svg>
      </div>
    ),
  },
]

export default function Settings({
  me,
  stations,
  settings,
  onUpdateSettings,
  onUpdateStations,
}: SettingsProps) {
  const [activeTab, setActiveTab] = useState<'branding' | 'stations'>('branding')
  const [prevSettings, setPrevSettings] = useState(settings)
  const [formSettings, setFormSettings] = useState<SystemSettings>(settings)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSuccess, setSettingsSuccess] = useState('')
  const [settingsError, setSettingsError] = useState('')

  // Station management state
  const [stationMode, setStationMode] = useState<'list' | 'add' | 'edit'>('list')
  const [editingStation, setEditingStation] = useState<Station | null>(null)
  const [stationCode, setStationCode] = useState('')
  const [stationName, setStationName] = useState('')
  const [stationPhone, setStationPhone] = useState('')
  const [stationAddress, setStationAddress] = useState('')
  const [savingStation, setSavingStation] = useState(false)
  const [stationError, setStationError] = useState('')
  const [stationSuccess, setStationSuccess] = useState('')

  const fileInputRef = useRef<HTMLInputElement>(null)

  if (prevSettings !== settings) {
    setPrevSettings(settings)
    setFormSettings(settings)
  }

  if (!isAdmin(me)) {
    return (
      <div className="page">
        <div className="card" style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div className="brand-icon" style={{ margin: '0 auto 16px', width: 48, height: 48 }}>
            <IconShield width={24} height={24} />
          </div>
          <h2>ไม่มีสิทธิ์เข้าถึงหน้านี้</h2>
          <p className="muted">
            การแก้ไขข้อมูลส่วนกลางของระบบ (ชื่อ สภ. ตราสัญลักษณ์ และชื่อระบบ) สงวนสิทธิ์เฉพาะระดับสารวัตรขึ้นไปเท่านั้น
          </p>
        </div>
      </div>
    )
  }

  // Handle image upload and resize client-side
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setSettingsError('กรุณาเลือกไฟล์รูปภาพ (PNG, JPG, SVG, WebP)')
      return
    }

    const reader = new FileReader()
    reader.onload = (event) => {
      const src = event.target?.result as string
      // If SVG, can store directly if reasonably sized
      if (file.type === 'image/svg+xml') {
        setFormSettings((prev) => ({ ...prev, system_badge_url: src }))
        setSettingsError('')
        return
      }

      // Resize raster image using canvas
      const img = new Image()
      img.onload = () => {
        const maxSize = 256
        let w = img.width
        let h = img.height
        if (w > h) {
          if (w > maxSize) {
            h = Math.round((h * maxSize) / w)
            w = maxSize
          }
        } else {
          if (h > maxSize) {
            w = Math.round((w * maxSize) / h)
            h = maxSize
          }
        }
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h)
          const dataUrl = canvas.toDataURL('image/png', 0.9)
          setFormSettings((prev) => ({ ...prev, system_badge_url: dataUrl }))
          setSettingsError('')
        }
      }
      img.onerror = () => setSettingsError('ไม่สามารถประมวลผลไฟล์รูปภาพได้')
      img.src = src
    }
    reader.readAsDataURL(file)
  }

  const saveBranding = async (e: FormEvent) => {
    e.preventDefault()
    setSavingSettings(true)
    setSettingsError('')
    setSettingsSuccess('')
    try {
      const updated = await api<SystemSettings>('/settings', 'PUT', formSettings)
      onUpdateSettings(updated)
      setSettingsSuccess('บันทึกการตั้งค่าระบบเรียบร้อยแล้ว')
      setTimeout(() => setSettingsSuccess(''), 4000)
    } catch (err) {
      setSettingsError((err as Error).message)
    } finally {
      setSavingSettings(false)
    }
  }

  const startAddStation = () => {
    setStationMode('add')
    setEditingStation(null)
    setStationCode('')
    setStationName('')
    setStationPhone('')
    setStationAddress('')
    setStationError('')
    setStationSuccess('')
  }

  const startEditStation = (st: Station) => {
    setStationMode('edit')
    setEditingStation(st)
    setStationCode(st.code)
    setStationName(st.name)
    setStationPhone(st.phone || '')
    setStationAddress(st.address || '')
    setStationError('')
    setStationSuccess('')
  }

  const cancelStationForm = () => {
    setStationMode('list')
    setEditingStation(null)
    setStationCode('')
    setStationName('')
    setStationPhone('')
    setStationAddress('')
  }

  const saveStation = async (e: FormEvent) => {
    e.preventDefault()
    setSavingStation(true)
    setStationError('')
    try {
      if (stationMode === 'add') {
        const created = await api<Station>('/stations', 'POST', {
          code: stationCode.trim().toUpperCase(),
          name: stationName.trim(),
          phone: stationPhone.trim(),
          address: stationAddress.trim(),
        })
        const updatedList = [...stations, created].sort((a, b) => a.code.localeCompare(b.code))
        onUpdateStations(updatedList)
        setStationSuccess(`เพิ่ม ${created.name} (${created.code}) เรียบร้อยแล้ว`)
        cancelStationForm()
      } else if (stationMode === 'edit' && editingStation) {
        await api(`/stations/${editingStation.id}`, 'PUT', {
          name: stationName.trim(),
          phone: stationPhone.trim(),
          address: stationAddress.trim(),
        })
        const updatedList = stations.map((s) =>
          s.id === editingStation.id
            ? { ...s, name: stationName.trim(), phone: stationPhone.trim(), address: stationAddress.trim() }
            : s,
        )
        onUpdateStations(updatedList)
        setStationSuccess(`อัปเดตข้อมูล ${stationName} สำเร็จ`)
        cancelStationForm()
      }
      setTimeout(() => setStationSuccess(''), 4000)
    } catch (err) {
      setStationError((err as Error).message)
    } finally {
      setSavingStation(false)
    }
  }

  const deleteStation = async (st: Station) => {
    const confirmMsg = `ยืนยันการลบ ${st.name} (${st.code}) ออกจากระบบหรือไม่?\n\nคำเตือน: หากมีข้อมูลผู้ต้องหาหรือเจ้าหน้าที่สังกัด สภ. นี้ ระบบจะไม่อนุญาตให้ลบเพื่อความปลอดภัยของข้อมูล`
    if (!window.confirm(confirmMsg)) return

    setStationError('')
    try {
      await api(`/stations/${st.id}`, 'DELETE')
      const updatedList = stations.filter((s) => s.id !== st.id)
      onUpdateStations(updatedList)
      setStationSuccess(`ลบ ${st.name} (${st.code}) เรียบร้อยแล้ว`)
      if (editingStation?.id === st.id) {
        cancelStationForm()
      }
      setTimeout(() => setStationSuccess(''), 4000)
    } catch (err) {
      setStationError((err as Error).message)
    }
  }

  return (
    <div className="page settings-page">
      <div className="page-header">
        <div className="page-title">
          <h2>
            <IconSettings width={22} height={22} style={{ verticalAlign: 'middle', marginRight: 8, opacity: 0.8 }} />
            ตั้งค่าระบบและข้อมูลหน่วยงาน
          </h2>
          <p>
            สิทธิ์เฉพาะระดับสารวัตรขึ้นไป ({ROLE_LABEL[me.role]}) ในการปรับแต่งตราสัญลักษณ์ ชื่อระบบ และข้อมูลสถานีตำรวจภูธร (สภ.)
          </p>
        </div>
        <div className="settings-role-badge">
          <span className="live-dot" />
          <span>เข้าถึงในฐานะ: {ROLE_LABEL[me.role]}</span>
        </div>
      </div>

      {/* Tabs Selection */}
      <div className="settings-nav-tabs">
        <button
          className={`settings-nav-tab ${activeTab === 'branding' ? 'active' : ''}`}
          onClick={() => setActiveTab('branding')}
        >
          <IconImage width={16} height={16} />
          <span>ตราสัญลักษณ์ & ชื่อระบบ</span>
        </button>
        <button
          className={`settings-nav-tab ${activeTab === 'stations' ? 'active' : ''}`}
          onClick={() => setActiveTab('stations')}
        >
          <IconBuilding width={16} height={16} />
          <span>จัดการสถานีตำรวจภูธร (สภ.)</span>
        </button>
      </div>

      {/* Tab 1: System Identity & Branding */}
      {activeTab === 'branding' && (
        <form className="settings-form" onSubmit={saveBranding}>
          {settingsSuccess && (
            <div className="alert success">
              <IconCheck width={16} height={16} />
              <span>{settingsSuccess}</span>
            </div>
          )}
          {settingsError && (
            <div className="error">
              <span>{settingsError}</span>
              <button type="button" className="link" onClick={() => setSettingsError('')}>
                ปิด
              </button>
            </div>
          )}

          {/* Live Header Preview Box */}
          <div className="preview-card">
            <span className="preview-label">ตัวอย่างการแสดงผลแถบด้านบน (Header Preview):</span>
            <div className="preview-topbar">
              <div className="brand">
                <div className="brand-icon">
                  {formSettings.system_badge_url ? (
                    <img
                      src={formSettings.system_badge_url}
                      alt="ตราสัญลักษณ์"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <IconShield width={18} height={18} />
                  )}
                </div>
                <div className="brand-text">
                  <span>
                    {formSettings.system_title || 'ติดตามผู้ต้องหา'} <b>{formSettings.system_org || 'ภ.จว.อ่างทอง'}</b>
                  </span>
                  <span className="brand-badge">
                    <span className="live-dot" /> {formSettings.system_subtitle || 'ระบบสารสนเทศภูมิศาสตร์สืบสวน'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Section 1.1: Logo & Badge */}
            <div className="settings-section">
              <h3>1. รูปตราสัญลักษณ์ประจำระบบ</h3>
              <p className="muted small">
                แสดงผลในแถบเมนูด้านบน หน้าจอเข้าสู่ระบบ และหน้าโหลด สามารถเลือกจากแม่แบบ หรืออัปโหลดไฟล์ตราของหน่วยงาน
              </p>

              <div className="logo-edit-layout">
                <div className="logo-current-box">
                  {formSettings.system_badge_url ? (
                    <img
                      src={formSettings.system_badge_url}
                      alt="Current Badge"
                      className="logo-current-img"
                    />
                  ) : (
                    <div className="logo-placeholder">
                      <IconShield width={40} height={40} />
                      <span style={{ fontSize: '0.75rem', marginTop: 4 }}>ตรามาตรฐาน</span>
                    </div>
                  )}
                </div>

                <div className="logo-actions">
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    onChange={handleFileUpload}
                  />

                  <div className="row">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <IconUpload width={16} height={16} />
                      <span>อัปโหลดรูปภาพตราใหม่</span>
                    </button>
                    {formSettings.system_badge_url && (
                      <button
                        type="button"
                        className="btn ghost small"
                        onClick={() => setFormSettings((p) => ({ ...p, system_badge_url: '' }))}
                      >
                        <IconRotateCcw width={14} height={14} />
                        <span>รีเซ็ตเป็นตราเดิม</span>
                      </button>
                    )}
                  </div>

                  <div className="presets-list">
                    <span className="small muted">หรือเลือกตราแม่แบบ:</span>
                    <div className="presets-grid">
                      {PRESET_BADGES.map((pb) => (
                        <button
                          key={pb.id}
                          type="button"
                          className={`preset-btn ${formSettings.system_badge_url === pb.url ? 'active' : ''}`}
                          onClick={() => setFormSettings((p) => ({ ...p, system_badge_url: pb.url }))}
                        >
                          {pb.preview}
                          <span>{pb.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <hr style={{ border: 0, borderTop: '1px solid var(--border-subtle)', margin: '4px 0' }} />

            {/* Section 1.2: System Titles & Text */}
            <div className="settings-section">
              <h3>2. ชื่อระบบและข้อความระบุหน่วยงาน</h3>
              <div className="grid2" style={{ gap: 16 }}>
                <label>
                  <span>ชื่อระบบหลัก</span>
                  <input
                    value={formSettings.system_title}
                    onChange={(e) => setFormSettings({ ...formSettings, system_title: e.target.value })}
                    placeholder="เช่น ติดตามผู้ต้องหา"
                    required
                  />
                  <span className="small muted">ข้อความส่วนนำหน้าชื่อหน่วยงาน</span>
                </label>

                <label>
                  <span>ชื่อหน่วยงาน / จังหวัด</span>
                  <input
                    value={formSettings.system_org}
                    onChange={(e) => setFormSettings({ ...formSettings, system_org: e.target.value })}
                    placeholder="เช่น ภ.จว.อ่างทอง"
                    required
                  />
                  <span className="small muted">ตัวหนาในโลโก้ และชื่อสังกัดหลัก</span>
                </label>

                <label>
                  <span>คำบรรยายระบบ</span>
                  <input
                    value={formSettings.system_subtitle}
                    onChange={(e) => setFormSettings({ ...formSettings, system_subtitle: e.target.value })}
                    placeholder="เช่น ระบบสารสนเทศภูมิศาสตร์สืบสวน"
                    required
                  />
                  <span className="small muted">ข้อความย่อยใต้ชื่อระบบ</span>
                </label>

                <label>
                  <span>ข้อความประกาศ / หมายเหตุระบบ</span>
                  <input
                    value={formSettings.system_notice || ''}
                    onChange={(e) => setFormSettings({ ...formSettings, system_notice: e.target.value })}
                    placeholder="เช่น ศูนย์ปฏิบัติการสืบสวนสอบสวน"
                  />
                  <span className="small muted">แสดงในหน้าลงชื่อเข้าใช้หรือส่วนท้าย</span>
                </label>
              </div>
            </div>

            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn primary" disabled={savingSettings}>
                <IconCheck width={16} height={16} />
                <span>{savingSettings ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่าระบบ'}</span>
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tab 2: Police Stations Management */}
      {activeTab === 'stations' && (
        <div className="stations-management">
          {stationSuccess && (
            <div className="alert success">
              <IconCheck width={16} height={16} />
              <span>{stationSuccess}</span>
            </div>
          )}
          {stationError && (
            <div className="error">
              <span>{stationError}</span>
              <button type="button" className="link" onClick={() => setStationError('')}>
                ปิด
              </button>
            </div>
          )}

          {stationMode !== 'list' && (
            <form className="card" onSubmit={saveStation} style={{ marginBottom: 20 }}>
              <div className="form-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                  {stationMode === 'add' ? (
                    <>
                      <IconPlus width={18} height={18} />
                      <span>เพิ่มสถานีตำรวจภูธร (สภ.) ใหม่</span>
                    </>
                  ) : (
                    <>
                      <IconEdit width={18} height={18} />
                      <span>
                        แก้ไขข้อมูล: <code>{editingStation?.code}</code> {editingStation?.name}
                      </span>
                    </>
                  )}
                </h3>
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={cancelStationForm}
                  title="ปิดฟอร์ม"
                >
                  <IconX width={16} height={16} />
                </button>
              </div>

              <div className="grid2" style={{ gap: 16 }}>
                <label>
                  <span>รหัส สภ. (เช่น TH1512)</span>
                  <input
                    value={stationCode}
                    onChange={(e) => setStationCode(e.target.value.toUpperCase())}
                    placeholder="เช่น TH1512"
                    required
                    maxLength={20}
                    disabled={stationMode === 'edit'}
                    style={
                      stationMode === 'edit'
                        ? { background: 'var(--bg-subtle, #f1f5f9)', cursor: 'not-allowed' }
                        : undefined
                    }
                  />
                  {stationMode === 'edit' ? (
                    <span className="small muted">รหัส สภ. ไม่สามารถแก้ไขได้หลังสร้างแล้ว</span>
                  ) : (
                    <span className="small muted">รหัสเฉพาะภาษาอังกฤษตัวพิมพ์ใหญ่และตัวเลข</span>
                  )}
                </label>

                <label>
                  <span>ชื่อสถานีตำรวจภูธร (สภ.)</span>
                  <input
                    value={stationName}
                    onChange={(e) => setStationName(e.target.value)}
                    placeholder="เช่น สภ.เมืองอ่างทอง"
                    required
                    maxLength={200}
                  />
                </label>

                <label>
                  <span>เบอร์โทรศัพท์ติดต่อ</span>
                  <input
                    value={stationPhone}
                    onChange={(e) => setStationPhone(e.target.value)}
                    placeholder="เช่น 035-611-111"
                  />
                </label>

                <label>
                  <span>ที่ตั้ง / ข้อมูลเพิ่มเติม</span>
                  <input
                    value={stationAddress}
                    onChange={(e) => setStationAddress(e.target.value)}
                    placeholder="ที่อยู่หรือจุดสังเกตของ สภ."
                  />
                </label>
              </div>

              <div className="row" style={{ marginTop: 16, display: 'flex', gap: 10 }}>
                <button className="btn primary" disabled={savingStation}>
                  <IconCheck width={15} height={15} />
                  <span>
                    {savingStation
                      ? 'กำลังบันทึก…'
                      : stationMode === 'add'
                      ? 'บันทึกเพิ่ม สภ.'
                      : 'บันทึกการแก้ไข สภ.'}
                  </span>
                </button>
                <button type="button" className="btn" onClick={cancelStationForm}>
                  ยกเลิก
                </button>
              </div>
            </form>
          )}

          <div className="table-card">
            <div
              className="table-header-bar"
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '14px 18px',
                borderBottom: '1px solid var(--border-subtle, #e2e8f0)',
              }}
            >
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600 }}>
                <IconBuilding
                  width={16}
                  height={16}
                  style={{ verticalAlign: 'middle', marginRight: 8, opacity: 0.7 }}
                />
                รายชื่อสถานีตำรวจภูธรในสังกัด ({stations.length} สถานี)
              </h3>
              {stationMode === 'list' && (
                <button className="btn primary small" onClick={startAddStation}>
                  <IconPlus width={14} height={14} />
                  <span>เพิ่ม สภ. ใหม่</span>
                </button>
              )}
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: 100 }}>รหัส สภ.</th>
                    <th>ชื่อสถานีตำรวจภูธร</th>
                    <th>เบอร์โทรศัพท์</th>
                    <th>ที่ตั้ง</th>
                    <th style={{ textAlign: 'right', width: 160 }}>การจัดการ</th>
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <code className="code-pill">{s.code}</code>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="station-badge-icon">
                            <IconBuilding width={14} height={14} />
                          </div>
                          <span style={{ fontWeight: 600 }}>{s.name}</span>
                        </div>
                      </td>
                      <td>
                        {s.phone ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <IconPhone width={13} height={13} style={{ opacity: 0.6 }} />
                            {s.phone}
                          </span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>{s.address ? s.address : <span className="muted">—</span>}</td>
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn small"
                          onClick={() => startEditStation(s)}
                          title="แก้ไขชื่อหรือข้อมูล สภ."
                          style={{ marginRight: 6 }}
                        >
                          <IconEdit width={13} height={13} />
                          <span>แก้ไข</span>
                        </button>
                        <button
                          className="btn small danger"
                          onClick={() => deleteStation(s)}
                          title="ลบ สภ."
                        >
                          <IconTrash width={13} height={13} />
                          <span>ลบ</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

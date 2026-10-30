export type Role = 'commander' | 'inspector' | 'officer'
export type Level = 'red' | 'orange' | 'yellow'

export interface Me {
  id: number
  username: string
  full_name: string
  role: Role
  station_id: number | null
  station_name: string | null
}

export interface Station {
  id: number
  code: string
  name: string
  phone?: string
  address?: string
}

export interface SystemSettings {
  system_title: string
  system_org: string
  system_subtitle: string
  system_badge_url: string
  system_notice: string
}

export const DEFAULT_SETTINGS: SystemSettings = {
  system_title: 'ติดตามผู้ต้องหา',
  system_org: 'ภ.จว.อ่างทอง',
  system_subtitle: 'ระบบสารสนเทศภูมิศาสตร์สืบสวน',
  system_badge_url: '',
  system_notice: '',
}

export interface Suspect {
  id: number
  station_id: number
  station_name: string
  full_name: string
  citizen_id: string
  address: string
  charge: string
  level: Level
  lat: number
  lng: number
  note: string
  created_by: string
  updated_at: string
}

export function formatCitizenId(id: string): string {
  if (!id) return ''
  const digits = id.replace(/\D/g, '')
  if (digits.length !== 13) return id
  return `${digits.slice(0, 1)}-${digits.slice(1, 5)}-${digits.slice(5, 10)}-${digits.slice(10, 12)}-${digits.slice(12, 13)}`
}

export type SuspectInput = Omit<Suspect, 'id' | 'station_name' | 'created_by' | 'updated_at'>

export interface UserRow extends Me {
  active: boolean
}

export const LEVELS: { value: Level; label: string; color: string }[] = [
  { value: 'red', label: 'แดง', color: '#d62828' },
  { value: 'orange', label: 'ส้ม', color: '#f77f00' },
  { value: 'yellow', label: 'เหลือง', color: '#f2c40f' },
]
export const levelOf = (l: Level) => LEVELS.find((x) => x.value === l)!

export const ROLE_LABEL: Record<Role, string> = {
  commander: 'ผู้กำกับ',
  inspector: 'สารวัตร',
  officer: 'เจ้าหน้าที่ สภ.',
}

export const isAdmin = (me: Me) => me.role !== 'officer'

export const googleMapsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`

let onUnauthorized = () => {}
export const setOnUnauthorized = (fn: () => void) => (onUnauthorized = fn)

export async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch('/api' + path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && path !== '/login') onUnauthorized()
    throw new Error(data.error ?? 'เกิดข้อผิดพลาด')
  }
  return data as T
}

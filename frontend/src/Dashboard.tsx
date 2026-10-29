import { useEffect, useState } from 'react'
import { api, isAdmin, LEVELS, type Level, type Me } from './api'
import { IconAlertTriangle, IconBuilding, IconMapPin, IconShield } from './icons'
import { NumberTicker } from './NumberTicker'

type Row = { station_id: number; station_name: string } & Record<Level, number>

export default function Dashboard({ me }: { me: Me }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api<Row[]>('/dashboard')
      .then(setRows)
      .catch((e) => setError(e.message))
  }, [])

  if (error) return <p className="error page">{error}</p>
  if (!rows) return <p className="muted page">กำลังโหลดข้อมูลสรุปผล…</p>

  const total = (r: Row) => r.red + r.orange + r.yellow
  const sum = (l: Level) => rows.reduce((n, r) => n + r[l], 0)
  const grand = rows.reduce((n, r) => n + total(r), 0)
  const max = Math.max(1, ...rows.map(total))

  const statIcons: Record<string, React.ReactNode> = {
    total: <IconShield width={18} height={18} />,
    red: <IconAlertTriangle width={18} height={18} />,
    orange: <IconMapPin width={18} height={18} />,
    yellow: <IconMapPin width={18} height={18} />,
  }

  return (
    <div className="page">
      <div className="page-header">
        <div className="page-title">
          <h2>{isAdmin(me) ? 'ภาพรวมสถิติทั้งจังหวัด' : `สรุปข้อมูลพื้นที่ ${me.station_name ?? ''}`}</h2>
          <p>
            {isAdmin(me)
              ? 'สรุปข้อมูลผู้ต้องหาจำแนกตามสถานีตำรวจภูธร 7 แห่งและระดับความสำคัญ'
              : 'สถิติการปักหมุดและการเฝ้าระวังในความรับผิดชอบ'}
          </p>
        </div>
      </div>

      <div className="stats">
        <div className="stat-card">
          <div className="stat-card-header">
            <span className="stat-card-title">ผู้ต้องหาทั้งหมด</span>
            <div className="stat-card-icon total">{statIcons.total}</div>
          </div>
          <div className="stat-card-value">
            <NumberTicker value={grand} />
          </div>
          <span className="stat-card-sub">หมุดที่ติดตามในระบบทั้งหมด</span>
        </div>

        {LEVELS.map((l, idx) => {
          const val = sum(l.value)
          const pct = grand > 0 ? Math.round((val / grand) * 100) : 0
          return (
            <div className="stat-card" key={l.value}>
              <div className="stat-card-header">
                <span className="stat-card-title">
                  <span className="dot" style={{ background: l.color }} />
                  ระดับ{l.label}
                </span>
                <div className={`stat-card-icon ${l.value}`}>{statIcons[l.value]}</div>
              </div>
              <div className="stat-card-value">
                <NumberTicker value={val} delay={0.1 * (idx + 1)} />
              </div>
              <span className="stat-card-sub">
                คิดเป็น <NumberTicker value={pct} delay={0.15 * (idx + 1)} />% ของทั้งหมด
              </span>
            </div>
          )
        })}
      </div>

      <div className="table-card">
        <div className="table-header-bar">
          <h3>ตารางสถิติจำแนกรายสถานีตำรวจภูธร (สภ.)</h3>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>สถานีตำรวจภูธร</th>
                {LEVELS.map((l) => (
                  <th key={l.value} className="num">
                    ระดับ{l.label}
                  </th>
                ))}
                <th className="num">รวม</th>
                <th className="bar-col">สัดส่วนระดับความสำคัญ</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const rowTotal = total(r)
                return (
                  <tr key={r.station_id}>
                    <td>
                      <div className="station-cell">
                        <div className="station-badge-icon">
                          <IconBuilding width={14} height={14} />
                        </div>
                        <span>{r.station_name}</span>
                      </div>
                    </td>
                    {LEVELS.map((l) => (
                      <td key={l.value} className="num">
                        {r[l.value]}
                      </td>
                    ))}
                    <td className="num">
                      <b>{rowTotal}</b>
                    </td>
                    <td className="bar-col">
                      <div className="stacked-bar" title={`รวม ${rowTotal} คน`}>
                        {LEVELS.map((l) => (
                          <div
                            key={l.value}
                            className={`stacked-segment ${l.value}`}
                            style={{ width: `${(r[l.value] / max) * 100}%` }}
                          />
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            {rows.length > 1 && (
              <tfoot>
                <tr style={{ background: 'var(--bg-subtle)', fontWeight: 600 }}>
                  <td>ยอดรวมทั้งจังหวัด</td>
                  {LEVELS.map((l, idx) => (
                    <td key={l.value} className="num">
                      <NumberTicker value={sum(l.value)} delay={0.1 * (idx + 1)} />
                    </td>
                  ))}
                  <td className="num" style={{ fontSize: '1rem', fontWeight: 700 }}>
                    <NumberTicker value={grand} delay={0.4} />
                  </td>
                  <td className="bar-col" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

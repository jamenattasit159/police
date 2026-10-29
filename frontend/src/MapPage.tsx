import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Marker, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import L from 'leaflet'
import type {} from 'leaflet.markercluster' // L.MarkerCluster* types
import type { Feature, FeatureCollection, Geometry, Position } from 'geojson'
import {
  api,
  formatCitizenId,
  googleMapsUrl,
  isAdmin,
  LEVELS,
  levelOf,
  type Level,
  type Me,
  type Station,
  type Suspect,
  type SuspectInput,
} from './api'
import {
  IconBuilding,
  IconChevronRight,
  IconCrosshair,
  IconEdit,
  IconMap,
  IconMapPin,
  IconNavigation,
  IconPlus,
  IconSearch,
  IconTrash,
  IconX,
} from './icons'

const AREA_COLORS = ['#3b82f6', '#10b981', '#8b5cf6', '#06b6d4', '#84cc16', '#64748b', '#ec4899', '#14b8a6']
const ANG_THONG_CENTER: [number, number] = [14.62, 100.36]

type Form = { id?: number; data: SuspectInput }

const PIN_ICONS = Object.fromEntries(
  LEVELS.map((l) => [
    l.value,
    L.divIcon({ className: 'pin', html: `<span style="background:${l.color}"></span>`, iconSize: [22, 22] }),
  ]),
) as Record<Level, L.DivIcon>

function clusterIcon(c: L.MarkerCluster) {
  const icons = c.getAllChildMarkers().map((m) => m.options.icon)
  const worst = LEVELS.find((l) => icons.includes(PIN_ICONS[l.value]))!
  const n = c.getChildCount()
  const size = n < 10 ? 34 : n < 50 ? 40 : 48
  return L.divIcon({
    className: `cluster cluster-${worst.value}`,
    html: `<span>${n}</span>`,
    iconSize: [size, size],
  })
}

export default function MapPage({ me, stations }: { me: Me; stations: Station[] }) {
  const [suspects, setSuspects] = useState<Suspect[]>([])
  const [loading, setLoading] = useState(true)
  const [geo, setGeo] = useState<FeatureCollection | null>(null)
  const [mask, setMask] = useState<Feature | null>(null)
  const [map, setMap] = useState<L.Map | null>(null)
  const [query, setQuery] = useState('')
  const [levels, setLevels] = useState<Level[]>(['red', 'orange', 'yellow'])
  const [stationFilter, setStationFilter] = useState(0)
  const [form, setForm] = useState<Form | null>(null)
  const [picking, setPicking] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [fitted, setFitted] = useState(false)
  const [mobileTab, setMobileTab] = useState<'map' | 'list'>('map')
  const markers = useRef<Record<number, L.Marker>>({})
  const cluster = useRef<L.MarkerClusterGroup>(null)

  const load = () => {
    api<Suspect[]>('/suspects')
      .then(setSuspects)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
    fetch('/geo/stations.geojson')
      .then((r) => r.json())
      .then(setGeo)
      .catch(() => setError('โหลดเส้นเขตไม่สำเร็จ'))
    fetch('/geo/outside-mask.geojson')
      .then((r) => r.json())
      .then(setMask)
      .catch(() => {})
  }, [])

  const stationByCode = useMemo(() => new Map(stations.map((s) => [s.code, s])), [stations])
  const positions = useMemo(() => new Map(suspects.map((s) => [s.id, [s.lat, s.lng] as [number, number]])), [suspects])

  const visible = suspects.filter(
    (s) =>
      levels.includes(s.level) &&
      (!stationFilter || s.station_id === stationFilter) &&
      (!query || `${s.full_name} ${s.citizen_id} ${s.charge} ${s.address}`.toLowerCase().includes(query.toLowerCase())),
  )

  const stationAt = (lat: number, lng: number) => {
    const f = geo?.features.find((f) => containsPoint(f, lng, lat))
    return f ? stationByCode.get(f.properties?.code)?.id : undefined
  }

  const onMapClick = (lat: number, lng: number) => {
    if (form) {
      setForm({ ...form, data: { ...form.data, lat, lng } })
    } else if (picking) {
      setPicking(false)
      setForm({
        data: {
          station_id: me.station_id ?? stationAt(lat, lng) ?? stationFilter,
          full_name: '',
          citizen_id: '',
          address: '',
          charge: '',
          level: 'red',
          lat,
          lng,
          note: '',
        },
      })
      // If on mobile, open the form view so keyboard can be used smoothly
      setMobileTab('list')
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    setBusy(true)
    setError('')
    try {
      if (form.id) await api(`/suspects/${form.id}`, 'PUT', form.data)
      else await api('/suspects', 'POST', form.data)
      setForm(null)
      await load()
      setMobileTab('map')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const remove = async (s: Suspect) => {
    if (!confirm(`ลบหมุดของ "${s.full_name}" ใช่หรือไม่?`)) return
    try {
      await api(`/suspects/${s.id}`, 'DELETE')
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const edit = (s: Suspect) => {
    map?.closePopup()
    setPicking(false)
    setForm({
      id: s.id,
      data: {
        station_id: s.station_id,
        full_name: s.full_name,
        citizen_id: s.citizen_id || '',
        address: s.address,
        charge: s.charge,
        level: s.level,
        lat: s.lat,
        lng: s.lng,
        note: s.note,
      },
    })
    setMobileTab('list')
  }

  const focus = (s: Suspect) => {
    const m = markers.current[s.id]
    setMobileTab('map')
    if (!m || !cluster.current) return
    cluster.current.zoomToShowLayer(m, () => m.openPopup())
  }

  const startPicking = () => {
    setPicking(true)
    setForm(null)
    setMobileTab('map')
  }

  const areaStyle = (f?: Feature): L.PathOptions => {
    const st = stationByCode.get(f?.properties?.code)
    const idx = stations.findIndex((s) => s.code === f?.properties?.code)
    const mine = !me.station_id || st?.id === me.station_id
    const color = AREA_COLORS[(idx < 0 ? 0 : idx) % AREA_COLORS.length]
    return {
      color: mine ? color : '#a1a1aa',
      weight: mine && me.station_id ? 2.5 : 1.5,
      fillColor: mine ? color : '#a1a1aa',
      fillOpacity: mine ? 0.12 : 0.04,
    }
  }

  const set = <K extends keyof SuspectInput>(k: K, v: SuspectInput[K]) =>
    form && setForm({ ...form, data: { ...form.data, [k]: v } })

  return (
    <div className={`map-layout mobile-view-${mobileTab}`}>
      {/* Side Panel (List & Form) */}
      <aside className={`side ${mobileTab === 'list' ? 'active-mobile' : ''}`}>
        {error && (
          <p className="error" role="alert">
            <span>{error}</span>
            <button className="link" onClick={() => setError('')}>
              ปิด
            </button>
          </p>
        )}

        {/* Mobile-only toggle button back to map */}
        <div className="mobile-switch-bar hide-desktop">
          <button className="btn block" onClick={() => setMobileTab('map')}>
            <IconMap width={16} height={16} />
            <span>สลับไปดูบนแผนที่เต็มจอ</span>
          </button>
        </div>

        {form ? (
          <form className="suspect-form" onSubmit={save}>
            <div className="form-header">
              <h2>{form.id ? 'แก้ไขข้อมูลหมุด' : 'ปักหมุดผู้ต้องหาใหม่'}</h2>
              <button
                type="button"
                className="btn ghost small"
                onClick={() => setForm(null)}
              >
                <IconX width={16} height={16} />
              </button>
            </div>

            <div className="hint-box">
              <IconCrosshair width={16} height={16} />
              <span>แตะบนแผนที่เพื่อระบุหรือเลื่อนพิกัดหมุด</span>
            </div>

            <label>
              ชื่อ-สกุล
              <input
                value={form.data.full_name}
                onChange={(e) => set('full_name', e.target.value)}
                placeholder="ชื่อ-นามสกุล หรือชื่อฉายา"
                required
                maxLength={200}
              />
            </label>

            <label>
              <span>เลขประจำตัวประชาชน (13 หลัก)</span>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={13}
                autoComplete="off"
                value={form.data.citizen_id}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 13)
                  set('citizen_id', val)
                }}
                placeholder="เช่น 1150123456789 (ตัวเลข 13 หลัก)"
              />
              {form.data.citizen_id.length > 0 && (
                <span className="small" style={{ marginTop: 2 }}>
                  {form.data.citizen_id.length === 13 ? (
                    <span style={{ color: 'var(--success-text)', fontWeight: 500 }}>
                      ✓ ครบ 13 หลัก: {formatCitizenId(form.data.citizen_id)}
                    </span>
                  ) : (
                    <span className="muted">กรอกแล้ว {form.data.citizen_id.length}/13 หลัก</span>
                  )}
                </span>
              )}
            </label>

            <label>
              ข้อหา / ฐานความผิด
              <input
                value={form.data.charge}
                onChange={(e) => set('charge', e.target.value)}
                placeholder="ระบุข้อหาหรือพฤติการณ์"
                required
                maxLength={500}
              />
            </label>

            <label>
              ที่อยู่ / จุดสังเกต
              <textarea
                value={form.data.address}
                onChange={(e) => set('address', e.target.value)}
                placeholder="บ้านเลขที่ หมู่ที่ ตำบล อำเภอ จุดสังเกต"
                required
                rows={2}
                maxLength={500}
              />
            </label>

            <fieldset className="levels-grid">
              {LEVELS.map((l) => (
                <label
                  key={l.value}
                  className={`level-radio-card ${form.data.level === l.value ? `active ${l.value}` : ''}`}
                >
                  <input
                    type="radio"
                    name="level"
                    checked={form.data.level === l.value}
                    onChange={() => set('level', l.value)}
                  />
                  <span className="dot" style={{ background: l.color }} />
                  <span>ระดับ{l.label}</span>
                </label>
              ))}
            </fieldset>

            {isAdmin(me) && (
              <label>
                สภ. ที่รับผิดชอบ
                <select
                  className="station-filter"
                  value={form.data.station_id || ''}
                  onChange={(e) => set('station_id', Number(e.target.value))}
                  required
                >
                  <option value="" disabled>
                    เลือก สภ.
                  </option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <div className="coords">
              <label>
                ละติจูด (Lat)
                <input
                  type="number"
                  step="any"
                  value={form.data.lat}
                  onChange={(e) => set('lat', Number(e.target.value))}
                  required
                />
              </label>
              <label>
                ลองจิจูด (Lng)
                <input
                  type="number"
                  step="any"
                  value={form.data.lng}
                  onChange={(e) => set('lng', Number(e.target.value))}
                  required
                />
              </label>
            </div>

            <label>
              หมายเหตุเพิ่มเติม
              <textarea
                value={form.data.note}
                onChange={(e) => set('note', e.target.value)}
                placeholder="พฤติการณ์พิเศษ หรือเบอร์ติดต่อ"
                rows={2}
                maxLength={2000}
              />
            </label>

            <div className="row" style={{ marginTop: 6 }}>
              <button className="btn primary grow" disabled={busy}>
                {busy ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
              </button>
              <button type="button" className="btn" onClick={() => setForm(null)}>
                ยกเลิก
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="side-header">
              <div className="side-title">
                <IconMapPin width={18} height={18} style={{ color: 'var(--text-main)' }} />
                <span>หมุดผู้ต้องหา</span>
                <span className="badge-count">{visible.length}</span>
              </div>
            </div>

            <button
              className="btn primary block hide-mobile"
              onClick={startPicking}
            >
              <IconPlus width={16} height={16} />
              <span>ปักหมุดผู้ต้องหาใหม่</span>
            </button>

            <div className="search-box">
              <IconSearch width={15} height={15} className="search-icon" />
              <input
                type="search"
                placeholder="ค้นหา ชื่อ / ข้อหา / ที่อยู่…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="search-clear" onClick={() => setQuery('')} title="ล้างการค้นหา">
                  <IconX width={14} height={14} />
                </button>
              )}
            </div>

            <div className="filters">
              {LEVELS.map((l) => {
                const count = suspects.filter((s) => s.level === l.value).length
                const active = levels.includes(l.value)
                return (
                  <button
                    key={l.value}
                    className={active ? 'chip on' : 'chip'}
                    aria-pressed={active}
                    onClick={() =>
                      setLevels(active ? levels.filter((x) => x !== l.value) : [...levels, l.value])
                    }
                  >
                    <span className="dot" style={{ background: l.color }} />
                    <span>{l.label}</span>
                    <span className="count-pill">{count}</span>
                  </button>
                )
              })}
            </div>

            {isAdmin(me) && (
              <div className="station-filter-wrap">
                <select
                  className="station-filter"
                  value={stationFilter}
                  onChange={(e) => setStationFilter(Number(e.target.value))}
                >
                  <option value={0}>ทุก สภ. ในจังหวัดอ่างทอง</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <ul className="suspect-list">
              {loading && suspects.length === 0 ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <li key={i} className="suspect-card-btn skeleton-card" style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="skeleton-line" style={{ width: '45%', height: 16 }} />
                      <div className="skeleton-line" style={{ width: '22%', height: 16 }} />
                    </div>
                    <div className="skeleton-line" style={{ width: '75%', height: 13 }} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div className="skeleton-line" style={{ width: '35%', height: 13 }} />
                      <div className="skeleton-line" style={{ width: '18%', height: 13 }} />
                    </div>
                  </li>
                ))
              ) : (
                visible.map((s) => (
                  <li key={s.id}>
                    <button
                      className={`suspect-card-btn level-${s.level}`}
                      onClick={() => focus(s)}
                      title="แตะเพื่อดูตำแหน่งบนแผนที่"
                    >
                      <div className="card-top">
                        <span className="card-name">{s.full_name}</span>
                        <span className={`level-tag ${s.level}`}>ระดับ{levelOf(s.level).label}</span>
                      </div>
                      {s.citizen_id && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>
                          เลขบัตร: {formatCitizenId(s.citizen_id)}
                        </div>
                      )}
                      <div className="card-charge">{s.charge}</div>
                      <div className="card-meta">
                        <span className="card-station">
                          <IconBuilding width={11} height={11} />
                          {s.station_name}
                        </span>
                        <span className="card-view-hint">
                          <span>ดูหมุด</span>
                          <IconChevronRight width={12} height={12} />
                        </span>
                      </div>
                    </button>
                  </li>
                ))
              )}
              {!loading && visible.length === 0 && (
                <li className="muted small" style={{ textAlign: 'center', padding: '36px 16px' }}>
                  ไม่พบรายการผู้ต้องหา
                </li>
              )}
            </ul>
          </>
        )}
      </aside>

      {/* Map View */}
      <div className={`map-wrap ${picking || form ? 'crosshair' : ''} ${mobileTab === 'map' ? 'active-mobile' : ''}`}>
        {/* Mobile Picking Alert Banner */}
        {picking && (
          <div className="mobile-pick-banner">
            <div className="pick-text">
              <IconCrosshair width={16} height={16} />
              <span>แตะบนแผนที่ตรงตำแหน่งที่ต้องการปักหมุด</span>
            </div>
            <button className="btn small" onClick={() => setPicking(false)}>
              ยกเลิก
            </button>
          </div>
        )}

        <MapContainer
          center={ANG_THONG_CENTER}
          zoom={11}
          maxBoundsViscosity={1.0}
          ref={setMap}
          className="map"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
            referrerPolicy="strict-origin"
          />
          {mask && (
            <GeoJSON
              data={mask}
              interactive={false}
              style={{ color: '#27272a', weight: 2, fillColor: '#18181b', fillOpacity: 0.85 }}
            />
          )}
          {geo && (
            <GeoJSON
              key={stations.length}
              data={geo}
              style={areaStyle}
              onEachFeature={(f, layer) => {
                const label = document.createElement('span')
                label.textContent = stationByCode.get(f.properties?.code)?.name ?? String(f.properties?.code ?? '')
                layer.bindTooltip(label, { sticky: true })
              }}
            />
          )}
          {geo && <FitOnce geo={geo} onDone={() => setFitted(true)} />}
          <ClickCatcher onClick={onMapClick} />
          {fitted && (
            <MarkerClusterGroup
              ref={cluster}
              chunkedLoading
              maxClusterRadius={45}
              disableClusteringAtZoom={17}
              showCoverageOnHover={false}
              spiderfyOnMaxZoom
              iconCreateFunction={clusterIcon}
            >
              {visible.map((s) => (
                <Marker
                  key={s.id}
                  position={positions.get(s.id)!}
                  icon={PIN_ICONS[s.level]}
                  ref={(m) => {
                    if (m) markers.current[s.id] = m
                  }}
                >
                  <Popup>
                    <div className="pop">
                      <div className="pop-header">
                        <span className="pop-title">{s.full_name}</span>
                        <span className={`level-tag ${s.level}`}>ระดับ{levelOf(s.level).label}</span>
                      </div>
                      <div className="pop-body">
                        <dl>
                          {s.citizen_id && (
                            <>
                              <dt>เลขบัตร</dt>
                              <dd style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatCitizenId(s.citizen_id)}</dd>
                            </>
                          )}
                          <dt>ข้อหา</dt>
                          <dd>{s.charge}</dd>
                          <dt>ที่อยู่</dt>
                          <dd>{s.address}</dd>
                          <dt>สภ.</dt>
                          <dd>{s.station_name}</dd>
                          {s.note && (
                            <>
                              <dt>หมายเหตุ</dt>
                              <dd>{s.note}</dd>
                            </>
                          )}
                        </dl>
                        <div className="small muted">
                          แก้ไข {new Date(s.updated_at).toLocaleDateString('th-TH')} · โดย {s.created_by}
                        </div>
                        <a
                          className="pop-nav-btn"
                          href={googleMapsUrl(s.lat, s.lng)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <IconNavigation width={16} height={16} />
                          <span>นำทางด้วย Google Maps</span>
                        </a>
                        <div className="pop-actions">
                          <button className="btn small" onClick={() => edit(s)}>
                            <IconEdit width={13} height={13} />
                            <span>แก้ไข</span>
                          </button>
                          <button className="btn danger small" onClick={() => remove(s)}>
                            <IconTrash width={13} height={13} />
                            <span>ลบ</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MarkerClusterGroup>
          )}
          {form && (
            <CircleMarker
              center={[form.data.lat, form.data.lng]}
              radius={11}
              pathOptions={{
                color: '#18181b',
                weight: 2.5,
                dashArray: '4 4',
                fillColor: levelOf(form.data.level).color,
                fillOpacity: 0.9,
              }}
            />
          )}
        </MapContainer>

        <div className="legend">
          {LEVELS.map((l) => (
            <span key={l.value}>
              <span className="dot" style={{ background: l.color }} />
              <span>ระดับ{l.label}</span>
            </span>
          ))}
        </div>

        {/* Floating Mobile Controls on Map */}
        {!picking && (
          <div className="mobile-floating-actions hide-desktop">
            <button
              className="btn-floating-pill list-trigger"
              onClick={() => setMobileTab('list')}
            >
              <IconSearch width={16} height={16} />
              <span>ดูรายชื่อ ({visible.length})</span>
            </button>
            <button
              className="btn-floating-pill primary add-trigger"
              onClick={startPicking}
            >
              <IconPlus width={16} height={16} />
              <span>ปักหมุด</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ClickCatcher({ onClick }: { onClick: (lat: number, lng: number) => void }) {
  useMapEvents({ click: (e) => onClick(e.latlng.lat, e.latlng.lng) })
  return null
}

function FitOnce({ geo, onDone }: { geo: FeatureCollection; onDone: () => void }) {
  const map = useMap()
  useEffect(() => {
    const b = L.geoJSON(geo).getBounds()
    map.fitBounds(b, { padding: [10, 10], animate: false })
    map.setMinZoom(map.getZoom())
    map.setMaxBounds(b.pad(0.15))
    onDone()
  }, [geo, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function containsPoint(f: Feature<Geometry | null>, x: number, y: number): boolean {
  const g = f.geometry
  const polys: Position[][][] = g?.type === 'Polygon' ? [g.coordinates] : g?.type === 'MultiPolygon' ? g.coordinates : []
  return polys.some((rings) => rings.filter((ring) => inRing(ring, x, y)).length % 2 === 1)
}

function inRing(ring: Position[], x: number, y: number) {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside
  }
  return inside
}

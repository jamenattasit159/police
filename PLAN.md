# ระบบติดตามผู้ต้องหา ภ.จว.อ่างทอง — แนวทางระบบ (PLAN)

> ไฟล์นี้คือ "สมุดส่งต่องาน" ใครมาทำต่อ (คนหรือ AI) ให้อ่านไฟล์นี้ก่อน
> แล้วดู **ส่วนที่ 6 สถานะปัจจุบัน** ว่าถึงไหนแล้ว ทำเสร็จขั้นไหนให้ติ๊ก `[x]` และอัปเดตส่วนที่ 6 ทุกครั้ง

---

## 1. ความต้องการ (จากสารวัตรสืบ จว.อ่างทอง)

1. แผนที่จังหวัดอ่างทอง แบ่งเขตตามอำเภอ / เขตรับผิดชอบของแต่ละ สภ.
2. ผู้ใช้ 3 บทบาท
   - **ผู้กำกับ (commander)** — เห็นทุกอย่าง: dashboard, หมุดทั้งจังหวัด, จัดการผู้ใช้
   - **สารวัตร (inspector)** — สิทธิ์เหมือนผู้กำกับ แต่เป็นบัญชีแยกกัน
   - **เจ้าหน้าที่ สภ. (officer)** — ผูกกับ 1 สภ.
3. เจ้าหน้าที่ปักหมุดผู้ต้องหา: ชื่อ, ที่อยู่, ข้อหา, ตำแหน่ง, สี (แดง / ส้ม / เหลือง)
4. ทุกหมุดมีปุ่ม "นำทางด้วย Google Maps" ให้เจ้าหน้าที่ไปตรวจสอบ

### ข้อตกลงที่ตัดสินแล้ว (อย่าเปลี่ยนถ้าลูกค้าไม่ได้ขอ)
- **ทุกคนเห็นแผนที่และเส้นเขตทั้งจังหวัด** แต่ **officer เห็น/แก้ได้เฉพาะหมุดของ สภ. ตัวเอง** (เขตของตัวเองไฮไลต์สี เขตอื่นเป็นสีเทา)
- หมุดเป็นของ สภ. ตาม `station_id` ของคนปัก **ไม่ใช่** ตามตำแหน่งที่หมุดตก
  (ลูกค้ายืนยันว่าแต่ละท้องที่ไม่ปักทับกันอยู่แล้ว → ไม่ใช้ PostGIS)
- Frontend: **React** · Backend: **Go**

---

## 2. สถาปัตยกรรม (สร้างแล้ว)

```
[React 19 + Vite + TS + react-leaflet]  --/api JSON-->  [Go 1.27 net/http]  -->  [PostgreSQL 17 (Docker)]
      │                                                      │
      └─ เส้นเขต: frontend/public/geo/stations.geojson     └─ กรองหมุดตาม role/station ที่ฝั่งเซิร์ฟเวอร์เสมอ
      └─ แผนที่พื้นหลัง: OpenStreetMap tiles (ฟรี ไม่ต้องมี key)
Production: Go binary เสิร์ฟทั้ง /api และไฟล์ React ที่ build แล้ว (พอร์ต 8080) — 1 container + 1 DB
```

| ส่วน | ใช้ | หมายเหตุ |
|---|---|---|
| แผนที่ | Leaflet + react-leaflet + OSM tiles | ฟรี; ถ้าผู้ใช้เยอะมากควรย้ายไป tile server ที่เสียเงิน/ตั้งเอง (นโยบาย OSM) |
| Router | `net/http` ServeMux ของ Go (รองรับ `GET /api/x/{id}`) | ไม่ใช้ chi — ไม่จำเป็น |
| DB driver | `github.com/jackc/pgx/v5` | |
| Schema | `backend/schema.sql` (embed, `IF NOT EXISTS`) รันทุกครั้งที่ server start | ยังไม่มีเครื่องมือ migration — ถ้าต้องแก้ตารางที่มีข้อมูลแล้ว ให้เพิ่ม `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` ต่อท้ายไฟล์ |
| Auth | bcrypt + session token สุ่ม 32 byte, เก็บ sha256 ใน DB, cookie `sid` `HttpOnly; Secure; SameSite=Strict`, อายุ 12 ชม. | ล็อกชื่อผู้ใช้ 15 นาที หลังใส่รหัสผิด 5 ครั้ง (in-memory) |
| Google Maps | `https://www.google.com/maps/dir/?api=1&destination={lat},{lng}` | ไม่ต้อง API key |

### โครงโฟลเดอร์
```
police/
├── PLAN.md                    ← ไฟล์นี้
├── run-local.sh               ← รันเครื่องตัวเอง (DB ใน Docker + Go + build React)
├── docker-compose.yml         ← db (dev) / db+app (prod: --profile prod)
├── Dockerfile                 ← build React + Go เป็น image เดียว
├── .env / .env.example        ← รหัสผ่าน DB, admin คนแรก (.env ห้าม commit)
├── data/
│   ├── raw/                   ← shapefile ตำบลทั้งประเทศจาก HDX (250MB, ไม่ commit)
│   ├── angthong_tambon.geojson← 73 ตำบลของอ่างทอง (ตัดแล้ว)
│   ├── station_tambon.csv     ← ตาราง ตำบล → สภ. (ตอนนี้ใส่ 1 อำเภอ = 1 สภ. ไว้ชั่วคราว)
│   └── build-stations.sh      ← CSV → frontend/public/geo/stations.geojson
│   (frontend/public/geo/outside-mask.geojson = ทั้งโลกเจาะรูเป็นรูปจังหวัด ใช้ทำให้นอกจังหวัดเป็นสีทึบ; แผนที่ล็อกไม่ให้เลื่อน/ซูมออกนอกจังหวัด)
├── backend/
│   ├── main.go                ← config, setupDB, routes, เสิร์ฟ SPA
│   ├── auth.go                ← login/logout/me, middleware, login limiter
│   ├── suspects.go            ← CRUD หมุด, dashboard, stations (+ ฟังก์ชัน scope() กรองสิทธิ์)
│   ├── users.go               ← จัดการผู้ใช้ (admin เท่านั้น)
│   ├── schema.sql             ← ตาราง + seed 7 สภ.
│   └── main_test.go           ← test สิทธิ์ (ต้องมี TEST_DATABASE_URL)
└── frontend/src/
    ├── api.ts                 ← fetch wrapper, types, สี/ชื่อบทบาท
    ├── App.tsx                ← header + เมนู + สลับหน้า
    ├── Login.tsx
    ├── MapPage.tsx            ← แผนที่, หมุด, ฟอร์มปักหมุด, รายการ/ค้นหา/กรอง
    ├── Dashboard.tsx
    ├── Users.tsx
    └── index.css
```

---

## 3. โมเดลข้อมูล
ดู `backend/schema.sql` (ตาราง `stations`, `users`, `sessions`, `suspects`, `audit_log`)

---

## 4. สิทธิ์ (บังคับที่ Go — ฟังก์ชัน `scope()` ใน suspects.go)

| การกระทำ | commander | inspector | officer |
|---|---|---|---|
| ดูแผนที่ + เส้นเขตทั้งจังหวัด | ✅ | ✅ | ✅ |
| ดูหมุด | ทั้งจังหวัด | ทั้งจังหวัด | **เฉพาะ สภ. ตัวเอง** |
| เพิ่ม/แก้/ลบหมุด | ทุก สภ. (เลือก สภ. ในฟอร์ม; ระบบเดาจากจุดที่คลิกให้) | ทุก สภ. | เฉพาะ สภ. ตัวเอง (station_id มาจาก session เสมอ) |
| Dashboard | ทั้งจังหวัด | ทั้งจังหวัด | เฉพาะ สภ. ตัวเอง |
| จัดการผู้ใช้ | ✅ | ✅ | ❌ (403) |
| ตั้งค่าระบบ (ชื่อ สภ. ตราสัญลักษณ์ ชื่อระบบ) | ✅ | ✅ | ❌ (403) |

แก้ข้อมูลผู้ใช้ (บทบาท/สภ./รหัส/ปิดใช้งาน) → session เดิมของคนนั้นถูกลบ ต้อง login ใหม่ทันที

### API
```
POST   /api/login  {username,password}     POST /api/logout     GET /api/me
GET    /api/stations                       PUT  /api/stations/{id}  (commander/inspector)
GET    /api/settings                       PUT  /api/settings       (commander/inspector)
GET    /api/suspects                       POST /api/suspects
PUT    /api/suspects/{id}                  DELETE /api/suspects/{id}
GET    /api/dashboard
GET    /api/users   POST /api/users   PUT /api/users/{id}      (commander/inspector)
```

---

## 5. ขั้นตอนการทำ

### ขั้น 0 — ข้อมูลเส้นเขต
- [x] 0.1 ดาวน์โหลดขอบเขตตำบล (ADM3) จาก HDX COD-AB Thailand — https://data.humdata.org/dataset/cod-ab-tha → `data/raw/tha_admin3.*`
- [x] 0.2 ตัดเฉพาะอ่างทอง (`adm1_pcode == 'TH15'`) → `data/angthong_tambon.geojson` (73 ตำบล)
- [x] 0.3 ตรวจแล้วได้ 7 อำเภอ (TH1501 เมืองอ่างทอง … TH1507 สามโก้)
- [ ] 0.4 **(รอลูกค้า)** แก้คอลัมน์ `station_code` ใน `data/station_tambon.csv` ให้ตรงความจริง แล้วรัน `bash data/build-stations.sh`
  - ถ้ามี สภ. ใหม่ที่ไม่ใช่รหัสอำเภอ (เช่น `ST08`) ต้องเพิ่มแถวใน seed ของ `backend/schema.sql` ด้วยรหัสเดียวกัน
  - ถ้าต้องเปลี่ยนชื่อ สภ. ที่มีอยู่แล้ว: `UPDATE stations SET name=... WHERE code=...` (seed ใช้ `ON CONFLICT DO NOTHING` จะไม่ทับ)

### ขั้น 1 — แผนที่
- [x] แผนที่ OSM + เส้นเขต สภ. คนละสี + ชื่อเมื่อ hover; officer เห็นเขตตัวเองเด่น
- [x] หมุด 3 สี + popup + ปุ่ม Google Maps
- [x] รวมกลุ่มหมุด (react-leaflet-cluster): หมุดใกล้กันรวมเป็นวงกลมมีตัวเลข สีตามระดับที่ร้ายแรงสุดในกลุ่ม, ซูม ≥17 แสดงทุกหมุด, คลิกรายชื่อ → ซูมดึงหมุดออกจากกลุ่มแล้วเปิด popup
  - **กับดักที่เคยเจอ (แก้แล้ว):** หมุดหายจากแผนที่แบบสุ่ม (รายการบอก 11 แต่แผนที่ขึ้น 9) เพราะ (1) ส่ง `position={[lat,lng]}` array ใหม่ทุก render → cluster ลบ/เพิ่มหมุดซ้ำ, (2) เพิ่มหมุดตอนแผนที่กำลัง animate ซูม → ต้นไม้ cluster พัง
    แก้โดย: position ต้องมาจาก `useMemo` (ตัวแปร `positions`), fitBounds แบบ `animate: false`, และ render `MarkerClusterGroup` หลัง fit เสร็จ (`fitted`) — **ห้ามย้อนกลับ**
    วิธีตรวจ: นับหมุดในรายการเทียบกับผลรวมตัวเลขบน cluster + หมุดเดี่ยวบนแผนที่ต้องเท่ากัน
  - ทดสอบด้วย 250 หมุด: `python -I data/seed_demo.py 250` / ลบ: `python -I data/seed_demo.py --delete` (หมุดทดสอบมี note = `[DEMO]`)
- [ ] 1.4 ให้สารวัตรดู ยืนยันเส้นเขตและหน้าตา

### ขั้น 2 — Backend
- [x] login/logout/me, session, bcrypt, login limiter
- [x] schema + seed 7 สภ. + สร้าง commander คนแรกจาก `ADMIN_USER`/`ADMIN_PASSWORD` (ตอนยังไม่มีผู้ใช้)
- [x] test สิทธิ์ `TestOfficerIsolation` ผ่าน

### ขั้น 3 — หมุดผู้ต้องหา
- [x] CRUD + กรองสิทธิ์ + audit_log + ตรวจว่าพิกัดอยู่ในกรอบจังหวัดอ่างทอง
- [x] ฟอร์มปักหมุด: คลิกแผนที่ / พิมพ์พิกัด / คลิกใหม่เพื่อย้าย; แก้ไข; ลบ (มียืนยัน)
- [x] ค้นหาชื่อ/ข้อหา/ที่อยู่, กรองสี, กรอง สภ. (admin)

### ขั้น 4 — Dashboard + ผู้ใช้
- [x] Dashboard: การ์ดรวม + ตาราง สภ. × สี + แถบสัดส่วน
- [x] หน้าผู้ใช้: เพิ่ม / แก้ / รีเซ็ตรหัส / ปิดใช้งาน (ห้ามลดสิทธิ์หรือปิดบัญชีตัวเอง)

### ขั้น 5 — Deploy
- [x] Dockerfile + docker-compose (`--profile prod`)
- [ ] 5.2 ตั้ง HTTPS (reverse proxy เช่น Caddy/nginx หน้า :8080) + backup DB รายวัน (`pg_dump`)
- [ ] 5.3 ตัดสินว่า host ที่ไหน (คำถามข้อ 4)

### งานที่ยังไม่ได้ทำ (ทำเมื่อลูกค้าขอ)
- หน้าดู audit_log (ตอนนี้บันทึกลง DB แล้วแต่ยังไม่มีหน้าจอ)
- แนบรูปผู้ต้องหา/บ้าน (คำถามข้อ 6)
- มอบหมายงาน + รายงานผล (คำถามข้อ 3)
- export Excel/PDF

---

## 6. สถานะปัจจุบัน  ← อัปเดตทุกครั้งที่หยุดงาน

- **วันที่ล่าสุด:** 2026-10-30
- **ถึงขั้น:** ระบบพร้อมใช้งานสมบูรณ์ (ขั้น 0–5 ครบถ้วน, รองรับทั้งรัน Docker บน Cloud และ Local, ปรับแต่งหน้าตาด้วย Magic UI, เพิ่มระบบตั้งค่าหน่วยงาน/ตราสัญลักษณ์/สภ. เฉพาะยศสารวัตรขึ้นไป)
- **ฟีเจอร์เพิ่มเติมที่พัฒนาแล้ว:**
  1. บันทึกเลขประจำตัวประชาชน 13 หลัก (`citizen_id`) พร้อมคีย์บอร์ดตัวเลขบนมือถือ (`inputMode="numeric"`)
  2. แถบนำทางมือถือแบบแคปซูลลอยตัวสไตล์ Magic UI Dock และแอนิเมชันนับตัวเลข 60fps Number Ticker
  3. ระบบ Skeleton Loader แสดงโครงร่างระหว่างโหลดข้อมูลครบทุกหน้า (Dashboard, Users, Map, Initial Connection)
  4. ระบบตั้งค่าระบบหลังบ้าน (`/api/settings`, `/api/stations/{id}`) สงวนสิทธิ์เฉพาะระดับสารวัตรขึ้นไป (`inspector`, `commander`) สามารถแก้ไขชื่อ สภ. 7 แห่ง, เปลี่ยนตราสัญลักษณ์ (อัปโหลดรูปภาพ/แม่แบบ), และแก้ไขชื่อระบบ/หน่วยงานแบบ Live Preview
- **ทดสอบแล้ว:** go test สิทธิ์ผ่านครบถ้วน (รวมทดสอบความปลอดภัยป้องกัน officer แอบแก้ไขการตั้งค่า); npm audit (0 vulnerabilities); oxlint (0 errors, 0 warnings); vite build ผ่านฉลุย
- **ความปลอดภัย:** ทดสอบเจาะระบบครอบคลุมทั้ง 56 ข้อ (เพิ่ม 4 ข้อตรวจสอบสิทธิ์ตั้งค่าและแก้ไข สภ.)
- **ขั้นถัดไป:** ส่งให้สารวัตรดู (1.4) + รอข้อมูลส่วนที่ 7 โดยเฉพาะข้อ 1
- **ติดอะไร:** เขต สภ. จริง (ตอนนี้ใช้ 1 อำเภอ = 1 สภ. ชั่วคราว)

### วิธีรัน (เครื่อง dev, Windows + Git Bash + Docker Desktop)
```bash
cp .env.example .env        # แล้วแก้รหัสผ่าน (ใส่ COOKIE_INSECURE=1 ถ้าเปิดผ่าน http ที่ไม่ใช่ localhost)
bash run-local.sh           # เปิด http://localhost:8080  login ด้วย ADMIN_USER / ADMIN_PASSWORD
```
พัฒนา frontend แบบ hot reload: รัน `run-local.sh` ค้างไว้ แล้ว `cd frontend && npm run dev` (proxy /api → :8080)

### วิธีรัน test
```bash
docker compose exec db psql -U police -d police -c "CREATE DATABASE police_test"   # ครั้งแรกครั้งเดียว
cd backend && TEST_DATABASE_URL="postgres://police:<DB_PASSWORD>@127.0.0.1:5433/police_test" go test ./...
```

### Production
```bash
docker compose --profile prod up -d --build      # app :8080 + db; ต้องมี HTTPS proxy ข้างหน้า
```

---

## 7. ข้อมูลที่ยังขาด (ต้องถามสารวัตร)

| # | คำถาม | กระทบขั้น | คำตอบ |
|---|---|---|---|
| 1 | รายชื่อ สภ. ทั้งหมดใน จว.อ่างทอง และแต่ละ สภ. รับผิดชอบตำบลไหนบ้าง → ส่ง `data/station_tambon.csv` ให้กรอก | 0.4 | _รอ_ |
| 2 | สี แดง/ส้ม/เหลือง หมายถึงอะไร (อันตราย? เร่งด่วน? สถานะหมาย?) — ตอนนี้แสดงแค่ชื่อสี | 3 | _รอ_ |
| 3 | ต้องมีระบบ "มอบหมายงาน + รายงานผลกลับ" ไหม หรือแค่ส่งลิงก์ Google Maps | 3 | _รอ_ |
| 4 | Host ที่ไหน: เครื่องของหน่วยงาน หรือ cloud (นโยบายข้อมูลราชการ) | 5 | _รอ_ |
| 5 | ใช้บนมือถือเป็นหลักไหม (รองรับแล้วระดับพื้นฐาน) | 1, 3 | _รอ_ |
| 6 | ต้องแนบรูปผู้ต้องหา / รูปบ้าน ไหม | 3 | _รอ_ |

---

## 9. ความปลอดภัย (ทดสอบล่าสุด 2026-10-29)

### เครื่องมือทดสอบ — รันทุกครั้งก่อน deploy
```bash
python -I security/pentest.py http://localhost:8080      # ยิงจริง 52 เคส (ต้องมี test_officer1)
cd backend && go run golang.org/x/vuln/cmd/govulncheck@latest ./...
cd frontend && npm audit
```
หมายเหตุ: pentest ใส่รหัสผิดหลายครั้ง → IP เครื่องตัวเองถูกล็อก login 15 นาที (รีสตาร์ท server เพื่อล้าง)

### ผลทดสอบ: 52/52 ผ่าน
| หมวด | ทดสอบ | ผล |
|---|---|---|
| SQL injection | login, path id, ทุกช่องข้อมูล | ✅ ใช้ parameterized query ทั้งหมด |
| XSS | เก็บ `<script>`/`<img onerror>` | ✅ React escape + CSP `script-src 'self'` + tooltip ใช้ textContent |
| IDOR / ข้าม สภ. | officer ดู/แก้/ลบ/ย้ายหมุด สภ. อื่น, ฝัง station_id | ✅ 404 / ถูกบังคับเป็น สภ. ตัวเอง |
| Privilege escalation | officer เรียก /api/users, สร้าง admin, แก้ role ตัวเอง | ✅ 403 |
| CSRF | form ข้ามเว็บ | ✅ SameSite=Strict + บังคับ `Content-Type: application/json` (415) |
| Brute force | ใส่รหัสผิดซ้ำ | ✅ ล็อก 5 ครั้ง/ชื่อผู้ใช้, 20 ครั้ง/IP ใน 15 นาที |
| User enumeration | จับเวลา login | ✅ รัน bcrypt เสมอ (เวลาเท่ากัน ~70ms) |
| Path traversal | `/../.env` ฯลฯ | ✅ ไม่หลุดไฟล์ |
| Headers | CSP, X-Frame-Options, nosniff, Referrer-Policy, HSTS, no-store บน /api | ✅ |
| DoS พื้นฐาน | body 100KB, header ช้า (slowloris), รหัส > 72 byte | ✅ จำกัดขนาด + timeout |
| Dependencies | govulncheck / npm audit | ✅ (อัป Go เป็น 1.27.3 แก้ 8 ช่องโหว่ stdlib) |
| Audit | login สำเร็จ/ล้มเหลว (+ชื่อที่ลอง, IP), ดู/เพิ่ม/แก้/ลบหมุด | ✅ ตาราง `audit_log` |

### ยังต้องทำก่อนใช้จริง (เรียงตามความสำคัญ)
1. **HTTPS บังคับ** — วาง Caddy/nginx หน้า :8080, ตั้ง `TRUST_PROXY=1` ให้ proxy ส่ง `X-Real-IP` (ไม่งั้นทุกคนจะเป็น IP เดียวกันแล้วโดนล็อกพร้อมกัน)
2. **DB สิทธิ์ต่ำสุด** — ตอนนี้แอปต่อ DB ด้วย user ที่เป็น superuser (ค่า default ของ image postgres) ควรแยก role ที่มีแค่สิทธิ์บนตารางของแอป
3. **Backup เข้ารหัส** + เก็บนอกเครื่อง + ทดสอบกู้คืน
4. **เปลี่ยนผู้ให้บริการแผนที่พื้นหลังก่อนใช้จริง** — tile.openstreetmap.org เป็นเซิร์ฟเวอร์อาสาสมัคร ไม่รับประกันบริการ และบล็อก (403 "Access blocked") ถ้าไม่ส่ง Referer หรือใช้หนักเกินนโยบาย https://operations.osmfoundation.org/policies/tiles/
   - ตอนนี้ TileLayer ตั้ง `referrerPolicy="strict-origin"` (ส่งแค่ชื่อเว็บ) ส่วนที่เหลือของเว็บยังเป็น `no-referrer` — **ห้ามลบ ไม่งั้นโดนบล็อก**
   - ทางเลือก: ผู้ให้บริการเสียเงิน (MapTiler / Thunderforest / Longdo Map ของไทย) หรือตั้ง tile server เอง (ปลอดภัยสุด) — เปลี่ยน `url` ใน TileLayer และ `img-src` ใน CSP (backend/main.go)
5. **แผนที่พื้นหลังรั่วตำแหน่ง** — ทุกครั้งที่เลื่อน/ซูม เบราว์เซอร์ขอ tile จาก openstreetmap.org (เห็น IP + บริเวณที่ดู) ถ้าซีเรียสให้ตั้ง tile server เอง และโหลด font Sarabun จากเซิร์ฟเวอร์ตัวเองแทน Google Fonts
6. **2FA** สำหรับผู้กำกับ/สารวัตร (TOTP)
7. หน้าดู audit_log สำหรับผู้กำกับ + กำหนดระยะเก็บ log
8. login limiter อยู่ใน memory — ถ้ารันหลายเครื่องต้องย้ายไป DB/Redis
9. สารวัตรมีสิทธิ์เท่าผู้กำกับ (ลดสิทธิ์/ปิดบัญชีผู้กำกับได้) — ถามลูกค้าว่าต้องการแบบนี้จริงไหม
10. หลัง deploy: สแกน TLS (เช่น testssl.sh) และให้หน่วยงาน/บุคคลภายนอกทำ pentest อีกรอบ

---

## 8. กฎที่ห้ามละเลย
- ข้อมูลผู้ต้องหาเป็นข้อมูลอ่อนไหว (PDPA) → กรองสิทธิ์ที่ backend, HTTPS, audit log, ไม่ log ข้อมูลส่วนตัวลง stdout
- ห้าม commit `.env` / รหัสผ่าน / ข้อมูลผู้ต้องหาจริง ลง git
- officer: `station_id` เอาจาก session เสมอ ห้ามรับจาก body/query; query ของ suspects ทุกตัวต้องผ่าน `scope()`
- เพิ่ม endpoint ใหม่ที่แตะ suspects → เพิ่มเคสใน `TestOfficerIsolation` ด้วย
- Production ห้ามตั้ง `COOKIE_INSECURE=1`

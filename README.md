# ระบบติดตามผู้ต้องหา ภ.จว.อ่างทอง (Ang Thong Police Suspect Tracking System)

ระบบสารสนเทศภูมิศาสตร์สืบสวน (GIS) สำหรับการบันทึก ปักหมุด และติดตามผู้ต้องหาในพื้นที่ความรับผิดชอบของตำรวจภูธรจังหวัดอ่างทอง ครอบคลุม 7 สถานีตำรวจภูธร (สภ.) พร้อมแสดงผลแผนที่แบบคลัสเตอร์ (Leaflet), ขอบเขตอำเภอตาม GeoJSON และการจำแนกตามระดับความสำคัญ (แดง / ส้ม / เหลือง)

---

## สถาปัตยกรรมระบบ (Architecture)

* **Frontend:** React 19 + TypeScript + Vite + Leaflet / React-Leaflet + Magic UI Design System
* **Backend:** Go 1.27 REST API (High Performance & Low Memory)
* **Database:** PostgreSQL 17 (Relational Database with Foreign Keys & Cascading)
* **Container:** Multi-stage Dockerfile (Node.js Build -> Go Build -> Alpine Minimal Runtime)
* **Security:** HttpOnly Cookie, SameSite=Strict, CSRF Protection, Rate Limiting, OWASP Top 10 Hardened (52/52 Pentest Passed)

---

## ข้อกำหนดของระบบ (Prerequisites)

* [Docker](https://www.docker.com/) และ Docker Compose

---

## วิธีการติดตั้งและรันระบบ (Quick Start)

### 1. คัดลอก Environment Configuration
```bash
cp .env.example .env
```
กำหนดรหัสผ่านในไฟล์ `.env`:
* `DB_PASSWORD`: รหัสผ่านสำหรับฐานข้อมูล PostgreSQL
* `ADMIN_USER`: ชื่อผู้ใช้ระดับผู้กำกับการ (Default: `admin`)
* `ADMIN_PASSWORD`: รหัสผ่านผู้ดูแลระบบ (8 ตัวอักษรขึ้นไป)
* `COOKIE_INSECURE`: ใส่ `1` หากทดสอบผ่าน `http://localhost` (หากใช้ HTTPS ใน Production ให้เว้นว่างไว้)

### 2. รันระบบด้วย Docker Compose
```bash
docker compose up -d --build
```

### 3. เข้าใช้งานระบบ
เปิดเบราว์เซอร์แล้วไปที่:
👉 **http://localhost:8080**

---

## โครงสร้างโปรเจกต์ (Project Structure)

```
police/
├── backend/          # Go 1.27 HTTP Server & API Routes
│   ├── main.go       # Server Entrypoint & Route Definition
│   ├── auth.go       # Authentication & Session Handlers
│   ├── suspects.go   # Suspect CRUD & Geospatial Verification
│   ├── users.go      # User Management Handlers
│   ├── schema.sql    # PostgreSQL Database Schema
│   └── ...
├── frontend/         # React 19 + Vite Application
│   ├── src/
│   │   ├── App.tsx          # Main Layout & Navigation Dock
│   │   ├── MapPage.tsx      # Interactive Leaflet Map & Pinning
│   │   ├── Dashboard.tsx    # Statistics & Number Ticker
│   │   ├── NumberTicker.tsx # Magic UI Animated Number Component
│   │   └── ...
│   └── ...
├── security/         # Security & Pentest Automation Scripts
│   └── pentest.py    # 52 Automated Security Checks
├── docker-compose.yml
├── Dockerfile
└── README.md
```

---

## การทดสอบความปลอดภัย (Security Pentest)

ทดสอบความปลอดภัยอัตโนมัติ 52 ข้อ:
```bash
python security/pentest.py http://localhost:8080
```

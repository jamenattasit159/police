-- Idempotent: runs on every server start.
CREATE TABLE IF NOT EXISTS stations (
  id    SERIAL PRIMARY KEY,
  code  TEXT UNIQUE NOT NULL,   -- matches properties.code in frontend/public/geo/*.geojson
  name  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  role          TEXT NOT NULL CHECK (role IN ('commander','inspector','officer')),
  station_id    INT REFERENCES stations(id),
  active        BOOLEAN NOT NULL DEFAULT true,
  CHECK (role <> 'officer' OR station_id IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS suspects (
  id          SERIAL PRIMARY KEY,
  station_id  INT NOT NULL REFERENCES stations(id),
  full_name   TEXT NOT NULL,
  citizen_id  TEXT NOT NULL DEFAULT '',
  address     TEXT NOT NULL,
  charge      TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('red','orange','yellow')),
  lat         DOUBLE PRECISION NOT NULL,
  lng         DOUBLE PRECISION NOT NULL,
  note        TEXT NOT NULL DEFAULT '',
  created_by  INT NOT NULL REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS suspects_station_idx ON suspects(station_id);
ALTER TABLE suspects ADD COLUMN IF NOT EXISTS citizen_id TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS audit_log (
  id         BIGSERIAL PRIMARY KEY,
  user_id    INT REFERENCES users(id),
  action     TEXT NOT NULL,
  suspect_id INT,
  at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS detail TEXT;

-- shortcut: 1 amphoe = 1 station until the client sends the real station↔tambon list (PLAN.md §7 #1).
INSERT INTO stations (code, name) VALUES
  ('TH1501', 'สภ.เมืองอ่างทอง'),
  ('TH1502', 'สภ.ไชโย'),
  ('TH1503', 'สภ.ป่าโมก'),
  ('TH1504', 'สภ.โพธิ์ทอง'),
  ('TH1505', 'สภ.แสวงหา'),
  ('TH1506', 'สภ.วิเศษชัยชาญ'),
  ('TH1507', 'สภ.สามโก้')
ON CONFLICT (code) DO NOTHING;

ALTER TABLE stations ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT '';
ALTER TABLE stations ADD COLUMN IF NOT EXISTS address TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS system_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT INTO system_settings (key, value) VALUES
  ('system_title', 'ติดตามผู้ต้องหา'),
  ('system_org', 'ภ.จว.อ่างทอง'),
  ('system_subtitle', 'ระบบสารสนเทศภูมิศาสตร์สืบสวน'),
  ('system_badge_url', ''),
  ('system_notice', '')
ON CONFLICT (key) DO NOTHING;

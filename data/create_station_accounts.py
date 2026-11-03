"""Create one officer account per police station (11 stations), with random passwords.

Usage:  python -I data/create_station_accounts.py [base_url]      (default http://127.0.0.1:8080)
Admin login: ADMIN_USER / ADMIN_PASSWORD from the environment, else from .env.
Writes accounts/station-accounts-<host>.csv (gitignored) — hand it over, then delete it.
Accounts that already exist are skipped (their password is NOT changed).
"""
import csv, http.cookiejar, json, os, secrets, sys, urllib.error, urllib.parse, urllib.request

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = {}
if os.path.exists(os.path.join(ROOT, ".env")):
    ENV = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".env"), encoding="utf8") if "=" in l and not l.startswith("#"))
LOCAL = urllib.parse.urlparse(BASE).hostname in ("127.0.0.1", "localhost")
if os.environ.get("ADMIN_PASSWORD"):
    ADMIN_USER, ADMIN_PASSWORD = os.environ.get("ADMIN_USER") or ENV["ADMIN_USER"], os.environ["ADMIN_PASSWORD"]
elif LOCAL:
    ADMIN_USER, ADMIN_PASSWORD = ENV["ADMIN_USER"], ENV["ADMIN_PASSWORD"]
else:  # a real host has its own admin, not the one in the local .env: ask (password is not echoed)
    import getpass
    ADMIN_USER = input(f"ชื่อผู้ใช้ admin ของ {BASE}: ").strip()
    ADMIN_PASSWORD = getpass.getpass("รหัสผ่าน admin (พิมพ์แล้วจะไม่แสดง กด Enter): ")

# station code (backend/schema.sql) -> login username
USERNAMES = {
    "TH1501": "mueang", "TH1502": "chaiyo", "TH1503": "pamok", "TH1504": "photong",
    "TH1505": "sawaengha", "TH1506": "wiset", "TH1507": "samko", "TH1508": "bangchak",
    "TH1509": "rammasak", "TH1510": "sibuathong", "TH1511": "ketchaiyo",
}
ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no 0/o/1/l/i: easy to read off paper


def password():
    return "-".join("".join(secrets.choice(ALPHABET) for _ in range(4)) for _ in range(3))  # ~59 bits


op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(method, path, body=None):
    r = urllib.request.Request(BASE + "/api" + path, method=method,
                               data=json.dumps(body, ensure_ascii=False).encode() if body is not None else None,
                               headers={"Content-Type": "application/json"})
    try:
        return 200, json.loads(op.open(r, timeout=15).read() or b"null")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


st, _ = call("POST", "/login", {"username": ADMIN_USER, "password": ADMIN_PASSWORD})
assert st == 200, f"admin login failed ({st})"
stations = {s["code"]: s for s in call("GET", "/stations")[1]}
missing = set(USERNAMES) - set(stations)
assert not missing, f"stations missing in DB: {missing}"

rows = []
for code, username in USERNAMES.items():
    s = stations[code]
    pw = password()
    st, body = call("POST", "/users", {"username": username, "password": pw, "full_name": f"เจ้าหน้าที่ {s['name']}",
                                       "role": "officer", "station_id": s["id"]})
    if st == 409:
        rows.append([s["name"], username, "(มีบัญชีอยู่แล้ว — ไม่ได้เปลี่ยนรหัส)"])
    elif st in (200, 201):
        rows.append([s["name"], username, pw])
    else:
        sys.exit(f"{username}: HTTP {st} {body}")

os.makedirs(os.path.join(ROOT, "accounts"), exist_ok=True)
out = os.path.join(ROOT, "accounts", f"station-accounts-{urllib.parse.urlparse(BASE).hostname}.csv")
with open(out, "w", encoding="utf-8-sig", newline="") as f:  # utf-8-sig: Excel shows Thai correctly
    w = csv.writer(f)
    w.writerow(["สภ.", "ชื่อผู้ใช้", "รหัสผ่าน"])
    w.writerows(rows)
print(f"{sum(1 for r in rows if not r[2].startswith('('))} created, {sum(1 for r in rows if r[2].startswith('('))} already existed -> {out}")

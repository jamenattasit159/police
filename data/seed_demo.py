"""Create (or delete) demo pins for load/visual testing. Demo pins are tagged note='[DEMO]'.

Usage:  python -I data/seed_demo.py 250            # add 250 pins
        python -I data/seed_demo.py --delete       # remove every [DEMO] pin
Logs in as ADMIN_USER from .env. BASE env var overrides http://127.0.0.1:8080.
"""
import http.cookiejar, json, os, random, sys, urllib.request

BASE = os.environ.get("BASE", "http://127.0.0.1:8080")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".env"), encoding="utf8") if "=" in l and not l.startswith("#"))
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))


def call(method, path, body=None):
    r = urllib.request.Request(BASE + "/api" + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                               headers={"Content-Type": "application/json"})
    return json.loads(op.open(r, timeout=10).read() or b"null")


def in_ring(ring, x, y):
    inside, j = False, len(ring) - 1
    for i in range(len(ring)):
        (xi, yi), (xj, yj) = ring[i][:2], ring[j][:2]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def polys(g):
    return [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]


call("POST", "/login", {"username": ENV["ADMIN_USER"], "password": ENV["ADMIN_PASSWORD"]})

if sys.argv[1:] == ["--delete"]:
    demo = [s for s in call("GET", "/suspects") if s["note"] == "[DEMO]"]
    for s in demo:
        call("DELETE", f"/suspects/{s['id']}")
    print("deleted", len(demo))
    sys.exit()

n = int(sys.argv[1]) if len(sys.argv) > 1 else 250
stations = {s["code"]: s["id"] for s in call("GET", "/stations")}
geo = json.load(open(os.path.join(ROOT, "frontend/public/geo/stations.geojson"), encoding="utf8"))
areas = [(stations[f["properties"]["code"]], polys(f["geometry"])) for f in geo["features"]]
# Real pins bunch up in villages: pick ~40 village centres, scatter pins around them.
xs = [p[0] for _, ps in areas for poly in ps for p in poly[0]]
ys = [p[1] for _, ps in areas for poly in ps for p in poly[0]]


def station_at(x, y):
    for sid, ps in areas:
        if any(in_ring(poly[0], x, y) for poly in ps):
            return sid


centres = []
while len(centres) < 40:
    x, y = random.uniform(min(xs), max(xs)), random.uniform(min(ys), max(ys))
    if station_at(x, y):
        centres.append((x, y))

first = ["สมชาย", "สมศักดิ์", "วิชัย", "ประเสริฐ", "สุนทร", "บุญมี", "อนันต์", "ธนากร", "กิตติ", "ณัฐพล"]
last = ["ใจดี", "ทองคำ", "ศรีสุข", "มีสุข", "แก้วมณี", "บุญเรือง", "พึ่งทอง", "รักไทย"]
charges = ["ลักทรัพย์", "ยาเสพติด", "ทำร้ายร่างกาย", "ฉ้อโกง", "พกพาอาวุธ", "หมายจับค้าง"]
made = 0
while made < n:
    cx, cy = random.choice(centres)
    x, y = cx + random.gauss(0, 0.008), cy + random.gauss(0, 0.008)  # ~0.9 km spread
    sid = station_at(x, y)
    if not sid:
        continue
    call("POST", "/suspects", {
        "station_id": sid, "full_name": f"{random.choice(first)} {random.choice(last)} (ทดสอบ {made + 1})",
        "address": f"{random.randint(1, 300)} ม.{random.randint(1, 12)}", "charge": random.choice(charges),
        "level": random.choices(["red", "orange", "yellow"], [2, 3, 5])[0], "lat": y, "lng": x, "note": "[DEMO]",
    })
    made += 1
print("created", made)

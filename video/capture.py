"""Drive the real app as the training account and capture one screenshot per tutorial step,
plus the on-screen rectangles the video should point at. Two runs: desktop (1920x1080) and phone (1080x1920).

Usage:  python video/capture.py [base_url]        (default http://127.0.0.1:8080)
Needs: Python playwright + installed Google Chrome; .env ADMIN_USER/ADMIN_PASSWORD and TRAINER_PASSWORD
(account 'demo', สภ.เมืองอ่างทอง). Writes video/tutorial/assets/shots/*.png and assets/steps.js.
Each run first has the admin re-issue the demo password, so the "set your own password" screen appears;
the demo account ends with password TRAINER_PASSWORD + "-v". The sample pin it creates is deleted.
"""
import http.cookiejar, json, os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8080").rstrip("/")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = dict(l.strip().split("=", 1) for l in open(os.path.join(ROOT, ".env"), encoding="utf8") if "=" in l and not l.startswith("#"))
OUT = os.path.join(ROOT, "video", "tutorial", "assets")
os.makedirs(os.path.join(OUT, "shots"), exist_ok=True)

ISSUED, OWN = ENV["TRAINER_PASSWORD"], ENV["TRAINER_PASSWORD"] + "-v"
PIN = (14.592, 100.452)  # where the sample pin goes (inside สภ.เมืองอ่างทอง)
MOVE = (14.585, 100.462)
SAMPLE = "นายตัวอย่าง ลงข้อมูล"

GET_MAP = """() => { const root=document.querySelector('.leaflet-container'); const k=Object.keys(root).find(k=>k.startsWith('__reactFiber'));
 let top=root[k]; while(top.return) top=top.return; let found=null;
 (function walk(n,d){ if(!n||d>800||found) return; const v=n.memoizedProps&&n.memoizedProps.value;
   if(v&&v.map&&v.map.latLngToContainerPoint){found=v.map;return} walk(n.child,d+1); walk(n.sibling,d+1)})(top,0);
 window.__map=found; return !!found }"""
CLEANUP = """async (n) => { const r = await fetch('/api/suspects'); const all = await r.json();
  for (const s of all.filter(s => s.full_name === n)) await fetch('/api/suspects/' + s.id, {method: 'DELETE'}) }"""

steps = {}
DSF = 1.0


def admin_reissue_demo():
    """Admin sets the demo password back to ISSUED, which flags it must-change (first-login screen)."""
    op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    def call(m, p, b=None):
        r = urllib.request.Request(BASE + "/api" + p, method=m, data=json.dumps(b, ensure_ascii=False).encode() if b is not None else None,
                                   headers={"Content-Type": "application/json"})
        return json.loads(op.open(r, timeout=15).read() or b"null")
    call("POST", "/login", {"username": ENV["ADMIN_USER"], "password": ENV["ADMIN_PASSWORD"]})
    demo = [u for u in call("GET", "/users") if u["username"] == "demo"][0]
    call("PUT", f"/users/{demo['id']}", {"full_name": demo["full_name"], "role": "officer", "station_id": demo["station_id"],
                                         "active": True, "password": ISSUED})


def rect(loc):
    b = loc.bounding_box()
    return [round(b["x"] * DSF), round(b["y"] * DSF), round(b["width"] * DSF), round(b["height"] * DSF)]


def point(page, lat, lng):
    return page.evaluate("""([lat,lng]) => { const p=__map.latLngToContainerPoint([lat,lng]);
      const r=__map.getContainer().getBoundingClientRect(); return [r.left+p.x, r.top+p.y] }""", [lat, lng])


def dot(page, lat, lng, size=40):
    x, y = point(page, lat, lng)
    return [round((x - size / 2) * DSF), round((y - size / 2) * DSF), round(size * DSF), round(size * DSF)]


def shot(page, step, **targets):
    page.wait_for_timeout(600)
    page.mouse.move(-10, -10)  # no hover states in shots; the video draws its own cursor
    page.screenshot(path=os.path.join(OUT, "shots", f"{step}.png"))
    steps[step] = targets
    print("shot", step, list(targets))


def login_and_new_password(page, p):
    """Login page -> forgot-password form (not sent) -> login -> forced new password. p = shot-name prefix."""
    page.goto(BASE)
    user, pwd = page.get_by_placeholder("กรอกชื่อผู้ใช้"), page.get_by_placeholder("กรอกรหัสผ่าน")
    login_btn = page.get_by_role("button", name="เข้าสู่ระบบ")
    forgot = page.get_by_role("button", name="ลืมรหัสผ่าน?")
    user.wait_for()
    shot(page, f"{p}01_login", user=rect(user), password=rect(pwd), submit=rect(login_btn), forgot=rect(forgot))

    forgot.click()
    fuser = page.locator("form input").nth(0)
    contact = page.get_by_placeholder("เช่น ด.ต.สมชาย 08x-xxx-xxxx")
    fuser.fill("demo")
    contact.fill("ด.ต.สาธิต ใช้งานง่าย 08x-xxx-xxxx")
    shot(page, f"{p}13_forgot", user=rect(fuser), contact=rect(contact), send=rect(page.get_by_role("button", name="ส่งคำขอรีเซ็ตรหัสผ่าน")))
    page.get_by_role("button", name="กลับไปหน้าเข้าสู่ระบบ").click()

    user.fill("demo")
    pwd.fill(ISSUED)
    shot(page, f"{p}02_login_filled", user=rect(user), password=rect(pwd), submit=rect(login_btn))
    login_btn.click()

    page.get_by_role("heading", name="ตั้งรหัสผ่านใหม่ของท่าน").wait_for()  # else the login page's field still matches
    cur = page.locator("input[autocomplete=current-password]")
    new = page.locator("input[autocomplete=new-password]")
    save = page.get_by_role("button", name="บันทึกรหัสผ่านใหม่")
    cur.wait_for()
    cur.fill(ISSUED)
    new.nth(0).fill(OWN)
    new.nth(1).fill(OWN)
    shot(page, f"{p}02b_newpass", current=rect(cur), new=rect(new.nth(0)), confirm=rect(new.nth(1)), save=rect(save))
    save.click()


def fill_form(name, cid, charge, addr, levels, note):
    name.fill(SAMPLE)
    cid.fill("1100000000001")
    charge.fill("ลักทรัพย์")
    addr.fill("12/3 ม.1 ต.ตลาดหลวง อ.เมืองอ่างทอง (ซอยข้างตลาด)")
    levels.get_by_text("ระดับส้ม").click()
    note.fill("พบตัวบ่อยช่วงเย็น")


def form_fields(page):
    return (page.get_by_placeholder("ชื่อ-นามสกุล หรือชื่อฉายา"), page.get_by_placeholder("เช่น 1150123456789 (ตัวเลข 13 หลัก)"),
            page.get_by_placeholder("ระบุข้อหาหรือพฤติการณ์"), page.get_by_placeholder("บ้านเลขที่ หมู่ที่ ตำบล อำเภอ จุดสังเกต"),
            page.locator(".levels-grid"), page.get_by_placeholder("พฤติการณ์พิเศษ หรือเบอร์ติดต่อ"))


def open_map(page, add):
    add.wait_for()
    page.evaluate(CLEANUP, SAMPLE)  # leftovers from an interrupted run
    page.reload()
    add.wait_for()
    page.wait_for_load_state("networkidle")
    page.evaluate(GET_MAP)
    page.wait_for_timeout(1500)


def desktop(page):
    login_and_new_password(page, "")
    add = page.get_by_role("button", name="ปักหมุดผู้ต้องหาใหม่")
    open_map(page, add)
    sidebar = page.locator(".suspect-list")
    shot(page, "03_map", add=rect(add), map=rect(page.locator(".leaflet-container")), list=rect(sidebar),
         filters=rect(page.locator(".filters")))

    # zoom into the station's area so pins stop clustering (the video tells users to use + / scroll)
    page.evaluate("() => __map.setView([14.592, 100.448], 13, {animate: false})")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    shot(page, "03b_zoomed", zoom=rect(page.locator(".leaflet-control-zoom")), area=dot(page, 14.592, 100.448, size=420))

    add.click()
    shot(page, "04_picking", spot=dot(page, *PIN, size=60), add=rect(add))
    page.mouse.click(*point(page, *PIN))

    name, cid, charge, addr, levels, note = form_fields(page)
    save = page.get_by_role("button", name="บันทึกข้อมูล")
    name.wait_for()
    form_targets = lambda: dict(name=rect(name), cid=rect(cid), charge=rect(charge), addr=rect(addr), levels=rect(levels),
                                coords=rect(page.locator(".coords")), note=rect(note), save=rect(save),
                                hint=rect(page.locator(".hint-box")), spot=dot(page, *PIN, size=60))
    shot(page, "05_form", **form_targets())
    fill_form(name, cid, charge, addr, levels, note)
    note.scroll_into_view_if_needed()
    shot(page, "06_form_filled", **form_targets())
    save.click()
    add.wait_for()
    page.wait_for_timeout(1200)
    card = page.locator(".suspect-list li", has_text=SAMPLE)
    shot(page, "07_saved", pin=dot(page, *PIN), card=rect(card))

    card.click()  # list card -> map zooms to the pin and opens it
    popup = page.locator(".leaflet-popup-content")
    popup.wait_for()
    shot(page, "08_popup", popup=rect(popup), gmaps=rect(page.get_by_role("link", name="นำทางด้วย Google Maps")),
         edit=rect(popup.get_by_role("button", name="แก้ไข")), delete=rect(popup.get_by_role("button", name="ลบ")))

    popup.get_by_role("button", name="แก้ไข").click()
    name.wait_for()
    page.mouse.click(*point(page, *MOVE))  # move the pin while editing
    shot(page, "09_edit_move", hint=rect(page.locator(".hint-box")), spot=dot(page, *MOVE, size=60),
         coords=rect(page.locator(".coords")), save=rect(save))
    page.get_by_role("button", name="ยกเลิก").click()
    add.wait_for()

    search = page.get_by_placeholder("ค้นหา ชื่อ / ข้อหา / ที่อยู่…")
    search.fill("ลักทรัพย์")
    shot(page, "10_search", search=rect(search), list=rect(sidebar))
    search.fill("")
    red = page.locator(".filters button", has_text="แดง")
    red.click()
    shot(page, "11_filter", filters=rect(page.locator(".filters")), chip=rect(red))
    red.click()

    page.get_by_role("tab", name="แดชบอร์ดสรุปผล").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    shot(page, "12_dashboard", logout=rect(page.get_by_role("button", name="ออกจากระบบ")),
         changepw=rect(page.get_by_role("button", name="เปลี่ยนรหัสผ่าน")))
    page.evaluate(CLEANUP, SAMPLE)


def mobile(page):
    login_and_new_password(page, "m")
    add = page.locator(".add-trigger")
    open_map(page, add)
    shot(page, "m03_map", add=rect(add), list=rect(page.locator(".list-trigger")), nav=rect(page.locator(".bottom-nav-dock")))

    page.evaluate("() => __map.setView([14.592, 100.452], 13, {animate: false})")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    add.click()
    banner = page.locator(".mobile-pick-banner")
    banner.wait_for()
    shot(page, "m04_picking", banner=rect(banner), spot=dot(page, *PIN, size=60))
    page.mouse.click(*point(page, *PIN))

    name, cid, charge, addr, levels, note = form_fields(page)
    save = page.get_by_role("button", name="บันทึกข้อมูล")
    name.wait_for()
    fill_form(name, cid, charge, addr, levels, note)
    page.evaluate("() => document.querySelector('.suspect-form').scrollIntoView({block: 'start'})")
    shot(page, "m05_form", name=rect(name), cid=rect(cid), charge=rect(charge), addr=rect(addr))
    save.scroll_into_view_if_needed()
    shot(page, "m06_form_bottom", levels=rect(levels), coords=rect(page.locator(".coords")), save=rect(save))
    save.click()
    add.wait_for()
    page.wait_for_timeout(1200)
    shot(page, "m07_saved", pin=dot(page, *PIN), list=rect(page.locator(".list-trigger")))

    page.locator(".list-trigger").click()
    card = page.locator(".suspect-list li", has_text=SAMPLE)
    card.wait_for()
    search = page.get_by_placeholder("ค้นหา ชื่อ / ข้อหา / ที่อยู่…")
    search.fill("ลักทรัพย์")
    page.wait_for_timeout(400)
    shot(page, "m09_list", search=rect(search), card=rect(card))
    card.click()  # -> map tab, popup opens on the pin
    popup = page.locator(".leaflet-popup-content")
    popup.wait_for()
    shot(page, "m08_popup", popup=rect(popup), gmaps=rect(page.get_by_role("link", name="นำทางด้วย Google Maps")),
         edit=rect(popup.get_by_role("button", name="แก้ไข")))

    page.get_by_role("tab", name="แดชบอร์ด").click()
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    shot(page, "m10_dashboard", nav=rect(page.locator(".bottom-nav-dock")),
         logout=rect(page.get_by_role("button", name="ออกจากระบบ")), changepw=rect(page.get_by_role("button", name="เปลี่ยนรหัสผ่าน")))
    page.evaluate(CLEANUP, SAMPLE)


# Playwright's own launch (pipe mode) hangs on this machine; start Chrome ourselves and attach over CDP.
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
chrome = subprocess.Popen([CHROME, "--headless=new", "--remote-debugging-port=9334", f"--user-data-dir={tempfile.mkdtemp(prefix='capture-chrome-')}",
                           "--no-first-run", "--lang=th-TH", "about:blank"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)
try:
    with sync_playwright() as pw:
        browser = pw.chromium.connect_over_cdp("http://127.0.0.1:9334")
        for run, viewport, dsf in [(desktop, {"width": 1600, "height": 900}, 1.2), (mobile, {"width": 360, "height": 640}, 3)]:
            DSF = dsf  # 1600x900 -> 1920x1080; 360x640 -> 1080x1920
            admin_reissue_demo()
            ctx = browser.new_context(viewport=viewport, device_scale_factor=dsf, locale="th-TH", is_mobile=run is mobile, has_touch=run is mobile)
            run(ctx.new_page())
            ctx.close()
        browser.close()
finally:
    chrome.kill()

with open(os.path.join(OUT, "steps.js"), "w", encoding="utf8") as f:
    f.write("// generated by video/capture.py — rects are [x, y, w, h] in output pixels\nwindow.STEPS = " + json.dumps(steps, indent=1) + ";\n")
print("wrote", len(steps), "steps")

"""Generate the two HyperFrames tutorial projects from captured screenshots:
video/tutorial (desktop 1920x1080) and video/tutorial-mobile (phone 1080x1920).

    python video/capture.py          # 1. screenshots + target rects -> video/tutorial/assets
    python video/build_tutorial.py   # 2. scenes -> <project>/index.html + compositions/*.html
    cd video/tutorial && npx hyperframes@0.9.6 render --docker -o renders/tutorial.mp4          # 3. render
    cd video/tutorial-mobile && npx hyperframes@0.9.6 render --docker -o renders/tutorial-mobile.mp4

Voiceover (video/VOICEOVER.md has the lines): best is one file per scene at <project>/assets/voice/<scene id>.wav|mp3|m4a;
each scene then stretches to fit its recording automatically. One long file at <project>/assets/voice.wav also works
(placed at 0 s; scene timing must then be matched by hand).
Edit DESKTOP / MOBILE below to change wording or timing; the output files are plain HyperFrames HTML.
"""
import html, json, math, os, random, shutil, struct, wave

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "tutorial")  # capture.py writes shots + steps.js here
STEPS = json.loads(open(os.path.join(SRC, "assets", "steps.js"), encoding="utf8").read().split("window.STEPS = ", 1)[1].rstrip().rstrip(";"))

GOLD = "#f2b632"
NAVY = "#0f1f36"

INTRO = [("badge", "", 0.2), ("kicker", "คู่มือการใช้งานสำหรับเจ้าหน้าที่ สภ.", 0.45),
         ("title", "วิธีลงข้อมูลผู้ต้องหา", 0.65), ("lead", "ระบบติดตามผู้ต้องหา ภ.จว.อ่างทอง", 0.95)]
OUTRO = [("kicker", "ข้อควรปฏิบัติ", 0.2),
         ("tip", "<b>1</b><span>รหัสผ่านเป็นของท่านคนเดียว ห้ามให้ผู้อื่นใช้</span>", 0.5),
         ("tip", "<b>2</b><span>ใช้เครื่องส่วนกลาง ต้องกด ออกจากระบบ ทุกครั้ง</span>", 1.0),
         ("tip", "<b>3</b><span>ข้อมูลเป็นความลับทางราชการ ห้ามแคปหน้าจอเผยแพร่</span>", 1.5),
         ("foot", "ติดปัญหาการใช้งาน ติดต่อเจ้าหน้าที่ที่เกี่ยวข้อง", 2.2)]

# Each scene: id, shot, dur, chip, caps [(start, end, main, sub)], hls [(target, start, end)],
# cur [(arrive_at, target, click?)], optional zoom (target, start, scale, dur).
DESKTOP = [
    dict(id="intro", dur=4.5, card=INTRO),
    dict(id="s01", shot="01_login", dur=6, chip="1",
         caps=[(0, 6, "เข้าสู่ระบบ", "ใส่ชื่อผู้ใช้และรหัสผ่านที่ได้รับจากผู้ดูแลระบบ")],
         hls=[("user", 0.8, 2.8), ("password", 2.9, 6)], cur=[(0.8, "user", True), (2.9, "password", True)]),
    dict(id="s02", shot="02_login_filled", dur=3.5, chip="1",
         caps=[(0, 3.5, "กดปุ่ม เข้าสู่ระบบ", "รหัสผ่านจะแสดงเป็นจุด ไม่มีใครเห็น")],
         hls=[("submit", 0.4, 3.5)], cur=[(1.0, "submit", True)]),
    dict(id="s02b", shot="02b_newpass", dur=9, chip="1",
         caps=[(0, 4.4, "เข้าครั้งแรก: ตั้งรหัสผ่านใหม่ของท่าน", "ช่องแรกใส่รหัสที่ได้รับ · ช่องถัดไปตั้งรหัสใหม่ 2 ครั้ง"),
               (4.4, 9, "กด บันทึกรหัสผ่านใหม่", "อย่างน้อย 8 ตัว ผสมตัวอักษรและตัวเลข ห้ามบอกผู้อื่น")],
         hls=[("current", 0.6, 2.0), ("new", 2.1, 3.3), ("confirm", 3.4, 4.6), ("save", 4.8, 9)],
         cur=[(0.6, "current", True), (2.1, "new", True), (3.4, "confirm", True), (5.6, "save", True)]),
    dict(id="s03", shot="03_map", dur=7, chip="2",
         caps=[(0, 7, "หน้าแผนที่ของ สภ. ท่าน", "เขตของท่านเป็นสีฟ้า · เห็นเฉพาะหมุดของ สภ. ตัวเอง")],
         hls=[("list", 0.8, 3.6), ("filters", 3.8, 7)], cur=[(0.8, "list", False), (3.8, "filters", False)]),
    dict(id="s03b", shot="03b_zoomed", dur=5, chip="2",
         caps=[(0, 5, "ซูมเข้าพื้นที่ที่ต้องการ", "กดปุ่ม + หรือหมุนลูกกลิ้งเมาส์")],
         hls=[("zoom", 0.4, 5)], cur=[(1.0, "zoom", True)]),
    dict(id="s04", shot="04_picking", dur=6.5, chip="3",
         caps=[(0, 6.5, "ปักหมุดใหม่", "กด ปักหมุดผู้ต้องหาใหม่ แล้วแตะตำแหน่งบ้านบนแผนที่")],
         hls=[("add", 0.4, 2.4), ("spot", 3.4, 6.5)], cur=[(1.1, "add", True), (3.4, "spot", True)]),
    dict(id="s05", shot="05_form", dur=8, chip="4",
         caps=[(0, 8, "กรอกข้อมูลผู้ต้องหา", "ชื่อ-สกุล · เลขบัตร 13 หลัก (ถ้ามี) · ข้อหา · ที่อยู่/จุดสังเกต")],
         hls=[("name", 0.6, 2.2), ("cid", 2.3, 3.9), ("charge", 4.0, 5.6), ("addr", 5.7, 8)],
         cur=[(0.6, "name", True), (2.3, "cid", True), (4.0, "charge", True), (5.7, "addr", True)]),
    dict(id="s06", shot="06_form_filled", dur=9, chip="4",
         caps=[(0, 3.2, "เลือกระดับสี", "แดง · ส้ม · เหลือง ตามที่ผู้บังคับบัญชากำหนด"),
               (3.2, 5.8, "ตรวจพิกัดหมุด", "ถ้ายังไม่ตรง แตะบนแผนที่ใหม่ได้เลย"),
               (5.8, 9, "กด บันทึกข้อมูล", "")],
         hls=[("levels", 0.5, 3.1), ("coords", 3.3, 5.7), ("save", 5.9, 9)],
         cur=[(1.0, "levels", True), (3.4, "coords", False), (6.6, "save", True)]),
    dict(id="s07", shot="07_saved", dur=5, chip="4",
         caps=[(0, 5, "บันทึกเรียบร้อย", "หมุดขึ้นบนแผนที่และในรายการทันที")],
         hls=[("card", 0.4, 2.6), ("pin", 2.7, 5)], cur=[(0.6, "card", False), (2.8, "pin", False)]),
    dict(id="s08", shot="08_popup", dur=8.5, chip="5",
         caps=[(0, 3.4, "ดูรายละเอียด", "แตะชื่อในรายการ หรือแตะหมุดบนแผนที่"),
               (3.4, 8.5, "กด นำทางด้วย Google Maps", "เปิดเส้นทางไปยังจุดนั้นเพื่อลงพื้นที่ตรวจสอบ")],
         hls=[("popup", 0.4, 3.3), ("gmaps", 3.5, 8.5)], cur=[(0.8, "popup", False), (4.4, "gmaps", True)],
         zoom=("popup", 0.2, 1.18, 1.4)),
    dict(id="s09", shot="09_edit_move", dur=7.5, chip="6",
         caps=[(0, 7.5, "แก้ไข / ย้ายหมุด", "กด แก้ไข → แตะจุดใหม่บนแผนที่ → กด บันทึกข้อมูล")],
         hls=[("hint", 0.4, 2.3), ("spot", 2.5, 4.6), ("save", 4.8, 7.5)],
         cur=[(0.8, "hint", False), (2.6, "spot", True), (5.5, "save", True)]),
    dict(id="s10", shot="10_search", dur=5, chip="7",
         caps=[(0, 5, "ค้นหา", "พิมพ์ชื่อ ข้อหา หรือที่อยู่ รายการจะกรองให้ทันที")],
         hls=[("search", 0.4, 2.5), ("list", 2.6, 5)], cur=[(0.8, "search", True), (2.8, "list", False)]),
    dict(id="s11", shot="11_filter", dur=5, chip="7",
         caps=[(0, 5, "กรองตามระดับสี", "กดปุ่มสีเพื่อซ่อนหรือแสดงหมุดระดับนั้น")],
         hls=[("chip", 0.4, 5)], cur=[(1.0, "chip", True)]),
    dict(id="s12", shot="12_dashboard", dur=10, chip="8",
         caps=[(0, 3.4, "แดชบอร์ดสรุปผล", "จำนวนผู้ต้องหาของ สภ. ท่าน แยกตามระดับสี"),
               (3.4, 6.4, "เปลี่ยนรหัสผ่านเองได้ทุกเมื่อ", "ปุ่ม เปลี่ยนรหัสผ่าน มุมขวาบน"),
               (6.4, 10, "เสร็จงานแล้ว กด ออกจากระบบ ทุกครั้ง", "")],
         hls=[("changepw", 3.5, 6.3), ("logout", 6.5, 10)], cur=[(4.2, "changepw", False), (7.4, "logout", True)]),
    dict(id="s13a", shot="01_login", dur=4, chip="9",
         caps=[(0, 4, "ลืมรหัสผ่าน?", "กดลิงก์ ลืมรหัสผ่าน? ที่หน้าเข้าสู่ระบบ")],
         hls=[("forgot", 0.5, 4)], cur=[(1.2, "forgot", True)]),
    dict(id="s13", shot="13_forgot", dur=8, chip="9",
         caps=[(0, 4.2, "ใส่ชื่อผู้ใช้ และเบอร์ติดต่อกลับ", "แล้วกด ส่งคำขอรีเซ็ตรหัสผ่าน"),
               (4.2, 8, "เจ้าหน้าที่ที่เกี่ยวข้องจะโทรยืนยัน แล้วแจ้งรหัสชั่วคราว", "เข้าระบบด้วยรหัสนั้น แล้วตั้งรหัสใหม่ของท่าน")],
         hls=[("user", 0.5, 1.9), ("contact", 2.0, 3.4), ("send", 3.6, 8)],
         cur=[(0.5, "user", True), (2.0, "contact", True), (4.2, "send", True)]),
    dict(id="outro", dur=7, card=OUTRO),
]

MOBILE = [
    dict(id="intro", dur=4.5, card=INTRO),
    dict(id="m01", shot="m01_login", dur=5.5, chip="1",
         caps=[(0, 5.5, "เข้าสู่ระบบ", "ใส่ชื่อผู้ใช้และรหัสผ่านที่ได้รับ")],
         hls=[("user", 0.8, 2.8), ("password", 2.9, 5.5)], cur=[(0.8, "user", True), (2.9, "password", True)]),
    dict(id="m02", shot="m02_login_filled", dur=3, chip="1",
         caps=[(0, 3, "แตะ เข้าสู่ระบบ", "")], hls=[("submit", 0.4, 3)], cur=[(1.0, "submit", True)]),
    dict(id="m02b", shot="m02b_newpass", dur=8.5, chip="1",
         caps=[(0, 4.4, "เข้าครั้งแรก: ตั้งรหัสผ่านใหม่", "ช่องแรกใส่รหัสที่ได้รับ · ตั้งรหัสใหม่ 2 ครั้ง"),
               (4.4, 8.5, "แตะ บันทึกรหัสผ่านใหม่", "อย่างน้อย 8 ตัว ห้ามบอกผู้อื่น")],
         hls=[("current", 0.6, 2.0), ("new", 2.1, 3.3), ("confirm", 3.4, 4.6), ("save", 4.8, 8.5)],
         cur=[(0.6, "current", True), (2.1, "new", True), (3.4, "confirm", True), (5.6, "save", True)]),
    dict(id="m03", shot="m03_map", dur=6.5, chip="2",
         caps=[(0, 6.5, "หน้าแผนที่", "ใช้สองนิ้วถ่างเพื่อซูม · ปุ่มหลักอยู่ด้านล่างจอ")],
         hls=[("add", 0.6, 2.4), ("list", 2.5, 4.3), ("nav", 4.4, 6.5)],
         cur=[(0.8, "add", False), (2.6, "list", False), (4.6, "nav", False)]),
    dict(id="m04", shot="m04_picking", dur=6, chip="3",
         caps=[(0, 6, "แตะ ปักหมุด", "แล้วแตะตำแหน่งบ้านบนแผนที่")],
         hls=[("banner", 0.4, 2.6), ("spot", 2.8, 6)], cur=[(1.0, "banner", False), (3.2, "spot", True)]),
    dict(id="m05", shot="m05_form", dur=8, chip="4",
         caps=[(0, 8, "กรอกข้อมูลผู้ต้องหา", "ชื่อ-สกุล · เลขบัตร (ถ้ามี) · ข้อหา · ที่อยู่/จุดสังเกต")],
         hls=[("name", 0.6, 2.2), ("cid", 2.3, 3.9), ("charge", 4.0, 5.6), ("addr", 5.7, 8)],
         cur=[(0.6, "name", True), (2.3, "cid", True), (4.0, "charge", True), (5.7, "addr", True)]),
    dict(id="m06", shot="m06_form_bottom", dur=7, chip="4",
         caps=[(0, 3.6, "เลือกระดับสี", "ตามที่ผู้บังคับบัญชากำหนด"), (3.6, 7, "แตะ บันทึกข้อมูล", "")],
         hls=[("levels", 0.5, 2.0), ("coords", 2.1, 3.5), ("save", 3.7, 7)],
         cur=[(0.9, "levels", True), (2.3, "coords", False), (4.4, "save", True)]),
    dict(id="m07", shot="m07_saved", dur=4.5, chip="4",
         caps=[(0, 4.5, "บันทึกแล้ว", "หมุดขึ้นบนแผนที่ทันที")],
         hls=[("pin", 0.4, 2.4), ("list", 2.5, 4.5)], cur=[(0.8, "pin", False), (2.8, "list", True)]),
    dict(id="m09", shot="m09_list", dur=6, chip="5",
         caps=[(0, 6, "ดูรายชื่อ / ค้นหา", "พิมพ์ชื่อหรือข้อหา แล้วแตะรายการเพื่อดูบนแผนที่")],
         hls=[("search", 0.4, 2.6), ("card", 2.8, 6)], cur=[(0.8, "search", True), (3.6, "card", True)]),
    dict(id="m08", shot="m08_popup", dur=7, chip="5",
         caps=[(0, 7, "แตะ นำทางด้วย Google Maps", "เปิดแอป Google Maps นำทางไปยังจุดนั้น")],
         hls=[("popup", 0.4, 2.6), ("gmaps", 2.8, 7)], cur=[(1.0, "popup", False), (3.6, "gmaps", True)]),
    dict(id="m10", shot="m10_dashboard", dur=8, chip="6",
         caps=[(0, 2.8, "แดชบอร์ด", "สรุปจำนวนผู้ต้องหาของ สภ. ท่าน"),
               (2.8, 5.2, "เปลี่ยนรหัสผ่าน", "ไอคอนแม่กุญแจ มุมขวาบน"),
               (5.2, 8, "เสร็จงาน แตะ ออกจากระบบ", "")],
         hls=[("nav", 0.4, 2.7), ("changepw", 2.9, 5.1), ("logout", 5.3, 8)],
         cur=[(1.0, "nav", True), (3.4, "changepw", False), (6.0, "logout", True)]),
    dict(id="m13a", shot="m01_login", dur=3.5, chip="7",
         caps=[(0, 3.5, "ลืมรหัสผ่าน?", "แตะลิงก์ที่หน้าเข้าสู่ระบบ")], hls=[("forgot", 0.5, 3.5)], cur=[(1.2, "forgot", True)]),
    dict(id="m13", shot="m13_forgot", dur=8, chip="7",
         caps=[(0, 4.2, "ใส่ชื่อผู้ใช้ และเบอร์ติดต่อกลับ", "แล้วแตะ ส่งคำขอรีเซ็ตรหัสผ่าน"),
               (4.2, 8, "รอเจ้าหน้าที่ที่เกี่ยวข้องโทรแจ้งรหัสชั่วคราว", "เข้าระบบแล้วตั้งรหัสใหม่ของท่าน")],
         hls=[("user", 0.5, 1.9), ("contact", 2.0, 3.4), ("send", 3.6, 8)],
         cur=[(0.5, "user", True), (2.0, "contact", True), (4.2, "send", True)]),
    dict(id="outro", dur=7, card=OUTRO),
]

FONT_FACE = "".join(
    f"@font-face{{font-family:'Sarabun';src:url('assets/fonts/Sarabun-{n}.ttf') format('truetype');font-weight:{w};}}"
    for n, w in [("Regular", 400), ("SemiBold", 600), ("Bold", 700)])

ARROW = ('<svg width="46" height="46" viewBox="0 0 24 24"><path d="M3 2l7.5 19 2.6-7.9L21 10.5z" '
         'fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>')
FINGER = '<svg width="76" height="76" viewBox="0 0 76 76"><circle cx="38" cy="38" r="30" fill="rgba(255,255,255,.55)" stroke="#111" stroke-width="3"/></svg>'

BASE_CSS = """
#R { position:absolute; inset:0; overflow:hidden; background:#0b1220; font-family:'Sarabun',sans-serif; }
#R .cam { position:absolute; left:0; top:0; width:Wpx; height:Hpx; }
#R .stage { position:absolute; overflow:hidden; border-radius:44px; box-shadow:0 0 0 6px #1f2a3d, 0 24px 60px rgba(0,0,0,.5); }
#R .shot { position:absolute; left:0; top:0; width:Wpx; height:Hpx; }
#R .hl { position:absolute; z-index:5; }
#R .hl i { position:absolute; inset:0; display:block; border:5px solid GOLD; border-radius:14px;
  box-shadow:0 0 0 9999px rgba(8,14,26,.42), 0 0 28px rgba(242,182,50,.75); }
#R .rip { position:absolute; width:90px; height:90px; z-index:7; }
#R .rip i { position:absolute; inset:0; display:block; border:5px solid GOLD; border-radius:50%; }
#R .cursor { position:absolute; left:0; top:0; z-index:8; filter:drop-shadow(0 3px 6px rgba(0,0,0,.45)); }
#R .cap { position:absolute; left:0; top:0; width:Wpx; height:Hpx; z-index:10; pointer-events:none; }
#R .cap .box { position:absolute; display:flex; align-items:center; gap:26px;
  background:rgba(12,22,40,.93); border:2px solid rgba(242,182,50,.55); border-radius:24px; padding:22px 34px; color:#fff; }
#R .cap .num { flex:none; width:76px; height:76px; border-radius:50%; background:GOLD; color:NAVY; font-weight:700;
  font-size:44px; display:flex; align-items:center; justify-content:center; }
#R .cap .main { font-size:50px; font-weight:700; line-height:1.25; }
#R .cap .sub { font-size:33px; font-weight:400; color:#d6deea; line-height:1.35; margin-top:4px; }
"""

CARD_CSS = """
#R { position:absolute; inset:0; overflow:hidden; font-family:'Sarabun',sans-serif; color:#fff;
  background: radial-gradient(1200px 900px at 30% 20%, #1d3a63 0%, NAVY 55%, #070e1a 100%); }
#R .stack { position:absolute; left:SIDEpx; right:SIDEpx; top:0; bottom:0; display:flex; flex-direction:column; justify-content:center; gap:26px; }
#R .badge { width:110px; height:110px; border-radius:28px; background:rgba(242,182,50,.14); border:2px solid rgba(242,182,50,.6);
  display:flex; align-items:center; justify-content:center; }
#R .kicker { font-size:36px; color:GOLD; font-weight:600; letter-spacing:.02em; }
#R .title { font-size:TITLEpx; font-weight:700; line-height:1.15; }
#R .lead { font-size:40px; color:#cfd8e6; }
#R .tip { font-size:44px; line-height:1.35; }
#R .tip > div { display:flex; gap:28px; align-items:baseline; }
#R .tip b { color:GOLD; font-size:44px; }
#R .foot { font-size:30px; color:#9fb0c8; margin-top:18px; }
"""

SHIELD = ('<svg width="62" height="62" viewBox="0 0 24 24" fill="none" stroke="' + GOLD + '" stroke-width="1.8" '
          'stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>'
          '<circle cx="12" cy="10" r="2.6"/></svg>')

FORMATS = {
    # caption box: left, width, estimated height; margins keep it inside the 80% title-safe box
    "desktop": dict(dir="tutorial", W=1920, H=1080, cap=(556, 1240, 150), touch=False, side=240, title=104, prefix=""),
    # phone: the screen sits shrunk in a frame at the top and captions get their own strip below it,
    # because a phone screenshot has no empty area a caption could cover safely
    "mobile": dict(dir="tutorial-mobile", W=1080, H=1920, cap=(60, 960, 210), touch=True, side=90, title=88, prefix="m",
                   frame=(97, 36, 0.82), cap_y=1636),
}


def center(r):
    return r[0] + r[2] / 2, r[1] + r[3] / 2


def caption_top(fmt, rects):
    """Bottom band unless a target sits under it, then the top band."""
    if "cap_y" in fmt:
        return fmt["cap_y"]
    L, Wc, Hc = fmt["cap"]
    bottom, top = fmt["H"] - round(fmt["H"] * 0.1) - Hc, round(fmt["H"] * 0.1)
    def hits(y0):
        return any(r[0] < L + Wc and r[0] + r[2] > L and r[1] < y0 + Hc + 20 and r[1] + r[3] > y0 - 20 for r in rects)
    return top if hits(bottom) and not hits(top) else bottom


def subst(css, fmt, sid):
    return (css.replace("#R", f"#{sid}").replace("GOLD", GOLD).replace("NAVY", NAVY)
            .replace("Wpx", f"{fmt['W']}px").replace("Hpx", f"{fmt['H']}px")
            .replace("SIDEpx", f"{fmt['side']}px").replace("TITLEpx", f"{fmt['title']}px"))


def wrap(sid, fmt, css, body, tl):
    return f"""<template>
  <style>
{FONT_FACE}
{css}
  </style>
  <div id="{sid}" data-composition-id="{sid}" data-width="{fmt['W']}" data-height="{fmt['H']}">
  {body}
  </div>
  <script>
    const tl = gsap.timeline({{ paused: true }});
    {chr(10).join('    ' + l for l in tl).strip()}
    window.__timelines["{sid}"] = tl;
  </script>
</template>
"""


def scene_html(fmt, s, cursor_start):
    sid, dur = s["id"], s["dur"]
    rects = STEPS[s["shot"]]
    els, tl = [], []
    half = 38 if fmt["touch"] else 0  # finger dot is centred on the target; the arrow's tip is its top-left
    els.append(f'<img id="{sid}-shot" class="clip shot" data-start="0" data-duration="{dur}" src="assets/shots/{s["shot"]}.png" alt="">')
    for i, (t, a, b) in enumerate(s.get("hls", []), 1):
        x, y, w, h = rects[t]
        p = 10
        els.append(f'<div id="{sid}-hl{i}" class="clip hl" data-start="{a}" data-duration="{round(b - a, 2)}" data-layout-allow-overflow '
                   f'style="left:{x - p}px;top:{y - p}px;width:{w + 2 * p}px;height:{h + 2 * p}px"><i id="{sid}-hl{i}-i"></i></div>')
        tl.append(f'tl.fromTo("#{sid}-hl{i}-i",{{opacity:0,scale:1.12}},{{opacity:1,scale:1,duration:0.35,ease:"power3.out"}},{a});')
    px, py = cursor_start
    tl.append(f'tl.set("#{sid}-cur",{{x:{px - half:.0f},y:{py - half:.0f}}},0);')
    clicks = []
    for i, (t, target, click) in enumerate(s.get("cur", []), 1):
        cx, cy = center(rects[target])
        tl.append(f'tl.fromTo("#{sid}-cur",{{x:{px - half:.0f},y:{py - half:.0f}}},{{x:{cx - half:.0f},y:{cy - half:.0f},duration:0.7,ease:"power2.inOut"}},{max(t - 0.7, 0):.2f});')
        px, py = cx, cy
        if click:
            clicks.append(t)
            els.append(f'<div id="{sid}-rip{i}" class="clip rip" data-start="{t}" data-duration="0.6" data-layout-allow-overflow '
                       f'style="left:{cx - 45:.0f}px;top:{cy - 45:.0f}px"><i id="{sid}-rip{i}-i"></i></div>')
            tl.append(f'tl.fromTo("#{sid}-rip{i}-i",{{scale:0.3,opacity:1}},{{scale:1.4,opacity:0,duration:0.55,ease:"power2.out"}},{t});')
            tl.append(f'tl.fromTo("#{sid}-cur",{{scale:1}},{{scale:0.82,duration:0.08,yoyo:true,repeat:1}},{t});')
    els.append(f'<div id="{sid}-cur" class="cursor" data-layout-ignore>{FINGER if fmt["touch"] else ARROW}</div>')
    if s.get("zoom"):
        target, t0, sc, zd = s["zoom"]
        zx, zy = center(rects[target])
        tl.append(f'tl.fromTo("#{sid}-cam",{{scale:1}},{{scale:{sc},transformOrigin:"{zx:.0f}px {zy:.0f}px",duration:{zd},ease:"power2.inOut"}},{t0});')
    cap_y = caption_top(fmt, [rects[t] for t, _, _ in s.get("hls", [])])
    L, Wc, _ = fmt["cap"]
    caps = []
    for i, (a, b, main, sub) in enumerate(s["caps"], 1):
        sub_html = f'<div class="sub">{html.escape(sub)}</div>' if sub else ""
        caps.append(f'<div id="{sid}-cap{i}" class="clip cap" data-start="{a}" data-duration="{round(b - a, 2)}" data-layout-allow-caption-zone>'
                    f'<div id="{sid}-cap{i}-box" class="box" style="left:{L}px;width:{Wc}px;top:{cap_y}px"><div class="num">{s["chip"]}</div>'
                    f'<div><div class="main">{html.escape(main)}</div>{sub_html}</div></div></div>')
        tl.append(f'tl.fromTo("#{sid}-cap{i}-box",{{opacity:0,y:18}},{{opacity:1,y:0,duration:0.35,ease:"power3.out"}},{a + 0.05});')
    body = f'<div id="{sid}-cam" class="cam" data-layout-allow-overflow>' + "\n    ".join(els) + "</div>"
    if fmt.get("frame"):
        fx, fy, fs = fmt["frame"]  # static CSS scale on a wrapper GSAP never animates
        body = (f'<div id="{sid}-stage" class="stage" data-layout-allow-overflow style="left:{fx}px;top:{fy}px;width:{fmt["W"]}px;'
                f'height:{fmt["H"]}px;transform:scale({fs});transform-origin:0 0">{body}</div>')
    body += "\n  " + "\n  ".join(caps)
    return wrap(sid, fmt, subst(BASE_CSS, fmt, sid), body, tl), (px, py), clicks


def card_html(fmt, s):
    sid, dur = s["id"], s["dur"]
    els, tl = [], []
    for i, (cls, text, at) in enumerate(s["card"], 1):
        inner = SHIELD if cls == "badge" else text
        els.append(f'<div id="{sid}-l{i}" class="clip {cls}" data-start="0" data-duration="{dur}"><div id="{sid}-l{i}-i">{inner}</div></div>')
        tl.append(f'tl.fromTo("#{sid}-l{i}-i",{{opacity:0,y:30}},{{opacity:1,y:0,duration:0.55,ease:"power3.out"}},{at});')
    return wrap(sid, fmt, subst(CARD_CSS, fmt, sid), '<div class="stack">' + "\n    ".join(els) + "</div>", tl)


def click_wav(path):
    """A short, soft mouse click (seeded noise burst + tick), 44.1 kHz mono."""
    rnd, rate = random.Random(7), 44100
    frames = []
    for n in range(int(rate * 0.06)):
        t = n / rate
        v = (0.55 * rnd.uniform(-1, 1) + 0.45 * math.sin(2 * math.pi * 2400 * t)) * math.exp(-t * 140)
        frames.append(struct.pack("<h", int(v * 0.5 * 32767)))
    with wave.open(path, "wb") as w:
        w.setnchannels(1), w.setsampwidth(2), w.setframerate(rate), w.writeframes(b"".join(frames))


VOICE_EXT = (".wav", ".mp3", ".m4a")


def media_seconds(path):
    out = os.popen(f'ffprobe -v error -show_entries format=duration -of csv=p=0 "{path}"').read().strip()
    return float(out)


def fit_to_voice(s, voice_len):
    """Stretch a scene so its voice line fits (+0.6 s breath), scaling every cue inside it proportionally."""
    new = max(s["dur"], round(voice_len + 0.6, 2))
    k = new / s["dur"]
    s = dict(s, dur=new)
    if "caps" in s:
        s["caps"] = [(round(a * k, 2), round(b * k, 2), m, sub) for a, b, m, sub in s["caps"]]
        s["hls"] = [(t, round(a * k, 2), round(b * k, 2)) for t, a, b in s.get("hls", [])]
        s["cur"] = [(round(a * k, 2), t, c) for a, t, c in s.get("cur", [])]
        if s.get("zoom"):
            z = s["zoom"]
            s["zoom"] = (z[0], round(z[1] * k, 2), z[2], z[3])
    return s


def build(name, scenes):
    fmt = FORMATS[name]
    proj = os.path.join(HERE, fmt["dir"])
    for d in ("compositions", "assets/sfx", "assets/fonts", "assets/shots"):
        os.makedirs(os.path.join(proj, d), exist_ok=True)
    if proj != SRC:  # the phone project gets its own copy of the shared assets
        for f in os.listdir(os.path.join(SRC, "assets", "fonts")):
            shutil.copy(os.path.join(SRC, "assets", "fonts", f), os.path.join(proj, "assets", "fonts", f))
        for f in os.listdir(os.path.join(SRC, "assets", "shots")):
            if f.startswith(fmt["prefix"]):
                shutil.copy(os.path.join(SRC, "assets", "shots", f), os.path.join(proj, "assets", "shots", f))
        for f in ("hyperframes.json", "package.json"):
            shutil.copy(os.path.join(SRC, f), os.path.join(proj, f))
        json.dump({"id": "police-tutorial-mobile", "name": "police-tutorial-mobile"}, open(os.path.join(proj, "meta.json"), "w"))
    click_wav(os.path.join(proj, "assets", "sfx", "click.wav"))

    hosts, audio, t, cursor = [], [], 0.0, (fmt["W"] * 0.75, fmt["H"] * 0.8)
    vdir = os.path.join(proj, "assets", "voice")
    for s in scenes:
        vfile = next((f"{s['id']}{e}" for e in VOICE_EXT if os.path.exists(os.path.join(vdir, f"{s['id']}{e}"))), None)
        if vfile:  # one recording per scene: assets/voice/<scene id>.wav|mp3|m4a
            vlen = media_seconds(os.path.join(vdir, vfile))
            s = fit_to_voice(s, vlen)
            audio.append(f'<audio id="voice-{s["id"]}" class="clip" data-start="{t + 0.25:.2f}" data-duration="{vlen:.2f}" data-volume="1" '
                         f'data-track-index="10" src="assets/voice/{vfile}"></audio>')
        sid, dur = s["id"], s["dur"]
        if "card" in s:
            out = card_html(fmt, s)
        else:
            out, cursor, clicks = scene_html(fmt, s, cursor)
            for c in clicks:
                audio.append(f'<audio id="click-{len(audio) + 1}" class="clip" data-start="{t + c:.2f}" data-duration="0.06" '
                             f'data-volume="0.6" data-track-index="20" src="assets/sfx/click.wav"></audio>')
        open(os.path.join(proj, "compositions", f"{sid}.html"), "w", encoding="utf8").write(out)
        hosts.append(f'<div id="{sid}" data-composition-id="{sid}" data-composition-src="compositions/{sid}.html" '
                     f'data-start="{t:.2f}" data-duration="{dur}" data-track-index="1" data-track-kind="graphics" '
                     f'data-width="{fmt["W"]}" data-height="{fmt["H"]}"></div>')
        t += dur
    voice = next((f"voice{e}" for e in VOICE_EXT if os.path.exists(os.path.join(proj, "assets", f"voice{e}"))), None)
    if voice:  # alternative: one long recording, placed at 0 s (then retime scenes by hand)
        audio.insert(0, f'<audio id="voice" class="clip" data-start="0" data-volume="1" data-track-index="10" src="assets/{voice}"></audio>')
    index = f"""<!doctype html>
<html lang="th">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width={fmt['W']}, height={fmt['H']}" />
    <script src="https://cdn.jsdelivr.net/npm/gsap@3.15.0/dist/gsap.min.js"></script>
    <style>
      * {{ margin: 0; padding: 0; box-sizing: border-box; }}
      html, body {{ margin: 0; width: {fmt['W']}px; height: {fmt['H']}px; overflow: hidden; background: #0b1220; }}
    </style>
  </head>
  <body>
    <!-- generated by video/build_tutorial.py -->
    <div id="root" data-composition-id="main" data-start="0" data-duration="{t:.2f}" data-width="{fmt['W']}" data-height="{fmt['H']}">
      {chr(10).join('      ' + h for h in hosts).strip()}
      {chr(10).join('      ' + a for a in audio).strip()}
    </div>
    <script>
      window.__timelines = window.__timelines || {{}};
      window.__timelines["main"] = gsap.timeline({{ paused: true }});
    </script>
  </body>
</html>
"""
    open(os.path.join(proj, "index.html"), "w", encoding="utf8").write(index)
    print(f"{name}: {len(scenes)} scenes, {len(audio)} audio clips{' + voice' if voice else ''}, {t:.1f}s -> {proj}")


if __name__ == "__main__":
    build("desktop", DESKTOP)
    build("mobile", MOBILE)

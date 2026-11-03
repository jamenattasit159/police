// Generate the tutorial voiceover with Motion Studio's cloned voice (Gemini TTS), one file per scene,
// using Studio's own tone preset + polish filter so it sounds the same as ordering it in Studio.
//
//   node video/voiceover_studio.mjs ["เจมส์ V.3"]
//
// Lines come from video/VOICEOVER.md. Output: video/tutorial/assets/voice/<scene>.wav and
// video/tutorial-mobile/assets/voice/<scene>.wav. Finished lines are cached (video/.voice-cache) so a rerun
// after a quota stop only sends what is missing. Then: python video/build_tutorial.py, and render.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const STUDIO = process.env.STUDIO_DIR || "D:/งานที่ให้ AI ทำ/motion/studio";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const VOICE_NAME = process.argv[2] || "เจมส์ V.3";
const PRESET = "flash-close", INTENSITY = "high"; // Studio: "เร่งปิดการขาย" + "จัดเต็ม" + ปรับแต่งเสียงอัตโนมัติ

const env = Object.fromEntries(fs.readFileSync(path.join(STUDIO, ".env"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#"))
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^"|"$/g, "")]; }));
const { GoogleGenAI } = createRequire(path.join(STUDIO, "package.json"))("@google/genai");
const { stylePrompt, polishFilter } = await import(pathToFileURL(path.join(STUDIO, "presets.mjs")).href);
const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
const MODEL = env.VOICE_MODEL || "gemini-3.8-flash-tts";
const GAP = Number(env.VOICE_GAP_MS || 12000);

// Abbreviations a TTS voice would spell out letter by letter -> how an officer says them.
const SPOKEN = [
  [/ภ\.จว\.อ่างทอง/g, "ตำรวจภูธรจังหวัดอ่างทอง"], [/สภ\.\s*/g, "สถานีตำรวจ"], [/Google Maps/g, "กูเกิลแมปส์"],
  [/ชื่อ-นามสกุล/g, "ชื่อ นามสกุล"], [/\s*\(ใช้ไฟล์เดียวกับคลิปคอมได้\)\s*/g, " "],
];
const spoken = (t) => SPOKEN.reduce((s, [re, to]) => s.replace(re, to), t).replace(/\s+/g, " ").trim();

/** VOICEOVER.md tables -> {desktop: [[id, line]], mobile: [[id, line]]} */
function readScript() {
  const md = fs.readFileSync(path.join(HERE, "VOICEOVER.md"), "utf8");
  const out = { desktop: [], mobile: [] };
  let cur = null;
  for (const l of md.split(/\r?\n/)) {
    if (l.startsWith("## คลิปคอม")) cur = "desktop";
    else if (l.startsWith("## คลิปมือถือ")) cur = "mobile";
    else if (l.startsWith("## ")) cur = null;
    const m = cur && l.match(/^\|\s*`([a-z0-9]+)`\s*\|[^|]*\|[^|]*\|\s*(.+?)\s*\|\s*$/);
    if (m) out[cur].push([m[1], spoken(m[2])]);
  }
  return out;
}

function pcmToWav(pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastCall = 0;

async function synth(text, voice, style) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastCall + GAP - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts: [{ text, speechMetadata: { style } }] }],
        config: { responseModalities: ["AUDIO"], speechConfig: { voiceConfig: { voice } } },
      });
      const d = res.candidates?.[0]?.content?.parts?.[0]?.inlineData;
      if (!d?.data) throw new Error("Gemini ไม่ส่งเสียงกลับมา");
      const buf = Buffer.from(d.data, "base64");
      return /L16|pcm/i.test(d.mimeType || "") ? pcmToWav(buf, Number(d.mimeType.match(/rate=(\d+)/)?.[1] || 24000)) : buf;
    } catch (err) {
      const msg = String(err?.message || err);
      if (!/429|RESOURCE_EXHAUSTED/i.test(msg) || /limit:\s*0\b|per.?day|daily/i.test(msg) || attempt >= 3) throw err;
      const backoff = 15000 * 2 ** attempt;
      console.log(`  429 รายนาที → รอ ${backoff / 1000} วิ`);
      await sleep(backoff);
    }
  }
}

const voices = (await ai.voices.list({ type: ["replicated"] })).voices || [];
const voice = voices.find((v) => (v.display_name || v.displayName) === VOICE_NAME)?.id;
if (!voice) throw new Error(`ไม่พบเสียงโคลน "${VOICE_NAME}"`);
const style = stylePrompt(PRESET, INTENSITY);
const polish = polishFilter(PRESET);
const cache = path.join(HERE, ".voice-cache");
fs.mkdirSync(cache, { recursive: true });
const script = readScript();
const projects = { desktop: path.join(HERE, "tutorial"), mobile: path.join(HERE, "tutorial-mobile") };
const total = script.desktop.length + script.mobile.length;
console.log(`เสียง ${VOICE_NAME} (${voice}) · โทน: ${style} · ${total} ฉาก`);

let n = 0;
for (const [fmt, lines] of Object.entries(script)) {
  const outDir = path.join(projects[fmt], "assets", "voice");
  fs.mkdirSync(outDir, { recursive: true });
  for (let [id, text] of lines) {
    n++;
    if (fmt === "mobile" && (id === "intro" || id === "outro") && text.length < 5)
      text = script.desktop.find(([d]) => d === id)[1]; // "use the desktop file" rows
    const raw = path.join(cache, crypto.createHash("sha256").update(`${voice}|${style}|${text}`).digest("hex").slice(0, 24) + ".wav");
    if (!fs.existsSync(raw)) {
      console.log(`[${n}/${total}] ${fmt} ${id}: ส่ง ${text.length} ตัวอักษร`);
      fs.writeFileSync(raw, await synth(text, voice, style));
    } else console.log(`[${n}/${total}] ${fmt} ${id}: มีแล้ว`);
    // Trim leading/trailing silence, then Studio's polish chain (rumble cut, compression, presence, tempo, loudness).
    const trim = "silenceremove=start_periods=1:start_threshold=-45dB:stop_periods=-1:stop_duration=0.4:stop_threshold=-45dB";
    execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", raw, "-af", `${trim},${polish}`, "-ar", "48000", "-ac", "1",
      path.join(outDir, `${id}.wav`)]);
  }
}
console.log("เสร็จ: วางไฟล์ใน assets/voice/ ของทั้งสองโปรเจกต์แล้ว");

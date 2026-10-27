#!/usr/bin/env node
/*
 * Rendert das Einfuehrungsvideo Bild fuer Bild mit Chromium (Playwright)
 * und setzt es mit ffmpeg zusammen.
 *
 *   node render.mjs video              ganzes Video -> out/einfuehrung.mp4
 *   node render.mjs video 30 45        nur Sekunde 30 bis 45 (Vorschau)
 *   node render.mjs stills 1.5 12 40   Standbilder -> out/stills/
 *   node render.mjs sheet 0 160 2      Kontaktbogen: alle 2 s ein Bild
 *   node render.mjs cues               Ton-Hinweise -> audio/cues.json
 *
 * Optionen: --fps 60 --workers 4 --scale 1 --crf 20 --out datei.mp4
 *           --blur 2 (Bewegungsunschaerfe: n Zwischenbilder je Bild)
 *
 * Braucht ffmpeg und Playwright mit Chromium (npx playwright install chromium).
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  console.error("Playwright fehlt: npm i -D playwright && npx playwright install chromium");
  process.exit(1);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "out");
const PAGE = pathToFileURL(join(HERE, "index.html")).href;

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i === -1) return fallback;
  const value = args[i + 1];
  args.splice(i, 2);
  return value;
};
const FPS = Number(opt("fps", 60));
const WORKERS = Number(opt("workers", 4));
const SCALE = Number(opt("scale", 1));
const CRF = Number(opt("crf", 20));
const BLUR = Number(opt("blur", 1));
const OUTFILE = opt("out", join(OUT, "einfuehrung.mp4"));
const [mode = "video", ...rest] = args;

mkdirSync(OUT, { recursive: true });

async function openPage(browser) {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: SCALE,
  });
  page.on("pageerror", (e) => console.error("Seitenfehler:", e.message));
  page.on("console", (m) => m.type() === "error" && console.error("Konsole:", m.text()));
  await page.goto(`${PAGE}?t=0`);
  await page.evaluate(() => window.__ready);
  return page;
}

const sessions = new WeakMap();
async function shot(page, t, type = "jpeg") {
  await page.evaluate((time) => window.V.seek(time), t);
  if (!sessions.has(page)) sessions.set(page, await page.context().newCDPSession(page));
  const { data } = await sessions.get(page).send("Page.captureScreenshot", {
    format: type,
    quality: type === "jpeg" ? 93 : undefined,
    optimizeForSpeed: type === "jpeg",
  });
  return Buffer.from(data, "base64");
}

function ffmpeg(argv, { quiet = true } = {}) {
  const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", quiet ? "error" : "info", ...argv], {
    stdio: ["pipe", "inherit", "inherit"],
  });
  const done = new Promise((resolve, reject) =>
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))),
  );
  return { proc, done };
}

const write = (stream, buf) =>
  new Promise((resolve) => (stream.write(buf) ? resolve() : stream.once("drain", resolve)));

async function duration(browser) {
  const page = await openPage(browser);
  const info = await page.evaluate(() => ({
    duration: window.V.duration,
    cues: window.V.cues,
    scenes: window.V.sceneList(),
  }));
  await page.close();
  return info;
}

async function renderVideo(browser, from, to) {
  const subs = BLUR;
  const total = Math.round((to - from) * FPS);
  const per = Math.ceil(total / WORKERS);
  const segDir = join(OUT, "segments");
  rmSync(segDir, { recursive: true, force: true });
  mkdirSync(segDir, { recursive: true });
  const started = Date.now();
  let doneFrames = 0;

  const jobs = Array.from({ length: WORKERS }, (_, w) => {
    const a = w * per;
    const b = Math.min(total, a + per);
    if (a >= b) return null;
    return (async () => {
      const page = await openPage(browser);
      const file = join(segDir, `seg-${String(w).padStart(2, "0")}.mp4`);
      const filters = [];
      if (subs > 1) filters.push(`tmix=frames=${subs}`, `select='not(mod(n\\,${subs}))'`, `setpts=N/${FPS}/TB`);
      if (SCALE !== 1) filters.push(`scale=1920:1080:flags=lanczos`);
      const enc = ffmpeg([
        "-y", "-f", "image2pipe", "-framerate", String(FPS * subs), "-c:v", "mjpeg", "-i", "-",
        ...(filters.length ? ["-vf", filters.join(",")] : []),
        "-r", String(FPS), "-c:v", "libx264", "-preset", "veryfast", "-crf", "12", "-pix_fmt", "yuv420p", file,
      ]);
      for (let f = a; f < b; f++) {
        for (let k = 0; k < subs; k++) {
          // Zwischenbilder um die Bildmitte verteilt (Verschluss 180 Grad)
          const t = from + (f + (subs > 1 ? (k / subs - 0.5) * 0.5 : 0)) / FPS;
          await write(enc.proc.stdin, await shot(page, Math.max(0, t)));
        }
        doneFrames++;
        if (doneFrames % 60 === 0) {
          const secs = (Date.now() - started) / 1000;
          const eta = (secs / doneFrames) * (total - doneFrames);
          process.stdout.write(`\r${doneFrames}/${total} Bilder · ${(doneFrames / secs).toFixed(1)} B/s · noch ${Math.round(eta)} s   `);
        }
      }
      enc.proc.stdin.end();
      await enc.done;
      await page.close();
      return file;
    })();
  }).filter(Boolean);

  const files = await Promise.all(jobs);
  process.stdout.write("\n");
  const list = join(segDir, "list.txt");
  writeFileSync(list, files.map((f) => `file '${f}'`).join("\n"));
  const audio = join(HERE, "audio", "soundtrack.wav");
  const withAudio = existsSync(audio);
  const final = ffmpeg(
    [
      "-y", "-f", "concat", "-safe", "0", "-i", list,
      ...(withAudio ? ["-ss", String(from), "-t", String(to - from), "-i", audio] : []),
      "-c:v", "libx264", "-preset", "slow", "-crf", String(CRF), "-pix_fmt", "yuv420p",
      "-profile:v", "high", "-tune", "animation", "-g", String(FPS * 2),
      ...(withAudio ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
      "-movflags", "+faststart", OUTFILE,
    ],
    { quiet: true },
  );
  await final.done;
  console.log(`Fertig: ${OUTFILE} (${((Date.now() - started) / 1000).toFixed(0)} s)${withAudio ? " mit Ton" : " ohne Ton"}`);
}

async function main() {
  const browser = await chromium.launch({ args: ["--disable-lcd-text", "--force-color-profile=srgb"] });
  try {
    if (mode === "cues") {
      const info = await duration(browser);
      writeFileSync(join(HERE, "audio", "cues.json"), JSON.stringify(info, null, 1));
      console.log(`${info.cues.length} Hinweise, ${info.duration} s -> audio/cues.json`);
    } else if (mode === "stills") {
      const page = await openPage(browser);
      const dir = join(OUT, "stills");
      mkdirSync(dir, { recursive: true });
      for (const value of rest) {
        const t = Number(value);
        const file = join(dir, `t${t.toFixed(2).padStart(7, "0")}.png`);
        writeFileSync(file, await shot(page, t, "png"));
        console.log(file);
      }
    } else if (mode === "sheet") {
      const [a = 0, b, step = 2, cols = 6] = rest.map(Number);
      const info = await duration(browser);
      const end = b || info.duration;
      const page = await openPage(browser);
      const dir = join(OUT, "sheet");
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      let i = 0;
      for (let t = a; t < end; t += step) {
        writeFileSync(join(dir, `${String(i++).padStart(4, "0")}.jpg`), await shot(page, t));
      }
      const sheet = join(OUT, `sheet-${a}-${end}.jpg`);
      await ffmpeg([
        "-y", "-framerate", "1", "-i", join(dir, "%04d.jpg"),
        "-vf", `scale=480:-1,drawtext=text='%{n}':x=8:y=8:fontcolor=white:fontsize=18:box=1:boxcolor=black@0.5,tile=${cols}x${Math.ceil(i / cols)}:padding=4`,
        "-frames:v", "1", sheet,
      ]).done.catch(async () => {
        // ohne drawtext (fehlende Schrift) nochmal schlicht
        await ffmpeg(["-y", "-framerate", "1", "-i", join(dir, "%04d.jpg"), "-vf", `scale=480:-1,tile=${cols}x${Math.ceil(i / cols)}:padding=4`, "-frames:v", "1", sheet]).done;
      });
      console.log(`${sheet} (${i} Bilder, ab ${a} s alle ${step} s)`);
    } else {
      const info = await duration(browser);
      const from = rest[0] !== undefined ? Number(rest[0]) : 0;
      const to = rest[1] !== undefined ? Number(rest[1]) : info.duration;
      console.log(`Rendere ${from}–${to} s, ${FPS} fps, ${WORKERS} Prozesse${BLUR > 1 ? `, ${BLUR}x Unschärfe` : ""}`);
      await renderVideo(browser, from, to);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

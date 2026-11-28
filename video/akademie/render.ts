/**
 * Rendert die Erklaervideos der Akademie.
 *
 *   npm run akademie:videos                       alle Videos
 *   npm run akademie:videos -- auftreten grenzen  nur diese
 *   npm run akademie:videos -- --stills           je Szene ein Standbild (out/<id>/stills)
 *   npm run akademie:videos -- --workers 3        Chromium-Seiten je Video (Standard 3)
 *
 * Ablauf je Video: Drehbuch (script.ts) -> Sprache je Satz (tts.py, Piper)
 * -> Zeitleiste aus den Satzlaengen -> Tonspur -> Bilder mit Chromium
 * (stage.html, Bild fuer Bild; steht alles still, wird das letzte Bild
 * wiederverwendet) -> ffmpeg. Ergebnis in public/akademie/<id>.mp4, .jpg
 * (Vorschaubild) und .vtt (Untertitel); Laenge, Kapitel und Fingerabdruck
 * in src/lib/academy/videos.json.
 *
 * Braucht ffmpeg, Playwright mit Chromium, die Schriften Inter und Inter
 * Display und Piper (siehe README.md in diesem Ordner).
 */
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { VOICE, buildVideoScripts, scriptHash, type Visual, type VideoScript } from "./script";
import { captionChunks, sentences, speakable } from "./speech";

const ROOT = process.cwd();
const HERE = join(ROOT, "video", "akademie");
const OUT = join(HERE, "out");
const PUBLIC = join(ROOT, "public", "akademie");
const MANIFEST = join(ROOT, "src", "lib", "academy", "videos.json");
const PYTHON = join(HERE, ".venv", "bin", "python");
const MODEL = join(HERE, ".cache", "voices", `${VOICE.model}.onnx`);
const TTS_CACHE = join(HERE, ".cache", "tts");
const STAGE = pathToFileURL(join(HERE, "stage.html")).href;

const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;

// Takt der Sprache (Sekunden)
const FIRST_LEAD = 1.1; // vom Start bis zum ersten Wort (der Gong klingt aus)
const SCENE_LEAD = 0.55; // vom Szenenbeginn bis zum ersten Wort
const BEAT_GAP = 0.5; // zwischen zwei Absaetzen einer Szene
const SENTENCE_GAP = 0.24; // zwischen zwei Saetzen eines Absatzes
const SCENE_TAIL = 0.8; // nach dem letzten Wort bis zur naechsten Szene
const LAST_TAIL = 2.4; // nach dem letzten Wort des Videos

const args = process.argv.slice(2);
function option(name: string, fallback: number): number {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(args[index + 1]);
  args.splice(index, 2);
  return value;
}
const WORKERS = option("workers", 3);
const CRF = option("crf", 25);
const STILLS = args.includes("--stills");
const wanted = args.filter((arg) => !arg.startsWith("--"));

/* ------------------------------------------------------------------ Sprache */

interface Spoken {
  text: string;
  speak: string;
  key: string;
  duration: number;
}

function speechKey(speak: string): string {
  return createHash("sha256").update(`${VOICE.model}|${VOICE.lengthScale}|${speak}`).digest("hex").slice(0, 24);
}

/** Alle Saetze sprechen lassen, die noch nicht im Zwischenspeicher liegen. */
function synthesize(items: Array<{ key: string; text: string }>): Record<string, number> {
  if (!existsSync(PYTHON)) throw new Error(`Piper fehlt: ${PYTHON} (siehe video/akademie/README.md)`);
  if (!existsSync(MODEL)) throw new Error(`Stimme fehlt: ${MODEL} (siehe video/akademie/README.md)`);
  const unique = [...new Map(items.map((item) => [item.key, item])).values()];
  const run = spawnSync(PYTHON, [join(HERE, "tts.py")], {
    input: JSON.stringify({ model: MODEL, length_scale: VOICE.lengthScale, items: unique }),
    encoding: "utf8",
    stdio: ["pipe", "pipe", "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (run.status !== 0) throw new Error("Sprachausgabe fehlgeschlagen");
  return JSON.parse(run.stdout) as Record<string, number>;
}

/* -------------------------------------------------------------- Zeitleiste */

interface TimedSentence {
  text: string;
  key: string;
  start: number;
  end: number;
}
interface TimedScene {
  start: number;
  end: number;
  visual: Visual;
  chapter?: string;
  beats: Array<{ start: number; end: number }>;
  sentences: TimedSentence[];
}
interface Timeline {
  id: string;
  mood: VideoScript["mood"];
  chip: VideoScript["chip"];
  duration: number;
  scenes: TimedScene[];
}

function plan(script: VideoScript, spoken: Map<string, Spoken[][]>): Timeline {
  let cursor = 0;
  const scenes = script.scenes.map((scene, index): TimedScene => {
    const start = cursor;
    let t = start + (index === 0 ? FIRST_LEAD : SCENE_LEAD);
    const beats: TimedScene["beats"] = [];
    const timed: TimedSentence[] = [];
    spoken.get(`${script.id}#${index}`)!.forEach((beat, b) => {
      if (b > 0) t += BEAT_GAP;
      const beatStart = t;
      beat.forEach((sentence, s) => {
        if (s > 0) t += SENTENCE_GAP;
        timed.push({ text: sentence.text, key: sentence.key, start: t, end: t + sentence.duration });
        t += sentence.duration;
      });
      beats.push({ start: beatStart, end: t });
    });
    const last = index === script.scenes.length - 1;
    cursor = t + (last ? LAST_TAIL : SCENE_TAIL);
    return { start, end: cursor, visual: scene.visual, chapter: scene.chapter, beats, sentences: timed };
  });
  return { id: script.id, mood: script.mood, chip: script.chip, duration: cursor, scenes };
}

/* --------------------------------------------------------------------- Ton */

function readWav(file: string): { rate: number; samples: Float32Array } {
  const buf = readFileSync(file);
  let offset = 12;
  let rate = 22050;
  let channels = 1;
  let bits = 16;
  while (offset < buf.length) {
    const id = buf.toString("ascii", offset, offset + 4);
    const size = buf.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(offset + 10);
      rate = buf.readUInt32LE(offset + 12);
      bits = buf.readUInt16LE(offset + 22);
    } else if (id === "data") {
      if (bits !== 16 || channels !== 1) throw new Error(`${file}: erwartet 16 bit mono`);
      const count = size / 2;
      const samples = new Float32Array(count);
      for (let i = 0; i < count; i++) samples[i] = buf.readInt16LE(offset + 8 + i * 2) / 32768;
      return { rate, samples };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error(`${file}: keine Tondaten`);
}

function writeWav(file: string, rate: number, samples: Float32Array): void {
  const data = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    data.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  writeFileSync(file, Buffer.concat([header, data]));
}

/** Weicher Gong zum Anfang: zwei Glockentoene, leise unter der Stimme. */
function addChime(track: Float32Array, rate: number, at: number, mood: VideoScript["mood"]): void {
  const notes = mood === "red" ? [523.25, 622.25] : [587.33, 880];
  const length = Math.round(rate * 1.6);
  notes.forEach((frequency, n) => {
    const offset = Math.round((at + n * 0.14) * rate);
    for (let i = 0; i < length && offset + i < track.length; i++) {
      const t = i / rate;
      const attack = Math.min(1, t / 0.008);
      const decay = Math.exp(-t * 3.2);
      const tone =
        Math.sin(2 * Math.PI * frequency * t) +
        0.35 * Math.sin(2 * Math.PI * frequency * 2.01 * t) * Math.exp(-t * 5) +
        0.12 * Math.sin(2 * Math.PI * frequency * 3.03 * t) * Math.exp(-t * 8);
      track[offset + i] += 0.16 * attack * decay * tone;
    }
  });
}

function buildAudio(timeline: Timeline, file: string): void {
  const first = timeline.scenes[0].sentences[0];
  const rate = readWav(join(TTS_CACHE, `${first.key}.wav`)).rate;
  const track = new Float32Array(Math.ceil(timeline.duration * rate) + rate);
  addChime(track, rate, 0.15, timeline.mood);
  for (const scene of timeline.scenes) {
    for (const sentence of scene.sentences) {
      const { samples } = readWav(join(TTS_CACHE, `${sentence.key}.wav`));
      const offset = Math.round(sentence.start * rate);
      // Piper normiert jeden Satz auf Vollaussteuerung - etwas Luft lassen.
      for (let i = 0; i < samples.length && offset + i < track.length; i++) track[offset + i] += samples[i] * 0.7;
    }
  }
  writeWav(file, rate, track);
}

/* --------------------------------------------------------------- Untertitel */

function clock(seconds: number): string {
  const ms = Math.round(seconds * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(rest).padStart(3, "0")}`;
}

function captions(timeline: Timeline): string {
  const cues: string[] = ["WEBVTT", ""];
  let n = 0;
  for (const scene of timeline.scenes) {
    for (const sentence of scene.sentences) {
      const chunks = captionChunks(sentence.text);
      const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
      let t = sentence.start;
      for (const chunk of chunks) {
        const share = ((sentence.end - sentence.start) * chunk.length) / total;
        cues.push(String(++n), `${clock(t)} --> ${clock(t + share)}`, chunk, "");
        t += share;
      }
    }
  }
  return cues.join("\n");
}

/* ------------------------------------------------------------------- Bilder */

/*
 * Playwright ist keine Abhaengigkeit der App - darum nur die Teile als Typ,
 * die hier gebraucht werden.
 */
interface CdpSession {
  send(method: "Page.captureScreenshot", params: Record<string, unknown>): Promise<{ data: string }>;
  detach(): Promise<void>;
}
interface Page {
  on(event: "pageerror", listener: (error: Error) => void): void;
  on(event: "console", listener: (message: { type(): string; text(): string }) => void): void;
  addInitScript<A>(script: (arg: A) => void, arg: A): Promise<void>;
  goto(url: string): Promise<unknown>;
  evaluate<R, A = undefined>(fn: (arg: A) => R | Promise<R>, arg?: A): Promise<R>;
  context(): { newCDPSession(page: Page): Promise<CdpSession> };
  close(): Promise<void>;
}
interface Browser {
  newPage(options: { viewport: { width: number; height: number }; deviceScaleFactor: number }): Promise<Page>;
  close(): Promise<void>;
}
interface Chromium {
  launch(options: { args: string[] }): Promise<Browser>;
}

const require = createRequire(join(ROOT, "package.json"));
function chromium(): Chromium {
  try {
    return (require("playwright") as { chromium: Chromium }).chromium;
  } catch {
    // In der Cloud-Umgebung liegt Playwright global, nicht im Projekt.
    const global = spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim();
    return (require(join(global, "playwright")) as { chromium: Chromium }).chromium;
  }
}
const launch = () => chromium().launch({ args: ["--disable-lcd-text", "--force-color-profile=srgb", "--font-render-hinting=none"] });

async function openStage(browser: Browser, timeline: Timeline): Promise<Page> {
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  page.on("pageerror", (error) => console.error("Seitenfehler:", error.message));
  page.on("console", (message) => {
    if (message.type() === "error") console.error("Konsole:", message.text());
  });
  await page.addInitScript((data) => {
    (window as unknown as { __TIMELINE__: unknown }).__TIMELINE__ = data;
  }, timeline);
  await page.goto(STAGE);
  await page.evaluate(() => (window as unknown as { __ready: Promise<boolean> }).__ready);
  return page;
}

async function capture(page: Page, type: "jpeg" | "png" = "jpeg"): Promise<Buffer> {
  const session = await page.context().newCDPSession(page);
  const { data } = await session.send("Page.captureScreenshot", {
    format: type,
    quality: type === "jpeg" ? 92 : undefined,
    optimizeForSpeed: type === "jpeg",
  });
  await session.detach();
  return Buffer.from(data, "base64");
}

function ffmpeg(argv: string[]) {
  const proc = spawn("ffmpeg", ["-hide_banner", "-loglevel", "error", ...argv], { stdio: ["pipe", "inherit", "inherit"] });
  const done = new Promise<void>((resolve, reject) =>
    proc.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg ${code}`)))),
  );
  return { proc, done };
}

function write(stream: NodeJS.WritableStream, buf: Buffer): Promise<void> {
  return new Promise((resolve) => (stream.write(buf) ? resolve() : stream.once("drain", () => resolve())));
}

async function renderFrames(timeline: Timeline, dir: string): Promise<string> {
  const total = Math.ceil(timeline.duration * FPS);
  const per = Math.ceil(total / WORKERS);
  const started = Date.now();
  let drawn = 0;
  let reused = 0;
  const jobs = Array.from({ length: WORKERS }, (_, worker) => {
    const from = worker * per;
    const to = Math.min(total, from + per);
    if (from >= to) return null;
    return (async () => {
      // Eigener Browser je Arbeiter - sonst teilen sich alle einen Grafikprozess.
      const browser = await launch();
      const page = await openStage(browser, timeline);
      const session = await page.context().newCDPSession(page);
      const file = join(dir, `segment-${worker}.mp4`);
      const encoder = ffmpeg([
        "-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
        "-c:v", "libx264", "-preset", "slow", "-crf", String(CRF), "-tune", "animation",
        // Schluesselbild hoechstens alle 10 s: das Bild steht meist still, jedes Schluesselbild kostet.
        "-g", String(FPS * 10), "-keyint_min", String(FPS), "-pix_fmt", "yuv420p", "-profile:v", "high", file,
      ]);
      let lastKey: string | null = null;
      let lastFrame: Buffer | null = null;
      for (let f = from; f < to; f++) {
        const state = await page.evaluate(
          (t: number) => (window as unknown as { V: { seek(t: number): { moving: boolean; key: string } } }).V.seek(t),
          f / FPS,
        );
        let frame: Buffer;
        if (!state.moving && state.key === lastKey && lastFrame) {
          frame = lastFrame;
          reused++;
        } else {
          const { data } = await session.send("Page.captureScreenshot", { format: "jpeg", quality: 92, optimizeForSpeed: true });
          frame = Buffer.from(data, "base64");
          drawn++;
        }
        lastKey = state.moving ? null : state.key;
        lastFrame = frame;
        await write(encoder.proc.stdin, frame);
        const done = drawn + reused;
        if (done % 300 === 0) {
          const secs = (Date.now() - started) / 1000;
          process.stdout.write(`\r  Bilder ${done}/${total} · ${drawn} gezeichnet · ${Math.round(secs)} s   `);
        }
      }
      encoder.proc.stdin.end();
      await encoder.done;
      await browser.close();
      return file;
    })();
  }).filter((job): job is Promise<string> => job !== null);
  const files = await Promise.all(jobs);
  process.stdout.write(`\r  ${drawn + reused} Bilder, ${drawn} gezeichnet, ${reused} wiederverwendet (${Math.round((Date.now() - started) / 1000)} s)\n`);
  const list = join(dir, "segments.txt");
  writeFileSync(list, files.map((file) => `file '${file}'`).join("\n"));
  return list;
}

/** Ein Bild aus der Mitte einer Szene - fuers Vorschaubild und die Standbilder. */
function calmMoment(scene: TimedScene): number {
  const lastBeat = scene.beats[scene.beats.length - 1];
  return Math.min(scene.end - 0.05, (lastBeat ? lastBeat.end : scene.start) + 0.3);
}

/* -------------------------------------------------------------- Manifest */

interface ManifestEntry {
  title: string;
  src: string;
  poster: string;
  captions: string;
  duration: number;
  chapters: Array<{ t: number; title: string }>;
  script: string;
}

function readManifest(): Record<string, ManifestEntry> {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, "utf8")) as Record<string, ManifestEntry>) : {};
}

function writeManifest(entries: Record<string, ManifestEntry>, order: string[]): void {
  const sorted: Record<string, ManifestEntry> = {};
  for (const id of order) if (entries[id]) sorted[id] = entries[id];
  writeFileSync(MANIFEST, `${JSON.stringify(sorted, null, 2)}\n`);
}

/* -------------------------------------------------------------------- Lauf */

async function main() {
  const scripts = buildVideoScripts();
  const chosen = wanted.length ? scripts.filter((script) => wanted.includes(script.id)) : scripts;
  if (chosen.length === 0) throw new Error(`Unbekannt: ${wanted.join(", ")} - es gibt ${scripts.map((s) => s.id).join(", ")}`);

  // 1. Sprache fuer alle gewaehlten Videos auf einmal (die Stimme laedt nur einmal).
  const spoken = new Map<string, Spoken[][]>();
  const items: Array<{ key: string; text: string }> = [];
  for (const script of chosen) {
    script.scenes.forEach((scene, index) => {
      const beats = scene.beats.map((beat) =>
        sentences(beat).map((text) => {
          const speak = speakable(text);
          const key = speechKey(speak);
          items.push({ key, text: speak });
          return { text, speak, key, duration: 0 };
        }),
      );
      spoken.set(`${script.id}#${index}`, beats);
    });
  }
  console.log(`Sprache: ${items.length} Sätze`);
  const durations = synthesize(items);
  for (const beats of spoken.values()) for (const beat of beats) for (const sentence of beat) sentence.duration = durations[sentence.key];

  mkdirSync(PUBLIC, { recursive: true });
  const manifest = readManifest();
  const browser = await launch();
  try {
    for (const script of chosen) {
      const timeline = plan(script, spoken);
      const dir = join(OUT, script.id);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "timeline.json"), JSON.stringify(timeline, null, 1));
      console.log(`\n${script.id}: ${timeline.scenes.length} Szenen, ${timeline.duration.toFixed(1)} s`);

      if (STILLS) {
        const page = await openStage(browser, timeline);
        const stills = join(dir, "stills");
        mkdirSync(stills, { recursive: true });
        for (const [index, scene] of timeline.scenes.entries()) {
          await page.evaluate((t: number) => (window as unknown as { V: { seek(t: number): unknown } }).V.seek(t), calmMoment(scene));
          writeFileSync(join(stills, `${String(index).padStart(2, "0")}-${scene.visual.kind}.png`), await capture(page, "png"));
        }
        await page.close();
        console.log(`  Standbilder: ${stills}`);
        continue;
      }

      const voice = join(dir, "voice.wav");
      buildAudio(timeline, voice);
      const list = await renderFrames(timeline, dir);
      const target = join(PUBLIC, `${script.id}.mp4`);
      await ffmpeg([
        "-y", "-f", "concat", "-safe", "0", "-i", list, "-i", voice,
        "-map", "0:v", "-map", "1:a", "-c:v", "copy",
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=11", "-ar", "48000", "-ac", "1", "-c:a", "aac", "-b:a", "96k",
        "-shortest", "-movflags", "+faststart", target,
      ]).done;

      // Vorschaubild: der Titel, ganz eingeblendet.
      const page = await openStage(browser, timeline);
      await page.evaluate((t: number) => (window as unknown as { V: { seek(t: number): unknown } }).V.seek(t), calmMoment(timeline.scenes[0]));
      const posterPng = join(dir, "poster.png");
      writeFileSync(posterPng, await capture(page, "png"));
      await page.close();
      await ffmpeg(["-y", "-i", posterPng, "-vf", "scale=1280:-1", "-q:v", "4", join(PUBLIC, `${script.id}.jpg`)]).done;

      writeFileSync(join(PUBLIC, `${script.id}.vtt`), captions(timeline));

      manifest[script.id] = {
        title: script.title,
        src: `/akademie/${script.id}.mp4`,
        poster: `/akademie/${script.id}.jpg`,
        captions: `/akademie/${script.id}.vtt`,
        duration: Math.round(timeline.duration * 10) / 10,
        chapters: timeline.scenes
          .filter((scene) => scene.chapter)
          .map((scene) => ({ t: Math.round(scene.start * 10) / 10, title: scene.chapter! })),
        script: scriptHash(script),
      };
      writeManifest(manifest, scripts.map((s) => s.id));
      const size = (readFileSync(target).length / 1024 / 1024).toFixed(1);
      console.log(`  -> public/akademie/${script.id}.mp4 (${size} MB)`);
    }
  } finally {
    await browser.close();
  }
  if (!STILLS) console.log(`\nManifest: ${MANIFEST}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

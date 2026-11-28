import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ACADEMY_MODULES, RED_LINES } from "../../src/lib/academy/content";
import { RED_LINES_VIDEO, academyVideo, videoLength } from "../../src/lib/academy/videos";
import { buildVideoScripts, scriptHash, type VideoScript } from "../../video/akademie/script";
import { captionChunks, sentences, speakable } from "../../video/akademie/speech";

const scripts = buildVideoScripts();
const spoken = (script: VideoScript) => script.scenes.flatMap((scene) => scene.beats).join(" ");

test("Drehbuch: jedes Video sagt alles, was im Modul steht", () => {
  assert.deepEqual(
    scripts.map((script) => script.id),
    [RED_LINES_VIDEO, ...ACADEMY_MODULES.map((mod) => mod.id)],
  );
  for (const mod of ACADEMY_MODULES) {
    const script = scripts.find((entry) => entry.id === mod.id)!;
    const text = spoken(script);
    for (const lesson of mod.lessons) {
      assert.ok(text.includes(lesson.title), `${mod.id}: Lektion „${lesson.title}“ fehlt`);
      assert.ok(text.includes(lesson.text), `${mod.id}: Einleitung zu „${lesson.title}“ fehlt`);
      for (const rule of lesson.rules) assert.ok(text.includes(rule.text), `${mod.id}: Regel fehlt: ${rule.text}`);
      if (lesson.example) {
        for (const part of [lesson.example.situation, lesson.example.wrong, lesson.example.right]) {
          assert.ok(text.includes(part), `${mod.id}: Beispiel fehlt: ${part}`);
        }
      }
    }
    for (const point of mod.keyPoints) assert.ok(text.includes(point), `${mod.id}: Kurzfassung fehlt: ${point}`);
    // Kapitel: Einstieg, jede Lektion, das Wichtigste.
    assert.deepEqual(
      script.scenes.filter((scene) => scene.chapter).map((scene) => scene.chapter),
      ["Einstieg", ...mod.lessons.map((lesson) => lesson.title), "Das Wichtigste"],
    );
  }
  const red = spoken(scripts.find((script) => script.id === RED_LINES_VIDEO)!);
  for (const line of RED_LINES) assert.ok(red.includes(line.text), `rote Linie fehlt: ${line.text}`);
});

test("Drehbuch: der Fingerabdruck folgt dem Inhalt", () => {
  const [first] = scripts;
  const changed: VideoScript = { ...first, scenes: [{ ...first.scenes[0], beats: ["Anders."] }, ...first.scenes.slice(1)] };
  assert.notEqual(scriptHash(changed), scriptHash(first));
  assert.equal(scriptHash(buildVideoScripts()[0]), scriptHash(first));
});

test("Videos: zu jedem Modul und den roten Linien ein aktuelles Video mit Untertiteln", () => {
  for (const script of scripts) {
    const video = academyVideo(script.id);
    assert.ok(video, `Video fehlt: ${script.id} – npm run akademie:videos -- ${script.id}`);
    assert.equal(
      video.script,
      scriptHash(script),
      `Video veraltet: ${script.id} – Inhalt geändert, neu rendern mit npm run akademie:videos -- ${script.id}`,
    );
    for (const file of [video.src, video.poster, video.captions]) {
      assert.ok(existsSync(path.join("public", file)), `Datei fehlt: public${file}`);
    }
    const vtt = readFileSync(path.join("public", video.captions), "utf8");
    assert.ok(vtt.startsWith("WEBVTT"), video.captions);
    assert.ok(video.duration > 30 && video.duration < 900, `${script.id}: ${video.duration} s`);
    assert.equal(video.chapters[0]?.t, 0);
    for (let i = 1; i < video.chapters.length; i++) assert.ok(video.chapters[i].t > video.chapters[i - 1].t);
    assert.deepEqual(
      video.chapters.map((chapter) => chapter.title),
      script.scenes.filter((scene) => scene.chapter).map((scene) => scene.chapter),
    );
  }
  assert.equal(academyVideo("gibt-es-nicht"), null);
  assert.equal(videoLength(193.2), "3:13");
  assert.equal(videoLength(59.6), "1:00");
});

test("Sprache: Abkürzungen, Zahlen und Fremdwörter so, wie man sie sagt", () => {
  assert.equal(speakable("Mo–Sa von 10–20 Uhr"), "Montag bis Samstag von 10 bis 20 Uhr");
  assert.equal(speakable("etwa 1.180 € im Jahr, 80 %"), "etwa 1180 Euro im Jahr, 80 Prozent");
  assert.equal(speakable("Im Notfall: 112 oder 110."), "Im Notfall: eins eins zwei oder eins eins null.");
  assert.equal(speakable("Auftreten & erster Eindruck"), "Auftreten und erster Eindruck");
  assert.equal(speakable("„Nein danke“ – und weiter."), "Nein danke, und weiter.");
  // Lautschrift: das Satzzeichen danach gehoert in die Klammer, sonst fehlt die Pause.
  assert.equal(speakable("von Carlsson Sales – hier"), "von [[kˈaɾlsɔn sˈeɪls,]] hier");
  assert.equal(speakable("per WhatsApp?"), "per [[vˈɔtsɛp?]]");
  assert.equal(speakable("in der App, auf dem Tablet"), "in der Äpp, auf dem Täblet");
  assert.equal(speakable("z. B. PINs und TANs"), "zum Beispiel Pins und Tans");
  assert.equal(
    speakable("Arbeitspreis (Cent pro kWh) nennen – nicht nur den Abschlag."),
    "Arbeitspreis, Cent pro Kilowattstunde, nennen, nicht nur den Abschlag.",
  );
  assert.equal(speakable("nie kleinreden („nur Formsache“) und"), "nie kleinreden, nur Formsache, und");
});

test("Sprache: Sätze und Untertitel", () => {
  assert.deepEqual(sentences("Erster Satz. Zweiter Satz! Dritter?"), ["Erster Satz.", "Zweiter Satz!", "Dritter?"]);
  // "z. B." beendet keinen Satz.
  assert.deepEqual(sentences("Etwa z. B. Name und Anschrift. Mehr nicht."), ["Etwa z. B. Name und Anschrift.", "Mehr nicht."]);
  // Ein Zitat ueber zwei Saetze: jeder Untertitel bekommt seine Anfuehrungszeichen.
  assert.deepEqual(sentences("So geht’s: „Hier ist mein Ausweis. Ich bin von nebenan.“"), [
    "So geht’s: „Hier ist mein Ausweis.“",
    "„Ich bin von nebenan.“",
  ]);
  const long = "Ein gepflegtes Auftreten und eine klare Vorstellung schaffen Vertrauen – und schützen dich und die Firma vor Missverständnissen.";
  const chunks = captionChunks(long);
  assert.equal(chunks.join(" "), long);
  assert.ok(chunks.every((chunk) => chunk.length <= 84));
  assert.ok(chunks[1].startsWith("– und"), chunks.join(" | "));
  assert.deepEqual(captionChunks("Kurz."), ["Kurz."]);
});

# Akademie-Videos

Sieben Erklärvideos für die Akademie (`/akademie`): die **roten Linien** und je eins pro
**Modul**. Wer sie schaut, hat alles Wichtige. Jedes Video enthält jede Regel, jedes Beispiel
und das Wichtigste in Kürze. Ein Test prüft das bei jedem `npm test`.
Format: 1920 × 1080, 30 fps, deutsche Sprecherstimme, Untertitel (WebVTT, im Player
standardmäßig an) und Kapitelmarken. Fertig liegen sie unter `public/akademie/`; Länge,
Kapitel und Fingerabdruck stehen in `src/lib/academy/videos.json`.

Alles entsteht aus den Inhalten in `src/lib/academy/content.ts`. Kein Schnittprogramm,
keine Fremdbilder, keine Aufnahme:

| Datei | Inhalt |
| --- | --- |
| `script.ts` | Drehbuch: aus den Inhalten werden Szenen (Titel, Lektion, Regel, Beispiel, In Kürze, Abspann) mit Sprechtext |
| `speech.ts` | Aussprache: Abkürzungen und Zeichen ausgeschrieben, Fremdwörter in Lautschrift, Sätze und Untertitel |
| `tts.py` | Sprachausgabe mit [Piper](https://github.com/OHF-Voice/piper1-gpl), offline, je Satz eine Aufnahme (zwischengespeichert) |
| `stage.html`, `stage.css`, `stage.js` | Die Bühne im Stil des Einführungsvideos: `V.seek(t)` stellt jedes Bild als reine Funktion der Zeit |
| `render.ts` | Ablauf: Sprache → Zeitleiste → Tonspur → Bilder (Chromium) → ffmpeg → Video, Vorschaubild, Untertitel, Manifest |

## Einrichten (einmal)

Voraussetzungen: Node 20+, ffmpeg, Python 3, Playwright mit Chromium und die Schriften
**Inter** und **Inter Display** (rsms.me/inter).

```bash
cd video/akademie
python3 -m venv .venv
.venv/bin/pip install piper-tts
mkdir -p .cache/voices
curl -L -o .cache/voices/de_DE-thorsten-high.onnx \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx
curl -L -o .cache/voices/de_DE-thorsten-high.onnx.json \
  https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/high/de_DE-thorsten-high.onnx.json
```

`.venv/`, `.cache/` und `out/` gehören nicht ins Repository.

## Rendern

Aus dem Hauptordner des Projekts:

```bash
npm run akademie:videos                        # alle sieben (rund 10 Minuten)
npm run akademie:videos -- vertrag grenzen     # nur diese
npm run akademie:videos -- vertrag --stills    # je Szene ein Standbild -> video/akademie/out/vertrag/stills
```

Danach `public/akademie/*` und `src/lib/academy/videos.json` mit einchecken.

**Inhalt geändert?** Dann meldet `npm test` „Video veraltet“ mit dem Befehl, der es neu
rendert. Der Fingerabdruck umfasst Drehbuch, Aussprache und Stimme. Ändert sich nur das
Aussehen (`stage.*`), `RENDER_VERSION` in `script.ts` hochzählen.

## Wie es klingt und aussieht

- **Takt:** Die Sprache bestimmt die Zeitleiste. Jeder Satz wird einzeln aufgenommen. Die
  Pausen zwischen Sätzen, Absätzen und Szenen stehen oben in `render.ts`. Bild und Wort
  laufen dadurch immer zusammen.
- **Aussprache:** Was die Stimme falsch sagt, kommt in `LEXICON` in `speech.ts`. Das geht
  entweder als andere Schreibweise („Flaier“) oder als Lautschrift in doppelten eckigen
  Klammern (`[[vˈɔtsɛp]]` für „WhatsApp“). Die Laute zeigt Piper so an:
  `.venv/bin/python -c "from piper import PiperVoice; v = PiperVoice.load('.cache/voices/de_DE-thorsten-high.onnx'); print(v.phonemize('WhatsApp'))"`
- **Tempo:** `VOICE.lengthScale` in `script.ts` (1,08 = etwas langsamer als normal).
- **Lautstärke:** auf −16 LUFS normiert, wie für Handys üblich. Am Anfang klingt ein leiser Gong.
- **Schnell gerendert:** Steht das Bild still, nimmt der Renderer das letzte Bild noch einmal.
  Gezeichnet werden nur die Übergänge, das sind rund ein Sechstel aller Bilder.

## Stimme und Lizenz

Die Stimme ist **Thorsten** (`de_DE-thorsten-high`) aus den Piper-Stimmen. Die Sprachdaten
von Thorsten Müller stehen unter **CC0**. Laut Modellkarte ist das Modell von einem
englischen Basismodell (lessac) aus weitertrainiert. Vor einem kommerziellen Einsatz sollte
man die Lizenzlage kurz prüfen. Eine andere Stimme ist eine Zeile (`VOICE.model`). Eine echte
Sprecheraufnahme ginge auch: Je Satz liegt eine WAV-Datei in `.cache/tts/`, die sich ersetzen
lässt.

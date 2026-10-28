# Einführungsvideo

Ein Motion-Graphics-Video (1920 × 1080, 60 fps, rund 2:40 mit Ton), das alle Bereiche
der App zeigt: Gebiete, Klinken, Termine, Abschluss, Visitenkarte, Preise, Übersicht,
Team, Kunden und die Einstellungen. Fertig liegt es unter `public/einfuehrung.mp4`; in
der App steht es unter **Profil › Werkzeuge › Einführung** (`/profil/einfuehrung`) mit
Kapitelmarken.

Alles ist Code – kein Schnittprogramm, keine Fremdbilder, keine Musik-Lizenz:

| Datei | Inhalt |
| --- | --- |
| `index.html` | Die Bühne; `?t=12.5` zeigt ein Standbild, `?play` spielt im Browser ab |
| `js/engine.js` | Zeitleiste und Bewegung: `V.seek(t)` stellt jedes Element so, wie es in Sekunde *t* aussieht – reine Funktion der Zeit, kein Zufall ohne Saat |
| `js/timeline.js` | Wann welches Kapitel beginnt (120 BPM, ein Takt = 2 s) |
| `js/icons.js`, `js/ui.js`, `js/screens.js` | Zeichen, Logo und Bildschirme der App – dieselben Pfade, Farben und Texte wie in `src/` |
| `js/scenes/*.js` | Die Szenen, je Kapitel eine Datei |
| `js/stage.js`, `js/transitions.js` | Licht im Hintergrund, Partikel, Blitze, Kapitelübergänge |
| `audio/soundtrack.py` | Musik und Klangeffekte, synthetisch aus `audio/cues.json` |
| `render.mjs` | Rendert Bild für Bild mit Chromium und setzt mit ffmpeg zusammen |

## Neu rendern

Voraussetzungen: Node 20+, ffmpeg, Python 3 mit numpy und scipy, Playwright mit
Chromium (`npx playwright install chromium`) und die Schrift **Inter** samt
**Inter Display** (rsms.me/inter).

```bash
cd video/einfuehrung
node render.mjs cues                 # Ton-Hinweise aus den Szenen -> audio/cues.json
python3 audio/soundtrack.py          # Musik + Effekte -> audio/soundtrack.wav
node render.mjs video                # Video -> out/einfuehrung.mp4 (rund 15 Minuten)
```

Für die Arbeit an einer Szene:

```bash
node render.mjs stills 34.5 88.9     # Standbilder -> out/stills/
node render.mjs sheet 0 161 1.5      # Kontaktbogen: alle 1,5 s ein Bild
node render.mjs video 79 97          # nur ein Abschnitt
```

`--workers` (Standard 4) verteilt die Bilder auf mehrere Chromium-Seiten, `--crf`
steuert die Qualität (Standard 20). `--blur n` mischt n Zwischenbilder zu
Bewegungsunschärfe; mit nur zwei entstehen bei schnellen Bewegungen Doppelkonturen in
der Schrift, darum ist das Video ohne gerendert – gestochen scharf in 60 fps.

Fürs Web wird die fertige Datei verkleinert und mit Vorschaubild abgelegt:

```bash
ffmpeg -i out/einfuehrung.mp4 -c:v libx264 -preset slow -crf 26 -tune animation \
  -c:a aac -b:a 160k -movflags +faststart ../../public/einfuehrung.mp4
ffmpeg -ss 8.8 -i out/einfuehrung.mp4 -frames:v 1 -vf scale=1280:-1 -q:v 4 ../../public/einfuehrung.jpg
```

Ändert sich der Zeitplan in `js/timeline.js`, die Kapitelmarken in
`src/app/(app)/profil/einfuehrung/IntroVideo.tsx` mitziehen.

## Action-Schnitt

Eine zweite, schnellere Fassung (rund 1:57) aus denselben Szenen – nicht in der
App eingebunden. `action.html` lädt zusätzlich `js/action.js`:

- **Tempo:** alles läuft 1,25-mal so schnell, die Musik mit 150 statt 120 BPM.
  Ruhige Stellen laufen zusätzlich gerafft durch. Jede Raffung spart ganze
  Schläge, darum bleiben Schnitte und Effekte im Takt (`RAMPS` in `js/action.js`).
- **Kamera:** Alle Szenen hängen in einer Kamera-Ebene. Sie punscht auf jeden
  Takt und jeden Treffer, ruckt bei Einschlägen (Logo, Abschluss, Level) und
  reißt an jedem Kapitelschnitt durch. Der Hintergrund bewegt sich nur halb so
  stark mit.
- **Musik:** derselbe Song mit durchgehend vollem Beat und einem Fill vor jedem
  Kapitel.

```bash
node render.mjs cues --cut action        # -> audio/cues-action.json
python3 audio/soundtrack.py action       # -> audio/soundtrack-action.wav
node render.mjs video --cut action       # -> out/einfuehrung-action.mp4
```

# Carlsson Sales · Gestaltungssystem

Dieses Dokument ist die Quelle der Wahrheit für das Aussehen der App. Tokens
stehen in `src/app/brand.css` (Marke: Akzent, Signale, Datenfarben) und
`src/app/globals.css` (Neutrales, Material, Schrift, Radien, Bausteine). Was
dort nicht steht, gibt es nicht – Tailwinds eigene Farben, Schriftgrößen,
Radien und Schatten sind per `@theme { --color-*: initial; … }` gelöscht.

Leitbild: iOS 26 mit eigener Handschrift („Tiefgrün“). **Navigation und
Bedienelemente aus Glas**, **Inhalt auf ruhigen, festen Flächen mit feiner
Kante und weichem Schatten**. Neutrale mit einem Hauch Grün statt Systemgrau,
genau **ein Akzent** (Energie-Grün), die **Hauptaktion kräftig** (tiefgrüner
Verlauf, weiße Schrift). Kompakt, ohne Erklärtexte, eine Hauptaktion je
Bildschirm.

---

## 1. Farbe

### Neutral (globals.css)

| Token | Hell | Dunkel | Rolle |
| --- | --- | --- | --- |
| `--bg` | `#f2f4f3` | `#000000` | Seitengrund (gruppiert) |
| `--surface` | `#ffffff` | `#141917` | Inhaltsfläche: Listen, Kennzahlen, Beiträge |
| `--surface-2` | `#f2f4f3` | `#1f2522` | Fläche auf Fläche (selten) |
| `--map-ground` | `#e3e7e5` | `#1f2522` | Kartengrund, solange Kacheln laden (hebt sich vom Seitengrund ab) |
| `--fill` / `--fill-strong` | `#465a50` 10 % / 17 % | `#788c82` 20 % / 30 % | Felder, Segmentleisten, Ringe-Spur |
| `--zebra` | `#465a50` 5 % | `#788c82` 8 % | Jede zweite Zeile der Klinken-Tabelle |
| `--ink` | `#0b1510` | `#f3f6f4` | Text |
| `--ink-2` | `#36413b` | `#d0d7d3` | Beschriftung von Kennzahlen |
| `--muted` | `#5f6964` | `#a3aca7` | Untertitel, Zeitangaben |
| `--separator` | `#283c32` 13 % | `#54645c` 50 % | Haarlinien (eingerückt bis zur Schrift) |
| `--elev-card` | Kante 4,5 % + weicher Schatten | Lichtkante innen | Kante und Schatten jeder Inhaltsfläche (`.surface`, `.list`, `.tile-grid`, `StatGrid`) |

Alle Neutralen sind leicht ins Grün gezogen, damit Grund, Linien und Schrift zur
Marke gehören. Der Seitengrund im Dunkeln bleibt Schwarz (OLED).

### Marke (brand.css)

| Token | Hell | Dunkel | Rolle |
| --- | --- | --- | --- |
| `--accent` | `#15904a` | `#30d158` | Füllung: Ringe, Fortschritt, Schalter, Abschluss-Zeichen |
| `--accent-ink` | `#0c6a34` | `#34d66b` | Grüne **Schrift** und kleine Zeichen |
| `--accent-tint` | Grün 16 % | Grün 20 % | Getönte Zweitaktion (`icon-btn-accent`), Auswahl in Listen |
| `--accent-soft` | Akzent 12 % | Akzent 18 % | Leise Auswahl: aktiver Reiter, Seitenleiste |
| `--primary` (`-top` → `-bottom`) | `#16884a` → `#0d6634` | `#16884a` → `#0e6b37` | **Hauptaktion**: `.btn-primary`, `.tray-btn-primary`, gewählter `.chip` |
| `--on-primary` | `#ffffff` | `#ffffff` | Schrift und Zeichen auf `--primary` |
| `--elev-primary` | Lichtkante + grüner Schatten | Lichtkante + Schatten | Tiefe der Hauptaktion |
| `--brand-deep` → `--brand-deeper` | `#0f4d2a` → `#0a361e` | `#0e4426` → `#062414` | Markenfläche (Kopfkarte der Übersicht) |
| `--brand-glow`, `--backdrop-glow(-2)` | Grün 35 % / 20 % / 8 % | Grün 35 % / 16 % / 6 % | Licht auf der Markenfläche bzw. hinter Anmelden/Einladung |
| `--on-accent` | `#ffffff` | `#062611` | Zeichen auf voller Akzentfläche – **nur Zeichen, keine Schrift** |
| `--danger` / `--danger-tint` | `#c9182a` | `#ff6b6b` | Fehler, Löschen – nur klein, immer mit Wort oder Zeichen |
| `--warn` / `--warn-tint` | `#a35a00` | `#ffb547` | Warnung (veraltet, prüfen) |
| `--chart-doors` / `--chart-met` / `--chart-sales` | grüngrau / dunkel / Akzent | grüngrau / hell / Akzent | Diagramme, Fitness-Ringe |
| `--chart-doors-soft` | `#c9d2cd` | `#36403b` | Tür-Säule im Verlauf – nur Spur für die Abschlüsse darin, Werte je Tag zusätzlich als Text |
| `--plot-1…4` | unverändert | dunkel angepasst | Teilgebiete (CVD-geprüfter Satz) |
| `--price-0…4`, `--price-none` | grau → tiefgrün | dunkel → hellgrün | Preisstufen der Energiekarte (sequenziell, Helligkeit steigt) |
| `--tone-{blue,indigo,purple,magenta,teal,slate,brown}-{hi,lo}` | Verlauf hell → satt | gleich | Symbolkacheln (`ReasonTile`, `ToneTile`) und Kürzel-Avatare |

**Regeln**

- Die **Hauptaktion ist kräftig**: tiefgrüner Verlauf `--primary` mit weißer
  Schrift und Lichtkante (`.btn-primary`, `.tray-btn-primary`), eine je
  Bildschirm. Gewählte Chips tragen denselben Verlauf, flacher. Zweitaktionen
  sind grau (`.btn-secondary`) oder getönt (`icon-btn-accent`).
- Der **grüne Kreis mit Haken** (`.glyph-result`) bedeutet ausschließlich
  **Abschluss** – im Toast, in Kontakten, im Feed. Auf einem gewählten Chip wird
  er weiß.
- Rot und Bernstein sind Signale, nie Dekoration, nie allein (immer Wort/Zeichen).
- **Keine Emojis.** Ablehnungsgründe tragen ein Zeichen aus `ReasonIcon.tsx`
  (Schlüssel in `src/lib/reason-icons.ts`). Wo Gründe gewählt, gepflegt oder
  ausgewertet werden, steht es auf seiner Kachel im Symbolton; in Verläufen
  (`OutcomeGlyph`) neutral im `.glyph`, damit der grüne Abschluss das einzige
  Farbsignal der Liste bleibt.
- Symboltöne haben kein Grün, Rot oder Bernstein und sind keine Bedienfarben.
  Weißes Zeichen auf dem hellen Ende des Verlaufs ≥ 3 : 1. Sie färben
  Ablehnungsgründe, die Einträge der Menüs (Profil: `ToneTile`) und Kürzel ohne
  Profilbild – jede Person hat über `personTone(name)` überall denselben Ton.
- Medaillen der Abzeichen (`levels/Medal.tsx`) sind Bildfarben wie das Logo:
  Bronze, Silber, Gold, Platin (Lavendel), Diamant (Eisblau); ab Gold mit
  Perlkranz. Das Zeichen sitzt eingraviert in der dunkelsten Metallfarbe.
- Schrift auf voller `--accent`-Fläche ist verboten (hell nur 4,1 : 1) – dafür
  `--primary` (≥ 4,5 : 1 schon am hellen Ende) oder die Tönung.

### Gemessene Kontraste (WCAG 2.x)

| Paar | Vordergrund | Hintergrund | Kontrast |
| --- | --- | --- | --- |
| `--ink` (hell) | `#0b1510` | Fläche `#ffffff` | 18.60 |
| `--ink-2` (hell) | `#36413b` | Fläche `#ffffff` | 10.63 |
| `--muted` (hell) | `#5f6964` | Fläche `#ffffff` | 5.69 |
| `--muted` (hell) | `#5f6964` | Grund `#f2f4f3` | 5.15 |
| `--muted` auf `--fill` (hell) | `#5f6964` | Feld auf Weiß | 4.93 |
| `--accent-ink` (hell) | `#0c6a34` | Fläche `#ffffff` | 6.72 |
| `--accent-ink` (hell) | `#0c6a34` | Grund `#f2f4f3` | 6.08 |
| `--accent-ink` auf Tönung (hell) | `#0c6a34` | Tönung auf Weiß | 5.78 |
| `--on-primary` (hell + dunkel) | `#ffffff` | `--primary-top` `#16884a` | 4.51 |
| `--on-primary` (hell) | `#ffffff` | `--primary-bottom` `#0d6634` | 7.08 |
| `--on-primary` (dunkel) | `#ffffff` | `--primary-bottom` `#0e6b37` | 6.61 |
| Schrift auf Markenfläche | `#ffffff` | `--brand-deep` `#0f4d2a` | 9.93 |
| leise Schrift auf Markenfläche | Weiß 80 % | `--brand-deep` | 6.97 |
| `--accent` Bedienelement (hell) | `#15904a` | Fläche `#ffffff` | 4.10 (≥ 3 : 1 Grafik) |
| `--chart-doors` (hell) | `#8a978f` | Fläche `#ffffff` | 3.04 (≥ 3 : 1 Grafik) |
| `--danger` (hell) | `#c9182a` | Fläche `#ffffff` | 5.76 |
| `--warn` (hell) | `#a35a00` | Grund `#f2f4f3` | 4.73 |
| `--ink` (dunkel) | `#f3f6f4` | Fläche `#141917` | 16.34 |
| `--ink-2` (dunkel) | `#d0d7d3` | Fläche `#141917` | 12.14 |
| `--muted` (dunkel) | `#a3aca7` | Fläche `#141917` | 7.63 |
| `--muted` (dunkel) | `#a3aca7` | Fläche 2 `#1f2522` | 6.70 |
| `--accent-ink` (dunkel) | `#34d66b` | Fläche `#141917` | 9.29 |
| `--on-accent` Zeichen (dunkel) | `#062611` | `--accent` | 8.03 |
| `--danger` (dunkel) | `#ff6b6b` | Fläche `#141917` | 6.41 |
| `--warn` (dunkel) | `#ffb547` | Fläche `#141917` | 10.12 |

Alle Textpaare ≥ 4,5 : 1, alle Bedien-/Grafikpaare ≥ 3 : 1 – bis auf die
Tür-Säule im Verlauf (`--chart-doors-soft`), die nur Spur ist; ihre Werte stehen
je Tag als Text (`title`, für Bildschirmleser `sr-only`). Bei
`prefers-contrast: more` wird Glas fest, Flächen bekommen eine volle Kante,
Haarlinien und `--muted` werden dunkler.

### Akzentfarben (themes.css)

Unter Einstellungen › Darstellung wählt jeder eine von zehn Akzentfarben – Grün
(Standard), Petrol, Blau, Indigo, Violett, Pink, Rot, Orange, Gold, Graphit. Jede soll
aussehen, als wäre die App in ihr erschienen, darum wechseln **alle Rollen** mit:
Akzent, Akzentschrift, Hauptaktion, Markenfläche samt Licht, Hintergrund der Anmeldung,
markenfarbene Schatten, Logo (`--logo-*`), Diagramme, Preisstufen und der Hauch Farbe
in den Neutralen (Grund, Linien, Glas, Schatten).

- **Ein Token, zwei Quellen:** jedes themenfähige Token liest zuerst sein
  `--t-`Gegenstück – hell `--t-name`, dunkel `--t-name-d` –, dahinter steht der grüne
  Wert: `--accent: var(--t-accent, #15904a)`. Ein Thema setzt nur `--t-`Werte in
  **einer** Regel (`:root[data-accent="rot"]`) und konkurriert so nie mit Hell/Dunkel,
  Energiesparmodus oder Kontrast. Werte mit eigener Deckkraft stehen als Tripel da
  (`rgb(var(--t-tint, 70 90 80) / 0.1)`).
- **Abgeleitet, nicht gemalt:** `src/lib/theme-palette.ts` nimmt jedes grüne Token in
  OKLCH, behält die Helligkeit, setzt Ton und Buntheit der neuen Farbe (tiefe Stufen mit
  eigenem Ton: Gold wird zur Bronze, Blau zum Marineblau) und begrenzt auf den
  Bildschirmumfang. Danach wird jede Rolle auf die Regeln oben nachgezogen.
  `npm run themes` schreibt `src/app/themes.css`.
- **Gleiche Regeln wie das Grün** (Test `scripts/tests/themes.test.ts`, je Farbe hell
  und dunkel): Akzent ≥ 3 : 1 auf Weiß und Grund, Akzentschrift ≥ 4,5 : 1 auch auf der
  Tönung, weiße Schrift auf der Hauptaktion ≥ 4,5 : 1, auf der Markenfläche ≥ 9 : 1,
  Zeichen auf dem Akzent (dunkel) ≥ 4,5 : 1, Preisstufen stetig dunkler.
- **Flächen tönen aus** (`data-tint="off"`): Neutrale in reinem Grau, die Marke bleibt.
- Signale (`--danger`, `--warn`), Teilgebiete (`--plot-*`), Symboltöne und Medaillen
  wechseln **nicht** – sie bedeuten etwas, unabhängig von der Marke. Bei Rot, Orange und
  Gold gilt umso mehr: Signale nie allein, immer mit Wort oder Zeichen.
- Das App-Symbol auf dem Home-Bildschirm (`public/icon*.png`) bleibt grün.

### Einstellungen am `<html>`

Was man sieht, setzt `PREFS_SCRIPT` (`src/lib/preferences.ts`) vor dem ersten Bild als
Merkmal: `data-accent`, `data-tint="off"`, `data-theme` (Hell/Dunkel erzwungen, samt
eigener Farbe der Statusleiste), `data-text="l|xl"` (Schriftgröße 106 % bzw. 112 % –
alles in rem wächst mit), `data-glass="off"`, `data-motion="off"`, `data-contrast="more"`
(wie `prefers-contrast: more`), `data-map-dark="off"` und `data-hide` mit je einem Wort
pro ausgeblendetem Bereich (`area-team`, `start-radar`, `tour-provider` …). Die Seite
markiert, was sich ausblenden lässt (`data-area`, `data-start`, `data-tour`); die Regeln
dazu stehen gesammelt in `globals.css` – der Server rendert alles, nichts blitzt auf.

---

## 2. Material „Liquid Glass“

`.glass` / `.glass-strong` und alle Glas-Bausteine (`.tabbar`, `.sidebar`,
`.toolbar[data-stuck]`, `.seg-glass`, `.sheet`, `.menu`, `.toast`, `.map-ctrl`,
`.map-chip`, `.tray`) teilen dieselben Tokens:

- `--glass-bg` (74 % deckend) bzw. `--glass-strong` (86 %), darüber `--glass-sheen`
  (Glanzverlauf von oben), Rand `--glass-edge` (0,5 px Lichtkante innen),
  Schatten `--elev-glass` / `--elev-float`.
- Unschärfe `--glass-blur: blur(22px) saturate(180%)`.
- **Rückfälle:** ohne `backdrop-filter`, bei `prefers-reduced-transparency`, bei
  `prefers-contrast: more`, im Super-Energiesparmodus (`data-power="save"`) und mit
  „Glas“ bzw. „Kontrast erhöhen“ aus den Einstellungen (`data-glass="off"`,
  `data-contrast="more"`) wird Glas zur festen Fläche `--glass-solid`.
- Glas nur für Dinge, die **über** Inhalt schweben. Inhalt selbst liegt auf
  `--surface` mit `--elev-card` (feine Kante, weicher Schatten) – immer über die
  Klasse `.surface` (bzw. `.list`, `.tile-grid`), nie `rounded-xl bg-surface`
  von Hand. Nie Glas auf Glas, nie Karte in Karte.

---

## 3. Schrift

Systemschrift (`-apple-system` → SF Pro; Rückfall Segoe UI/Roboto/Inter).
Große Zahlen (`.kpi`) in SF Pro Rounded, leicht enger gesetzt. **Alle Zahlen
tabellarisch** (`html` setzt `font-variant-numeric: tabular-nums`). Titel ab
`title-3` laufen etwas enger als die Systemvorgabe (−0,6 % bis −3,5 %) – das
lässt sie gesetzt statt voreingestellt wirken.

| Klasse | Größe / Zeile | Gewicht | Verwendung |
| --- | --- | --- | --- |
| `text-display` | 48 / 52 | 700 | Große Einzelzahl |
| `text-large-title` | 34 / 41 | 700 | Seitentitel, Haupt-Kennzahl |
| `text-title-1` | 28 / 34 | 700 | Kennzahlen im Raster |
| `text-title-2` | 22 / 28 | 700 | Zwischentitel |
| `text-title-3` | 20 / 25 | 600 | Abschnittstitel, Blatt-Titel, Hausnummer in der Klinken-Liste (700) |
| `text-headline` | 17 / 22 | 600 | Hervorgehobene Zeile |
| `text-body` | 17 / 22 | 400 | Fließtext, Zeilentitel, Eingaben |
| `text-callout` | 16 / 21 | 400 | – |
| `text-subhead` | 15 / 20 | 400 | Knöpfe, Werte rechts |
| `text-footnote` | 13 / 18 | 400 | Untertitel, Beschriftungen |
| `text-caption` | 12 / 16 | 400 | Zeitangaben |
| `text-caption-2` | 11 / 13 | 600 | Reiterbeschriftung, Legende |

Eingabefelder haben immer `text-body` (17 px) – unter 16 px zoomt iOS.

---

## 4. Raster, Radien, Abstände

- **4-pt-Raster.** Abstände nur aus Tailwinds 4er-Schritten (`1` = 4 px …).
- **iPad ab 744 pt** (`md`, so schmal ist das iPad mini hochkant): Seitenleiste
  statt Reiterleiste, Blätter als mittiger Dialog. Dieselbe Grenze steht in
  `@theme` (`--breakpoint-md`), in den Medienabfragen und in `Sheet.tsx`.
- Seitenrand `--gutter`: 16 / 24 / 32 px (Handy / Tablet / Rechner).
- Seitenbreiten: `.page` 1200 px, `.page-medium` 960 px, `.page-narrow` 680 px.
- **Radien konzentrisch** (innen = außen − Abstand): `xs 4` · `sm 8` · `md 12`
  · `lg 16` · `xl 20` · `2xl 28` · `full`. Listen und Flächen `xl`, Blätter
  `2xl`, Felder `md`, Knöpfe und Plaketten `full`.
- Tippflächen ≥ 44 pt (`.btn` 44, `.btn-sm` 36 mit unsichtbar erweiterter
  Fläche, `.btn-lg` 56, Ergebnisknöpfe beim Klinken 60, auf dem iPad 76,
  Zeilen der Klinken-Liste 60, auf dem iPad 64).
- Sichere Bereiche: Reiterleiste, Blätter, Werkzeugleiste und Ergebnisleiste
  berücksichtigen `env(safe-area-inset-*)`.

---

## 5. Bewegung

| Token | Wert | Verwendung |
| --- | --- | --- |
| `--dur-1` | 150 ms | Druck, Hover |
| `--dur-2` | 250 ms | Segment, Toast |
| `--dur-3` | 350 ms | Blatt, Reiterleiste |
| `--ease-spring` | `cubic-bezier(.32,.72,0,1)` | Blätter, Fortschritt |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Ein- und Ausblenden |
| `--ease-pop` | `cubic-bezier(.34,1.4,.64,1)` | Haken beim Abschluss |

- Gedrückt: `scale(.97)` (Knöpfe), `.cell-tap` tönt.
- Blätter lassen sich am Griff nach unten wegziehen; die Reiterleiste wird beim
  Scrollen kleiner; Rückmeldungen sind Toasts (kurz, nicht blockierend, mit
  „Rückgängig“ statt Rückfragen).
- `prefers-reduced-motion`, Super-Energiesparmodus und „Animationen“ aus den
  Einstellungen (`data-motion="off"`): alle Animationen ≈ 0 ms.
- **Laden:** Jede Seite hat ihr `loading.tsx` – nur dann lädt Next.js sie vorab, und
  das Skelett steht beim Tippen sofort da. Was feststeht (Titel, Zurück,
  Segmentleiste, Abschnittstitel), steht echt da; grau ist nur, was vom Server kommt.
  Der Lichtstreif läuft über `transform` (ruckelt nicht, während die Seite aufgebaut
  wird); das Grau blendet erst nach 80 ms ein, damit bei schneller Antwort nichts
  aufblitzt. Hat ein Bereich Unterseiten (`team`, `gebiete`, `profil`), liegt seine
  Startseite in einer Route-Gruppe (`(feed)`, `(liste)`, `(hub)`) – sonst sähe man auf
  dem Weg zur Unterseite erst das Skelett der Startseite.
- Nichts läuft endlos, solange es nicht lädt: der Standort-Punkt pulsiert dreimal je
  neuer Position, dann ruht er (eine Dauerschleife hält die Grafik den ganzen Tag wach).
- **Super-Energiesparmodus** (`data-power="save"` am `<html>`, Schalter im Profil):
  setzt zugleich `data-theme="dark"` und eine schwarze Statusleiste. Schon vor React
  gesetzt (`POWER_SCRIPT` in `src/lib/power.ts`), damit nichts hell aufblitzt.

---

## 6. Bausteine

Alle in `src/components/`. Stil per Klassen aus `globals.css` (`@layer components`).

| Baustein | Datei | Zweck |
| --- | --- | --- |
| `PageHeader` | `PageHeader.tsx` | Werkzeugleiste (Zurück, Aktionen) + großer Titel; wird beim Scrollen zu Glas mit kleinem Titel. `back.mobileOnly` für Seiten, die ab dem iPad selbst in der Seitenleiste stehen |
| `Cell` | `ui.tsx` | Zeile einer gruppierten Liste (`ul.list`, `ul.list list-icons`) – Link, Knopf oder statisch; `wrap` lässt den Untertitel zweizeilig umbrechen statt ihn abzuschneiden |
| `ListLabel`, `SectionHeader` | `ui.tsx` | Gruppenüberschrift (Versalien, klein) bzw. Abschnittstitel mit „Alle“ |
| `HeroStats`, `SkeletonHero` | `HeroStats.tsx` | Kopfkarte der Übersicht auf der Markenfläche: Abschlüsse groß mit Quote, darunter Türen, Gespräche, Termine; der Ring der Marke als Wasserzeichen |
| `StatGrid` | `ui.tsx` | Kennzahlen auf einer Fläche, Haarlinien dazwischen |
| `ProgressRing`, `ProgressBar` | `ui.tsx` | Fortschritt im Akzent |
| `Pill`, `StatusBadge` | `ui.tsx` | Plaketten (neutral, accent, danger, warn, ink) |
| `Avatar` | `ui.tsx` | Bild oder Kürzel; das Kürzel im festen Symbolton der Person (`personTone`) |
| `ToneTile` | `ui.tsx` | Zeichen auf einer Kachel im Symbolton – Einträge der Menüs wie in den iOS-Einstellungen |
| `EmptyState`, `InlineError`, `Notice` | `ui.tsx` | Leer, Fehler, ruhiger Hinweis |
| `Skeleton*` | `ui.tsx` | Ladeplatzhalter: `SkeletonHeader` (echter `PageHeader`, fester Titel steht schon da), `SkeletonText` (Balken in der Zeile seiner Schrift), `SkeletonList`, `SkeletonStats`, `SkeletonPost`, `SkeletonChips`, `SkeletonSegmented` |
| `OutcomeGlyph` | `ui.tsx` | Ergebnis eines Besuchs als Zeichen (bei Ablehnung das Zeichen des Grundes, neutral) |
| `DoorTable`, `DoorFilter` | `tour/DoorTable.tsx` | Klinken: Türen als Tabelle (Nummer, Stand, Zeichen; Zebra, grüner Balken = Abschluss) und die Leiste darüber („Nr. filtern“, In meiner Nähe, Nur offene) |
| `ReasonIcon`, `ReasonTile` | `ReasonIcon.tsx` | Zeichen eines Ablehnungsgrunds; als Kachel im Symbolton (`sm` 24, `md` 32, `lg` 48) |
| `Medal` | `levels/Medal.tsx` | Medaille eines erreichten Abzeichens im Metall der Stufe |
| `Segmented`, `SegmentedLinks` | `ui.tsx` | Wahl aus wenigen (auch Glas-Variante über Karten) |
| `Switch` | `ui.tsx` | Kippschalter |
| `PrefSwitch`, `PrefChoice`, `ChoiceRows`, `GoalStepper` | `settings/controls.tsx` | Zeilen der Einstellungen: Schalter, Auswahl mit Haken (eine Zeile je Möglichkeit), Regler für Tagesziele – je an eine Einstellung gebunden, ohne Toast (die Wirkung ist zu sehen) |
| `Sheet` | `Sheet.tsx` | Blatt von unten (Handy, ziehbar) / mittiger Dialog (iPad, Rechner); rückt bei offener Bildschirmtastatur in den sichtbaren Teil darüber (`visualViewport`), damit der Hauptknopf zu sehen bleibt |
| `Menu`, `MenuItem` | `Menu.tsx` | Glas-Menü hinter „…“ |
| `ToastProvider`, `useToast` | `Toast.tsx` | Eine Rückmeldung zur Zeit, optional mit Aktion („Rückgängig“) |
| `useConfirm` | `useConfirm.tsx` | Rückfrage nur für Unumkehrbares (Löschen) |
| `TabBar`, `Sidebar` | `AppNav.tsx` | Schwebende Glas-Reiterleiste (Handy) / einklappbare Seitenleiste (iPad, Rechner) |
| `DailyBars`, `ReasonBars`, `HourBars` | `charts.tsx` | Diagramme |
| `ProfileRadar` | `ProfileRadar.tsx` | Netzdiagramm der Übersicht: sechs Achsen gegen den Zeitraum davor (gestrichelt = wie vorher, Rand = doppelt so viel), Achse antippen zeigt die Zahlen dahinter |
| `ActivityRings`, `LevelSummary`, `LevelBadge` | `levels/LevelCard.tsx` | Fitness-Ringe, Level |
| `ProviderSummary`, `PriceBadge` | `ProviderRating.tsx` | Grundversorger und Preisstufe |
| `Logo`, `LogoMark` | `Logo.tsx` | Marke |
| Zeichen | `icons.tsx` | Eine Familie (SF-Symbols-artig, 1,75 px Strich), gefüllte Variante für aktive Reiter |

### Muster

- **Übersicht** beginnt mit der Kopfkarte (`HeroStats`) – die einzige
  tiefgrüne Fläche der Seite. Andere Seiten bleiben bei `StatGrid`.
- **Gruppierte Liste statt Karten.** Überschrift `ListLabel`, darunter
  `ul.list` mit `Cell`s. Kein Erklärtext – höchstens eine `list-footer`-Zeile.
- **Eine Hauptaktion je Bildschirm** – oben rechts in der Werkzeugleiste als
  `btn-primary btn-sm` mit Zeichen und kurzem Wort („+ Neu“, „+ Preis“,
  „Einladen“), oder als Fuß im Blatt. `icon-btn-accent` nur für Aktionen in
  einer Zeile (Abhaken, Senden).
- **Raster aus Kacheln** (Abzeichen) als `.tile-grid`: Haarlinien je Kachel,
  eine unvollständige letzte Reihe bleibt Fläche statt graue Lücke.
- **Untertitel immer** auf Seiten, die als Reiter nebeneinanderstehen (Feed,
  Rangliste, Erfolge) – sonst springt die Segmentleiste beim Wechsel.
- **Selten Gebrauchtes** hinter `Menu` („…“).
- **Bearbeiten im Blatt** (`Sheet`), Hauptknopf im Fuß als `btn-primary btn-lg btn-block`.
- **Löschen**: `useConfirm` mit `danger`. Alles andere: Toast mit „Rückgängig“.
- **Leere Zustände**: ein Zeichen, ein Satz, höchstens eine Aktion.
- **Klinken** (nach dem Vorbild der Glasfaser-Vertriebs-App der Telekom): die
  Häuser der Straße als **Tabelle** (`DoorTable`, `.door-table`) – eine Zeile je
  Hausnummer, links fett die Nummer in fester Spalte, daneben der Stand in Worten
  („Nicht angetroffen · 2×“, der Ablehnungsgrund, „Termin vereinbart“, „Abschluss am
  12.03.2026“), darunter wer und wann, rechts das Zeichen des Ergebnisses. Jede zweite
  Zeile ist getönt (`--zebra`), damit die Zeile auch in der Sonne hält. Ein **grüner
  Balken links** heißt „hier gab es einen Abschluss“ – als Form, nicht nur als Farbe,
  und ohne die Tür zu sperren. Darüber „Nr. filtern“ (filtern statt blättern; eine
  fehlende Nummer lässt sich dort öffnen), „In meiner Nähe“ und „Nur offene“. Ein
  Mehrfamilienhaus öffnet sich wie ein Ordner (Chevron): drinnen stehen nur seine
  Klingeln (`BuildingHeader` mit „‹ Straße“), keine Hausnummern. Gewählt ist, was man
  antippt – die Nummer wird zur grünen Plakette, die Zeile getönt, und die
  Ergebnisleiste nennt darüber dieselbe Tür (`TrayTarget`). **Nichts springt von
  selbst**: nach dem Speichern bleibt die Tür gewählt und zeigt sofort ihren neuen
  Stand (auch ohne Netz). Wird eine gewählte Zeile von der gewachsenen Leiste
  verdeckt, rollt die Liste genau so weit, dass sie darüber steht.
  Termine erscheinen als kompakte Zusammenfassung; ein Tipp öffnet
  die Liste mit Adresse, Anruf und Sprung zur Tür. Die Aktionsleiste bietet zuerst
  die fehlende Haus- oder Klingelauswahl, danach „Nicht da“, „Ohne Abschluss“,
  „Termin“ und „Auftrag starten“. Inhalt und Toasts halten Abstand zur gemessenen
  Höhe der Leiste. Strom und Gas haben jeweils eine beschriftete Preiszeile mit
  Versorger und eigener Preisstufe. Der Standort meldet sich nur, wenn er etwas
  sagt: der Hinweis „Nächste offene Tür“ erst, wenn die gewählte Tür weit weg ist
  (nicht bei jedem Schritt die Straße hinauf), keine Entfernung, wenn man davorsteht,
  „ca.“ statt falscher Genauigkeit. Listen, die nach Nähe geordnet sind, springen
  nicht, solange das Blatt offen ist – nur die Zahlen laufen mit.
- **Klinken auf dem iPad** (Aufbau in `globals.css`, Abschnitt „Klinken“): eine
  Spalte (bis 760 px breit) – Kopf, Liste, unten die Ergebnisleiste. Sie klebt unten
  an der Liste (`position: sticky`) – immer an derselben Stelle, egal wie viele
  Termine oder Hinweise darüber stehen, und hochkant in derselben Anordnung wie am
  Handy (zwei mal zwei, „Auftrag starten“ unten rechts). Quer (ab 800 px
  Inhaltsbreite, Containerabfrage auf `.tour`) stehen die vier Knöpfe nebeneinander,
  Zeichen über dem Wort – so bleibt über der Leiste Platz für die Liste. Der Toast
  „Rückgängig“ steht mittig über der Leiste. In niedrigen Fenstern (≤ 600 px hoch)
  wird die Leiste ebenfalls einzeilig. Im Auto-Modus bleibt die Seitenleiste beim
  Klinken bis 1279 px schmal.
- **Rechner/iPad**: zweispaltig (`lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]`),
  Tabellen (`table.table`) erlaubt, wo Spalten vergleichen. Containerabfragen nur
  ab `md` und nie auf Vorfahren fest positionierter Elemente – ältere Browser
  machten den Container zu deren Bezugsrahmen.

---

## 7. Marke

„Carlsson Sales“: Zeichen = offener Ring (das „C“, als Fortschrittsring) mit
Punkt – Tür/Ziel. Der Ring wächst von 3 Uhr bis 12 Uhr von schmal zu breit und
läuft so auf den Punkt zu. App-Symbol: Energie-Grün mit Licht von oben links,
feiner Lichtkante, heller Marke mit weichem Schatten und leicht leuchtendem
Punkt. Wortmarke in der Systemschrift, „Carlsson“ fett, „Sales“ normal.
Seiten vor der App (Anmelden, Einladung, Nicht gefunden) liegen auf
`.brand-backdrop` (grünes Licht von oben); die Bildmarke beim Anmelden wirft
einen grün getönten Schatten (`.brand-mark`).
Dateien: `public/logo.svg`, `public/logo-mark.svg`, `public/icon.svg`,
`public/icon-maskable.svg`; PNGs (inkl. Benachrichtigungs-Symbol
`badge-96.png`) erzeugt `scripts/build-icons.mjs`.

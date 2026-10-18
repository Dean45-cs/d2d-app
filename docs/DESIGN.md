# Carlsson Sales · Gestaltungssystem

Dieses Dokument ist die Quelle der Wahrheit für das Aussehen der App. Tokens
stehen in `src/app/brand.css` (Marke: Akzent, Signale, Datenfarben) und
`src/app/globals.css` (Neutrales, Material, Schrift, Radien, Bausteine). Was
dort nicht steht, gibt es nicht – Tailwinds eigene Farben, Schriftgrößen,
Radien und Schatten sind per `@theme { --color-*: initial; … }` gelöscht.

Leitbild: iOS 26. **Navigation und Bedienelemente aus Glas**, **Inhalt auf
ruhigen, festen Flächen**. Fast einfarbig, genau **ein Akzent** (Energie-Grün).
Kompakt, ohne Erklärtexte, eine Hauptaktion je Bildschirm.

---

## 1. Farbe

### Neutral (globals.css)

| Token | Hell | Dunkel | Rolle |
| --- | --- | --- | --- |
| `--bg` | `#f2f2f7` | `#000000` | Seitengrund (gruppiert) |
| `--surface` | `#ffffff` | `#1c1c1e` | Inhaltsfläche: Listen, Kennzahlen, Beiträge |
| `--surface-2` | `#f2f2f7` | `#2c2c2e` | Fläche auf Fläche (selten), Kartengrund |
| `--fill` / `--fill-strong` | `#767680` 12 % / 20 % | 24 % / 34 % | Felder, Segmentleisten, Ringe-Spur |
| `--ink` | `#0b0b0d` | `#f5f5f7` | Text |
| `--ink-2` | `#3c3c43` | `#d1d1d6` | Beschriftung von Kennzahlen |
| `--muted` | `#68686f` | `#a1a1a8` | Untertitel, Zeitangaben |
| `--separator` | `#3c3c43` 16 % | `#545458` 60 % | Haarlinien (eingerückt bis zur Schrift) |

### Marke (brand.css)

| Token | Hell | Dunkel | Rolle |
| --- | --- | --- | --- |
| `--accent` | `#1f9d4c` | `#30d158` | Füllung: Ringe, Fortschritt, aktiver Reiter, Abschluss-Zeichen |
| `--accent-ink` | `#0d6b32` | `#34d66b` | Grüne **Schrift** und kleine Zeichen |
| `--accent-tint` | Grün 16 % | Grün 20 % | Getönte Aktion (Primärknopf), Auswahl |
| `--on-accent` | `#ffffff` | `#062611` | Zeichen auf voller Akzentfläche – **nur Zeichen, keine Schrift** |
| `--danger` / `--danger-tint` | `#c9182a` | `#ff6b6b` | Fehler, Löschen – nur klein, immer mit Wort oder Zeichen |
| `--warn` / `--warn-tint` | `#a35a00` | `#ffb547` | Warnung (veraltet, prüfen) |
| `--chart-doors` / `--chart-met` / `--chart-sales` | grau / dunkel / Akzent | grau / hell / Akzent | Diagramme, Fitness-Ringe |
| `--plot-1…4` | unverändert | dunkel angepasst | Teilgebiete (CVD-geprüfter Satz) |
| `--price-0…4`, `--price-none` | grau → tiefgrün | dunkel → hellgrün | Preisstufen der Energiekarte (sequenziell, Helligkeit steigt) |
| `--tone-{blue,indigo,purple,magenta,teal,slate,brown}-{hi,lo}` | Verlauf hell → satt | gleich | Kacheln der Ablehnungsgründe (`ReasonTile`) – nur dort |

**Regeln**

- Aktionen sind **getönt** (`.btn-primary` = Tönung + `--accent-ink`) oder umrandet,
  nie flächig grün. Volle grüne Fläche mit Haken (`.glyph-result`) bedeutet
  ausschließlich **Abschluss** – im Toast, in Kontakten, im Feed.
- Rot und Bernstein sind Signale, nie Dekoration, nie allein (immer Wort/Zeichen).
- **Keine Emojis.** Ablehnungsgründe tragen ein Zeichen aus `ReasonIcon.tsx`
  (Schlüssel in `src/lib/reason-icons.ts`). Wo Gründe gewählt, gepflegt oder
  ausgewertet werden, steht es auf seiner Kachel im Symbolton; in Verläufen
  (`OutcomeGlyph`) neutral im `.glyph`, damit der grüne Abschluss das einzige
  Farbsignal der Liste bleibt.
- Symboltöne haben kein Grün, Rot oder Bernstein und sind keine Bedienfarben.
  Weißes Zeichen auf dem hellen Ende des Verlaufs ≥ 3 : 1.
- Medaillen der Abzeichen (`levels/Medal.tsx`) sind Bildfarben wie das Logo:
  Bronze, Silber, Gold, Platin (Lavendel), Diamant (Eisblau); ab Gold mit
  Perlkranz. Das Zeichen sitzt eingraviert in der dunkelsten Metallfarbe.
- Schrift auf voller Akzentfläche ist verboten (hell nur 3,5 : 1) – dafür die Tönung.

### Gemessene Kontraste (WCAG 2.x)

| Paar | Vordergrund | Hintergrund | Kontrast |
| --- | --- | --- | --- |
| `--ink` (hell) | `#0b0b0d` | Fläche `#ffffff` | 19.66 |
| `--ink-2` (hell) | `#3c3c43` | Fläche `#ffffff` | 10.94 |
| `--muted` (hell) | `#68686f` | Fläche `#ffffff` | 5.53 |
| `--muted` (hell) | `#68686f` | Grund `#f2f2f7` | 4.95 |
| `--muted` auf `--fill` (hell) | `#68686f` | Feld auf Weiß | 4.81 |
| `--accent-ink` (hell) | `#0d6b32` | Fläche `#ffffff` | 6.63 |
| `--accent-ink` (hell) | `#0d6b32` | Grund `#f2f2f7` | 5.94 |
| `--accent-ink` auf Tönung (hell) | `#0d6b32` | Tönung auf Weiß | 5.90 |
| `--accent-ink` auf Tönung (hell) | `#0d6b32` | Tönung auf Grund | 5.35 |
| `--accent` Bedienelement (hell) | `#1f9d4c` | Fläche `#ffffff` | 3.51 (≥ 3 : 1 Grafik) |
| `--on-accent` Zeichen (hell) | `#ffffff` | `--accent` | 3.51 (≥ 3 : 1 Grafik) |
| `--danger` (hell) | `#c9182a` | Fläche `#ffffff` | 5.76 |
| `--danger` auf Tönung (hell) | `#c9182a` | Tönung | 4.89 |
| `--warn` (hell) | `#a35a00` | Grund `#f2f2f7` | 4.68 |
| `--ink` (dunkel) | `#f5f5f7` | Fläche `#1c1c1e` | 15.63 |
| `--ink-2` (dunkel) | `#d1d1d6` | Fläche `#1c1c1e` | 11.18 |
| `--muted` (dunkel) | `#a1a1a8` | Fläche `#1c1c1e` | 6.63 |
| `--muted` (dunkel) | `#a1a1a8` | Fläche 2 `#2c2c2e` | 5.43 |
| `--accent-ink` (dunkel) | `#34d66b` | Fläche `#1c1c1e` | 8.89 |
| `--accent-ink` auf Tönung (dunkel) | `#34d66b` | Tönung auf Fläche | 6.00 |
| `--on-accent` Zeichen (dunkel) | `#062611` | `--accent` | 8.03 |
| `--danger` (dunkel) | `#ff6b6b` | Fläche `#1c1c1e` | 6.13 |
| `--warn` (dunkel) | `#ffb547` | Fläche `#1c1c1e` | 9.68 |

Alle Textpaare ≥ 4,5 : 1, alle Bedien-/Grafikpaare ≥ 3 : 1. Bei
`prefers-contrast: more` wird Glas fest, Haarlinien und `--muted` dunkler.

---

## 2. Material „Liquid Glass“

`.glass` / `.glass-strong` und alle Glas-Bausteine (`.tabbar`, `.sidebar`,
`.toolbar[data-stuck]`, `.seg-glass`, `.sheet`, `.menu`, `.toast`, `.map-ctrl`,
`.map-chip`, `.tray`) teilen dieselben Tokens:

- `--glass-bg` (74 % deckend) bzw. `--glass-strong` (86 %), darüber `--glass-sheen`
  (Glanzverlauf von oben), Rand `--glass-edge` (0,5 px Lichtkante innen),
  Schatten `--elev-glass` / `--elev-float`.
- Unschärfe `--glass-blur: blur(22px) saturate(180%)`.
- **Rückfälle:** ohne `backdrop-filter`, bei `prefers-reduced-transparency` und
  bei `prefers-contrast: more` wird Glas zur festen Fläche `--glass-solid`.
- Glas nur für Dinge, die **über** Inhalt schweben. Inhalt selbst liegt auf
  `--surface`. Nie Glas auf Glas, nie Karte in Karte.

---

## 3. Schrift

Systemschrift (`-apple-system` → SF Pro; Rückfall Segoe UI/Roboto/Inter).
Große Zahlen (`.kpi`) in SF Pro Rounded. **Alle Zahlen tabellarisch** (`html`
setzt `font-variant-numeric: tabular-nums`).

| Klasse | Größe / Zeile | Gewicht | Verwendung |
| --- | --- | --- | --- |
| `text-hero` | 96 / 96 | 700 | Hausnummer beim Klinken |
| `text-display` | 48 / 52 | 700 | Große Einzelzahl |
| `text-large-title` | 34 / 41 | 700 | Seitentitel, Haupt-Kennzahl |
| `text-title-1` | 28 / 34 | 700 | Kennzahlen im Raster |
| `text-title-2` | 22 / 28 | 700 | Zwischentitel |
| `text-title-3` | 20 / 25 | 600 | Abschnittstitel, Blatt-Titel |
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
- Seitenrand `--gutter`: 16 / 24 / 32 px (Handy / Tablet / Rechner).
- Seitenbreiten: `.page` 1200 px, `.page-medium` 960 px, `.page-narrow` 680 px.
- **Radien konzentrisch** (innen = außen − Abstand): `xs 4` · `sm 8` · `md 12`
  · `lg 16` · `xl 20` · `2xl 28` · `full`. Listen und Flächen `xl`, Blätter
  `2xl`, Felder `md`, Knöpfe und Plaketten `full`.
- Tippflächen ≥ 44 pt (`.btn` 44, `.btn-sm` 36 mit unsichtbar erweiterter
  Fläche, `.btn-lg` 56, Ergebnisknöpfe beim Klinken ≥ 56).
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
- `prefers-reduced-motion`: alle Animationen ≈ 0 ms.

---

## 6. Bausteine

Alle in `src/components/`. Stil per Klassen aus `globals.css` (`@layer components`).

| Baustein | Datei | Zweck |
| --- | --- | --- |
| `PageHeader` | `PageHeader.tsx` | Werkzeugleiste (Zurück, Aktionen) + großer Titel; wird beim Scrollen zu Glas mit kleinem Titel |
| `Cell` | `ui.tsx` | Zeile einer gruppierten Liste (`ul.list`, `ul.list list-icons`) – Link, Knopf oder statisch |
| `ListLabel`, `SectionHeader` | `ui.tsx` | Gruppenüberschrift (Versalien, klein) bzw. Abschnittstitel mit „Alle“ |
| `StatGrid` | `ui.tsx` | Kennzahlen auf einer Fläche, Haarlinien dazwischen |
| `ProgressRing`, `ProgressBar` | `ui.tsx` | Fortschritt im Akzent |
| `Pill`, `StatusBadge` | `ui.tsx` | Plaketten (neutral, accent, danger, warn, ink) |
| `Avatar` | `ui.tsx` | Bild oder Kürzel |
| `EmptyState`, `InlineError`, `Notice` | `ui.tsx` | Leer, Fehler, ruhiger Hinweis |
| `Skeleton*` | `ui.tsx` | Ladeplatzhalter (Kopf, Liste, Kennzahlen) |
| `OutcomeGlyph` | `ui.tsx` | Ergebnis eines Besuchs als Zeichen (bei Ablehnung das Zeichen des Grundes, neutral) |
| `ReasonIcon`, `ReasonTile` | `ReasonIcon.tsx` | Zeichen eines Ablehnungsgrunds; als Kachel im Symbolton (`sm` 24, `md` 32, `lg` 48) |
| `Medal` | `levels/Medal.tsx` | Medaille eines erreichten Abzeichens im Metall der Stufe |
| `Segmented`, `SegmentedLinks` | `ui.tsx` | Wahl aus wenigen (auch Glas-Variante über Karten) |
| `Switch` | `ui.tsx` | Kippschalter |
| `Sheet` | `Sheet.tsx` | Blatt von unten (Handy, ziehbar) / mittiger Dialog (iPad, Rechner) |
| `Menu`, `MenuItem` | `Menu.tsx` | Glas-Menü hinter „…“ |
| `ToastProvider`, `useToast` | `Toast.tsx` | Eine Rückmeldung zur Zeit, optional mit Aktion („Rückgängig“) |
| `useConfirm` | `useConfirm.tsx` | Rückfrage nur für Unumkehrbares (Löschen) |
| `TabBar`, `Sidebar` | `AppNav.tsx` | Schwebende Glas-Reiterleiste (Handy) / einklappbare Seitenleiste (iPad, Rechner) |
| `DailyBars`, `ReasonBars`, `HourBars` | `charts.tsx` | Diagramme |
| `ActivityRings`, `LevelSummary`, `LevelBadge` | `levels/LevelCard.tsx` | Fitness-Ringe, Level |
| `ProviderSummary`, `PriceBadge` | `ProviderRating.tsx` | Grundversorger und Preisstufe |
| `Logo`, `LogoMark` | `Logo.tsx` | Marke |
| Zeichen | `icons.tsx` | Eine Familie (SF-Symbols-artig, 1,75 px Strich), gefüllte Variante für aktive Reiter |

### Muster

- **Gruppierte Liste statt Karten.** Überschrift `ListLabel`, darunter
  `ul.list` mit `Cell`s. Kein Erklärtext – höchstens eine `list-footer`-Zeile.
- **Eine Hauptaktion je Bildschirm** – oben rechts in der Werkzeugleiste
  (`btn-primary btn-sm` oder `icon-btn-accent`) oder als Fuß im Blatt.
- **Selten Gebrauchtes** hinter `Menu` („…“).
- **Bearbeiten im Blatt** (`Sheet`), Hauptknopf im Fuß als `btn-primary btn-lg btn-block`.
- **Löschen**: `useConfirm` mit `danger`. Alles andere: Toast mit „Rückgängig“.
- **Leere Zustände**: ein Zeichen, ein Satz, höchstens eine Aktion.
- **Klinken**: Termine erscheinen als kompakte Zusammenfassung; ein Tipp öffnet
  die Liste mit Adresse, Anruf und Sprung zur Tür. Die Aktionsleiste bietet zuerst
  die fehlende Haus- oder Klingelauswahl, danach „Nicht da“, „Ohne Abschluss“,
  „Termin“ und „Auftrag starten“. Inhalt und Toasts halten Abstand zur gemessenen
  Höhe der Leiste. Strom und Gas haben jeweils eine beschriftete Preiszeile mit
  Versorger und eigener Preisstufe.
- **Rechner/iPad**: zweispaltig (`lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]`),
  Tabellen (`table.table`) erlaubt, wo Spalten vergleichen.

---

## 7. Marke

„Carlsson Sales“: Zeichen = offener Ring (das „C“, als Fortschrittsring) mit
Punkt – Tür/Ziel. Der Ring wächst von 3 Uhr bis 12 Uhr von schmal zu breit und
läuft so auf den Punkt zu. App-Symbol: Energie-Grün mit Licht von oben links,
feiner Lichtkante, heller Marke mit weichem Schatten und leicht leuchtendem
Punkt. Wortmarke in der Systemschrift, „Carlsson“ fett, „Sales“ normal.
Dateien: `public/logo.svg`, `public/logo-mark.svg`, `public/icon.svg`,
`public/icon-maskable.svg`; PNGs (inkl. Benachrichtigungs-Symbol
`badge-96.png`) erzeugt `scripts/build-icons.mjs`.

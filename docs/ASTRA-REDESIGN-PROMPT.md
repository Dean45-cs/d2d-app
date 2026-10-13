# Redesign-Auftrag für GPT-6 Astra (Codex)

Briefing für den kompletten Design-Umbau inklusive Rebranding zu „Carlsson Sales“.
Verwendung: In Codex mit diesem Repo eine neue Aufgabe starten und entweder den Text
unterhalb der Linie einfügen oder schreiben: „Lies `docs/ASTRA-REDESIGN-PROMPT.md` und
setze den Auftrag vollständig um.“

Getroffene Entscheidungen: iOS 26 Liquid Glass, fast monochrom mit Energie-Grün als
einzigem Akzent, hell und dunkel nach Systemeinstellung, Seiten zusammenlegen (Struktur
entwirft Astra), schwebende Glas-Tab-Leiste, Klinken im Ein-Hand-Modus, Gamification
dezent, Animationen dezent, ein Durchgang, volle Freiheit mit Schutz der Produktivdaten.

---

You are redesigning an existing, working product end to end. Treat this as a flagship
redesign that Apple's own design team would sign off on. You have full freedom; read the
whole brief before touching code.

# 1. The product

Repository: this repo ("d2d-app"). A door-to-door sales app for electricity & gas
contracts, used by:
- Sales reps (role MEMBER): on iPhone, outdoors, in sunlight, one-handed, often with bad
  reception, standing at a stranger's door. Every second and every tap counts.
- Team leaders (role LEADER): on iPhone, iPad and desktop: territories, team performance,
  appointments, settings.
What is visible also depends on fine-grained permissions (`src/lib/permissions.ts`,
`src/lib/permission-definitions.ts`), not only on the role.

The core features are done and work. The problem: the UI looks like an unfinished
construction kit. Too many pages, too many cards inside cards, too much explanatory text,
inconsistent density, a heavy dark-blue header/sidebar, and no clear visual hierarchy.

All UI copy is German and must stay German (natural, short, "du" form). Code comments in
this repo are German; keep that convention for comments you write.

# 2. Tech you are working in

- Next.js 16 App Router, React 19, TypeScript, Tailwind CSS v4 (`@theme inline` in
  `src/app/globals.css`), better-sqlite3 (`src/lib/db.ts`, migrations run on startup).
- Design tokens: `src/app/brand.css` (brand colors, chart and map colors) and
  `src/app/globals.css` (surfaces, ink, radii, shadows, motion + a component layer:
  .card .btn .list .list-row .seg .sheet .menu .tap-tile .switch .badge .input …).
- Shared UI: `src/components/ui.tsx` (PageHeader, StatTile, Segmented, Avatar, EmptyState,
  skeletons …), `Sheet.tsx`, `Menu.tsx`, `icons.tsx` (hand-drawn SVG icons),
  `charts.tsx`, `AppNav.tsx` (sidebar, mobile top bar, mobile tab bar),
  `levels/*`, `community/*`, `ProviderRating.tsx`, `InstallHint.tsx`, `Logo.tsx`.
- Navigation model: `src/lib/nav.ts` + `src/components/nav-icons.ts`; app shell in
  `src/app/(app)/layout.tsx`.
- Maps: `src/components/map/*`: MapLibre (OpenFreeMap) by default, Leaflet fallback,
  optional Apple MapKit. Map markers/controls are styled in globals.css (.map-*).
- PWA: `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, icons in
  `public/`; `capacitor.config.json` for a later App Store build.
- Current screens (routes under `src/app/(app)/`):
  start (leader dashboard) · gebiete (+ [id]: territory workspace, street list, map,
  split, handover) · tour (the door-knocking flow, `TourClient.tsx`, ~3000 lines) ·
  termine · feed (+ [id]) · vergleich (leaderboard / head-to-head) · level (XP,
  achievements) · karte (energy price map, price sheet, spreadsheet import) · auswertung
  (reports, date ranges) · team (table + org structure) · einladungen · berechtigungen ·
  einstellungen (rejection reasons, reference prices) · profil/[id] (+ abos) · mehr.
  Outside the shell: `src/app/login`, `src/app/einladung/[token]` (join form).

# 3. Goal

A complete, coherent redesign of every screen and component, as compact as possible,
with Apple-product quality. Nothing may keep the old look. When you are done, there must
be no leftover old styles, dead components or one-off inline style hacks.

# 4. Design direction

## 4.1 Material: iOS 26 "Liquid Glass"
- Navigation and controls (tab bar, sidebar, toolbars, segmented controls, sheets, map
  controls, toasts, floating buttons) are made of translucent glass that floats above the
  content: blur + saturation, a subtle specular edge highlight, soft refraction feel and
  light tinting from what lies beneath. Depth comes from the material, not from heavy
  drop shadows.
- Content itself (lists, numbers, forms) sits on solid, calm surfaces and runs
  edge-to-edge underneath the glass layer.
- Concentric geometry: corner radii of nested elements are concentric
  (inner radius = outer radius − padding). Define one radius scale and stick to it.
- Legibility first: glass over a busy map or photo must still pass contrast. Provide
  solid fallbacks for `prefers-reduced-transparency`, `prefers-contrast: more`, and
  browsers without `backdrop-filter`.
- Performance: glass layers are few and GPU-cheap. No jank while scrolling long lists
  or panning the map on a mid-range iPhone.

## 4.2 Color: near-monochrome + one accent
- Neutral greys, near-black and white do almost all the work, in both light and dark.
- Exactly ONE accent: an energetic green ("Energie-Grün"). It marks primary actions,
  selection, focus, active tab, progress.
- Green also means "Abschluss" (closed sale / success). Keep them apart through form,
  not hue: actions are tinted or outlined green; a completed sale is a solid green fill
  with a checkmark glyph. A user must never confuse "button" with "result".
- Red (rejection/destructive) and amber (gas) survive ONLY as small semantic signals,
  never as decoration. Never rely on color alone (add icon/shape/label).
- Derive an accessible "ink" green for text and icons on light and on dark backgrounds
  (WCAG AA ≥ 4.5:1 for text, ≥ 3:1 for large text and UI). Green on white often fails,
  so measure it, don't guess.
- Map territory colors (`--plot-1..4` in brand.css) were checked for color-vision
  deficiency. You may restyle them, but keep 4 colors that stay distinguishable for
  protan/deutan users in light and dark, plus the number badge as the real identifier.
- Light and dark are equally polished and follow the system. Keep the existing
  `data-theme="light|dark"` override mechanism working.

## 4.3 Typography & icons
- System font stack (SF Pro on Apple devices). Define an Apple-HIG-like type scale
  (Large Title, Title 1–3, Headline, Body, Callout, Subheadline, Footnote, Caption) as
  tokens and use only those. Tabular numerals for every number, KPI and table.
- Big, confident numbers for KPIs (Apple Fitness/Health style), small quiet labels.
- One consistent icon family in the spirit of SF Symbols (same stroke weight, rounded
  caps/joins, same optical size, filled variant for the active tab). You may redraw or
  replace `icons.tsx`, but keep it dependency-light.
- Emojis in rejection reasons (user-configurable) stay supported, but render them
  inside a consistent neutral glyph container.

## 4.4 Motion & haptics feel
- Subtle and fast: iOS spring curves, sheets that glide up and can be dragged down,
  tab bar that shrinks/minimizes on scroll and expands on scroll-up, pressed states that
  scale slightly. Nothing that delays work at the door. Durations mostly 150–350 ms.
- Respect `prefers-reduced-motion` everywhere.
- Level-up and closed-sale feedback: short, tasteful, skippable, never blocking.

## 4.5 Compactness
- Fewer pages, denser screens, less scrolling. Prefer inset grouped lists over stacks
  of cards. No card inside a card. No decorative containers.
- Remove explanatory paragraphs from screens. Help text moves into empty states, an
  info button, or disappears. Labels are 1–3 words.
- One clear primary action per screen. Secondary actions go into toolbars or menus.
- Progressive disclosure: details on tap (sheet or push), not all at once.
- Every pixel of padding is on a 4-pt grid and justified.

# 5. Information architecture: you decide

Today there are 13 top-level sections (listed above) plus "Mehr". Redesign the
information architecture from scratch:
- Merge and regroup aggressively. On iPhone: a floating Liquid-Glass tab bar with at most
  4–5 destinations. On iPad and desktop: a translucent glass sidebar in the style of
  iPadOS 26 (collapsible), content uses the width properly (multi-column where useful).
- The current dark-blue mobile header and dark-blue sidebar are removed entirely.
  Account, profile and logout live inside the new structure (e.g. a "Me" destination or
  the sidebar footer), not in a separate header.
- Role- and permission-aware: reps and leaders may get different tabs or a different
  first screen. A rep's first screen must get them knocking doors within one tap.
- Ideas you may use or reject: territories + energy price map as layers of one map;
  feed + leaderboard + levels as one "team" space; reports folded into the dashboard;
  admin (team, invitations, permissions, reasons, prices) grouped under settings.
- Update `src/lib/nav.ts`, the app shell and all links/redirects. Old URLs that users may
  have bookmarked or that push notifications open (see `public/sw.js`,
  `src/lib/push.ts`, `src/lib/appointment-reminders.ts`) must redirect to their new home.
- Justify the final IA in the PR description (one short table: old route → new place).

# 6. The door-knocking flow ("Klinken", `src/app/(app)/tour/`) is the heart of the app

Design it for one-handed use, outdoors:
- The current house number is the hero: large and unmistakable. Street and territory
  are compact context above it, switchable via a quick sheet with search.
- The outcome actions (nicht angetroffen · angetroffen · Termin · Abschluss, plus the
  follow-ups: rejection reason, appointment, sale/tariff calculator) sit in the bottom
  thumb zone as large targets (≥ 56 pt high, never < 44 pt).
- Minimum taps: after saving, auto-advance to the next open house; one-tap rejection
  reasons; an undo toast instead of confirmation dialogs.
- Multi-family houses (doorbell board, up to 3 attempts per door), house descriptions,
  blocked houses, pending sales, today's appointments at the top: all still reachable,
  but secondary.
- Offline status and queued entries are visible but calm (small glass pill), never
  alarming. Offline capture must keep working (`src/lib/offline-queue.ts`,
  `src/lib/visit-idempotency.ts`, `src/lib/tour-draft.ts`).
- Sunlight: high contrast, no thin grey text for anything that matters.
- `TourClient.tsx` is ~3000 lines. Split it into well-named components while you
  redesign it.

# 7. Other screens (all of them, no exceptions)
- Dashboard / reports: Fitness-style KPI numbers, compact charts (`charts.tsx`) restyled
  to the monochrome + green language, readable in both themes.
- Gamification (levels, XP, achievements, streaks, ranking): subtle, Apple-Fitness-ring
  style. A ring or slim progress indicator in the overview; details on tap. Not loud.
- Maps (territories, territory workspace, area picker, energy price map): glass map
  controls and chips, a calmer base map in both themes (adjust the MapLibre style or
  paint properties if needed), clean markers, bottom sheets for details.
- Feed, profile, follow/abos, comments, push toggle, leaderboard, head-to-head.
- Team table and org structure, invitations, permissions editor, settings (reasons,
  reference prices), price sheet, spreadsheet import.
- Login, invitation join page, `public/offline.html`, install hint, loading skeletons
  (`loading.tsx` files), empty states, error states, toasts, confirm dialogs, menus.
- Desktop/iPad: use the width properly; tables are allowed where they beat lists.

# 8. Rebrand to "Carlsson Sales"

The company is now called **Carlsson Sales**. Design a cool, minimalist, premium logo:
- A symbol (bildmarke) + wordmark. The symbol must work alone as the app icon (iOS home
  screen, maskable Android/PWA icon with safe zone), as a favicon at 16–32 px, in mono,
  and on light and dark backgrounds. It should feel at home next to Apple's own icons
  while hinting at energy/momentum/sales.
- Deliver the logo as clean, optimized SVG in `public/` (e.g. `logo.svg`,
  `logo-mark.svg`, `icon.svg`, `icon-maskable.svg`) and rebuild `src/components/Logo.tsx`.
- Regenerate all raster icons from the SVG with a script (e.g. sharp or headless
  Chromium), not by hand: `icon-192.png`, `icon-512.png`, `icon-maskable-512.png`,
  `apple-touch-icon.png` (180), `favicon-32.png`.
- Replace every product-branding occurrence of "Energie Partner 24" / "EP24": metadata
  in `src/app/layout.tsx`, `src/app/einladung/[token]/page.tsx`, login page, manifest
  (name, short_name, theme/background colors), `public/offline.html`, notification
  title in `public/sw.js`, `brand.css`, `capacitor.config.json` (appName, and appId →
  `de.carlssonsales.vertrieb`; the app is not in the App Store yet), README and docs.
- Do NOT change external URLs or domains: the tariff calculator
  `https://portal-ep24.de/...` / `NEXT_PUBLIC_TARIFRECHNER_URL`, and the fly.dev
  hostnames are real endpoints.

# 9. Freedom and the few hard rules

You have full freedom: restructure flows, merge or drop features, change components,
routes, API routes and the database if it makes the product better.
Hard rules (these protect a live production app, they don't limit the design):
1. Production runs on fly.io with an existing SQLite database. Any schema change must be
   an idempotent startup migration in `src/lib/db.ts` that keeps all existing data.
2. Server-side permission checks keep protecting every API route and page.
3. At the end, `npm run typecheck`, `npm test` and `npm run build` pass. If you change
   behavior on purpose, update the tests and say so.
4. Every feature you remove or merge is listed in the PR description with a one-line
   reason. Nothing disappears silently.
5. Accessibility: semantic HTML, visible focus for keyboard, labels for icon buttons,
   tap targets ≥ 44 pt, WCAG AA contrast in light AND dark, safe areas (notch, Dynamic
   Island, home indicator), no horizontal page scroll, no iOS input zoom (inputs ≥ 16px).
6. German copy stays German. Long German compounds ("Ablehnungsgründe",
   "Grundversorger") must not break layouts.

# 10. How to work (single pass)

1. Audit first: read the codebase, inventory every screen, state (empty, loading,
   error, offline, permission-limited) and role variant. Write down what is wrong today.
2. Write the design system first: tokens (color incl. accessible inks, type scale,
   4-pt spacing, radii, materials/glass, elevation, motion) in `brand.css` /
   `globals.css`, documented in a new `docs/DESIGN.md`.
3. Rebuild the primitives (ui.tsx, Sheet, Menu, AppNav/tab bar/sidebar, icons, charts,
   map controls, toasts) on top of the tokens.
4. Implement the new IA and navigation, including redirects for old routes.
5. Redesign every screen. Delete dead CSS classes, components and inline styles you
   replaced.
6. Rebrand (logo, icons, names).
7. Verify visually: seed demo data and run the app
   (`cp .env.example .env.local`, set SESSION_SECRET, then
   `SEED_DEMO=1 npm run db:seed && npm run dev`; logins: leader `leitung@example.de` /
   `start1234`, reps `alex@example.de` and `sina@example.de` / `start1234`).
   Use Playwright to screenshot every screen for both roles at iPhone (393×852),
   iPad (820×1180 and 1180×820) and desktop (1440×900), in light and dark. Review each
   screenshot critically against section 11 and fix what fails. Attach the screenshots
   to the PR if your environment allows.
8. Run typecheck, tests and build. Open one PR with: summary, the IA table
   (old → new), removed/merged features, design-system overview, screenshots, and
   anything you were unsure about.

# 11. Quality bar (check every screen against this before you finish)
- Would this screen look at home in an Apple keynote? If not, it is not done.
- Is there anything on screen that could be removed without losing function? Remove it.
- One primary action, obvious within one second.
- Consistent: same spacing scale, radius scale, type scale, icon weight everywhere.
- Glass is legible over every background it can appear on.
- Dark mode is designed, not inverted.
- Every number is tabular and aligned; every list row has the same height logic.
- Empty, loading, error and offline states are designed, not defaults.
- No truncated German labels, no wrapped buttons, no layout shift on load.

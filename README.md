# D2D-App – Vertriebs-App für Strom & Gas an der Haustür

Eine Web-App für Door-to-Door-Teams im Energievertrieb:

- **Gebiete zuteilen** – Straßenlisten anlegen und einzelnen Teammitgliedern zuweisen
- **Türen tracken** – nicht angetroffen / angetroffen / Termin / Abschluss, mit einem Daumen bedienbar
- **Ablehnungsgründe mit einem Tap** – konfigurierbare Kachel-Auswahl statt Freitext
- **Abschluss-Button** – speichert den Verkauf und öffnet direkt die Auftragserfassung des Partners
- **Energiekarte** – zeigt täglich aktualisiert, wo der Grundversorger besonders teuer ist
- **Auswertung** – Antreff- und Abschlussquoten je Mitarbeiter, Gebiet und Zeitraum
- **Installierbar auf iPhone und iPad** – eigenes Symbol, Vollbild ohne Browserleiste,
  Erfassung funktioniert auch ohne Empfang

Die Oberfläche ist mobil-first (der Außendienst arbeitet am Handy), das Leitungs-Dashboard
funktioniert zusätzlich am Desktop.

**Installation auf dem Handy und Weg in den App Store:
[docs/IPHONE-IPAD.md](docs/IPHONE-IPAD.md)**

---

## Schnellstart

```bash
npm install
cp .env.example .env.local        # Werte anpassen, vor allem SESSION_SECRET
npm run db:seed                   # Datenbank + erste Teamleitung anlegen
npm run dev                       # http://localhost:3000
```

Nach dem Seed steht der Login in der Konsole, standardmäßig:

| Rolle       | E-Mail                | Passwort    |
|-------------|-----------------------|-------------|
| Teamleitung | `leitung@example.de`  | `start1234` |

Eigene Zugangsdaten beim Seed setzen:

```bash
SEED_LEADER_EMAIL=chef@meinefirma.de SEED_LEADER_PASSWORD='EinLangesPasswort' npm run db:seed
```

Mit `SEED_DEMO=1` werden zusätzlich zwei Beispiel-Mitarbeiter und zwei Beispiel-Gebiete
angelegt – praktisch zum Ausprobieren, für den Echtbetrieb weglassen.

**Das Startpasswort nach dem ersten Login ändern** (Team → Passwort neu setzen).

---

## Rollen

| | Teamleitung | Vertrieb |
|---|---|---|
| Gebiete anlegen, Straßen pflegen, zuteilen | ✅ | – |
| Mitarbeiter anlegen, Passwörter setzen | ✅ | – |
| Ablehnungsgründe konfigurieren | ✅ | – |
| Türen erfassen | ✅ | ✅ |
| Eigene Gebiete sehen, Status melden | ✅ (alle) | ✅ (eigene) |
| Auswertung | ganzes Team | nur eigene Zahlen |
| Energiekarte | ✅ | ✅ |

---

## Der Ablauf an der Tür

1. Gebiet und Straße auswählen (bleibt stehen, bis gewechselt wird)
2. Hausnummer eintippen – `+1` springt zur nächsten Nummer
3. Eines der drei Ergebnisse tippen:
   - **Nicht angetroffen** – sofort gespeichert
   - **Angetroffen – kein Abschluss** – es öffnet sich die Kachel-Auswahl mit den
     Ablehnungsgründen; ein Tap speichert. Optional eine Notiz dazu.
   - **Termin vereinbart** – sofort gespeichert
4. **Abschluss** – der große grüne Button speichert den Verkauf **und öffnet im selben
   Moment den Tarifrechner des Partners**
   (`https://portal-ep24.de/menues/tarifrechner/`, änderbar über
   `NEXT_PUBLIC_TARIFRECHNER_URL`). Das Fenster wird direkt beim Antippen geöffnet, damit
   kein Popup-Blocker dazwischenkommt; blockiert der Browser es trotzdem, wechselt die App
   selbst auf die Seite.
5. Vertippt? „Letzten Eintrag rückgängig machen“ – für eigene Einträge bis 15 Minuten,
   die Teamleitung kann jederzeit korrigieren.

Die Ablehnungsgründe sind vorbelegt (zufrieden mit Anbieter, kein Interesse, Vertrag läuft
noch, muss mit Partner sprechen, keine Haustürgeschäfte …) und unter **Einstellungen**
frei änderbar: umbenennen, ausblenden, sortieren, eigene ergänzen.

---

## Gebiete und Straßen

Beim Anlegen eines Gebiets wird die Straßenliste einfach eingefügt – eine Straße pro Zeile.
Hausnummern und Wohneinheiten sind optional und werden automatisch erkannt:

```
Bahnhofstraße 1-45; 30 WE
Kampstraße 2-28; 24 WE
Lindenweg
```

Daraus wird: Name / Hausnummernbereich / Anzahl Wohneinheiten. Die Wohneinheiten dienen als
Nenner für den Fortschrittsbalken („18 von 30 Türen bearbeitet“).

---

## Energiekarte

Die Karte zeigt je Postleitzahl die Jahreskosten eines Musterhaushalts beim örtlichen
**Grundversorger** (Strom: 3.500 kWh, Gas: 15.000 kWh). Rot = teuer = größtes
Wechselargument. Die Liste „Teuerste Grundversorger“ führt direkt zu den lohnendsten
Gebieten.

### Datenquelle einrichten

Es gibt keine kostenlose offene Schnittstelle mit tagesaktuellen Grundversorgertarifen.
Die App bringt deshalb eine **austauschbare Quelle** mit, die in `.env.local` konfiguriert wird:

```bash
ENERGY_FEED_MODE=csv                       # seed | csv | json
ENERGY_FEED_URL=https://…/grundversorger.csv
ENERGY_FEED_TOKEN=…                        # optional, wird als Bearer-Token gesendet
ENERGY_FEED_LABEL=Mein Tarifdatenanbieter  # Anzeigename in der Karte
```

- **`seed`** (Voreinstellung): erzeugt Beispielwerte, damit die Karte bedienbar ist.
  Diese Werte sind **keine echten Tarife** – die App weist in der Karte deutlich darauf hin.
- **`csv` / `json`**: ruft täglich die hinterlegte Adresse ab. Geeignet ist alles, was
  PLZ-bezogene Preise liefert: ein Export eures Tarifdatenanbieters (z. B. ene't, Verivox
  Partner-Feed, Check24 Partnerprogramm) oder eine selbst gepflegte Tabelle.

Erwartete Spalten (deutsche oder englische Namen, Groß-/Kleinschreibung egal, Komma oder
Punkt als Dezimaltrennzeichen):

| Spalte | Pflicht | Beispiel |
|---|---|---|
| `plz` / `postal_code` | ✅ | `44135` |
| `ort` / `city` | – | `Dortmund` |
| `versorger` / `provider` | – | `DEW21` |
| `strom_ct_kwh` | – | `38,45` |
| `strom_grundpreis_eur` | – | `142,80` |
| `gas_ct_kwh` | – | `12,10` |
| `gas_grundpreis_eur` | – | `178,00` |
| `lat`, `lng` | – | `51.5136`, `7.4653` |
| `gueltig_ab` / `valid_from` | – | `2026-09-17` |

Fehlen `lat`/`lng`, ergänzt die App die Koordinate aus der mitgelieferten Städteliste
(`src/lib/energy/cities.ts`, rund 90 Städte mit ihrem Grundversorger). Zeilen ohne
zuordenbare Koordinate werden übersprungen. Für flächendeckende PLZ-Abdeckung einfach
`lat`/`lng` in den Feed aufnehmen oder die Städteliste erweitern.

### Täglich aktualisieren

Drei Wege, je nach Betrieb:

```bash
# 1) Cron auf dem Server (App muss nicht laufen)
0 5 * * *  cd /pfad/zur/app && npm run energy:refresh

# 2) HTTP-Aufruf, z. B. aus einem Cron-Dienst oder Vercel Cron
curl -X POST https://deine-app.de/api/energy/refresh \
     -H "Authorization: Bearer $ENERGY_REFRESH_TOKEN"

# 3) Von Hand: in der App auf „Jetzt aktualisieren“ (nur Teamleitung)
```

Für Vercel Cron genügt eine `vercel.json`:

```json
{ "crons": [{ "path": "/api/energy/refresh", "schedule": "0 5 * * *" }] }
```

Jeder Lauf wird protokolliert; Zeitpunkt, Quelle und Ergebnis stehen in der Karte unter
„Datenstand“ und unter Einstellungen.

---

## Design anpassen

Alle Farben stehen in **einer** Datei: `src/app/brand.css`. Dort die Hex-Werte von
Energie Partner 24 eintragen – Kopfzeile, Buttons, Diagramme und Karte übernehmen sie
automatisch, inklusive Dunkelmodus.

```css
:root {
  --brand-600: #0f5cab;   /* Hauptfarbe */
  --energy-600: #059450;  /* Abschluss / Strom */
  --gas-500:   #f59e0b;   /* Gas */
  --signal-500:#e5484d;   /* Ablehnung */
}
```

Eigenes Logo: Datei als `public/logo.svg` ablegen und in `src/components/Logo.tsx`
einbinden (der Platzhalter ist dort kommentiert).

Die Diagrammfarben (`--chart-doors`, `--chart-sales`) sind auf Farbfehlsichtigkeit geprüft;
beim Austauschen bitte den Kontrast im Blick behalten.

---

## Auf dem Handy installieren

Die App ist eine installierbare Web-App (PWA). Auf dem iPhone in **Safari** öffnen,
Teilen-Symbol → „Zum Home-Bildschirm“ → „Hinzufügen“. Danach startet sie mit eigenem
Symbol im Vollbild. Die Anleitung dazu zeigt die App beim ersten Öffnen selbst an.

Voraussetzung ist eine erreichbare **HTTPS**-Adresse – ohne HTTPS gibt es weder
Installation noch Service Worker.

**Erfassung ohne Empfang:** Tippt jemand im Treppenhaus ohne Netz ein Ergebnis, landet der
Eintrag im Speicher des Geräts. Ein Banner zeigt, wie viele Einträge warten; sobald wieder
Verbindung besteht, werden sie automatisch nachgesendet (bei erneutem Öffnen der App, beim
Wechsel auf „online“ und alle 30 Sekunden). Einträge, die der Server dauerhaft ablehnt –
etwa weil das Gebiet gelöscht wurde – werden verworfen, damit die Schlange nicht blockiert.

Der Service Worker speichert bewusst **nur** JavaScript, CSS und Icons zwischen, niemals
HTML mit Teamdaten. So kann auf einem geteilten Gerät nach dem Abmelden keine gecachte
Seite mehr auftauchen.

Alles Weitere – Livegang in 15 Minuten, App-Store-Weg, Stolpersteine – steht in
[docs/IPHONE-IPAD.md](docs/IPHONE-IPAD.md).

---

## Livegang

Es liegt ein `Dockerfile` (Next.js im Standalone-Modus) und eine Beispiel-`fly.toml` bei:

```bash
fly apps create d2d-app
fly volumes create d2d_data --region fra --size 1
fly secrets set SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fly deploy
fly ssh console -C "npx tsx scripts/seed.ts"
```

Geht genauso bei Railway, Render, Hetzner oder einem eigenen Server – Hauptsache, es gibt
**dauerhaften Dateispeicher** für die SQLite-Datei. **Vercel und Netlify funktionieren
nicht**, weil dort das Dateisystem nach jedem Aufruf verworfen wird.

Mit Volume darf immer nur **eine** Maschine laufen (`min_machines_running = 1`), sonst
entstehen zwei getrennte Datenbestände.

---

## Technik

| | |
|---|---|
| Framework | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS v4 mit eigenen Marken-Tokens |
| Datenbank | SQLite über `better-sqlite3` – kein Datenbankserver nötig |
| Karte | Leaflet mit OpenStreetMap-Kacheln |
| Login | Signiertes Session-Cookie (HMAC), Passwörter als scrypt-Hash |
| App auf dem Handy | PWA mit Manifest, Service Worker und lokaler Erfassungs-Warteschlange |

### Struktur

```
src/
  app/
    (app)/            Bereich nach dem Login (Layout mit Navigation)
      start/          Dashboard der Teamleitung
      tour/           Türerfassung (das Herzstück)
      gebiete/        Gebiete und Straßen
      karte/          Energiekarte
      auswertung/     Zahlen
      team/           Mitarbeiterverwaltung
      einstellungen/  Ablehnungsgründe, Quellen, Design-Hinweise
    api/              REST-Endpunkte
    brand.css         >>> hier die Markenfarben eintragen <<<
  lib/
    db.ts             Schema und Verbindung
    auth.ts           Login, Rollen, Passwörter
    queries.ts        alle Datenbankabfragen
    energy/           Städteliste, Datenquellen-Adapter, Tagesabruf
    offline-queue.ts  Puffer für Türeinträge ohne Netz
  components/         UI-Bausteine, Diagramme, Navigation
public/
  manifest.webmanifest, sw.js, offline.html, App-Icons
docs/
  IPHONE-IPAD.md      Installation auf dem Handy und App-Store-Weg
scripts/
  seed.ts             Ersteinrichtung
  refresh-energy.ts   Tagesabruf für Cron
```

### Befehle

```bash
npm run dev             # Entwicklung
npm run build           # Produktionsbuild
npm run start           # Produktionsserver
npm run typecheck       # TypeScript prüfen
npm run db:seed         # Datenbank einrichten
npm run energy:refresh  # Energiepreise abrufen
```

---

## Betrieb

- **`SESSION_SECRET` in Produktion zwingend setzen** (die App startet sonst nicht):
  `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Die Datenbank liegt unter `data/d2d.db` (`DATABASE_PATH`). Für Backups reicht es, diese
  Datei zu sichern – am besten über `sqlite3 data/d2d.db ".backup backup.db"`.
- HTTPS verwenden: das Session-Cookie wird in Produktion nur über HTTPS gesetzt.
- Kartenkacheln kommen standardmäßig von OpenStreetMap. Für dauerhaften Betrieb mit
  vielen Nutzern einen eigenen Kachel-Dienst über `NEXT_PUBLIC_MAP_TILE_URL` eintragen
  und die Nutzungsbedingungen des Anbieters beachten.
- Bei Plattformen ohne dauerhaften Dateispeicher (z. B. Vercel) ist SQLite nicht die
  richtige Wahl – dort ein Volume einbinden (Fly.io, Railway, eigener Server) oder das
  Schema auf Postgres portieren. Alle Abfragen liegen gebündelt in `src/lib/queries.ts`.

## Datenschutz

Die App speichert Besuchsergebnisse pro Hausnummer, keine Namen oder Kontaktdaten von
Kundinnen und Kunden. Wird beim Erfassen die Standortfreigabe erteilt, wird zusätzlich die
Position des Erfassenden gespeichert – das ist eine Mitarbeiterortung und gehört mit dem
Betriebsrat bzw. den Beschäftigten abgestimmt. Wer das nicht möchte: in
`src/app/(app)/tour/TourClient.tsx` den `navigator.geolocation`-Block entfernen.

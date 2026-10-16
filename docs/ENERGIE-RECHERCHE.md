# Grundversorger-Preise per KI-Recherche

Die Energiekarte holt ihre Preise aus einer Tagesquelle (siehe README, „Optional:
Tagesquelle“). Diese Quelle ist die Tabelle `data/grundversorger.csv` auf dem Branch
**`claude/energy-prices`**. Eine geplante Claude-Aufgabe pflegt sie einmal pro Woche:
Sie schlägt die Preisblätter der Grundversorger nach, prüft die Tabelle und pusht sie.
Die App ruft sie danach selbst ab:

```bash
fly secrets set ENERGY_FEED_MODE=csv \
  ENERGY_FEED_URL="https://raw.githubusercontent.com/Dean45-cs/d2d-app/refs/heads/claude/energy-prices/data/grundversorger.csv" \
  ENERGY_FEED_LABEL="KI-Recherche (Preisblätter der Grundversorger)"
```

Selbst eingetragene Preise auf der Karte gehen der Tabelle weiterhin vor.

## Anleitung für den wöchentlichen Lauf

Diese Anleitung gilt für die Claude-Sitzung, die die Tabelle pflegt.

### 1. Vorbereiten

```bash
git fetch origin claude/energy-prices
git checkout -B claude/energy-prices origin/claude/energy-prices
npm ci
npm run energy:check -- data/grundversorger.csv
```

Die Prüfung nennt die Orte, die **noch fehlen**, und die, deren Prüfung **älter als
14 Tage** ist. Die Orte stammen aus `src/lib/energy/cities.ts` (PLZ, Ort,
vorgeschlagener Grundversorger).

### 2. Auswahl: höchstens 45 Orte pro Lauf

Zuerst die fehlenden Orte, sortiert nach Einwohnerzahl. Danach die mit dem ältesten
`geprueft_am`. So ist jeder Ort spätestens alle zwei Wochen frisch geprüft.

### 3. Recherche je Ort

Gesucht ist der Tarif der **Grundversorgung** (nicht die Ersatzversorgung, kein
Sondervertrag, kein Öko- oder Wärmepumpentarif) für einen **Haushaltskunden mit
Eintarifzähler** in der jeweiligen PLZ:

- **Quelle:** nur das offizielle Preisblatt oder die Tarifseite des Grundversorgers
  selbst. Vergleichsportale, Nachrichtenartikel und Foren sind keine Quelle. Sie
  dürfen höchstens Hinweise auf eine Preisänderung liefern.
- **Grundversorger prüfen:** Der Name in `cities.ts` ist nur ein Vorschlag.
  Maßgeblich ist, wer laut eigener Website die Grundversorgung in diesem Ort stellt.
- **Brutto** (inkl. 19 % MwSt.). Steht dort nur netto, rechne mal 1,19 und runde auf
  zwei Nachkommastellen.
- `strom_ct_kwh` / `gas_ct_kwh`: Arbeitspreis in **Cent pro kWh**.
- `strom_grundpreis_eur` / `gas_grundpreis_eur`: Grundpreis in **Euro pro Jahr**.
  Steht dort ein Monatspreis, rechne mal 12.
- Gilt ab einem künftigen Datum ein neuer Preis, trag den **heute gültigen** ein.
  Den künftigen trägst du erst ab dem Stichtag ein.
- Gas nur, wenn derselbe Ort eine Gas-Grundversorgung hat und das Preisblatt zu
  finden ist. Sonst bleibt Gas leer.

**Nie schätzen.** Ist ein Preis nicht eindeutig belegbar, gilt:

- Ein bestehender Ort bleibt **unverändert**, auch sein altes `geprueft_am`. So
  kommt er beim nächsten Lauf wieder dran.
- Ein neuer Ort wird nicht eingetragen.

### 4. Tabelle

Trennzeichen `;`, UTF-8, Kopfzeile genau so:

```
plz;ort;versorger;strom_ct_kwh;strom_grundpreis_eur;gas_ct_kwh;gas_grundpreis_eur;gueltig_ab;quelle_url;geprueft_am
```

- `plz` wie in `cities.ts`, damit die App die Koordinate findet.
- `gueltig_ab`: ab wann der Preis laut Preisblatt gilt (JJJJ-MM-TT), sonst leer.
- `quelle_url`: der direkte Link zum Preisblatt.
- `geprueft_am`: das heutige Datum (JJJJ-MM-TT), nur bei tatsächlich geprüften Zeilen.
- Zeilen nach PLZ sortieren und keine anderen Zeilen anfassen.

### 5. Prüfen und veröffentlichen

```bash
npm run energy:check -- data/grundversorger.csv   # muss ohne Fehler durchlaufen
git add data/grundversorger.csv
git commit -m "Grundversorger-Preise: <n> Orte geprüft, <m> geändert"
git push -u origin claude/energy-prices
```

Nur `data/grundversorger.csv` committen und **keinen** Pull Request öffnen. Der
Branch ist eine reine Datenquelle.

### 6. Abschluss

Zum Schluss eine kurze Zusammenfassung auf Deutsch:

- Wie viele Orte geprüft wurden.
- Welche Preise sich geändert haben (alt → neu, mit Quelle).
- Welche Orte nicht belegbar waren.
- Wie viele Orte noch fehlen.

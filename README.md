# D2D-App – Vertriebs-App für Strom & Gas an der Haustür

Eine Web-App für Door-to-Door-Teams im Energievertrieb:

- **Gebiete auf der Karte abstecken** – Fläche einkreisen, die Straßen holt die App
  selbst aus OpenStreetMap; auf Wunsch gleich ausgewogen auf mehrere Leute aufgeteilt
- **Türen tracken** – nicht angetroffen / angetroffen / Termin / Abschluss, mit einem Daumen bedienbar;
  Ein- und Mehrfamilienhäuser mit eigenem Klingelbrett, höchstens drei Versuche je Tür
- **Ablehnungsgründe mit einem Tap** – konfigurierbare Kachel-Auswahl statt Freitext
- **Abschluss-Button** – speichert den Verkauf und öffnet den Tarifrechner des Partners,
  in dem der Auftrag aufgenommen und unterschrieben wird
- **Termine mit Uhrzeit** – Vorschläge für den Abend, Rufnummer dazu, und am nächsten Tag
  stehen sie oben auf der Tour
- **Energiekarte** – zeigt, wo der Grundversorger besonders teuer ist; Preise in Sekunden
  vom Preisblatt eingetragen oder als Tabelle aus Excel übernommen
- **Auswertung** – Antreff- und Abschlussquoten je Mitarbeiter, Gebiet und Zeitraum
- **Vergleich** – Rangliste je Kennzahl, der eigene Platz samt Abstand zum nächsten,
  Team-Schnitt, Bestwert und Direktvergleich mit einem Kollegen
- **Feed** – jeder Abschluss erscheint von selbst; dazu eigene Beiträge, Kommentare
  und „Gefällt mir“
- **Abonnieren** – wer Kollegen abonniert, bekommt eine Push-Nachricht aufs Handy,
  sobald sie einen Vertrag machen
- **Profil** – wie bei Twitter, aber mit den eigenen Zahlen: Abschlüsse, Quoten, Platz
  im Team, Serie, Bestwert und Abzeichen
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

Beim Serverstart legt die App Team und Teamleitung automatisch an, sobald
`SEED_LEADER_EMAIL` und `SEED_LEADER_PASSWORD` gesetzt sind – lokal genügt
`npm run db:seed`. Danach lautet der Login standardmäßig:

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
| Gebiete abstecken, aufteilen, Straßen pflegen, zuteilen | ✅ | – |
| Mitarbeiter anlegen, Passwörter setzen | ✅ | – |
| Ablehnungsgründe konfigurieren | ✅ | – |
| Türen erfassen | ✅ | ✅ |
| Eigene Gebiete sehen, Status melden | ✅ (alle) | ✅ (eigene) |
| Auswertung | ganzes Team | nur eigene Zahlen |
| Vergleich (Rangliste, Profile mit Zahlen) | ✅ | ✅ |
| Feed: posten, kommentieren, abonnieren | ✅ | ✅ |
| Fremde Beiträge und Kommentare löschen | ✅ | – |
| Energiekarte | ✅ | ✅ |

Auf dem Handy stehen unten höchstens fünf Reiter. Im Vertrieb sind das Klinken, Feed,
Vergleich, Termine und **Mehr** (Gebiete, Energiekarte, Zahlen); bei der Teamleitung
liegen Feed, Vergleich, Energiekarte, Auswertung, Team und Einstellungen unter **Mehr**.
Das eigene Profil und das Abmelden erreicht man über das Profilbild oben rechts. Am
Rechner steht alles gruppiert in der Seitenleiste, das Profil unten links.

---

## Der Ablauf an der Tür

1. Gebiet und Straße auswählen (bleibt stehen, bis gewechselt wird)
2. Hausnummer antippen – bei Gebieten aus der Kartenauswahl stehen die Häuser der
   Straße als Plaketten bereit (erfasste durchgestrichen), „weiter“ springt zur
   nächsten offenen. Ohne hinterlegte Nummern: eintippen, `+1` zählt hoch.
3. Eines der drei Ergebnisse tippen:
   - **Nicht angetroffen** – sofort gespeichert. Nach dem dritten Versuch gilt die Tür als
     abgearbeitet, damit niemand dieselbe Klingel ein viertes Mal läuft.
   - **Angetroffen – kein Abschluss** – es öffnet sich die Kachel-Auswahl mit den
     Ablehnungsgründen; ein Tap speichert. Optional eine Notiz dazu.
   - **Termin vereinbart** – kurze Abfrage: Vorschläge wie „Morgen 18:00“ oder freie
     Eingabe, dazu Name und Rufnummer. Ein Termin ohne Uhrzeit verfällt, deshalb fragt die
     App danach.
4. **Abschluss** – der große grüne Button speichert den Verkauf **und öffnet im selben
   Moment den Tarifrechner des Partners**
   (`https://portal-ep24.de/menues/tarifrechner/`, änderbar über
   `NEXT_PUBLIC_TARIFRECHNER_URL`). Dort wird der Auftrag aufgenommen und unterschrieben –
   Kundendaten, Widerrufsbelehrung und Unterschrift gehören in den Tarifrechner und nicht
   ein zweites Mal in diese App. Das Fenster wird direkt beim Antippen geöffnet, damit kein
   Popup-Blocker dazwischenkommt; blockiert der Browser es trotzdem, wechselt die App selbst
   auf die Seite.
5. Vertippt? „Letzten Eintrag rückgängig machen“ – für eigene Einträge bis 15 Minuten,
   die Teamleitung kann jederzeit korrigieren.

Beim ersten Antippen einer Hausnummer fragt die App nach **Ein- oder Mehrfamilienhaus**.
Im Mehrfamilienhaus werden die Klingelschilder angelegt – entweder die Namen vom Brett
abtippen oder „6 Klingeln ohne Namen“. Danach zählt jede Klingel als eigene Tür, und wie es
weitergeht, hängt am Brett:

- **Namen am Brett**: nach jedem Ergebnis geht die Liste wieder auf und der Name wird
  ausdrücklich gewählt. Geklingelt wird in der Reihenfolge, die man vorfindet – ein Eintrag
  beim falschen Namen wäre schlimmer als ein Tipp mehr.
- **„Klingel 1, 2, 3 …“** aus der Schnellanlage: die Reihenfolge sagt nichts aus, deshalb
  springt die App wie gewohnt selbst zur nächsten offenen Klingel.

Wer ausdrücklich keinen Besuch will, bekommt über **Sperren** einen dauerhaften Eintrag
fürs ganze Team – aufheben kann ihn nur die Teamleitung.

Die Ablehnungsgründe sind vorbelegt (zufrieden mit Anbieter, kein Interesse, Vertrag läuft
noch, muss mit Partner sprechen, keine Haustürgeschäfte …) und unter **Einstellungen**
frei änderbar: umbenennen, ausblenden, sortieren, eigene ergänzen.

---

## Termine

Unter **Termine** (Teamleitung: alle, Außendienst: die eigenen) steht, was an der Tür
vereinbart wurde – nach Tagen geordnet, überfällige ganz oben und rot markiert. Von dort
aus lässt sich anrufen, die Route öffnen oder der Termin abhaken; abgehakte stehen unter
„Erledigt“ und lassen sich wieder öffnen. Termine von heute erscheinen zusätzlich
am Kopf der Tour; ein Tipp darauf stellt Straße, Hausnummer und Klingel ein.

Gespeichert wird die **Ortszeit** (`2026-09-21 18:00`). Ob ein Termin „heute“ ist,
entscheidet das Gerät und nicht der Server: vor der Tür zählt die Uhr an der Wand.

---

## Vergleich, Feed und Profil

Der Teil der App, der anspornen soll: Jeder sieht, wo er im Team steht, und jeder
Vertrag wird gefeiert.

### Vergleich

**Vergleich** zeigt die Rangliste des Teams – wählbar nach Abschlüssen, Terminen,
Türen, Abschlussquote und Antreffquote, für heute, 7 Tage, 30 Tage oder gesamt.

- **Dein Platz** oben mit dem Satz, der zählt: „Noch 3 Abschlüsse und du überholst
  Sina (Platz 2).“ – oder, wer vorn liegt, wie groß der Vorsprung ist. Daneben, wie
  viele Plätze man gegenüber dem Zeitraum davor gutgemacht oder verloren hat.
- **Treppchen** für die ersten drei, darunter alle mit Balken im Verhältnis zum Besten.
  Gleiche Werte teilen sich den Platz.
- **Du im Vergleich:** jede Kennzahl als Balken, der Team-Schnitt als Strich darüber.
- **Direktvergleich** mit einer Kollegin oder einem Kollegen, Kennzahl für Kennzahl.
  Voreingestellt ist, wer direkt vor einem steht – der nächste, den man einholen kann.

Fair bleibt es so: Eine **Quote** zählt erst ab 5 Gesprächen (Abschlussquote) bzw.
20 Türen (Antreffquote); darunter steht man in der Liste, aber ohne Platz. Die
**Teamleitung** kommt nur in die Wertung, wenn sie im Zeitraum selbst an Türen war.

### Feed

Jeder **Abschluss** erscheint von selbst im Feed – mit Produkt, Gebiet und der wievielte
Vertrag der Person es ist (runde Zahlen bekommen eine Plakette). Adresse und Kunde stehen
dort bewusst nicht. Wird der Eintrag an der Tür rückgängig gemacht, verschwindet auch der
Beitrag. Abschlüsse von vor dem Feed werden beim ersten Start nachgetragen.

Dazu kann jeder **eigene Beiträge** schreiben (bis 500 Zeichen), **kommentieren** und
**„Gefällt mir“** setzen. Unter einem Abschluss stehen Ein-Tipp-Glückwünsche („Stark! 💪“)
bereit. „Abonniert“ zeigt nur die Beiträge der Leute, denen man folgt. Eigene Beiträge
und Kommentare löscht man selbst, die Teamleitung darf alle löschen.

### Abonnieren und Push-Nachrichten

Auf einem Profil (oder rechts im Feed) **„Abonnieren“** tippen – ab dann kommt jeder
Vertrag dieser Person als Push-Nachricht aufs Handy. Ein Tipp darauf öffnet den Beitrag
zum Gratulieren. Außerdem gibt es eine Nachricht, wenn jemand den eigenen Beitrag
kommentiert oder einen abonniert.

- Beim ersten Abonnieren fragt das Gerät nach der Erlaubnis. Ein- und ausschalten lässt
  sich Push im **eigenen Profil**; dort gibt es auch eine Probe-Nachricht.
- **iPhone/iPad:** nur in der installierten App (ab iOS 16.4), nicht im Safari-Tab.
- Einrichten muss man nichts: Die Schlüssel (VAPID) erzeugt die App beim ersten Bedarf
  selbst und speichert sie in der Datenbank. Eigene Schlüssel gehen über
  `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, der Kontakt für die Push-Dienste über
  `VAPID_SUBJECT` (sonst die E-Mail der Teamleitung).
- Versendet wird direkt an die Push-Dienste von Apple, Google, Mozilla und Microsoft –
  ohne Zusatzdienst und ohne weitere Bibliothek (`src/lib/push.ts`). Andere Adressen
  nimmt der Server nicht an. Der Server muss diese Dienste erreichen können.

### Profil

Das Profil ist wie bei Twitter aufgebaut – Titelbild, Profilbild, Name, ein Satz über
sich, „Dabei seit“, Abonnenten und Abonnierte, darunter die Reiter **Beiträge**,
**Abschlüsse** und **Gefällt mir**. Der Unterschied: oben stehen die **Zahlen** der Person.

- Abschlüsse gesamt und der letzten 30 Tage mit **Platz im Team**
- Abschluss- und Antreffquote
- **Serie**: Arbeitstage in Folge mit mindestens einem Abschluss (Tage ohne Türen
  unterbrechen nicht), **bester Tag**, Termine
- **Abzeichen** für 1, 5, 10, 25, 50, 100 … Abschlüsse und ein Balken bis zum nächsten
- Verlauf der letzten 14 Tage

Über „Profil bearbeiten“ ändert jeder sein Bild und den Text über sich selbst; Name,
Rolle und Zugang bleiben bei der Teamleitung.

---

## Gebiete und Straßen

### Auf der Karte abstecken (der schnelle Weg)

**Gebiete → Neues Gebiet → „Auf der Karte“:**

1. Ort oder PLZ ins Suchfeld tippen – oder 📍 für den eigenen Standort
2. **Umkreis:** einmal auf die Karte tippen, Größe über den Regler (150 m – 2 km).
   **Fläche zeichnen:** die Ecken nacheinander antippen, Punkte lassen sich nachziehen.
3. **„Straßen im Gebiet laden“** – die App holt aus OpenStreetMap nicht nur die
   Straßennamen, sondern **jede einzelne Hausnummer** (`Bahnhofstraße: 1, 3, 5, 7, 9,
   11, 12a …`) mitsamt Wohneinheiten und Lage. Jedes Haus erscheint als Punkt auf der
   Karte: man sieht vor dem Speichern, wie viel Substanz das Gebiet hat. Ein Tipp auf
   eine Zeile in der Liste springt zur Straße, abgewählte Straßen werden blass.
4. PLZ, Ort und ein Namensvorschlag sind schon ausgefüllt; nur noch zuteilen und speichern.

Schon vergebene Gebiete liegen grau gestrichelt unter der Zeichnung und werden
**automatisch ausgespart**: Man darf großzügig über sie hinweg zeichnen, das neue Gebiet
endet trotzdem an ihrer Grenze (oben auf der Karte steht, wie viele ausgespart wurden).
Auch der Server schneidet beim Speichern und beim Ändern einer Fläche vergebene Gebiete
heraus – zwei Gebiete überschneiden sich also nie. Ein Gebiet ist auf **25 km²**
begrenzt; ein Tagesgebiet sind meist ein bis zwei Quadratkilometer.

Überschneiden sich Gebiete aus älteren Daten, zeigt die Übersichtskarte trotzdem jeden
Fleck nur einmal: das kleinere Gebiet liegt obenauf, das größere bekommt dort ein Loch.
Die Kürzel stehen immer mitten in der eigenen Fläche; decken sie sich beim aktuellen
Zoom, tritt das kleinere zurück und erscheint beim Hineinzoomen wieder.

### Was mit den Hausnummern passiert

Die geladenen Hausnummern bleiben erhalten und werden an drei Stellen benutzt:

- **Gebietsseite:** hinter jeder Straße steht „8 Nr.“ – aufgeklappt erscheint jedes
  Haus als Plakette, grau = offen, blau = erfasst, grün = Abschluss. Damit sieht die
  Teamleitung, was tatsächlich abgearbeitet ist, nicht nur die Summe.
- **An der Tür:** unter dem Eingabefeld stehen die Häuser der Straße zum Antippen –
  erfasste sind durchgestrichen. Statt „+1“ heißt der Knopf dann **„weiter“** und
  springt zur nächsten **offenen** Hausnummer. Wer lieber tippt, tippt weiter.
- **Wohneinheiten:** kennt OpenStreetMap die Zahl der Wohnungen im Haus, zählt sie in
  den Fortschritt ein (sonst gilt ein Haus als eine Tür). Der Tooltip einer Plakette
  verrät sie.

Fehlen die Hausnummern in OpenStreetMap, bleibt alles wie vorher – die Straße wird
ohne Liste angelegt und die Nummer an der Tür von Hand eingetippt. **„Straßen
nachladen“** trägt fehlende Hausnummern bei bestehenden Gebieten nach, ohne etwas zu
überschreiben.

### Ein Gebiet auf mehrere Leute aufteilen

Unter **„Aufteilen auf“** wird aus einer Zeichnung mit einem Tipp ein Gebiet je
Mitarbeiter – **bis zu vier**:

- Die App gruppiert die Straßen **räumlich** (niemand läuft quer durchs Viertel) und
  gleicht sie danach **nach Türen** aus. Wohneinheiten aus OpenStreetMap zählen, sonst
  jede Adresse als eine Tür.
- Jedes Paket bekommt Farbe und Nummer auf der Karte, eine eigene Fläche und ein
  eigenes Zuteilungsfeld. Die Flächen teilen die Zeichnung **lückenlos und ohne
  Überschneidung** mit geraden Grenzen; jede Grenze liegt dort, wo sie die Häuser der
  beiden Nachbarpakete am saubersten trennt. Eine Straße, die über eine Grenze läuft,
  bleibt ganz bei ihrem Paket – ihre letzten Häuser können also knapp jenseits liegen.
- Gespeichert wird in einem Zug: `Innenstadt-Nord – KW 38 (1/3)` bis `(3/3)`.
  Entweder entstehen alle Teilgebiete oder keines.

Ganz gleich groß werden die Pakete nicht immer – eine Straße mit 50 Wohneinheiten
lässt sich nicht halbieren. Angestrebt sind höchstens 12 % Unterschied.

> **Warum höchstens vier?** Mehr Farben nebeneinander lassen sich auf einer Karte nicht
> mehr sicher unterscheiden, vor allem bei Rot-Grün-Schwäche. Die vier Farben in
> `brand.css` (`--plot-1` bis `--plot-4`) sind dafür geprüft – hell und dunkel, jedes
> Paar gegen jedes. Die Zahl im Kreis ist die eigentliche Kennzeichnung, die Farbe nur
> die Unterstützung.

### Den Überblick behalten

- Die **Gebietsliste** zeigt oben alle Flächen auf einer Karte: Farbe = Status (blau in
  Arbeit, grün fertig, orange pausiert, grau offen), das Kürzel im Kreis = wer dran ist.
  Über das Auswahlfeld lässt sich die Karte auf eine Person oder auf „nicht zugeteilt“
  filtern; ein Tipp auf eine Fläche öffnet das Gebiet.
- Die **Gebietsseite** zeigt die Fläche und jede Straße als Punkt, eingefärbt nach
  Bearbeitungsstand (offen / in Arbeit / fertig). Die Fläche lässt sich neu ziehen
  („Fläche ändern“), die Straßenliste nachladen („Straßen nachladen“) – vorhandene
  Straßen bleiben unberührt.
- Der Pfeil **➤** neben einer Straße öffnet die Navigation in **Apple Karten** – in der
  Gebietsliste und an der Tür in der Türerfassung (am Rechner die Web-Version).
- Auf jeder Karte schaltet der Ebenen-Knopf zwischen Karte und **Satellit** um (nur mit
  Apple Karten); der Rahmen-Knopf holt alle Gebiete zurück ins Bild.

### Die Arbeitskarte im Gebiet

Die Gebietsseite ist das Werkzeug für unterwegs:

- **Jede Tür als Punkt**, eingefärbt nach Stand: blau = noch nicht besucht, orange =
  nochmal versuchen, lila = Termin, grün = Abschluss, grau = erledigt, rot = gesperrt.
  Die Filter über der Karte blenden den Rest aus (Standard: nur offene Türen).
- **Eigener Standort** als blauer Punkt mit Genauigkeitskreis (Pfeil-Knopf auf jeder Karte).
- **Nächste offene Tür** ab dem eigenen Standort, mit „Hier klingeln“ und „Route“.
- **Laufroute planen:** eine günstige Reihenfolge durch alle offenen Türen, ab dem
  eigenen Standort (sonst ab dem Rand des Gebiets), mit Strecke und geschätzter Dauer
  (4,5 km/h plus 1,5 Minuten je Tür). Die Reihenfolge entsteht auf dem Gerät – ohne
  Routing-Dienst, auch ohne Netz.
- **Tipp auf eine Tür:** Stand, Versuche, wer zuletzt da war – „Hier klingeln“ öffnet
  Klinken direkt an diesem Haus, „Route“ die Fußgänger-Navigation in Apple Karten.
- **Wann trifft man hier jemanden an?** Antreffquote nach Tageszeit aus den bisherigen
  Besuchen im Gebiet (ab 15 Besuchen).

### Karten: OpenFreeMap und Apple Karten

Standard ist **OpenFreeMap** – eine moderne Vektorkarte (Stil „Liberty“, im Dunkelmodus
„Dark“), kostenlos, ohne Konto und ohne Limit. Es muss nichts eingerichtet werden.
Eigene Stile lassen sich über `NEXT_PUBLIC_MAP_STYLE_URL` und
`NEXT_PUBLIC_MAP_STYLE_URL_DARK` eintragen.

**Apple Karten (MapKit JS)** übernimmt automatisch, sobald Zugangsdaten aus einem
Apple-Developer-Konto hinterlegt sind (99 €/Jahr, dasselbe Konto wie für den App Store):

1. developer.apple.com → Certificates, IDs & Profiles → **Identifiers** → „Maps IDs“
   anlegen, dann unter **Keys** einen Schlüssel mit „MapKit JS“ erzeugen und die
   `.p8`-Datei herunterladen.
2. In `.env.local` bzw. als Secret beim Hoster eintragen:

   ```bash
   APPLE_MAPKIT_TEAM_ID=ABCDE12345          # Team-ID (oben rechts im Developer-Konto)
   APPLE_MAPKIT_KEY_ID=XYZ9876543           # ID des Schlüssels
   APPLE_MAPKIT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n…\n-----END PRIVATE KEY-----"
   APPLE_MAPKIT_ORIGIN=https://ep24-vertrieb.fly.dev   # optional: Token nur für diese Adresse
   ```

   Der Server stellt damit stündlich neue, kurzlebige Tokens aus; der Schlüssel verlässt
   den Server nie. Alternativ ein im Developer-Konto erzeugtes Token direkt eintragen:
   `APPLE_MAPKIT_TOKEN=eyJ…`.

Lehnt Apple das Token ab, springt die Karte auf OpenFreeMap zurück; kann ein Gerät keine
Vektorkarten (kein WebGL), auf einfache OpenStreetMap-Kacheln. `MAP_PROVIDER=openfreemap`
(oder `osm`) erzwingt eine Karte.

### Straßenliste einfügen (der klassische Weg)

Unter **„Liste einfügen“** wird die Straßenliste wie bisher eingefügt – eine Straße pro
Zeile. Hausnummern und Wohneinheiten sind optional und werden automatisch erkannt:

```
Bahnhofstraße 1-45; 30 WE
Kampstraße 2-28; 24 WE
Lindenweg
```

Daraus wird: Name / Hausnummernbereich / Anzahl Wohneinheiten. Die Wohneinheiten dienen als
Nenner für den Fortschrittsbalken („18 von 30 Türen bearbeitet“).

### Woher die Straßen kommen

Die Daten stammen aus **OpenStreetMap**: Overpass liefert die Straßen und Hausnummern in
der Fläche, Nominatim die Ortssuche sowie PLZ und Ort. Beides ist kostenfrei und ohne
Zugangsdaten nutzbar – die öffentlichen Server sind aber gedrosselt und für den
Dauerbetrieb nicht gedacht:

```bash
# Mehrere Server mit Komma trennen – ist einer ausgelastet, nimmt die App den nächsten
OVERPASS_URL=https://overpass-api.de/api/interpreter,https://overpass.kumi.systems/api/interpreter
NOMINATIM_URL=https://nominatim.openstreetmap.org
GEO_USER_AGENT=d2d-app (kontakt@deinefirma.de)   # bitte eintragen, sonst drohen Sperren
GEO_COUNTRY_CODES=de,at,ch                       # Länder der Ortssuche
```

**„Die Straßen-Server sind gerade alle ausgelastet"?** Der offizielle Overpass-Server
begrenzt die Abfragen pro IP-Adresse. Bei einem Hoster, dessen Ausgangs-IP sich viele
Kunden teilen (Fly.io, Railway & Co.), ist dieses Kontingent oft schon von anderen
verbraucht. Die App probiert deshalb von sich aus mehrere Spiegelserver durch und merkt
sich den, der geantwortet hat. Bleibt es hartnäckig, hilft eine eigene Overpass-Instanz –
`OVERPASS_URL` darauf zeigen lassen, fertig. Welcher Server gerade genommen wurde, steht
im Serverprotokoll (`[overpass] …`).

Für ein Team, das täglich Gebiete schneidet, lohnt eine eigene Overpass-Instanz oder ein
kommerzieller Anbieter – einfach die beiden Adressen umbiegen. Die App geht sparsam mit
den Diensten um: Die Ortssuche ist auf einen Aufruf pro Sekunde gebremst, Ergebnisse
werden zwischengespeichert, und dieselbe Fläche wird innerhalb von fünf Minuten nicht
zweimal abgefragt – Zuschneiden und noch einmal Laden kostet also nichts.

**Zu den Zahlen:** Die Wohneinheiten kommen aus den OSM-Angaben zum Gebäude; fehlen sie,
zählt jede Adresse als eine Tür. OpenStreetMap ist nicht überall gleich vollständig –
die Zahlen sind ein guter Startwert und lassen sich in der Straßenliste nachbessern.
Findet die App keine Straßen, hilft der Weg über „Liste einfügen“.

---

## Energiekarte

Die Karte zeigt je Ort die Jahreskosten eines Musterhaushalts beim örtlichen
**Grundversorger** (Strom: 3.500 kWh, Gas: 15.000 kWh), gemessen am Bundesschnitt der
Grundversorgung. Rot = teuer = größtes Wechselargument. Die Liste „Teuerste Orte“ führt
direkt zu den lohnendsten Gebieten.

Es gibt **keine Beispiel- oder Demowerte** mehr: Auf der Karte steht nur, was wirklich
auf einem Preisblatt steht. Ältere Datenbanken werden beim Start automatisch von den
früheren Demowerten bereinigt.

### Preise eintragen – ohne Schnittstelle

Eine kostenlose Schnittstelle mit Grundversorgungstarifen gibt es nicht (Anbieter wie
ene't oder Verivox verkaufen sie als Webservice). Jeder Grundversorger muss seine Preise
aber gut auffindbar im Internet veröffentlichen (§ 36 EnWG). Die App macht das Abtippen
so kurz wie möglich – alles direkt auf der **Energiekarte** (nur Teamleitung):

**Einzeln** – „Preis eintragen“, ein grauer Punkt auf der Karte oder „Eintragen“ in der
Liste „Noch ohne Preis“:

- PLZ, Ort und ein Namensvorschlag für den Grundversorger sind bei Orten aus den eigenen
  Gebieten schon ausgefüllt; zwei Links suchen das Preisblatt für Strom und Gas.
- Arbeitspreis (ct/kWh) und Grundpreis abtippen, brutto. Steht der Grundpreis pro Jahr
  auf dem Blatt, auf „Jahr“ umschalten – die App rechnet selbst um.
- Schon beim Tippen erscheint die Bewertung („sehr teuer, +157 € ggü. Bundesschnitt“) –
  ein Tippfehler wie „385“ statt „38,5“ fällt so sofort auf.
- „Gültig ab“ und der Link zum Preisblatt sind optional, aber der Beleg, falls an der Tür
  jemand nachfragt.

**Viele Orte auf einmal** – „Tabelle“:

1. **Vorlage herunterladen** (CSV): enthält alle Orte eurer Gebiete ohne Preis – PLZ, Ort
   und Namensvorschlag stehen schon drin – und alle bereits eingetragenen Orte.
2. In Excel oder Google Tabellen die Preise ergänzen. Zeilen ohne Preis werden
   übersprungen; es muss nicht alles auf einmal gefüllt sein.
3. Alle Zellen kopieren und einfügen (oder die CSV-Datei wählen). Die Vorschau zeigt vor
   dem Speichern, welche Orte neu sind, welche ersetzt werden und welche Zeile einen
   Fehler hat.

Die Tabelle darf auch selbst gebaut sein: Spalten werden am Namen erkannt („PLZ“,
„Arbeitspreis Strom“, „Grundpreis Gas pro Jahr“, `strom_ct_kwh` …), Komma oder Punkt als
Dezimaltrennzeichen, Tabulator, Semikolon oder Komma als Trenner. Ohne Kopfzeile gilt die
Spaltenfolge der Vorlage. Excel-typische Eigenheiten (PLZ `1067` statt `01067`, ANSI-Umlaute)
werden ausgeglichen.

**Gepflegt halten:** Ein Tipp auf einen Ort zeigt alle Werte samt Preisblatt-Link, mit
„Bearbeiten“ und „Löschen“. Nach einem halben Jahr steht „prüfen“ daneben – Grundversorger
ändern ihre Preise meist ein- bis zweimal im Jahr. Die Vorlage taugt zugleich als Sicherung
aller Preise.

Die Lage eines Ortes bestimmt die App selbst: Mitte des eigenen Gebiets mit derselben PLZ,
sonst die mitgelieferte Städteliste (`src/lib/energy/cities.ts`, rund 90 Städte mit
Grundversorger-Vorschlag), sonst die Ortssuche. Ein Ort ohne bekannte Lage gilt trotzdem
für Gebiete mit dieser PLZ, erscheint aber nicht als Punkt auf der Karte.

### Grundversorger je Gebiet

Überall, wo ein Gebiet auftaucht, stehen Name und Preis des Grundversorgers mit einer
**Bewertung in fünf Stufen** (sehr günstig · günstig · mittel · teuer · sehr teuer):

- **Übersicht:** eigener Abschnitt mit dem Gebiet, dessen Grundversorger am teuersten ist
- **Gebietsliste** und **Gebietsseite** (dort mit Strom und Gas, Jahreskosten und
  Abstand zum Bundesschnitt; fehlt der Preis, führt „Preis vom Preisblatt eintragen“
  direkt ins vorausgefüllte Formular auf der Energiekarte)
- **Klinken:** unter der Straßenauswahl, damit das Argument an der Tür parat ist

Zugeordnet wird über die PLZ des Gebiets, sonst über den Ortsnamen, sonst über den nächsten
eingetragenen Ort (bis 30 km) oder die PLZ-Region – dann steht dabei, aus welchem Ort der
Preis stammt.

**Bewertung:** gemessen am Bundesdurchschnitt der Grundversorgung (voreingestellt Stand
September 2026: Strom 37,3 ct/kWh + 13,76 €/Monat, Gas 13,6 ct/kWh; unter Einstellungen →
Grundversorger-Preise änderbar). Ab 3 % darüber „teuer“, ab 8 % „sehr teuer“,
entsprechend nach unten. Eine Rangfolge der eingetragenen Orte untereinander wäre bei
wenigen Orten nichtssagend – einer wäre immer „sehr teuer“.

### Optional: Tagesquelle

Wer doch eine Quelle mit Preisen hat – einen Export des Tarifdatenanbieters oder eine
**als CSV veröffentlichte Google-Tabelle** (Datei → Freigeben → Im Web veröffentlichen →
CSV) –, kann sie zusätzlich täglich abrufen lassen. Selbst eingetragene Preise gehen ihr
immer vor.

```bash
ENERGY_FEED_MODE=csv                       # csv | json – leer = keine Tagesquelle
ENERGY_FEED_URL=https://…/grundversorger.csv
ENERGY_FEED_TOKEN=…                        # optional, wird als Bearer-Token gesendet
ENERGY_FEED_LABEL=Mein Tarifdatenanbieter  # Anzeigename in der App
```

Erwartete Spalten (deutsche oder englische Namen, Groß-/Kleinschreibung egal, Komma oder
Punkt als Dezimaltrennzeichen):

| Spalte | Pflicht | Beispiel |
|---|---|---|
| `plz` / `postal_code` | ✅ | `44135` |
| `ort` / `city` | – | `Dortmund` |
| `versorger` / `provider` | – | `DEW21` |
| `strom_ct_kwh` | – | `38,45` |
| `strom_grundpreis_eur` (pro Jahr) | – | `142,80` |
| `gas_ct_kwh` | – | `12,10` |
| `gas_grundpreis_eur` (pro Jahr) | – | `178,00` |
| `lat`, `lng` | – | `51.5136`, `7.4653` |
| `gueltig_ab` / `valid_from` | – | `2026-09-17` |

Fehlen `lat`/`lng`, ergänzt die App die Koordinate aus der Städteliste; Zeilen ohne
zuordenbare Koordinate werden übersprungen.

Mit eingerichteter Quelle ruft die App sie beim Start und danach täglich selbst ab.
Alternativ per Cron:

```bash
# 1) Cron auf dem Server (App muss nicht laufen)
0 5 * * *  cd /pfad/zur/app && npm run energy:refresh

# 2) HTTP-Aufruf, z. B. aus einem Cron-Dienst
curl -X POST https://deine-app.de/api/energy/refresh \
     -H "Authorization: Bearer $ENERGY_REFRESH_TOKEN"

# 3) Von Hand: auf der Energiekarte über den Abruf-Knopf oben rechts (nur Teamleitung)
```

Jeder Lauf wird protokolliert; Quelle, Zeitpunkt und Ergebnis stehen unter
Einstellungen → „Tagesquelle der Energiekarte“.

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

Für Schrift und Symbole in den Tonfarben gibt es eigene Stufen (`--tint`, `--ok-ink`,
`--danger-ink`, `--warn-ink` in `globals.css`): hell entsprechen sie den 600er-Stufen, im
Dunkelmodus werden sie aufgehellt, damit Verweise und Plaketten lesbar bleiben.

Die Diagrammfarben (`--chart-doors`, `--chart-sales`) und die Farben der Teilgebiete
(`--plot-1` bis `--plot-4`) sind auf Farbfehlsichtigkeit geprüft – jedes Paar gegen jedes,
hell und dunkel. Wer sie austauscht, sollte den Abstand der Farben zueinander prüfen;
sonst sind auf der Karte zwei Teilgebiete nicht mehr auseinanderzuhalten.

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
fly volumes create d2d_data --region fra --size 1 --yes
fly secrets set \
  SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  SEED_LEADER_EMAIL="chef@deinefirma.de" \
  SEED_LEADER_PASSWORD="EinLangesPasswort123"
fly deploy
```

Team, Teamleitung und Ablehnungsgründe legt die App beim ersten Start selbst an
(`src/lib/bootstrap.ts`). Ein Einrichtungsschritt über die Kommandozeile entfällt. Die
Preise der Energiekarte trägt die Teamleitung danach in der App ein.

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
| Hausnummern | eigene Tabelle je Straße, aus OpenStreetMap übernommen |
| Karte | OpenFreeMap über MapLibre GL; Apple Karten (MapKit JS), wenn eingerichtet; Rückfall Leaflet |
| Gebietszuschnitt | Overpass (Straßen in der Fläche), Nominatim (Ortssuche) |
| Aufteilung | k-Means auf den Straßenmitten, danach Ausgleich nach Türen |
| Login | Signiertes Session-Cookie (HMAC), Passwörter als scrypt-Hash |
| App auf dem Handy | PWA mit Manifest, Service Worker und lokaler Erfassungs-Warteschlange |
| Push-Nachrichten | Web Push (VAPID, aes128gcm) direkt mit `node:crypto`, Schlüssel selbst erzeugt |

### Struktur

```
src/
  app/
    (app)/            Bereich nach dem Login (Layout mit Navigation)
      start/          Dashboard der Teamleitung
      tour/           Türerfassung (das Herzstück)
      termine/        Vereinbarte Termine
      feed/           Abschlüsse, Beiträge, Kommentare
      vergleich/      Rangliste, eigener Platz, Direktvergleich
      profil/         Profil mit Zahlen, Abonnenten
      gebiete/        Gebiete und Straßen
      karte/          Energiekarte
      auswertung/     Zahlen
      team/           Mitarbeiterverwaltung
      einstellungen/  Ablehnungsgründe, Vergleichswert, Tarifrechner
    api/              REST-Endpunkte
    brand.css         >>> hier die Markenfarben eintragen <<<
  lib/
    db.ts             Schema und Verbindung
    auth.ts           Login, Rollen, Passwörter
    queries.ts        Datenbankabfragen für Gebiete, Türen, Termine, Zahlen
    community.ts      Datenbankabfragen für Feed, Kommentare, Abos, Profil
    ranking.ts        Rangliste, Abstand zum Nächsten, Serie, Abzeichen
    push.ts           Push-Nachrichten senden (Server)
    push-client.ts    Push ein- und ausschalten (Browser)
    appointments.ts   Terminzeiten, Vorschläge, Beschriftung
    doors.ts          Türstatus: offen, Wiedervorlage, fertig, gesperrt
    energy/           Preise, Bewertung, Tabellen-Import, Städteliste, Tagesquelle
    geo/              Flächenberechnung, Aufteilung, OpenStreetMap-Abfragen
    offline-queue.ts  Puffer für Türeinträge ohne Netz
  components/         UI-Bausteine, Diagramme, Navigation
    map/              Kartenschicht: OpenFreeMap (MapLibre), Apple Karten, OSM-Rückfall
public/
  manifest.webmanifest, sw.js, offline.html, App-Icons
docs/
  IPHONE-IPAD.md      Installation auf dem Handy und App-Store-Weg
scripts/
  seed.ts             Ersteinrichtung
  refresh-energy.ts   Abruf der (optionalen) Tagesquelle für Cron
```

### Befehle

```bash
npm run dev             # Entwicklung
npm run build           # Produktionsbuild
npm run start           # Produktionsserver
npm run typecheck       # TypeScript prüfen
npm run db:seed         # Datenbank einrichten
npm run energy:refresh  # Tagesquelle abrufen (falls eingerichtet)
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
  und die Nutzungsbedingungen des Anbieters beachten. Dasselbe gilt für die Straßensuche
  (`OVERPASS_URL`) und die Ortssuche (`NOMINATIM_URL`).
- Der Server muss `OVERPASS_URL` und `NOMINATIM_URL` erreichen können. Ist das gesperrt,
  funktioniert alles weiter – die Straßen werden dann von Hand eingetragen.
- Bei Plattformen ohne dauerhaften Dateispeicher (z. B. Vercel) ist SQLite nicht die
  richtige Wahl – dort ein Volume einbinden (Fly.io, Railway, eigener Server) oder das
  Schema auf Postgres portieren. Die Abfragen liegen gebündelt in `src/lib/queries.ts`
  und `src/lib/community.ts`.
- Für Push-Nachrichten muss der Server die Push-Dienste der Browser erreichen
  (`web.push.apple.com`, `fcm.googleapis.com`, `updates.push.services.mozilla.com`,
  `*.notify.windows.com`). Die VAPID-Schlüssel liegen in der Datenbank – mit dem
  Backup sind sie also gesichert.

## Datenschutz

Die App speichert **personenbezogene Daten**, sobald an der Tür etwas zustande kommt:

- **Türeinträge** hängen an der Hausnummer bzw. am Namen des Klingelschilds.
- **Termine** speichern Name und Rufnummer des Ansprechpartners.

Kundendaten zum Vertrag, Unterschrift und Widerrufsbelehrung entstehen dagegen im
Tarifrechner des Partners – diese App nimmt sie bewusst nicht auf. Für das, was hier liegt,
braucht es trotzdem eine Rechtsgrundlage, eine Information der Kundschaft und eine
Löschfrist; das gehört mit dem eigenen Datenschutzbeauftragten abgestimmt. Die App gibt
keine Frist vor und löscht nichts von selbst.

**Vergleich, Feed und Profil** machen die Leistung jedes Einzelnen im Team sichtbar:
Abschlüsse, Quoten und Platz sieht jeder, der angemeldet ist – im Vertrieb also auch die
Zahlen der Kollegen. Das ist eine Leistungsauswertung von Beschäftigten und gehört vor dem
Einsatz mit dem Betriebsrat bzw. den Beschäftigten abgestimmt. Kundendaten tauchen dort
nicht auf: ein Abschluss im Feed nennt Produkt und Gebiet, keine Adresse und keinen Namen.
Für Push-Nachrichten speichert die App je Gerät die Adresse beim Push-Dienst des
Browsers; beim Ausschalten wird sie gelöscht.

Ohne Netz liegen wartende Einträge **auf dem Gerät** im lokalen Speicher des Browsers, bis
sie gesendet sind. Geräte des Außendienstes gehören deshalb gesperrt und im Verlustfall
gelöscht.

Wird beim Erfassen die Standortfreigabe erteilt, wird zusätzlich die Position des
Erfassenden gespeichert – das ist eine Mitarbeiterortung und gehört mit dem Betriebsrat
bzw. den Beschäftigten abgestimmt. Wer das nicht möchte: in
`src/app/(app)/tour/TourClient.tsx` den `navigator.geolocation`-Block entfernen.

Ein erkennbares Verbot („Keine Werbung“, „Für Vertreter verboten“) und ein ausdrückliches
„kein Interesse“ sind bindend: dafür gibt es die Sperre, die serverseitig auch beim
Nachsenden greift.

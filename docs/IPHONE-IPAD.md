# Die App auf iPhone und iPad

Es gibt zwei Wege. Der erste ist heute machbar, der zweite dauert Wochen.

| | Home-Bildschirm (PWA) | App Store |
|---|---|---|
| Dauer bis einsatzbereit | **heute** | 2–4 Wochen |
| Apple-Entwicklerkonto nötig | nein | ja, 99 $/Jahr |
| Mac mit Xcode nötig | nein | ja |
| Eigenes Symbol auf dem Bildschirm | ja | ja |
| Vollbild ohne Browserleiste | ja | ja |
| Offline-Erfassung | ja | ja |
| Push-Benachrichtigungen | eingeschränkt (ab iOS 16.4, nur installiert) | voll |
| Verteilung | Link verschicken | über den Store |
| Risiko einer Ablehnung | keins | real, siehe unten |

**Empfehlung für ein internes Vertriebsteam: Weg 1.** Der App Store ist für
Apps gedacht, die die Allgemeinheit herunterlädt – nicht für ein Werkzeug, das
nur die eigenen zehn oder zwanzig Leute benutzen.

---

## Weg 1 – Heute: auf den Home-Bildschirm

### Schritt 1: App ins Netz stellen

Sie braucht eine erreichbare HTTPS-Adresse. Ohne HTTPS gibt es kein
App-Verhalten auf dem iPhone – Apple verlangt es.

Beispiel mit [Fly.io](https://fly.io) (Kreditkarte nötig, kleine App kostet
ein paar Euro im Monat):

```bash
# einmalig: Fly-Kommandozeile installieren und anmelden
curl -L https://fly.io/install.sh | sh
fly auth signup      # oder: fly auth login

cd d2d-app

# App anlegen – "d2d-app" durch einen freien Namen ersetzen
# und denselben Namen oben in fly.toml eintragen
fly apps create d2d-app

# Dauerhaften Speicher für die Datenbank anlegen (1 GB reicht weit)
fly volumes create d2d_data --region fra --size 1

# Geheimnisse setzen
fly secrets set SESSION_SECRET="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")"
fly secrets set ENERGY_REFRESH_TOKEN="$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"

# Starten
fly deploy

# Datenbank einrichten (legt die erste Teamleitung an)
fly ssh console -C "npx tsx scripts/seed.ts"
```

Danach läuft die App unter `https://d2d-app.fly.dev`.

> **Wichtig:** Die Datenbank ist SQLite und verträgt nur **eine** laufende
> Maschine. `min_machines_running = 1` in `fly.toml` bitte so lassen und nicht
> mit `fly scale count 2` hochskalieren – sonst gibt es zwei getrennte
> Datenbestände.

Andere Anbieter gehen genauso, solange sie dauerhaften Dateispeicher bieten:
Railway, Render, Hetzner mit Docker, ein eigener Server. **Vercel und Netlify
funktionieren nicht**, weil dort das Dateisystem nach jedem Aufruf verworfen
wird und die SQLite-Datei damit verschwindet.

### Schritt 2: Auf dem iPhone installieren

1. Die Adresse **in Safari** öffnen (nicht Chrome – nur Safari darf auf iOS
   installieren)
2. Anmelden
3. Unten auf das **Teilen-Symbol** tippen (Quadrat mit Pfeil nach oben)
4. In der Liste nach unten scrollen zu **„Zum Home-Bildschirm“**
5. Oben rechts auf **„Hinzufügen“**

Auf dem iPad liegt das Teilen-Symbol oben rechts, sonst identisch.

Die App zeigt diese Anleitung beim ersten Öffnen selbst an, du musst sie dem
Team also nicht erklären – nur den Link schicken.

### Was das Team danach hat

- Eigenes Symbol auf dem Bildschirm, kein Safari drumherum
- Start direkt in der Türerfassung
- **Erfassung ohne Netz**: Im Treppenhaus oder Keller wird jeder Tap auf dem
  Gerät gespeichert und automatisch nachgesendet, sobald wieder Empfang da ist.
  Ein Banner zeigt, wie viele Einträge warten.
- Kein Zoom beim Doppeltippen, kein Gummiband-Scrollen – fühlt sich an wie eine App

---

## Weg 2 – Später: in den App Store

### Was du brauchst

1. **Apple Developer Program**, 99 $ pro Jahr.
   Freischaltung dauert in der Regel 24–48 Stunden, bei Firmenkonten mit
   D-U-N-S-Nummer auch mal ein bis zwei Wochen.
2. **Einen Mac** mit Xcode. Ohne Mac lässt sich keine iOS-App bauen und
   hochladen – das ist eine harte Vorgabe von Apple.
3. **App-Review**: nach dem Hochladen prüft Apple die App, meist 1–3 Tage,
   bei Rückfragen länger.

Realistisch: **2 bis 4 Wochen**, nicht heute.

### Die ehrliche Warnung

Apple lehnt Apps ab, die im Kern nur eine Webseite in einer Hülle sind
(Richtlinie **4.2 – Minimum Functionality**). Genau das wäre diese App, weil sie
serverseitig rendert. Möglichkeiten:

- **Apple Business Manager / Custom Apps**: der richtige Weg für ein internes
  Firmenwerkzeug. Die App wird nicht öffentlich gelistet, sondern nur an die
  eigene Organisation ausgeliefert. Die 4.2-Regel wird hier deutlich lockerer
  gehandhabt.
- **Apple Developer Enterprise Program**: Verteilung komplett an Apple vorbei,
  kostet 299 $ im Jahr und setzt ein Unternehmen mit mindestens 100
  Mitarbeitenden voraus.
- **Öffentlicher App Store**: nur sinnvoll, wenn echte Gerätefunktionen
  dazukommen, die der Browser nicht kann – Hintergrund-Standort, Push,
  Kamera-Scan der Zählernummer, Offline-Karten.

### Wenn es trotzdem der Store sein soll

Die Konfiguration liegt schon im Projekt (`capacitor.config.json`) – dort zuerst unter
`server.url` die eigene Adresse eintragen. Dann auf einem Mac:

```bash
npm install -D @capacitor/cli
npm install @capacitor/core @capacitor/ios

# Die iOS-Hülle erzeugen
npx cap add ios

# Konfiguration in die iOS-Huelle uebernehmen
npx cap sync ios

# In Xcode öffnen, signieren, hochladen
npx cap open ios
```

In Xcode dann: Team auswählen, Bundle Identifier setzen
(`de.energiepartner24.vertrieb` ist ein Vorschlag, muss eindeutig sein),
Version setzen, **Product → Archive**, hochladen zu App Store Connect.

Zusätzlich verlangt Apple:
- App-Symbol in allen Größen (liegt als `public/icon.svg` bereit)
- Screenshots für iPhone 6,7″ und iPad 12,9″
- Datenschutzerklärung unter einer öffentlich erreichbaren Adresse
- Ausgefülltes Formular „App Privacy“ – die App erhebt Standortdaten der
  Mitarbeitenden, das muss dort angegeben werden
- Einen Testzugang für die Prüfer, sonst kommen sie nicht an der Anmeldung vorbei

---

## Häufige Stolpersteine

**„Zum Home-Bildschirm“ fehlt im Menü**
Die Seite wurde nicht in Safari geöffnet. In Chrome oder Firefox auf iOS gibt es
den Eintrag nicht.

**Die App startet trotzdem mit Adressleiste**
Meist wurde das Symbol angelegt, bevor die Seite fertig geladen war. Symbol
löschen, Seite neu laden, noch einmal hinzufügen.

**Nach dem Abmelden ist man wieder drin**
Das Sitzungs-Cookie hält 30 Tage – gewollt, damit sich niemand täglich neu
anmelden muss. Wer das anders will, ändert `MAX_AGE_SECONDS` in
`src/lib/auth.ts`.

**Gepufferte Einträge verschwinden**
Sie liegen im Speicher des Browsers. Wird der Safari-Verlauf samt Websitedaten
gelöscht, sind sie weg. Deshalb: bei schlechtem Empfang das Team bitten, die App
kurz zu öffnen, sobald wieder Netz da ist – dann wird sofort nachgesendet.

**Der Tarifrechner öffnet sich nicht**
In der installierten App öffnet der Link in Safari. Ist das unerwünscht,
lässt sich in `src/app/(app)/tour/TourClient.tsx` in `handleSale` auf
`window.location.href` umstellen – dann bleibt alles in der App, der Rückweg
ist dann aber nur über das Zurückwischen.

# Website carlssonsales.de

Statische Seiten (HTML, eine kleine `kontakt.js`, lokale Schriften) – lassen sich
bei jedem Webhoster hochladen. Das Kontaktformular schickt an das Backend der
d2d-App: `POST /api/public/inquiries`. Dort landen die Anfragen im Posteingang
**Anfragen** (Profil › Anfragen bzw. Seitenleiste).

## Einrichten

1. **Adresse der App eintragen** – in `index.html` an zwei Stellen:
   - `action="https://d2d-app.fly.dev/api/public/inquiries"` am Formular
   - `connect-src` und `form-action` in der Content-Security-Policy aller Seiten
     (`index.html`, `impressum.html`, `datenschutz.html`, `danke.html`, `fehler.html`)
2. **In der App die Website freigeben** – Umgebungsvariable setzen, z. B. bei Fly.io:
   ```bash
   fly secrets set INQUIRY_ALLOWED_ORIGINS="https://carlssonsales.de,https://www.carlssonsales.de"
   ```
   Ohne diesen Eintrag lehnt die App jede Absendung von der Website ab (403).
3. **Hochladen** – alle Dateien dieses Ordners inklusive `.htaccess` in das
   Wurzelverzeichnis des Webspace.
4. **Datenschutzerklärung prüfen** – Abschnitt 3 beschreibt das Formular; die
   Platzhalter in eckigen Klammern (Hoster, Name, Ort) ausfüllen.

## Was die Website selbst absichert

- Content-Security-Policy: Skripte nur von der eigenen Domain, Daten gehen nur an die App
- `kontakt.js` setzt Meldungen nur als Text (kein `innerHTML`)
- Honigtopf-Feld und Ausfüllzeit gegen Formular-Roboter
- `.htaccess`: HTTPS-Zwang, HSTS, kein Einbetten in fremde Seiten, keine Verzeichnislisten
- ohne JavaScript funktioniert das Formular trotzdem (Weiterleitung auf `danke.html` / `fehler.html`)

Alle eigentlichen Prüfungen macht der Server – siehe README der App, Abschnitt
„Anfragen von der Website“.

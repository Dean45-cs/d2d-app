#!/bin/sh
set -e

DB_PATH="${DATABASE_PATH:-/data/d2d.db}"
DB_DIR="$(dirname "$DB_PATH")"
mkdir -p "$DB_DIR"

# Hosting-Anbieter hängen dauerhafte Laufwerke als root ein. Damit die App
# unter ihrem eigenen Nutzer schreiben darf, wird der Ordner beim Start
# übereignet und anschließend auf den unprivilegierten Nutzer gewechselt.
if [ "$(id -u)" = "0" ]; then
  chown -R 1001:1001 "$DB_DIR"

  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=1001 --regid=1001 --clear-groups node server.js
  fi
  if command -v su-exec >/dev/null 2>&1; then
    exec su-exec 1001:1001 node server.js
  fi
  if command -v gosu >/dev/null 2>&1; then
    exec gosu 1001:1001 node server.js
  fi

  echo "[Start] Hinweis: Kein Werkzeug zum Nutzerwechsel gefunden – der Server läuft als root." >&2
fi

exec node server.js

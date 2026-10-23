import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Erzeugt beim Build einen eigenständigen Server-Ordner (.next/standalone),
  // der ohne node_modules auskommt - das macht das Docker-Image klein.
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
  // Kein Entwickler-Knopf ueber der Reiterleiste.
  devIndicators: false,

  experimental: {
    /*
     * Im Treppenhaus reisst die Verbindung oft gerade dann ab, wenn die App
     * nach dem Speichern die Seite nachlaedt. Ohne diese Einstellung laedt
     * Next.js dann die ganze Seite neu - die Tuer ist weg, und ohne Netz
     * erscheint nur "Keine Verbindung". So wartet der Router stattdessen auf
     * Empfang und laedt danach nach.
     */
    useOffline: true,
  },

  /*
   * Grundschutz fuer jede Antwort: nicht in fremde Seiten einbetten (gegen
   * untergeschobene Klicks), Dateitypen nicht raten, keine vollen Adressen
   * an fremde Seiten weitergeben, nur HTTPS. Standort darf nur die App
   * selbst abfragen, Kamera und Mikrofon niemand.
   */
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(self)" },
          { key: "Strict-Transport-Security", value: "max-age=31536000" },
        ],
      },
    ];
  },

  /*
   * Alte Adressen aus Lesezeichen und Push-Nachrichten fuehren an ihren
   * neuen Platz. Die Suchparameter (Zeitraum, Kennzahl, Ansicht) bleiben
   * erhalten. Bewusst nicht dauerhaft (307), damit Browser nichts fuer
   * immer festschreiben.
   */
  async redirects() {
    return [
      { source: "/mehr", destination: "/profil", permanent: false },
      { source: "/feed", destination: "/team", permanent: false },
      { source: "/feed/:id", destination: "/team/beitrag/:id", permanent: false },
      { source: "/vergleich", destination: "/team/rangliste", permanent: false },
      { source: "/level", destination: "/team/erfolge", permanent: false },
      { source: "/auswertung", destination: "/start", permanent: false },
      { source: "/einladungen", destination: "/einstellungen/einladungen", permanent: false },
      { source: "/berechtigungen", destination: "/einstellungen/rechte", permanent: false },
      { source: "/einstellungen", destination: "/profil", permanent: false },
    ];
  },
};

export default nextConfig;

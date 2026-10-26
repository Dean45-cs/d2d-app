import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";
import { PowerMode } from "@/components/PowerSave";
import { POWER_SCRIPT } from "@/lib/power";
import { PREFS_SCRIPT } from "@/lib/preferences";
import { PrefsSync } from "@/components/PrefsSync";

export const metadata: Metadata = {
  title: { default: "Carlsson Sales", template: "%s · Carlsson Sales" },
  description: "Gebiete, Türerfassung und Energiepreise für den Haustürvertrieb von Strom und Gas.",
  manifest: "/manifest.webmanifest",
  applicationName: "Carlsson Sales",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Startet vom Home-Bildschirm ohne Safari-Leisten. "default": die
  // Statusleiste nimmt die Hintergrundfarbe (theme-color) an und bleibt in
  // Hell und Dunkel lesbar.
  appleWebApp: {
    capable: true,
    title: "Carlsson",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
  other: {
    // Aeltere iOS-Versionen starten ohne Safari-Leisten nur mit diesem Tag.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Inhalt bis unter Notch und Home-Indikator; Abstaende per env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f2f2f7" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    // Energiesparmodus und Einstellungen (Farbe, Hell/Dunkel, Textgroesse ...)
    // setzen ihre Merkmale schon vor React (POWER_SCRIPT, PREFS_SCRIPT).
    <html lang="de" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: POWER_SCRIPT + PREFS_SCRIPT }} />
        {children}
        <ServiceWorker />
        <PowerMode />
        <PrefsSync />
      </body>
    </html>
  );
}

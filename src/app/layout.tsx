import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorker } from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: "Energie Partner 24 · Vertrieb",
  description:
    "Gebietsplanung, Tür-Tracking und Energiekarte für den Door-to-Door-Vertrieb von Strom und Gas.",
  manifest: "/manifest.webmanifest",
  applicationName: "EP24 Vertrieb",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  // Sorgt dafür, dass die App vom Home-Bildschirm ohne Safari-Leisten startet.
  appleWebApp: {
    capable: true,
    title: "EP24 Vertrieb",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
  other: {
    // Next.js setzt nur das neuere "mobile-web-app-capable". Ältere iOS-Versionen
    // starten die App ohne Safari-Leisten nur mit diesem Tag.
    "apple-mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // Blendet den Inhalt bis unter Notch und Home-Indicator; die Abstände
  // setzen wir selbst über env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: "#0c2f56",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}

/**
 * Bildmarke und Schriftzug von Energie Partner 24.
 * Soll das echte Logo verwendet werden: Datei nach public/logo.svg legen und
 * hier durch <img src="/logo.svg" alt="Energie Partner 24" /> ersetzen.
 */
export function Logo({
  size = 32,
  tagline = "Vertrieb",
}: {
  size?: number;
  /** Zweite Zeile unter dem Namen; leer = nur der Name. */
  tagline?: string;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className="leading-tight">
        <span className="block text-[15px] font-bold tracking-[-0.015em]">
          Energie Partner <span className="text-energy-400">24</span>
        </span>
        {tagline && (
          <span className="block text-[11.5px] font-medium opacity-60">{tagline}</span>
        )}
      </span>
    </span>
  );
}

/**
 * Nur die Bildmarke - fuer enge Stellen.
 *
 * Der Verlauf sitzt als CSS-Hintergrund auf dem Kaestchen und nicht als
 * SVG-Verlauf: der braucht eine ID, und steht dieselbe ID zweimal auf der
 * Seite (Seitenleiste und Kopfzeile), zeichnet der Browser die zweite Marke
 * ohne Farbe, sobald die erste ausgeblendet ist.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <span
      className="inline-grid shrink-0 place-items-center"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.25,
        background: "linear-gradient(135deg, var(--energy-400), var(--brand-500))",
      }}
      role="img"
      aria-label="Energie Partner 24"
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="12 7 24 34" aria-hidden>
        <path d="M26.8 9 15 26.4h8.2L21.2 39 33 21.6h-8.2L26.8 9Z" fill="#fff" />
      </svg>
    </span>
  );
}

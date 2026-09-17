/**
 * Platzhalter-Logo im Stil von Energie Partner 24.
 * Soll das echte Logo verwendet werden: Datei nach public/logo.svg legen und
 * hier durch <img src="/logo.svg" alt="Energie Partner 24" /> ersetzen.
 */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        role="img"
        aria-label="Energie Partner 24"
      >
        <defs>
          <linearGradient id="epGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--energy-400)" />
            <stop offset="100%" stopColor="var(--brand-500)" />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="12" fill="url(#epGrad)" />
        <path
          d="M26.8 9 15 26.4h8.2L21.2 39 33 21.6h-8.2L26.8 9Z"
          fill="#fff"
        />
      </svg>
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">
          Energie Partner <span className="text-energy-400">24</span>
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
          Vertriebsportal
        </span>
      </span>
    </span>
  );
}

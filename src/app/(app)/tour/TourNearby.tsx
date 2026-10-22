"use client";

import { IconNavigate, IconPin, IconX } from "@/components/icons";

/**
 * Hinweis, wenn man weit weg von der gewaehlten Tuer steht - etwa nach der
 * Fahrt ins Gebiet, wenn die App noch bei der Strasse von gestern ist. Ein
 * Tipp stellt die naechste offene Tuer ein (liegt sie in einem Gebiet, das
 * erst laden muss, dessen naechste Strasse), der Pfeil fuehrt zu Fuss hin.
 */
export function TourNearby({
  place,
  distance,
  context,
  route,
  onGo,
  onDismiss,
}: {
  /** "Lindenstraße 14" */
  place: string;
  /** "80 m", "ca. 120 m" */
  distance: string;
  /** Anderes Gebiet als das gewaehlte - dann steht sein Name dabei. */
  context: string | null;
  /** Fussweg in der Karten-App - ohne bekannte Lage keiner. */
  route: string | null;
  onGo: () => void;
  onDismiss: () => void;
}) {
  const caption = ["Nächste offene Tür", distance, context].filter(Boolean).join(" · ");
  return (
    // Kein Live-Bereich: die Entfernung aendert sich im Gehen staendig.
    <section className="cell rounded-xl bg-surface pr-2" aria-label="Nächste offene Tür">
      <button
        type="button"
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg text-left"
        onClick={onGo}
        aria-label={`${place}, ${distance}${context ? `, ${context}` : ""} – dorthin wechseln`}
      >
        <span className="glyph glyph-round">
          <IconPin className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-caption text-muted">{caption}</span>
          <span className="block truncate text-subhead font-semibold">{place}</span>
        </span>
      </button>
      {route && (
        <a
          href={route}
          target="_blank"
          rel="noreferrer"
          className="icon-btn icon-btn-fill shrink-0"
          aria-label={`Route zu ${place}`}
        >
          <IconNavigate className="h-5 w-5" />
        </a>
      )}
      <button type="button" className="icon-btn shrink-0" onClick={onDismiss} aria-label="Hinweis ausblenden">
        <IconX className="h-5 w-5" />
      </button>
    </section>
  );
}

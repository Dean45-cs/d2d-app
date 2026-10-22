"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconChevronLeft } from "./icons";

/**
 * Kopf einer Seite im Stil von iOS: oben eine Leiste mit Zurueck und
 * Aktionen, darunter der grosse Titel. Rollt der Titel aus dem Bild, wird
 * die Leiste zu Glas und zeigt ihn klein in der Mitte.
 *
 * Kein Erklaertext: der Untertitel sagt nur, was gerade gilt (Datum,
 * Anzahl, Zeitraum).
 */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  children,
  hideLargeTitle = false,
}: {
  /** Text; beim Laden auch ein Platzhalter (SkeletonHeader). */
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * Ruecksprung links oben, etwa "Gebiete". mobileOnly: die Seite steht ab
   * dem iPad selbst in der Seitenleiste - dort waere "zurueck" irrefuehrend.
   */
  back?: { href: string; label: string; mobileOnly?: boolean };
  /** Zeichen-Knoepfe rechts oben (Neu, Menue, Filter). */
  actions?: ReactNode;
  /** Steht unter dem Titel - etwa eine Segmentleiste. */
  children?: ReactNode;
  /** Nur die Leiste - fuer Seiten, deren Inhalt selbst der Titel ist. */
  hideLargeTitle?: boolean;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [stuck, setStuck] = useState(hideLargeTitle);

  useEffect(() => {
    if (hideLargeTitle) return;
    const node = titleRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting),
      // Die Leiste ist 44 pt hoch: verschwindet der Titel darunter, ist er weg.
      { rootMargin: "-52px 0px 0px 0px", threshold: 0 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hideLargeTitle]);

  return (
    <>
      <div className="toolbar" data-stuck={stuck}>
        <div className="grid h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
          <div className="flex min-w-0 items-center">
            {back && (
              <Link
                href={back.href}
                className={`-ml-2 flex min-h-11 min-w-0 items-center gap-1 rounded-full pr-2 text-body text-accent-ink ${
                  back.mobileOnly ? "md:hidden" : ""
                }`}
              >
                <IconChevronLeft className="h-5 w-5 shrink-0" />
                <span className="truncate">{back.label}</span>
              </Link>
            )}
          </div>
          <p className="toolbar-title max-w-[60vw] truncate text-center text-headline" aria-hidden={!stuck}>
            {title}
          </p>
          <div className="-mr-2 flex min-w-0 items-center justify-end gap-1">{actions}</div>
        </div>
      </div>
      {hideLargeTitle ? (
        <h1 className="sr-only">{title}</h1>
      ) : (
        <header className="pb-4 pt-1">
          <h1 ref={titleRef} className="text-large-title">
            {title}
          </h1>
          {subtitle && <p className="mt-1 text-subhead text-muted">{subtitle}</p>}
          {children && <div className="mt-4">{children}</div>}
        </header>
      )}
    </>
  );
}

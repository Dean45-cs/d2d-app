"use client";

import { useMemo } from "react";
import { qrPath } from "@/lib/qr";

/**
 * QR-Code als SVG. Immer schwarz auf weiss, auch im Dunkelmodus: helle Codes
 * auf dunklem Grund lesen viele Kamera-Apps nicht. Gerechnet wird im Geraet -
 * so steht der Code auch im Treppenhaus ohne Netz.
 */
export function QrCode({ value, size = 232, label }: { value: string; size?: number; label: string }) {
  const qr = useMemo(() => (value ? qrPath(value) : null), [value]);
  if (!qr) {
    return <span className="skeleton block rounded-xl" style={{ width: size, height: size }} aria-hidden="true" />;
  }
  return (
    <svg
      viewBox={`0 0 ${qr.size} ${qr.size}`}
      width={size}
      height={size}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      className="block rounded-xl"
    >
      <rect width={qr.size} height={qr.size} fill="#fff" />
      <path d={qr.path} fill="#000" />
    </svg>
  );
}

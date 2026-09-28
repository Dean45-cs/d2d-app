"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Kurze Rueckmeldung am unteren Rand, die von selbst verschwindet - dieselbe
 * Form wie nach einem Eintrag an der Tuer.
 *
 *   const { show, toast } = useToast();
 *   show("Abonniert");
 *   return <>{...}{toast}</>;
 */
export function useToast() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    if (!text) return;
    const timer = setTimeout(() => setText(null), 3600);
    return () => clearTimeout(timer);
  }, [text]);

  const show = useCallback((message: string) => setText(message), []);

  const toast = text ? (
    <div
      className="glass fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 mx-auto w-fit max-w-[92vw] rounded-[var(--r-lg)] border px-4 py-2.5 text-center text-[13px] font-semibold md:bottom-8"
      style={{
        borderColor: "var(--line)",
        boxShadow: "var(--shadow-3)",
        animation: "toast-up .32s var(--ease-spring) both",
      }}
      role="status"
    >
      {text}
    </div>
  ) : null;

  return { show, toast };
}

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { IconCheck } from "./icons";
import { toastDuration } from "@/lib/preferences";

export interface ToastOptions {
  /** Ein Knopf im Toast - etwa "Rückgängig". */
  action?: { label: string; onClick: () => void };
  /** "result": volles gruenes Haekchen - nur fuer einen Abschluss. */
  tone?: "neutral" | "result";
  icon?: ReactNode;
  /** Anzeigedauer in ms; mit Aktion laenger. */
  duration?: number;
}

interface ToastState extends ToastOptions {
  id: number;
  text: string;
}

const ToastContext = createContext<(text: string, options?: ToastOptions) => void>(() => {});

/**
 * Eine Stelle fuer alle kurzen Rueckmeldungen der App: ein Toast aus Glas
 * ueber der Reiterleiste, der von selbst verschwindet und nie etwas
 * blockiert. Ein neuer ersetzt den alten.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const counter = useRef(0);

  const show = useCallback((text: string, options: ToastOptions = {}) => {
    counter.current += 1;
    setToast({ id: counter.current, text, ...options });
  }, []);

  useEffect(() => {
    if (!toast) return;
    // Kurz, normal oder lang - Einstellungen -> Mitteilungen.
    const duration = toastDuration(toast.duration ?? (toast.action ? 5200 : 2800));
    const timer = window.setTimeout(() => setToast(null), duration);
    return () => window.clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div aria-live="polite" aria-atomic="true">
        {toast && (
          <div key={toast.id} className="toast" role="status" onClick={() => !toast.action && setToast(null)}>
            {toast.tone === "result" ? (
              <span className="glyph glyph-result glyph-round glyph-sm check-pop">
                <IconCheck className="h-3.5 w-3.5" />
              </span>
            ) : (
              toast.icon && <span className="shrink-0 text-ink-2">{toast.icon}</span>
            )}
            <span className="min-w-0 py-1 text-subhead font-semibold">{toast.text}</span>
            {toast.action ? (
              <button
                type="button"
                className="btn btn-primary btn-sm shrink-0"
                onClick={(event) => {
                  event.stopPropagation();
                  toast.action?.onClick();
                  setToast(null);
                }}
              >
                {toast.action.label}
              </button>
            ) : (
              <span className="w-2" aria-hidden="true" />
            )}
          </div>
        )}
      </div>
    </ToastContext.Provider>
  );
}

/** const toast = useToast(); toast("Gespeichert"); */
export function useToast() {
  const show = useContext(ToastContext);
  return useMemo(() => show, [show]);
}

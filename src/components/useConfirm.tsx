"use client";

import { useCallback, useState, type ReactNode } from "react";
import { Sheet } from "./Sheet";

export interface ConfirmOptions {
  title: string;
  text?: ReactNode;
  /** Beschriftung des Knopfs, der bestaetigt - ein Verb, kein "OK". */
  confirmLabel: string;
  /** Rot, wenn etwas verloren geht. */
  danger?: boolean;
}

/**
 * Rueckfrage im Stil der App - nur fuer Dinge, die sich nicht rueckgaengig
 * machen lassen (Loeschen, Deaktivieren). Alles andere bekommt einen
 * Toast mit "Rückgängig".
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: "Straße entfernen?", confirmLabel: "Entfernen", danger: true }))) return;
 */
export function useConfirm() {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) => new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const settle = useCallback((ok: boolean) => {
    setPending((current) => {
      current?.resolve(ok);
      return null;
    });
  }, []);
  const cancel = useCallback(() => settle(false), [settle]);

  const dialog = pending ? (
    <Sheet title={pending.options.title} subtitle={pending.options.text} onClose={cancel}>
      <div className="grid gap-2 pt-2">
        <button
          type="button"
          className={`btn btn-lg btn-block ${pending.options.danger ? "btn-danger" : "btn-primary"}`}
          onClick={() => settle(true)}
          autoFocus
        >
          {pending.options.confirmLabel}
        </button>
        <button type="button" className="btn btn-lg btn-block btn-secondary" onClick={cancel}>
          Abbrechen
        </button>
      </div>
    </Sheet>
  ) : null;

  return { confirm, dialog };
}

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
 * Rueckfrage im Stil der App statt des grauen Browser-Dialogs.
 *
 *   const { confirm, dialog } = useConfirm();
 *   if (!(await confirm({ title: "Straße entfernen?", confirmLabel: "Entfernen", danger: true }))) return;
 *   ...
 *   return <>{...}{dialog}</>;
 */
export function useConfirm() {
  const [pending, setPending] = useState<{
    options: ConfirmOptions;
    resolve: (ok: boolean) => void;
  } | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setPending({ options, resolve })),
    [],
  );

  const settle = useCallback(
    (ok: boolean) => {
      setPending((current) => {
        current?.resolve(ok);
        return null;
      });
    },
    [],
  );
  const cancel = useCallback(() => settle(false), [settle]);

  const dialog = pending ? (
    <Sheet title={pending.options.title} onClose={cancel}>
      {pending.options.text && (
        <p className="muted text-[14px] leading-snug">{pending.options.text}</p>
      )}
      <div className="mt-5 grid grid-cols-2 gap-2">
        <button type="button" className="btn btn-ghost" onClick={cancel}>
          Abbrechen
        </button>
        <button
          type="button"
          className={`btn ${pending.options.danger ? "btn-danger" : "btn-primary"}`}
          onClick={() => settle(true)}
          autoFocus
        >
          {pending.options.confirmLabel}
        </button>
      </div>
    </Sheet>
  ) : null;

  return { confirm, dialog };
}

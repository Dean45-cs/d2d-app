"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { Avatar, Note } from "@/components/ui";
import { fileToAvatar } from "@/lib/avatar";

const MAX_BIO = 160;

/** "Profil bearbeiten" wie bei Twitter: Bild und ein Satz ueber sich. */
export function ProfileEditor({
  name,
  avatar: initialAvatar,
  bio: initialBio,
}: {
  name: string;
  avatar: string;
  bio: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState(initialAvatar);
  const [bio, setBio] = useState(initialBio);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function start() {
    setAvatar(initialAvatar);
    setBio(initialBio);
    setError(null);
    setOpen(true);
  }

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      setAvatar(await fileToAvatar(file));
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : "Bild nicht lesbar.");
    } finally {
      setBusy(false);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        // Das Bild nur mitschicken, wenn es sich geaendert hat - es ist der dicke Teil.
        body: JSON.stringify({ bio, ...(avatar !== initialAvatar ? { avatar } : {}) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error ?? "Speichern fehlgeschlagen.");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Keine Verbindung – bitte gleich noch einmal versuchen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-ghost btn-pill btn-sm" onClick={start}>
        Profil bearbeiten
      </button>
      {open && (
        <Sheet
          title="Profil bearbeiten"
          onClose={() => setOpen(false)}
          footer={
            <div className="space-y-2">
              {error && <Note tone="danger">{error}</Note>}
              <div className="grid grid-cols-2 gap-2">
                <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                  Abbrechen
                </button>
                <button type="submit" form="profile-edit" className="btn btn-primary" disabled={busy}>
                  {busy ? "Speichern …" : "Speichern"}
                </button>
              </div>
            </div>
          }
        >
          <form id="profile-edit" onSubmit={save} className="space-y-4 pb-1">
            <div className="inset flex items-center gap-3 p-3">
              <Avatar name={name} src={avatar} size={60} loading={busy && !avatar} />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold">Profilbild</p>
                <p className="muted text-[12px] leading-snug">Steht im Feed, im Vergleich und an der Tür.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-1">
                <label className="btn btn-ghost btn-sm btn-pill cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void pick(e.target.files?.[0])}
                  />
                  {avatar ? "Ändern" : "Wählen"}
                </label>
                {avatar && (
                  <button type="button" className="btn btn-plain btn-sm btn-pill" onClick={() => setAvatar("")}>
                    Entfernen
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="label" htmlFor="profile-bio">
                Über mich
              </label>
              <textarea
                id="profile-bio"
                className="textarea resize-none"
                rows={3}
                maxLength={MAX_BIO}
                placeholder="z. B. „Seit 2024 im Team · Spezialist für Mehrfamilienhäuser · Ziel: 30 im Monat“"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
              <p className="muted mt-1 text-right text-[12px] tabular-nums">
                {bio.length}/{MAX_BIO}
              </p>
            </div>
          </form>
        </Sheet>
      )}
    </>
  );
}

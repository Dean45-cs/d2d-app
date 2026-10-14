"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Sheet } from "@/components/Sheet";
import { useToast } from "@/components/Toast";
import { Avatar, InlineError } from "@/components/ui";
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
  const toast = useToast();
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
      toast("Profil gespeichert");
      router.refresh();
    } catch {
      setError("Keine Verbindung.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="btn btn-secondary btn-sm" onClick={start}>
        Bearbeiten
      </button>
      {open && (
        <Sheet
          title="Profil bearbeiten"
          onClose={() => setOpen(false)}
          footer={
            <div className="space-y-3">
              {error && <InlineError>{error}</InlineError>}
              <button type="submit" form="profile-edit" className="btn btn-primary btn-lg btn-block" disabled={busy}>
                {busy ? "Speichern …" : "Speichern"}
              </button>
            </div>
          }
        >
          <form id="profile-edit" onSubmit={save}>
            <div className="flex flex-col items-center gap-3 py-2">
              <Avatar name={name} src={avatar} size={88} loading={busy && !avatar} />
              <div className="flex gap-2">
                <label className="btn btn-secondary btn-sm cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) => void pick(e.target.files?.[0])}
                  />
                  {avatar ? "Bild ändern" : "Bild wählen"}
                </label>
                {avatar && (
                  <button type="button" className="btn btn-plain btn-sm" onClick={() => setAvatar("")}>
                    Entfernen
                  </button>
                )}
              </div>
            </div>

            <label className="label mt-4" htmlFor="profile-bio">
              Über mich
            </label>
            <textarea
              id="profile-bio"
              className="field resize-none"
              rows={3}
              maxLength={MAX_BIO}
              placeholder="Optional"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
            <p className="mt-1 px-1 text-right text-footnote text-muted">
              {bio.length}/{MAX_BIO}
            </p>
          </form>
        </Sheet>
      )}
    </>
  );
}

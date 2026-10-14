import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { EmptyState } from "@/components/ui";
import { IconLink } from "@/components/icons";
import { publicInvitation } from "@/lib/invitations";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Einladung · Carlsson Sales",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/**
 * Oeffentliche Seite hinter einem Einladungslink - ausserhalb der App-Schale.
 * Wer hier landet, hat noch kein Konto: Marke, wer einlaedt, ein Formular.
 */
export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = publicInvitation(token);
  return (
    <main className="min-h-dvh bg-bg px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3rem,env(safe-area-inset-top))]">
      <div className="mx-auto w-full max-w-md">
        <Logo size={40} className="mb-8" />
        {invitation ? (
          <>
            <h1 className="text-large-title">Einladung</h1>
            <p className="mb-8 mt-1 text-subhead text-muted">
              {invitation.inviter_name} · {invitation.team_name}
            </p>
            <JoinForm token={token} />
          </>
        ) : (
          <EmptyState
            boxed
            icon={<IconLink className="h-6 w-6" />}
            title="Link nicht mehr gültig"
            text="Abgelaufen, schon benutzt oder zurückgezogen."
          />
        )}
        <p className="mt-8 text-center">
          <Link href="/login" className="link min-h-11">
            Zur Anmeldung
          </Link>
        </p>
      </div>
    </main>
  );
}

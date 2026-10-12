import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { publicInvitation } from "@/lib/invitations";
import { JoinForm } from "./JoinForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Einladung · EP24", robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function InvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invitation = publicInvitation(token);
  return <main className="min-h-dvh bg-[var(--surface)]">
    <header className="bg-brand-900 p-5 text-white"><Logo size={34} /></header>
    <section className="mx-auto max-w-md px-5 py-12">
      <h1 className="text-2xl font-bold">{invitation ? "Du bist eingeladen" : "Link nicht verfügbar"}</h1>
      {invitation ? <>
        <p className="muted mb-6 mt-3">{invitation.inviter_name} lädt dich zu {invitation.team_name} ein. Nach deiner Registrierung prüft die direkte Führungskraft des Einladenden deinen Beitritt.</p>
        <JoinForm token={token} />
      </> : <p className="muted my-5">Dieser Link ist abgelaufen, bereits verwendet oder nicht mehr aktiv. Bitte die einladende Person um einen neuen Link.</p>}
      <Link href="/login" className="link mt-6 inline-flex">Zur Anmeldung</Link>
    </section>
  </main>;
}

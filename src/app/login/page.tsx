import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { hasPermission } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { LogoMark } from "@/components/Logo";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(hasPermission(user, "reports.team") ? "/start" : "/tour");

  return (
    <main className="brand-backdrop flex min-h-dvh flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(48px,env(safe-area-inset-top))]">
      <section className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <LogoMark size={80} className="brand-mark" />
          <h1 className="mt-6 text-title-1">
            Carlsson <span className="font-normal text-ink-2">Sales</span>
          </h1>
          <p className="mt-1 text-subhead text-muted">Melde dich mit deinem Team-Zugang an.</p>
        </div>
        <LoginForm />
        <p className="mt-6 text-center text-footnote text-muted">Zugang gibt’s bei deiner Teamleitung.</p>
      </section>
      <p className="text-center text-caption text-muted">© {new Date().getFullYear()} Carlsson Sales</p>
    </main>
  );
}

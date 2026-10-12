import { hasPermission } from "@/lib/permissions";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(hasPermission(user, "reports.team") ? "/start" : "/tour");

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--surface)]">
      <header className="border-b border-white/10 bg-brand-900 px-5 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-white md:px-8">
        <Logo size={34} />
      </header>

      <section className="flex flex-1 items-start justify-center px-5 py-12 sm:items-center sm:py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-[26px] font-bold">Anmelden</h1>
          <p className="muted mt-2 text-[14px]">Zugang für den Außendienst von Energie Partner 24.</p>

          <div className="mt-7">
            <LoginForm />
          </div>

          <p className="muted mt-6 border-t border-[var(--line)] pt-5 text-[13px]">
            Zugangsdaten erhältst du von deiner Teamleitung.
          </p>
        </div>
      </section>

      <footer className="muted px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center text-[12px]">
        © {new Date().getFullYear()} Energie Partner 24
      </footer>
    </main>
  );
}

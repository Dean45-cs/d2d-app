import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "LEADER" ? "/start" : "/tour");

  return (
    <main className="min-h-dvh bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950 px-5 py-10 text-white">
      <div className="mx-auto flex min-h-[80dvh] max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <Logo size={44} />
          </div>
          <h1 className="text-2xl font-bold">Anmelden</h1>
          <p className="mt-1 text-sm text-white/65">
            Gebiete, Tür-Tracking und Energiekarte für Strom &amp; Gas
          </p>
        </div>

        <div className="rounded-2xl bg-white/95 p-6 text-slate-900 shadow-2xl backdrop-blur dark:bg-slate-900/95 dark:text-slate-100">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
          Zugangsdaten bekommst du von deiner Teamleitung.
        </p>
      </div>
    </main>
  );
}

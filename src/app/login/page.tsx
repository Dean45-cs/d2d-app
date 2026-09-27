import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "./LoginForm";
import { Logo } from "@/components/Logo";
import { IconBolt, IconDoor, IconMap } from "@/components/icons";

export const dynamic = "force-dynamic";

const FEATURES = [
  { icon: IconMap, title: "Gebiete", text: "Auf der Karte abstecken, Straßen und Hausnummern kommen von selbst." },
  { icon: IconDoor, title: "Türen", text: "Mit einem Daumen erfassen – auch ohne Empfang im Treppenhaus." },
  { icon: IconBolt, title: "Grundversorger", text: "Sehen, wo der Wechsel sich am meisten lohnt." },
];

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect(user.role === "LEADER" ? "/start" : "/tour");

  return (
    <main className="flex min-h-dvh flex-col bg-[var(--surface)] lg:flex-row">
      {/* ------------------------------ Marke ------------------------------ */}
      <section className="relative overflow-hidden bg-brand-900 px-6 pb-10 pt-[max(2.5rem,env(safe-area-inset-top))] text-white lg:flex lg:w-[46%] lg:flex-col lg:justify-between lg:px-14 lg:py-12">
        {/* Weicher Lichtschein hinter der Marke */}
        <div
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-40 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--brand-500), transparent 70%)" }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, var(--energy-500), transparent 70%)" }}
          aria-hidden
        />

        <div className="relative">
          <Logo size={40} />
        </div>

        <div className="relative mt-10 hidden max-w-md lg:block">
          <h1 className="text-[34px] font-bold leading-[1.15] tracking-[-0.025em]">
            Der Vertrieb an der Haustür, an einem Ort.
          </h1>
          <ul className="mt-10 space-y-6">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex gap-4">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--r-sm)] bg-white/10 text-energy-300">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold">{title}</span>
                  <span className="block text-[14px] leading-snug text-white/65">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative mt-10 hidden text-[12px] text-white/40 lg:block">
          © {new Date().getFullYear()} Energie Partner 24
        </p>
      </section>

      {/* ----------------------------- Formular ---------------------------- */}
      <section className="relative -mt-5 flex flex-1 items-start justify-center rounded-t-[var(--r-xl)] bg-[var(--surface)] px-5 pb-10 pt-8 lg:mt-0 lg:items-center lg:rounded-none lg:px-10">
        <div className="w-full max-w-sm">
          <h2 className="text-[26px] font-bold tracking-[-0.02em]">Anmelden</h2>
          <p className="muted mt-1 text-[14px]">Mit deiner E-Mail-Adresse und deinem Passwort.</p>

          <div className="mt-7">
            <LoginForm />
          </div>

          <p className="muted mt-8 text-center text-[13px]">
            Noch keinen Zugang? Den legt deine Teamleitung für dich an.
          </p>
        </div>
      </section>
    </main>
  );
}

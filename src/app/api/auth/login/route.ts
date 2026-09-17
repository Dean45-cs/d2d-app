import { NextResponse } from "next/server";
import { authenticate, startSession } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "");
  const password = String(body.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Bitte E-Mail und Passwort eingeben." },
      { status: 400 },
    );
  }

  const user = authenticate(email, password);
  if (!user) {
    return NextResponse.json(
      { error: "E-Mail oder Passwort stimmt nicht." },
      { status: 401 },
    );
  }

  await startSession(user.id);
  return NextResponse.json({
    ok: true,
    redirect: user.role === "LEADER" ? "/start" : "/tour",
  });
}

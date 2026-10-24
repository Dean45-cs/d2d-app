import { hasPermission } from "@/lib/permissions";
import { NextResponse } from "next/server";
import { authenticate, startSession } from "@/lib/auth";
import {
  clientAddress,
  loginBlockedFor,
  recordLoginFailure,
  recordLoginSuccess,
  retryText,
} from "@/lib/login-throttle";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email ?? "");
  const password = String(body?.password ?? "");

  if (!email || !password) {
    return NextResponse.json(
      { error: "Bitte E-Mail und Passwort eingeben." },
      { status: 400 },
    );
  }

  // Zu viele Fehlversuche: gar nicht erst pruefen - auch nicht das richtige Passwort.
  const attempt = { email, client: clientAddress(request.headers) };
  const wait = loginBlockedFor(attempt);
  if (wait > 0) {
    return NextResponse.json(
      { error: `Zu viele Fehlversuche. Bitte ${retryText(wait)} erneut versuchen.` },
      { status: 429, headers: { "retry-after": String(Math.ceil(wait / 1000)) } },
    );
  }

  const user = authenticate(email, password);
  if (!user) {
    recordLoginFailure(attempt);
    return NextResponse.json(
      { error: "E-Mail oder Passwort stimmt nicht." },
      { status: 401 },
    );
  }

  recordLoginSuccess(attempt);
  await startSession(user.id);
  return NextResponse.json({
    ok: true,
    redirect: hasPermission(user, "reports.team") ? "/start" : "/tour",
  });
}

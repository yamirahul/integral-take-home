import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth";
import { SESSION_COOKIE_NAME, SESSION_MAX_AGE_SECONDS, sessionCookieOptions, signSession } from "@/lib/session";

// POST /api/auth/login — the only place a session cookie gets created.
// Body: { email: string, password: string, expectedRole: "PATIENT" | "REVIEWER" }
//
// `expectedRole` comes from which tab the user picked on the login page (see
// src/app/page.tsx — the sign-in form lives at "/"). It's checked AFTER credentials,
// so it never becomes an
// enumeration vector — by the time we tell someone "this account is a Reviewer," they've
// already proven they own the password. Its purpose is UX (catching "I clicked the wrong
// tab"), not a security boundary: the account's real role always comes from the DB and is
// what actually gets signed into the session cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const expectedRole = body?.expectedRole === "REVIEWER" ? "REVIEWER" : "PATIENT";

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });

  // Same generic error whether the email doesn't exist or the password is wrong — telling
  // an attacker which one failed would let them enumerate valid emails.
  if (!user || !verifyPassword(password, user.password)) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }

  if (user.role !== expectedRole) {
    const actualRoleLabel = user.role === "PATIENT" ? "Patient" : "Reviewer";
    return NextResponse.json(
      { error: `This account is registered as a ${actualRoleLabel}. Switch tabs and try again.` },
      { status: 401 }
    );
  }

  const session = await signSession({ userId: user.id, role: user.role });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, session, {
    ...sessionCookieOptions(),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  // Return the safe subset of the user (never the password hash) so the client can
  // redirect based on role without a follow-up /api/auth/me round trip.
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    organization: user.organization,
  });
}

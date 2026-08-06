import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/session";

// POST /api/auth/logout — clears the session cookie. There's no server-side session
// record to invalidate (see the note in src/lib/session.ts), so this only logs the
// current browser out, not "everywhere."
export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}

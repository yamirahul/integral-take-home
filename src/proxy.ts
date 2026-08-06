// Route guard: runs before every matched request (see `config.matcher` below), before any
// page or API route handler executes. This is the single place that decides "is this
// request allowed to reach /intake or /queue" — putting it here means a new route under
// those paths is protected automatically, instead of relying on every page remembering to
// check auth itself.
//
// Named `proxy.ts` (not `middleware.ts`) per Next.js 16's renamed convention — same
// mechanism, new file/export name: https://nextjs.org/docs/messages/middleware-to-proxy
//
// Reads the session cookie directly (via src/lib/session.ts, Web Crypto only) rather than
// calling src/lib/current-user.ts — that file imports Prisma, which we deliberately keep
// out of this file's Edge bundle. The role embedded in the signed cookie is enough to
// make the PATIENT-vs-REVIEWER routing decision without a DB round trip.

import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

const PATIENT_HOME = "/intake";
const REVIEWER_HOME = "/queue";

export async function proxy(request: NextRequest) {
  const session = await verifySession(request.cookies.get(SESSION_COOKIE_NAME)?.value);
  const { pathname } = request.nextUrl;

  // /documents is the patient's supporting-document library (Goal 3) — same gating as
  // /intake, both are patient-only pages.
  const isPatientRoute = pathname.startsWith("/intake") || pathname.startsWith("/documents");
  const isReviewerRoute = pathname.startsWith("/queue");

  // Not signed in and hitting a protected route -> bounce to "/" (the sign-in page).
  if (!session && (isPatientRoute || isReviewerRoute)) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Signed in but wrong role for this route -> send them to their own home instead of
  // a confusing 403. (e.g. a Reviewer manually navigating to /intake.)
  if (session && isPatientRoute && session.role !== "PATIENT") {
    return NextResponse.redirect(new URL(REVIEWER_HOME, request.url));
  }
  if (session && isReviewerRoute && session.role !== "REVIEWER") {
    return NextResponse.redirect(new URL(PATIENT_HOME, request.url));
  }

  // Already signed in and revisiting "/" -> skip straight past the sign-in form to
  // their home page.
  if (session && pathname === "/") {
    return NextResponse.redirect(new URL(session.role === "PATIENT" ? PATIENT_HOME : REVIEWER_HOME, request.url));
  }

  return NextResponse.next();
}

// Only run this (and pay the cookie-verification cost) on the routes that actually need
// gating, not on every static asset request.
export const config = {
  matcher: ["/", "/intake/:path*", "/documents/:path*", "/queue/:path*"],
};

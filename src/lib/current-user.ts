// "Who's logged in" for Server Components and Route Handlers (Node.js runtime only).
//
// Deliberately kept separate from src/lib/session.ts: this file imports Prisma, and
// src/middleware.ts (Edge runtime) imports session.ts directly. Keeping the Prisma import
// out of session.ts means middleware's bundle never has a reason to pull in Prisma.

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/session";

// Looks up the full current-user row from the DB via the session cookie. Returns null if
// there's no cookie, the cookie fails signature verification, or the user it names was
// deleted after the cookie was issued. Never returns the password hash.
export async function getCurrentUser() {
  const cookieStore = await cookies();
  const session = await verifySession(cookieStore.get(SESSION_COOKIE_NAME)?.value);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      organization: true,
      createdAt: true,
      updatedAt: true,
      // password intentionally omitted
    },
  });

  return user;
}

// Shared query for "which intakes can this user see" — used by both GET /api/intakes
// (src/app/api/intakes/route.ts) and the /intake Server Component (which queries Prisma
// directly for its initial render instead of round-tripping through its own API route).
// Keeping this in one place means the PATIENT-vs-REVIEWER scoping rule can't drift
// between the two call sites.

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function listIntakesForUser(user: { id: string; role: Role }) {
  return prisma.intake.findMany({
    where: user.role === "PATIENT" ? { submittedById: user.id } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      submittedBy: { select: { id: true, name: true, email: true } },
      reviewer: { select: { id: true, name: true } },
    },
  });
}

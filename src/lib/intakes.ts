// Shared queries for "which intakes can this user see" — used by GET /api/intakes,
// the /intake Server Component, and the /queue Server Component (which all query Prisma
// directly for their initial render instead of round-tripping through their own API
// route). Keeping this in one place means the PATIENT-vs-REVIEWER scoping rule can't
// drift between call sites.
//
// Both queries below deliberately `select` a safe field set — clientName, clientEmail,
// status, timestamps, who submitted/is reviewing it — and never ssn, clientPhone,
// dateOfBirth, description, or notes. Neither the Review Queue table nor a patient's own
// "Your Applications" list has ever needed those fields, so they were never fetched, let
// alone sent over the wire. The privileged/redacted toggle Goal 5 owes the *detail* view
// is a separate, dedicated fetch (only it needs the sensitive fields at all) — see
// src/app/queue/[id]/page.tsx.

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const SAFE_INTAKE_SELECT = {
  id: true,
  status: true,
  clientName: true,
  clientEmail: true,
  createdAt: true,
  updatedAt: true,
  submittedById: true,
  reviewerId: true,
  submittedBy: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

export async function listIntakesForUser(user: { id: string; role: Role }) {
  return prisma.intake.findMany({
    where: user.role === "PATIENT" ? { submittedById: user.id } : undefined,
    orderBy: { createdAt: "desc" },
    select: SAFE_INTAKE_SELECT,
  });
}

// Single-intake fetch for the same safe field set — powers src/app/queue/[id]/page.tsx's
// placeholder detail view. Returns null if the intake doesn't exist OR (for a Patient)
// isn't theirs, so callers can 404 either case identically.
export async function getSafeIntakeById(id: string, user: { id: string; role: Role }) {
  return prisma.intake.findFirst({
    where: user.role === "PATIENT" ? { id, submittedById: user.id } : { id },
    select: SAFE_INTAKE_SELECT,
  });
}

// Shared queries for "which intakes can this user see" — used by GET /api/intakes,
// GET /api/intakes/[id], and the /intake, /queue, and /queue/[id] Server Components
// (which query Prisma directly for their initial render instead of round-tripping
// through their own API route). Keeping this in one place means the PATIENT-vs-REVIEWER
// scoping rule can't drift between call sites.

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { redactSsn, redactPhone, redactDateOfBirth } from "@/lib/redact";

// Deliberately excludes ssn, clientPhone, dateOfBirth, description, and notes. Neither
// the Review Queue table nor a patient's own "Your Applications" list has ever needed
// those fields, so they're never fetched for a *list*, let alone sent over the wire.
// getIntakeDetail() below is the one place those fields get requested at all.
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

const FULL_INTAKE_SELECT = {
  id: true,
  status: true,
  clientName: true,
  clientEmail: true,
  clientPhone: true,
  dateOfBirth: true,
  ssn: true,
  description: true,
  notes: true,
  createdAt: true,
  updatedAt: true,
  submittedById: true,
  reviewerId: true,
  submittedBy: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true } },
} as const;

// The single-intake detail fetch — the only query in the app that ever requests ssn,
// clientPhone, dateOfBirth, description, or notes. Implements the README's Privacy
// Model directly:
//   - A Patient always gets their own data unmasked, regardless of `privileged`.
//   - A Reviewer gets the sensitive fields masked (src/lib/redact.ts) unless they pass
//     `privileged: true` — which GET /api/intakes/[id] only sets from an explicit
//     `?view=privileged` request, never as a page-load default. See that route for why:
//     the server should never send unmasked PII except in direct response to asking for
//     it, so it's the one place worth an audit log entry.
// Returns null if the intake doesn't exist OR (for a Patient) isn't theirs, so callers
// can 404 either case identically without revealing which.
export async function getIntakeDetail(
  id: string,
  user: { id: string; role: Role },
  { privileged }: { privileged: boolean }
) {
  const intake = await prisma.intake.findFirst({
    where: user.role === "PATIENT" ? { id, submittedById: user.id } : { id },
    select: FULL_INTAKE_SELECT,
  });
  if (!intake) return null;

  const isRedacted = user.role === "REVIEWER" && !privileged;
  if (!isRedacted) {
    return { ...intake, redacted: false };
  }

  return {
    ...intake,
    clientPhone: redactPhone(intake.clientPhone),
    dateOfBirth: redactDateOfBirth(intake.dateOfBirth),
    ssn: redactSsn(intake.ssn),
    redacted: true,
  };
}

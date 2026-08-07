// Shared audit log query — used by the global Audit Trail page (/queue/audit) and the
// per-application history embedded in the detail view (/queue/[id]). Same pattern as
// src/lib/intakes.ts: the Server Component queries this directly rather than round
// tripping through an API route, since this is read-only display data with no client
// mutation to support.
//
// `action` is a free-text column in the schema (not a Prisma enum), so every write site
// (POST /api/intakes, POST /api/documents(/attach), PATCH /api/intakes/[id], GET
// /api/intakes/[id]) is responsible for using one of the 5 values the README documents:
// CREATED, STATUS_CHANGED, VIEWED, ASSIGNED, DOCUMENT_UPLOADED. src/lib/audit-format.ts
// is what turns those + each entry's `details` JSON into a human-readable line.

import { prisma } from "@/lib/prisma";

export async function listAuditLogs(filter?: { intakeId?: string }) {
  return prisma.auditLog.findMany({
    where: filter?.intakeId ? { intakeId: filter.intakeId } : undefined,
    orderBy: { createdAt: "desc" },
    include: {
      user: { select: { id: true, name: true, role: true } },
      intake: { select: { id: true, clientName: true, status: true } },
    },
  });
}

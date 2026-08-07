// Client-safe formatting for audit log entries — turns the raw `action` string + JSON
// `details` blob (see src/lib/audit.ts) into a plain-English line, e.g. "Dr. Sarah Chen
// changed status from Pending to In Review." Zero Node dependencies, same reasoning as
// src/lib/format.ts: this runs in the browser (AuditLog.tsx renders it), not just on
// the server.

import { STATUS_LABEL, IntakeStatus } from "@/lib/intake-status";

export type AuditAction = "CREATED" | "STATUS_CHANGED" | "VIEWED" | "ASSIGNED" | "DOCUMENT_UPLOADED";

export interface AuditEntry {
  id: string;
  action: string;
  details: string | null;
  createdAt: string;
  user: { id: string; name: string; role: "PATIENT" | "REVIEWER" };
  intake: { id: string; clientName: string; status: IntakeStatus } | null;
}

// Every action type gets a short, fixed label for filter dropdowns and badges — the
// full sentence (below) carries the specifics.
export const ACTION_LABEL: Record<AuditAction, string> = {
  CREATED: "Submitted",
  STATUS_CHANGED: "Status Changed",
  ASSIGNED: "Assignment Changed",
  VIEWED: "Privileged View",
  DOCUMENT_UPLOADED: "Document Uploaded",
};

export const ALL_AUDIT_ACTIONS: AuditAction[] = [
  "CREATED",
  "STATUS_CHANGED",
  "ASSIGNED",
  "VIEWED",
  "DOCUMENT_UPLOADED",
];

function safeParse(details: string | null): Record<string, unknown> {
  if (!details) return {};
  try {
    const parsed = JSON.parse(details);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

// One human-readable sentence per entry. Falls back to something reasonable (the raw
// action label) rather than throwing if `details` is missing or malformed — a
// compliance log should never fail to render because one row's JSON is off.
export function describeAuditEntry(entry: AuditEntry): string {
  const details = safeParse(entry.details);
  const who = entry.user.name;

  switch (entry.action as AuditAction) {
    case "CREATED":
      return `${who} submitted the application.`;

    case "STATUS_CHANGED": {
      const from = details.from as IntakeStatus | undefined;
      const to = details.to as IntakeStatus | undefined;
      const fromLabel = from && STATUS_LABEL[from] ? STATUS_LABEL[from] : "an unknown status";
      const toLabel = to && STATUS_LABEL[to] ? STATUS_LABEL[to] : "an unknown status";
      return `${who} changed status from ${fromLabel} to ${toLabel}.`;
    }

    case "ASSIGNED":
      return details.reviewerId
        ? `${who} assigned this application to themselves.`
        : `${who} released this application.`;

    case "VIEWED":
      return `${who} viewed the privileged (unmasked) view of this application.`;

    case "DOCUMENT_UPLOADED": {
      const fileName = typeof details.fileName === "string" ? details.fileName : "a document";
      return details.reusedFrom
        ? `${who} attached "${fileName}" — reused from another application, not re-uploaded.`
        : `${who} uploaded "${fileName}".`;
    }

    default:
      return `${who} performed ${entry.action}.`;
  }
}

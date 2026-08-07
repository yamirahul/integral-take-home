// Presentational audit trail list — reused by the global Audit Trail page
// (/queue/audit) and the per-application history embedded in the detail view
// (/queue/[id]). Takes already-fetched entries as a prop rather than fetching by
// `intakeId` itself: every other page in this app fetches server-side and passes data
// down (see src/lib/audit.ts), so this follows the same pattern instead of being the one
// component that does its own client-side fetch.
//
// No "use client" here — it has no state or handlers of its own, so it stays a plain
// component whether its caller is a Server Component or (as both current callers are) an
// already-"use client" one.

import type { ReactNode } from "react";
import Link from "next/link";
import styles from "./AuditLog.module.css";
import { shortRef, formatDateTime } from "@/lib/format";
import { AuditAction, AuditEntry, describeAuditEntry } from "@/lib/audit-format";

function CreatedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M12 12v6M9 15h6" />
    </svg>
  );
}

function StatusChangedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 2l4 4-4 4" />
      <path d="M3 12v-2a4 4 0 0 1 4-4h14" />
      <path d="M7 22l-4-4 4-4" />
      <path d="M21 12v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}

function AssignedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.5-7 8-7s8 3 8 7" />
    </svg>
  );
}

function ViewedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function DocumentUploadedIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

const ACTION_ICON: Record<AuditAction, ReactNode> = {
  CREATED: <CreatedIcon />,
  STATUS_CHANGED: <StatusChangedIcon />,
  ASSIGNED: <AssignedIcon />,
  VIEWED: <ViewedIcon />,
  DOCUMENT_UPLOADED: <DocumentUploadedIcon />,
};

const ICON_CLASS: Record<AuditAction, string> = {
  CREATED: styles.iconCREATED,
  STATUS_CHANGED: styles.iconSTATUS_CHANGED,
  ASSIGNED: styles.iconASSIGNED,
  VIEWED: styles.iconVIEWED,
  DOCUMENT_UPLOADED: styles.iconDOCUMENT_UPLOADED,
};

export default function AuditLog({
  entries,
  showApplication = false,
  emptyText = "No audit activity yet.",
}: {
  entries: AuditEntry[];
  showApplication?: boolean;
  emptyText?: string;
}) {
  if (entries.length === 0) {
    return <p className={styles.emptyText}>{emptyText}</p>;
  }

  return (
    <ul className={styles.list}>
      {entries.map((entry) => {
        const action = entry.action as AuditAction;
        return (
          <li key={entry.id} className={styles.row}>
            <span className={`${styles.icon} ${ICON_CLASS[action] ?? ""}`}>
              {ACTION_ICON[action] ?? <CreatedIcon />}
            </span>
            <div className={styles.main}>
              <p className={styles.description}>{describeAuditEntry(entry)}</p>
              <p className={styles.meta}>
                {showApplication && entry.intake && (
                  <>
                    <Link href={`/queue/${entry.intake.id}`} className={styles.applicationLink}>
                      {shortRef(entry.intake.id)} · {entry.intake.clientName}
                    </Link>
                    <span>·</span>
                  </>
                )}
                <span>{formatDateTime(entry.createdAt)}</span>
                <span className={styles.roleTag}>{entry.user.role}</span>
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

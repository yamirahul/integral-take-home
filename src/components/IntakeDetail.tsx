"use client";

// Shared detail view for both /queue/[id] (Reviewer, with the privileged/redacted
// toggle) and /intake/[id] (Patient, their own data — always unmasked, no toggle; see
// the README's Privacy Model). One component, two thin page wrappers that fetch the
// initial (always-redacted-for-a-Reviewer) data server-side and supply the right
// AppHeader nav + back link.
//
// The toggle is NOT a client-side hide/show of already-loaded data — that would still
// leak the unmasked SSN into the page's HTML/RSC payload even while displaying the
// masked version. Switching to "Privileged" makes a fresh GET /api/intakes/[id]?view=
// privileged request; the server only sends unmasked fields in direct response to that
// explicit request (and logs a VIEWED audit entry when it does — see that route).

import { useState } from "react";
import Link from "next/link";
import styles from "./IntakeDetail.module.css";
import AppHeader from "./AppHeader";
import { formatFileSize, formatDateTime, shortRef } from "@/lib/format";
import { ALL_STATUSES, IntakeStatus, STATUS_LABEL } from "@/lib/intake-status";

interface NavItem {
  href: string;
  label: string;
}

interface IntakeDetailData {
  id: string;
  status: IntakeStatus;
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  dateOfBirth: string;
  ssn: string;
  description: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  reviewer: { id: string; name: string } | null;
  redacted: boolean;
}

interface DocumentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description: string | null;
  createdAt: string;
}

const BADGE_CLASS: Record<IntakeStatus, string> = {
  PENDING: styles.badgePENDING,
  IN_REVIEW: styles.badgeIN_REVIEW,
  APPROVED: styles.badgeAPPROVED,
  REJECTED: styles.badgeREJECTED,
};

// Same palette as the badges/queue stat cards (reviewer-dashboard.png): amber Pending,
// blue In Review, green Approved, red Rejected — one status vocabulary, one color
// mapping, used everywhere in the app that shows a status.
const STATUS_BUTTON_ACTIVE_CLASS: Record<IntakeStatus, string> = {
  PENDING: styles.statusButtonActivePENDING,
  IN_REVIEW: styles.statusButtonActiveIN_REVIEW,
  APPROVED: styles.statusButtonActiveAPPROVED,
  REJECTED: styles.statusButtonActiveREJECTED,
};

function LockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <rect x="4" y="11" width="16" height="9" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 7.4-2" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <path d="M21 15l-5-5L5 21" />
    </svg>
  );
}

function FileTypeIcon({ fileType }: { fileType: string }) {
  return fileType === "application/pdf" ? <PdfIcon /> : <ImageIcon />;
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

// `maskable` fields (phone, DOB, SSN) show a lock/unlock icon reflecting their current
// state — plain fields (name, email — never redacted at all) show no icon, so the icon
// only ever appears where it means something.
function PiiField({
  label,
  value,
  maskable = false,
  masked = false,
}: {
  label: string;
  value: string;
  maskable?: boolean;
  masked?: boolean;
}) {
  return (
    <div className={styles.field}>
      <div className={styles.fieldLabel}>
        {maskable && (masked ? <LockIcon /> : <UnlockIcon />)}
        {label}
      </div>
      <div className={`${styles.fieldValue} ${masked ? styles.fieldValueMasked : ""}`}>{value}</div>
    </div>
  );
}

export default function IntakeDetail({
  currentUser,
  navItems,
  backHref,
  backLabel,
  canToggle,
  canManageStatus,
  initialIntake,
  documents,
}: {
  currentUser: { name: string; role: "PATIENT" | "REVIEWER" };
  navItems: NavItem[];
  backHref: string;
  backLabel: string;
  canToggle: boolean;
  canManageStatus: boolean;
  initialIntake: IntakeDetailData;
  documents: DocumentRow[];
}) {
  const [intake, setIntake] = useState<IntakeDetailData>(initialIntake);
  const [isSwitching, setIsSwitching] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [isChangingStatus, setIsChangingStatus] = useState(false);
  const [statusError, setStatusError] = useState<string | null>(null);

  async function switchView(view: "redacted" | "privileged") {
    if ((view === "redacted") === intake.redacted) return; // already there
    setIsSwitching(true);
    setToggleError(null);
    try {
      const response = await fetch(`/api/intakes/${intake.id}?view=${view}`);
      const data = await response.json();
      if (!response.ok) {
        setToggleError(data.error ?? "Could not load that view.");
        return;
      }
      setIntake(data);
    } catch {
      setToggleError("Could not reach the server. Please try again.");
    } finally {
      setIsSwitching(false);
    }
  }

  async function handleStatusChange(status: IntakeStatus) {
    if (status === intake.status) return;
    setIsChangingStatus(true);
    setStatusError(null);
    try {
      const response = await fetch(`/api/intakes/${intake.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await response.json();
      if (!response.ok) {
        setStatusError(data.error ?? "Could not update status.");
        return;
      }
      setIntake((prev) => ({ ...prev, status: data.status }));
    } catch {
      setStatusError("Could not reach the server. Please try again.");
    } finally {
      setIsChangingStatus(false);
    }
  }

  return (
    <>
      <AppHeader user={currentUser} navItems={navItems} />
      <main className={styles.page}>
        <div className={styles.container}>
          <Link href={backHref} className={styles.backLink}>
            ← {backLabel}
          </Link>

          <div className={styles.card}>
            <div className={styles.header}>
              <div>
                <div className={styles.headerLeft}>
                  <span className={styles.refTitle}>{shortRef(intake.id)}</span>
                  <span className={`${styles.badge} ${BADGE_CLASS[intake.status]}`}>
                    {STATUS_LABEL[intake.status]}
                  </span>
                </div>
                <p className={styles.subline}>
                  {intake.clientName} · {intake.clientEmail}
                </p>
              </div>

              {canToggle && (
                <div className={styles.viewToggle} role="tablist" aria-label="Choose PII visibility">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={intake.redacted}
                    disabled={isSwitching}
                    className={`${styles.viewToggleBtn} ${intake.redacted ? styles.viewToggleBtnActiveRedacted : ""}`}
                    onClick={() => switchView("redacted")}
                  >
                    <LockIcon /> Redacted View
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!intake.redacted}
                    disabled={isSwitching}
                    className={`${styles.viewToggleBtn} ${!intake.redacted ? styles.viewToggleBtnActivePrivileged : ""}`}
                    onClick={() => switchView("privileged")}
                  >
                    <UnlockIcon /> Privileged View
                  </button>
                </div>
              )}
            </div>

            {toggleError && <p className={styles.toggleError}>{toggleError}</p>}

            {canToggle && (
              <div
                className={`${styles.viewModeBanner} ${
                  intake.redacted ? styles.viewModeBannerRedacted : styles.viewModeBannerPrivileged
                }`}
              >
                {intake.redacted ? <LockIcon /> : <UnlockIcon />}
                {intake.redacted
                  ? "Redacted view — phone, date of birth, and SSN are masked for initial screening."
                  : "Privileged view — full PII visible. This access has been recorded in the audit log."}
              </div>
            )}

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Applicant Information</h2>
              <div className={styles.fieldGrid}>
                <PiiField label="Full Name" value={intake.clientName} />
                <PiiField label="Email" value={intake.clientEmail} />
                <PiiField label="Phone Number" value={intake.clientPhone} maskable masked={intake.redacted} />
                <PiiField label="Date of Birth" value={intake.dateOfBirth} maskable masked={intake.redacted} />
                <PiiField label="Social Security Number" value={intake.ssn} maskable masked={intake.redacted} />
              </div>
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Application Details</h2>
              <div className={styles.field} style={{ marginBottom: intake.notes ? "1.1rem" : 0 }}>
                <div className={styles.fieldLabel}>Reason for Enrollment</div>
                <p className={styles.bodyText}>{intake.description}</p>
              </div>
              {intake.notes && (
                <div className={styles.field}>
                  <div className={styles.fieldLabel}>Additional Notes</div>
                  <p className={styles.bodyText}>{intake.notes}</p>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Status</h2>
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <div className={styles.fieldLabel}>Submitted</div>
                  <div className={styles.fieldValue}>{formatDateTime(intake.createdAt)}</div>
                </div>
                <div className={styles.field}>
                  <div className={styles.fieldLabel}>Reviewer</div>
                  <div className={styles.fieldValue}>{intake.reviewer?.name ?? "Unassigned"}</div>
                </div>
              </div>

              {canManageStatus && (
                <div className={styles.statusControlWrap}>
                  <div className={styles.fieldLabel}>Update Status</div>
                  {statusError && <p className={styles.toggleError}>{statusError}</p>}
                  <div className={styles.statusControl} role="radiogroup" aria-label="Application status">
                    {ALL_STATUSES.map((status) => (
                      <button
                        key={status}
                        type="button"
                        role="radio"
                        aria-checked={intake.status === status}
                        disabled={isChangingStatus || intake.status === status}
                        className={`${styles.statusButton} ${
                          intake.status === status ? STATUS_BUTTON_ACTIVE_CLASS[status] : ""
                        }`}
                        onClick={() => handleStatusChange(status)}
                      >
                        {STATUS_LABEL[status]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className={styles.section}>
              <h2 className={styles.sectionTitle}>Supporting Documents</h2>
              {documents.length === 0 ? (
                <p className={styles.emptyText}>No supporting documents uploaded.</p>
              ) : (
                documents.map((doc) => (
                  <div key={doc.id} className={styles.docRow}>
                    <div className={styles.docIcon}>
                      <FileTypeIcon fileType={doc.fileType} />
                    </div>
                    <div className={styles.docMain}>
                      <div className={styles.docName}>{doc.fileName}</div>
                      <div className={styles.docMeta}>
                        {formatFileSize(doc.fileSize)} · uploaded {formatDateTime(doc.createdAt)}
                        {doc.description ? ` · ${doc.description}` : ""}
                      </div>
                    </div>
                    <a
                      href={`/api/documents/${doc.id}/file`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.docLink}
                    >
                      <EyeIcon /> View
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

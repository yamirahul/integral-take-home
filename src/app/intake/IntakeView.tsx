"use client";

// Client component: the interactive half of /intake (form state, submission, success
// screen, and the "Your Applications" list). Split from page.tsx so the initial user +
// intakes fetch stays server-side, only the interactive bits ship JS to the browser.

import { useState, FormEvent } from "react";
import styles from "./intake.module.css";
import LogoutButton from "@/components/LogoutButton";

type IntakeStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

interface IntakeSummary {
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
}

interface FormState {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  dateOfBirth: string;
  ssn: string;
  description: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  clientName: "",
  clientEmail: "",
  clientPhone: "",
  dateOfBirth: "",
  ssn: "",
  description: "",
  notes: "",
};

const STATUS_LABEL: Record<IntakeStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

// Cosmetic short reference (mockup shows "INT-006") derived from the real cuid — the
// database's actual primary key is what everything (audit log, review actions) keys off,
// this is purely a friendlier label to show the patient.
function shortRef(id: string): string {
  return `INT-${id.slice(-6).toUpperCase()}`;
}

function StatusBadge({ status }: { status: IntakeStatus }) {
  const badgeClass = {
    PENDING: styles.badgePENDING,
    IN_REVIEW: styles.badgeIN_REVIEW,
    APPROVED: styles.badgeAPPROVED,
    REJECTED: styles.badgeREJECTED,
  }[status];

  return <span className={`${styles.badge} ${badgeClass}`}>{STATUS_LABEL[status]}</span>;
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

export default function IntakeView({
  user,
  initialIntakes,
}: {
  user: { id: string; name: string; email: string };
  initialIntakes: IntakeSummary[];
}) {
  const [view, setView] = useState<"form" | "success">("form");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [intakes, setIntakes] = useState<IntakeSummary[]>(initialIntakes);
  const [lastCreated, setLastCreated] = useState<IntakeSummary | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    // Clear that field's error as soon as the user starts fixing it, rather than making
    // them re-submit to find out it's resolved.
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function resetForm() {
    setForm(EMPTY_FORM);
    setFieldErrors({});
    setTopLevelError(null);
  }

  // "Clear Intake" (formerly "Cancel") only asks for confirmation when there's actually
  // something to lose — no point interrupting a click on an already-blank form.
  function handleClearClick() {
    const hasInput = Object.values(form).some((value) => value.trim().length > 0);
    if (hasInput) {
      setConfirmingClear(true);
    } else {
      resetForm();
    }
  }

  function confirmClear() {
    resetForm();
    setConfirmingClear(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setTopLevelError(null);
    setFieldErrors({});
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/intakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await response.json();

      if (!response.ok) {
        if (data.fieldErrors) {
          setFieldErrors(data.fieldErrors);
        } else {
          setTopLevelError(data.error ?? "Something went wrong. Please try again.");
        }
        return;
      }

      const created: IntakeSummary = data;
      setIntakes((prev) => [created, ...prev]);
      setLastCreated(created);
      setView("success");
    } catch {
      setTopLevelError("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.topBar}>
        <div>
          <div className={styles.brand}>Intake Review System</div>
          <div className={styles.userInfo}>
            Signed in as {user.name} ({user.email})
          </div>
        </div>
        <LogoutButton />
      </div>

      {view === "form" ? (
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>Submit New Intake</h1>
          <p className={styles.cardSubtitle}>
            Please provide your personal information below. All fields marked with * are required. Your
            information is encrypted and securely stored.
          </p>

          {topLevelError && <p className={styles.topLevelError}>{topLevelError}</p>}

          <form onSubmit={handleSubmit} noValidate>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="clientName">
                Full Name <span className={styles.required}>*</span>
              </label>
              <input
                id="clientName"
                className={`${styles.input} ${fieldErrors.clientName ? styles.inputInvalid : ""}`}
                placeholder="John Smith"
                value={form.clientName}
                onChange={(e) => updateField("clientName", e.target.value)}
              />
              {fieldErrors.clientName && <span className={styles.fieldError}>{fieldErrors.clientName}</span>}
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="clientEmail">
                  Email Address <span className={styles.required}>*</span>
                </label>
                <input
                  id="clientEmail"
                  type="email"
                  className={`${styles.input} ${fieldErrors.clientEmail ? styles.inputInvalid : ""}`}
                  placeholder="john@example.com"
                  value={form.clientEmail}
                  onChange={(e) => updateField("clientEmail", e.target.value)}
                />
                {fieldErrors.clientEmail && <span className={styles.fieldError}>{fieldErrors.clientEmail}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="clientPhone">
                  Phone Number <span className={styles.required}>*</span>
                </label>
                <input
                  id="clientPhone"
                  type="tel"
                  className={`${styles.input} ${fieldErrors.clientPhone ? styles.inputInvalid : ""}`}
                  placeholder="(555) 123-4567"
                  value={form.clientPhone}
                  onChange={(e) => updateField("clientPhone", e.target.value)}
                />
                {fieldErrors.clientPhone && <span className={styles.fieldError}>{fieldErrors.clientPhone}</span>}
              </div>
            </div>

            <div className={styles.formGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="ssn">
                  Social Security Number <span className={styles.required}>*</span>
                </label>
                <input
                  id="ssn"
                  className={`${styles.input} ${fieldErrors.ssn ? styles.inputInvalid : ""}`}
                  placeholder="123-45-6789"
                  value={form.ssn}
                  onChange={(e) => updateField("ssn", e.target.value)}
                />
                <span className={styles.hint}>Format: XXX-XX-XXXX</span>
                {fieldErrors.ssn && <span className={styles.fieldError}>{fieldErrors.ssn}</span>}
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="dateOfBirth">
                  Date of Birth <span className={styles.required}>*</span>
                </label>
                <input
                  id="dateOfBirth"
                  type="date"
                  className={`${styles.input} ${fieldErrors.dateOfBirth ? styles.inputInvalid : ""}`}
                  value={form.dateOfBirth}
                  onChange={(e) => updateField("dateOfBirth", e.target.value)}
                />
                {fieldErrors.dateOfBirth && <span className={styles.fieldError}>{fieldErrors.dateOfBirth}</span>}
              </div>
            </div>

            {/* Not in the mockup — the mockup predates schema.prisma's required `description`
                column ("Reason for enrollment, medical history, etc."). Per the README, the
                schema wins when it and the mockup disagree. */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="description">
                Reason for Enrollment <span className={styles.required}>*</span>
              </label>
              <textarea
                id="description"
                className={`${styles.textarea} ${fieldErrors.description ? styles.inputInvalid : ""}`}
                placeholder="Describe why you're applying — relevant medical history, referring physician, etc."
                value={form.description}
                onChange={(e) => updateField("description", e.target.value)}
              />
              {fieldErrors.description && <span className={styles.fieldError}>{fieldErrors.description}</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="notes">
                Additional Notes
              </label>
              <textarea
                id="notes"
                className={styles.textarea}
                placeholder="Any additional information you'd like to provide..."
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
              />
            </div>

            <hr className={styles.divider} />

            <div className={styles.consentBox}>
              By submitting this form, you consent to the collection and processing of your personal
              information in accordance with our privacy policy. Your data will be reviewed by authorized
              personnel only.
            </div>

            {confirmingClear ? (
              <div className={styles.confirmBar} role="alertdialog" aria-label="Confirm clearing the form">
                <p className={styles.confirmText}>Clear everything you&apos;ve entered? This can&apos;t be undone.</p>
                <div className={styles.actions}>
                  <button type="button" className={styles.cancelButton} onClick={() => setConfirmingClear(false)}>
                    Keep Editing
                  </button>
                  <button type="button" className={styles.dangerButton} onClick={confirmClear}>
                    Yes, Clear Intake
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.cancelButton}
                  disabled={isSubmitting}
                  onClick={handleClearClick}
                >
                  Clear Intake
                </button>
                <button type="submit" className={styles.submitButton} disabled={isSubmitting}>
                  {isSubmitting ? "Submitting..." : "Submit Intake"}
                </button>
              </div>
            )}
          </form>
        </div>
      ) : (
        lastCreated && (
          <div className={styles.successCard}>
            <div className={styles.successIconWrap}>
              <CheckIcon />
            </div>
            <h1 className={styles.successTitle}>Intake Submitted Successfully</h1>
            <p className={styles.successText}>
              Your intake has been received and is now pending review. You will be notified once a
              reviewer processes your submission.
            </p>
            <div className={styles.refBox}>
              <div className={styles.refLabel}>Reference Number</div>
              <div className={styles.refValue}>{shortRef(lastCreated.id)}</div>
            </div>
            <div className={styles.successActions}>
              <button
                className={styles.cancelButton}
                onClick={() => {
                  resetForm();
                  setView("form");
                }}
              >
                Submit Another
              </button>
              <button
                className={styles.submitButton}
                onClick={() => {
                  resetForm();
                  setView("form");
                }}
              >
                Back to My Applications
              </button>
            </div>
          </div>
        )
      )}

      <div className={styles.listCard}>
        <h2 className={styles.listHeader}>Your Applications</h2>
        {intakes.length === 0 ? (
          <p className={styles.listEmpty}>You haven&apos;t submitted any applications yet.</p>
        ) : (
          intakes.map((intake) => (
            <div key={intake.id} className={styles.listRow}>
              <div className={styles.listRowMain}>
                <div className={styles.listRowTitle}>{shortRef(intake.id)}</div>
                <div className={styles.listRowMeta}>
                  Submitted {new Date(intake.createdAt).toLocaleDateString()}
                </div>
              </div>
              <StatusBadge status={intake.status} />
            </div>
          ))
        )}
      </div>
    </main>
  );
}

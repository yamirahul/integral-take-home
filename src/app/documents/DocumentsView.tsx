"use client";

// Client component: upload form + the "document library" view. There's no dedicated
// per-user document library in the database — prisma/schema.prisma scopes Document to
// exactly one Intake, and the README says that model wasn't ours to redesign — so the
// library shown here is computed client-side by grouping the patient's Document rows
// (each tied to some intake) by `filePath`. Rows sharing a filePath are the same
// uploaded file reused across multiple intakes (see POST /api/documents/attach); the
// UI just presents that as one library entry with multiple "attached to" chips.

import { useMemo, useState, FormEvent } from "react";
import Link from "next/link";
import styles from "./documents.module.css";
import AppHeader from "@/components/AppHeader";
import { shortRef, formatFileSize } from "@/lib/format";
import { IntakeStatus, STATUS_LABEL } from "@/lib/intake-status";

interface IntakeOption {
  id: string;
  status: IntakeStatus;
  createdAt: string;
}

interface DocumentRow {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  description: string | null;
  createdAt: string;
  intakeId: string;
}

interface LibraryGroup {
  filePath: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  description: string | null;
  earliestCreatedAt: string;
  attachments: { documentId: string; intakeId: string }[];
}

const BADGE_CLASS: Record<IntakeStatus, string> = {
  PENDING: styles.badgePENDING,
  IN_REVIEW: styles.badgeIN_REVIEW,
  APPROVED: styles.badgeAPPROVED,
  REJECTED: styles.badgeREJECTED,
};

function groupByFile(documents: DocumentRow[]): LibraryGroup[] {
  const groups = new Map<string, LibraryGroup>();

  // `documents` arrives newest-first, so the first row seen per filePath is also the
  // most recent — used below as the representative fileName/description for the group.
  for (const doc of documents) {
    const existing = groups.get(doc.filePath);
    if (existing) {
      existing.attachments.push({ documentId: doc.id, intakeId: doc.intakeId });
      if (doc.createdAt < existing.earliestCreatedAt) existing.earliestCreatedAt = doc.createdAt;
    } else {
      groups.set(doc.filePath, {
        filePath: doc.filePath,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        description: doc.description,
        earliestCreatedAt: doc.createdAt,
        attachments: [{ documentId: doc.id, intakeId: doc.intakeId }],
      });
    }
  }

  return [...groups.values()];
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

// Shared by the upload form's "Attach to" field and the library's "Reuse for other
// applications" picker — both are "pick one or more of my applications" with the same
// select-all convenience, just backed by different state and a different candidate list
// (all of them vs. only the ones this file isn't already on).
function IntakeCheckboxList({
  intakes,
  selected,
  onToggle,
  onToggleAll,
}: {
  intakes: IntakeOption[];
  selected: Set<string>;
  onToggle: (intakeId: string) => void;
  onToggleAll: () => void;
}) {
  return (
    <>
      <label className={styles.attachPickerOption}>
        <input
          type="checkbox"
          checked={intakes.length > 0 && selected.size === intakes.length}
          onChange={onToggleAll}
        />
        <strong>Select all ({intakes.length})</strong>
      </label>
      {intakes.map((intake) => (
        <label key={intake.id} className={styles.attachPickerOption}>
          <input type="checkbox" checked={selected.has(intake.id)} onChange={() => onToggle(intake.id)} />
          {shortRef(intake.id)} — {STATUS_LABEL[intake.status]}
        </label>
      ))}
    </>
  );
}

function toggleInSet(setState: (updater: (prev: Set<string>) => Set<string>) => void, id: string) {
  setState((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });
}

function toggleAllInSet(setState: (updater: (prev: Set<string>) => Set<string>) => void, ids: string[]) {
  setState((prev) => (prev.size === ids.length ? new Set() : new Set(ids)));
}

export default function DocumentsView({
  user,
  intakes,
  initialDocuments,
}: {
  user: { id: string; name: string; email: string };
  intakes: IntakeOption[];
  initialDocuments: DocumentRow[];
}) {
  const [documents, setDocuments] = useState<DocumentRow[]>(initialDocuments);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  // Pre-select the most recent application (the old single-select default) — expandable
  // to as many as the patient wants in one upload.
  const [attachToIntakeIds, setAttachToIntakeIds] = useState<Set<string>>(
    new Set(intakes[0] ? [intakes[0].id] : [])
  );
  const [description, setDescription] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [topLevelNotice, setTopLevelNotice] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [attachPickerFor, setAttachPickerFor] = useState<string | null>(null);
  const [attachPickerTargets, setAttachPickerTargets] = useState<Set<string>>(new Set());
  const [busyGroup, setBusyGroup] = useState<string | null>(null);

  const intakeById = useMemo(() => new Map(intakes.map((i) => [i.id, i])), [intakes]);
  const libraryGroups = useMemo(() => groupByFile(documents), [documents]);

  async function handleUpload(event: FormEvent) {
    event.preventDefault();
    setFieldErrors({});
    setTopLevelError(null);
    setTopLevelNotice(null);

    if (!selectedFile) {
      setFieldErrors({ file: "Choose a file to upload." });
      return;
    }
    if (attachToIntakeIds.size === 0) {
      setFieldErrors({ intakeIds: "Choose at least one application to attach this to." });
      return;
    }

    setIsUploading(true);
    try {
      const body = new FormData();
      body.set("file", selectedFile);
      attachToIntakeIds.forEach((intakeId) => body.append("intakeIds", intakeId));
      if (description.trim()) body.set("description", description.trim());

      // No Content-Type header here on purpose — the browser sets the multipart
      // boundary itself when the body is a FormData instance.
      const response = await fetch("/api/documents", { method: "POST", body });
      const data = await response.json();

      if (!response.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        else setTopLevelError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      const createdRows: DocumentRow[] = data.created;
      setDocuments((prev) => [...createdRows, ...prev]);
      setSelectedFile(null);
      setDescription("");
      setAttachToIntakeIds(new Set(intakes[0] ? [intakes[0].id] : []));
      setTopLevelNotice(
        `"${createdRows[0]?.fileName}" uploaded and attached to ${createdRows.length} application${
          createdRows.length === 1 ? "" : "s"
        }.`
      );
      const input = document.getElementById("document-file-input") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch {
      setTopLevelError("Could not reach the server. Please try again.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAttachExisting(group: LibraryGroup) {
    if (attachPickerTargets.size === 0) return;
    setBusyGroup(group.filePath);
    setTopLevelError(null);
    try {
      const response = await fetch("/api/documents/attach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: group.attachments[0].documentId,
          intakeIds: [...attachPickerTargets],
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        setTopLevelError(data.error ?? "Could not attach that document.");
        return;
      }

      setDocuments((prev) => [...data.created, ...prev]);
      const count = data.created.length;
      setTopLevelNotice(
        count > 0
          ? `Attached to ${count} application${count === 1 ? "" : "s"}.${
              data.alreadyAttachedCount > 0 ? ` (${data.alreadyAttachedCount} already had it.)` : ""
            }`
          : "Already attached to every application you selected."
      );
      setAttachPickerFor(null);
      setAttachPickerTargets(new Set());
    } catch {
      setTopLevelError("Could not reach the server. Please try again.");
    } finally {
      setBusyGroup(null);
    }
  }

  async function handleRemoveAttachment(documentId: string, groupKey: string) {
    setBusyGroup(groupKey);
    setTopLevelError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setTopLevelError(data.error ?? "Could not remove that document.");
        return;
      }
      setDocuments((prev) => prev.filter((d) => d.id !== documentId));
    } catch {
      setTopLevelError("Could not reach the server. Please try again.");
    } finally {
      setBusyGroup(null);
    }
  }

  return (
    <main className={styles.page}>
      <AppHeader user={user} />

      {intakes.length === 0 ? (
        <div className={styles.emptyStateCard}>
          <h1 className={styles.cardTitle}>Supporting Documents</h1>
          <p className={styles.emptyStateText}>
            You&apos;ll need an enrollment application before you can upload supporting documents — every
            document is attached to one. Submit your first application, then come back here.
          </p>
          <Link href="/intake" className={styles.submitButton}>
            Submit an Application
          </Link>
        </div>
      ) : (
        <div className={styles.card}>
          <h1 className={styles.cardTitle}>Supporting Documents</h1>
          <p className={styles.cardSubtitle}>
            Upload medical records, insurance cards, prescriptions, or ID photos. Once a file is here, you
            can reuse it on any of your other applications without uploading it again.
          </p>

          {topLevelError && <p className={styles.topLevelError}>{topLevelError}</p>}
          {topLevelNotice && <p className={styles.topLevelNotice}>{topLevelNotice}</p>}

          <form onSubmit={handleUpload}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="document-file-input">
                File <span className={styles.required}>*</span>
              </label>
              <div className={`${styles.fileRow} ${selectedFile ? styles.fileRowChosen : ""}`}>
                <FileTypeIcon fileType={selectedFile?.type ?? "application/pdf"} />
                <span>{selectedFile ? selectedFile.name : "No file chosen"}</span>
              </div>
              <input
                id="document-file-input"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              />
              <span className={styles.hint}>PDF or photo (JPG, PNG, WEBP, HEIC) — up to 10MB.</span>
              {fieldErrors.file && <span className={styles.fieldError}>{fieldErrors.file}</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.label}>
                Attach to <span className={styles.required}>*</span>
              </label>
              <div className={styles.attachPicker}>
                <IntakeCheckboxList
                  intakes={intakes}
                  selected={attachToIntakeIds}
                  onToggle={(id) => toggleInSet(setAttachToIntakeIds, id)}
                  onToggleAll={() => toggleAllInSet(setAttachToIntakeIds, intakes.map((i) => i.id))}
                />
              </div>
              {fieldErrors.intakeIds && <span className={styles.fieldError}>{fieldErrors.intakeIds}</span>}
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="document-description">
                Description
              </label>
              <textarea
                id="document-description"
                className={styles.textarea}
                placeholder="e.g. Insurance card, front and back"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.submitButton} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload Document"}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={styles.libraryCard}>
        <h2 className={styles.libraryHeader}>Your Documents</h2>
        {libraryGroups.length === 0 ? (
          <p className={styles.libraryEmpty}>You haven&apos;t uploaded any documents yet.</p>
        ) : (
          libraryGroups.map((group) => {
            const attachedIntakeIds = new Set(group.attachments.map((a) => a.intakeId));
            const availableIntakes = intakes.filter((i) => !attachedIntakeIds.has(i.id));
            const isBusy = busyGroup === group.filePath;

            return (
              <div key={group.filePath} className={styles.libraryRow}>
                <div className={styles.libraryIcon}>
                  <FileTypeIcon fileType={group.fileType} />
                </div>
                <div className={styles.libraryMain}>
                  <div className={styles.libraryFileName}>{group.fileName}</div>
                  <div className={styles.libraryMeta}>
                    {formatFileSize(group.fileSize)} · uploaded {new Date(group.earliestCreatedAt).toLocaleDateString()}
                  </div>
                  {group.description && <div className={styles.libraryDescription}>{group.description}</div>}

                  <div className={styles.attachedRow}>
                    {group.attachments.map((attachment) => {
                      const intake = intakeById.get(attachment.intakeId);
                      if (!intake) return null;
                      return (
                        <span
                          key={attachment.documentId}
                          className={`${styles.attachChip} ${BADGE_CLASS[intake.status]}`}
                        >
                          {shortRef(intake.id)}
                          <button
                            type="button"
                            className={styles.attachChipRemove}
                            disabled={isBusy}
                            aria-label={`Remove from ${shortRef(intake.id)}`}
                            title={`Remove from ${shortRef(intake.id)}`}
                            onClick={() => {
                              if (window.confirm(`Remove this document from application ${shortRef(intake.id)}?`)) {
                                handleRemoveAttachment(attachment.documentId, group.filePath);
                              }
                            }}
                          >
                            ×
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  {availableIntakes.length > 0 && (
                    <div className={styles.libraryActions}>
                      <a
                        href={`/api/documents/${group.attachments[0].documentId}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.linkButton}
                      >
                        View
                      </a>
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => {
                          setAttachPickerFor((current) => (current === group.filePath ? null : group.filePath));
                          setAttachPickerTargets(new Set());
                        }}
                      >
                        Reuse for other applications
                      </button>
                    </div>
                  )}
                  {availableIntakes.length === 0 && (
                    <div className={styles.libraryActions}>
                      <a
                        href={`/api/documents/${group.attachments[0].documentId}/file`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.linkButton}
                      >
                        View
                      </a>
                    </div>
                  )}

                  {attachPickerFor === group.filePath && (
                    <div className={styles.attachPicker}>
                      <IntakeCheckboxList
                        intakes={availableIntakes}
                        selected={attachPickerTargets}
                        onToggle={(id) => toggleInSet(setAttachPickerTargets, id)}
                        onToggleAll={() => toggleAllInSet(setAttachPickerTargets, availableIntakes.map((i) => i.id))}
                      />
                      <button
                        type="button"
                        className={styles.cancelButton}
                        disabled={isBusy || attachPickerTargets.size === 0}
                        onClick={() => handleAttachExisting(group)}
                      >
                        {isBusy
                          ? "Attaching..."
                          : attachPickerTargets.size === 0
                            ? "Attach"
                            : `Attach to ${attachPickerTargets.size} application${
                                attachPickerTargets.size === 1 ? "" : "s"
                              }`}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </main>
  );
}

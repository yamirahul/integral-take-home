"use client";

// Client component: the interactive Review Queue (stat cards, search/filter, table,
// self-assign). Split from page.tsx so the initial user + intakes fetch stays
// server-side, only the interactive bits ship JS to the browser — same pattern as
// IntakeView.tsx and DocumentsView.tsx.
//
// Detail view (the "View" action) and status changes are Goal 5 and Goal 6 — this only
// wires up what Goal 4 asked for: the list itself, plus self-assignment, since that's
// explicitly part of this goal ("the reviewer can assign the intake to them").

import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./queue.module.css";
import AppHeader, { REVIEWER_NAV } from "@/components/AppHeader";
import { shortRef, formatDateTime } from "@/lib/format";
import { IntakeStatus, STATUS_LABEL } from "@/lib/intake-status";

interface QueueIntake {
  id: string;
  status: IntakeStatus;
  clientName: string;
  clientEmail: string;
  createdAt: string;
  reviewer: { id: string; name: string } | null;
}

const STATUS_FILTERS: { value: IntakeStatus | "ALL"; label: string }[] = [
  { value: "ALL", label: "All Statuses" },
  { value: "PENDING", label: "Pending" },
  { value: "IN_REVIEW", label: "In Review" },
  { value: "APPROVED", label: "Approved" },
  { value: "REJECTED", label: "Rejected" },
];

function ClockIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 6v6l4 2" />
    </svg>
  );
}

function AlertCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v5" />
      <path d="M12 16h.01" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l2.5 2.5L16 9.5" />
    </svg>
  );
}

function XCircleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.5 9.5l5 5" />
      <path d="M14.5 9.5l-5 5" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
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

function StatCard({
  icon,
  iconClass,
  label,
  count,
}: {
  icon: React.ReactNode;
  iconClass: string;
  label: string;
  count: number;
}) {
  return (
    <div className={styles.statCard}>
      <div className={`${styles.statIcon} ${iconClass}`}>{icon}</div>
      <div>
        <div className={styles.statLabel}>{label}</div>
        <div className={styles.statCount}>{count}</div>
      </div>
    </div>
  );
}

export default function QueueView({
  currentUser,
  initialIntakes,
}: {
  currentUser: { id: string; name: string };
  initialIntakes: QueueIntake[];
}) {
  const [intakes, setIntakes] = useState<QueueIntake[]>(initialIntakes);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IntakeStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const base: Record<IntakeStatus, number> = { PENDING: 0, IN_REVIEW: 0, APPROVED: 0, REJECTED: 0 };
    for (const intake of intakes) base[intake.status]++;
    return base;
  }, [intakes]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return intakes.filter((intake) => {
      if (statusFilter !== "ALL" && intake.status !== statusFilter) return false;
      if (!query) return true;
      return (
        intake.clientName.toLowerCase().includes(query) ||
        intake.clientEmail.toLowerCase().includes(query) ||
        shortRef(intake.id).toLowerCase().includes(query)
      );
    });
  }, [intakes, search, statusFilter]);

  async function handleAssign(intakeId: string, reviewerId: string | null) {
    setBusyId(intakeId);
    setTopLevelError(null);
    try {
      const response = await fetch(`/api/intakes/${intakeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewerId }),
      });
      const data = await response.json();

      if (!response.ok) {
        setTopLevelError(data.error ?? "Could not update this application.");
        return;
      }

      setIntakes((prev) =>
        prev.map((item) => (item.id === intakeId ? { ...item, reviewer: data.reviewer ?? null } : item))
      );
    } catch {
      setTopLevelError("Could not reach the server. Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AppHeader user={{ name: currentUser.name, role: "REVIEWER" }} navItems={REVIEWER_NAV} />
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Review Queue</h1>
            <p className={styles.pageSubtitle}>Manage and review client intake submissions</p>
          </div>

          {topLevelError && <p className={styles.topLevelError}>{topLevelError}</p>}

          <div className={styles.statsGrid}>
            <StatCard icon={<ClockIcon />} iconClass={styles.statIconPENDING} label="Pending" count={counts.PENDING} />
            <StatCard
              icon={<AlertCircleIcon />}
              iconClass={styles.statIconIN_REVIEW}
              label="In Review"
              count={counts.IN_REVIEW}
            />
            <StatCard
              icon={<CheckCircleIcon />}
              iconClass={styles.statIconAPPROVED}
              label="Approved"
              count={counts.APPROVED}
            />
            <StatCard
              icon={<XCircleIcon />}
              iconClass={styles.statIconREJECTED}
              label="Rejected"
              count={counts.REJECTED}
            />
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <div>
                <h2 className={styles.tableTitle}>Intake Submissions</h2>
                <p className={styles.tableSubtitle}>
                  {filtered.length} intake{filtered.length === 1 ? "" : "s"} found
                </p>
              </div>
              <div className={styles.toolbar}>
                <div className={styles.searchWrap}>
                  <span className={styles.searchIcon}>
                    <SearchIcon />
                  </span>
                  <input
                    className={styles.searchInput}
                    placeholder="Search by name, ID, or email..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className={styles.filterSelect}
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as IntakeStatus | "ALL")}
                >
                  {STATUS_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Client Name</th>
                    <th>Email</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Reviewer</th>
                    <th style={{ textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((intake) => (
                    <tr key={intake.id}>
                      <td className={styles.idCell}>{shortRef(intake.id)}</td>
                      <td className={styles.nameCell}>{intake.clientName}</td>
                      <td className={styles.emailCell}>{intake.clientEmail}</td>
                      <td className={styles.submittedCell}>{formatDateTime(intake.createdAt)}</td>
                      <td>
                        <StatusBadge status={intake.status} />
                      </td>
                      <td className={styles.reviewerCell}>
                        {intake.reviewer === null ? (
                          <>
                            <span className={styles.reviewerMuted}>— </span>
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={busyId === intake.id}
                              onClick={() => handleAssign(intake.id, currentUser.id)}
                            >
                              Assign to me
                            </button>
                          </>
                        ) : intake.reviewer.id === currentUser.id ? (
                          <>
                            <span className={styles.reviewerYou}>You</span>{" "}
                            <button
                              type="button"
                              className={styles.linkButton}
                              disabled={busyId === intake.id}
                              onClick={() => handleAssign(intake.id, null)}
                            >
                              Unassign
                            </button>
                          </>
                        ) : (
                          intake.reviewer.name
                        )}
                      </td>
                      <td className={styles.actionsCell}>
                        <Link href={`/queue/${intake.id}`} className={styles.viewLink}>
                          <EyeIcon /> View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <div className={styles.emptyState}>No applications match your search.</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}

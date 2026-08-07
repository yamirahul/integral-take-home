"use client";

// Client component: search + action-type filter over the full audit log, rendered with
// the shared AuditLog list component. Reuses ../queue.module.css directly rather than
// duplicating the same card/toolbar/search-input chrome a third time — this page is
// visually the same family as the Review Queue (search + filter + card), just over a
// different list.

import { useMemo, useState } from "react";
import styles from "../queue.module.css";
import AppHeader, { REVIEWER_NAV } from "@/components/AppHeader";
import AuditLog from "@/components/AuditLog";
import { shortRef } from "@/lib/format";
import { ACTION_LABEL, ALL_AUDIT_ACTIONS, AuditAction, AuditEntry } from "@/lib/audit-format";

function SearchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.35-4.35" />
    </svg>
  );
}

export default function AuditTrailView({
  currentUser,
  initialEntries,
}: {
  currentUser: { name: string };
  initialEntries: AuditEntry[];
}) {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<AuditAction | "ALL">("ALL");

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return initialEntries.filter((entry) => {
      if (actionFilter !== "ALL" && entry.action !== actionFilter) return false;
      if (!query) return true;
      return (
        entry.user.name.toLowerCase().includes(query) ||
        (entry.intake?.clientName.toLowerCase().includes(query) ?? false) ||
        (entry.intake ? shortRef(entry.intake.id).toLowerCase().includes(query) : false)
      );
    });
  }, [initialEntries, search, actionFilter]);

  return (
    <>
      <AppHeader user={{ name: currentUser.name, role: "REVIEWER" }} navItems={REVIEWER_NAV} />
      <main className={styles.page}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Audit Trail</h1>
            <p className={styles.pageSubtitle}>
              Every recorded action across every application, for compliance review.
            </p>
          </div>

          <div className={styles.tableCard}>
            <div className={styles.tableHeader}>
              <div>
                <h2 className={styles.tableTitle}>Activity</h2>
                <p className={styles.tableSubtitle}>
                  {filtered.length} entr{filtered.length === 1 ? "y" : "ies"}
                </p>
              </div>
              <div className={styles.toolbar}>
                <div className={styles.searchWrap}>
                  <span className={styles.searchIcon}>
                    <SearchIcon />
                  </span>
                  <input
                    className={styles.searchInput}
                    placeholder="Search by name, applicant, or ID..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <select
                  className={styles.filterSelect}
                  value={actionFilter}
                  onChange={(e) => setActionFilter(e.target.value as AuditAction | "ALL")}
                >
                  <option value="ALL">All Actions</option>
                  {ALL_AUDIT_ACTIONS.map((action) => (
                    <option key={action} value={action}>
                      {ACTION_LABEL[action]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <AuditLog entries={filtered} showApplication emptyText="No activity matches your search." />
          </div>
        </div>
      </main>
    </>
  );
}

// Placeholder detail page — the Review Queue's "View" action needs somewhere to go, but
// the real detail view (full record, privileged/redacted PII toggle, status change,
// audit trail) is Goal 5 and Goal 6, not this one. This shows only what's already safe
// to fetch (see SAFE_INTAKE_SELECT in src/lib/intakes.ts) so the link isn't dead, without
// building ahead of the goal it belongs to. Expect this whole file to be replaced when
// Goal 5 lands.
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/current-user";
import { getSafeIntakeById } from "@/lib/intakes";
import { shortRef, formatDateTime } from "@/lib/format";
import { STATUS_LABEL } from "@/lib/intake-status";
import AppHeader, { REVIEWER_NAV } from "@/components/AppHeader";
import styles from "../queue.module.css";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QueueDetailPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "REVIEWER") redirect("/intake");

  const intake = await getSafeIntakeById(id, user);
  if (!intake) notFound();

  return (
    <>
      <AppHeader user={{ name: user.name, role: "REVIEWER" }} navItems={REVIEWER_NAV} />
      <main className={styles.page}>
        <div className={styles.container}>
          <p style={{ marginBottom: "1rem" }}>
            <Link href="/queue" className={styles.linkButton}>
              ← Back to Review Queue
            </Link>
          </p>

          <div className={styles.tableCard}>
            <h1 className={styles.tableTitle}>{shortRef(intake.id)}</h1>
            <p className={styles.tableSubtitle}>
              {intake.clientName} · {intake.clientEmail}
            </p>

            <p style={{ marginTop: "1.5rem", color: "#6b7280", fontSize: "0.9rem" }}>
              Submitted {formatDateTime(intake.createdAt.toISOString())} — status {STATUS_LABEL[intake.status]} — reviewer{" "}
              {intake.reviewer?.name ?? "unassigned"}.
            </p>

            <p
              style={{
                marginTop: "1.5rem",
                padding: "0.85rem 1rem",
                background: "#f9fafb",
                borderRadius: "10px",
                color: "#6b7280",
                fontSize: "0.85rem",
                lineHeight: 1.5,
              }}
            >
              Full application details — phone, date of birth, SSN (with the privileged/redacted toggle),
              description, documents, status changes, and the audit trail — will be available here once
              Goals 5, 6, and 7 are built.
            </p>
          </div>
        </div>
      </main>
    </>
  );
}

// Server Component: reads the session and loads every audit log entry in the system
// (via src/lib/audit.ts, same pattern as /queue's page.tsx) before the page reaches the
// browser. Reviewer-only — proxy.ts's isReviewerRoute check already covers any path
// under /queue, including this one, so no gating changes were needed there.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { listAuditLogs } from "@/lib/audit";
import AuditTrailView from "./AuditTrailView";

export default async function AuditTrailPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "REVIEWER") redirect("/intake");

  const logs = await listAuditLogs();

  return (
    <AuditTrailView
      currentUser={{ name: user.name }}
      initialEntries={logs.map((log) => ({
        id: log.id,
        action: log.action,
        details: log.details,
        createdAt: log.createdAt.toISOString(),
        user: log.user,
        intake: log.intake,
      }))}
    />
  );
}

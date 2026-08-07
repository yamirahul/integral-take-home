// The real Goal 5 detail view — replaces the Goal 4 placeholder. Server Component: reads
// the session, fetches the intake via getIntakeDetail() (always `privileged: false` here
// — see that function and GET /api/intakes/[id] for why the redacted view is the only
// thing ever server-rendered) and its documents, then hands both to the shared
// IntakeDetail component with the toggle enabled.
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getIntakeDetail } from "@/lib/intakes";
import { listAuditLogs } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import IntakeDetail from "@/components/IntakeDetail";
import { REVIEWER_NAV } from "@/components/AppHeader";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function QueueDetailPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "REVIEWER") redirect("/intake");

  const [intake, documents, auditLogs] = await Promise.all([
    getIntakeDetail(id, user, { privileged: false }),
    prisma.document.findMany({ where: { intakeId: id }, orderBy: { createdAt: "desc" } }),
    listAuditLogs({ intakeId: id }),
  ]);

  if (!intake) notFound();

  return (
    <IntakeDetail
      currentUser={{ name: user.name, role: "REVIEWER" }}
      navItems={REVIEWER_NAV}
      backHref="/queue"
      backLabel="Back to Review Queue"
      canToggle
      canManageStatus
      initialIntake={{
        id: intake.id,
        status: intake.status,
        clientName: intake.clientName,
        clientEmail: intake.clientEmail,
        clientPhone: intake.clientPhone,
        dateOfBirth: intake.dateOfBirth,
        ssn: intake.ssn,
        description: intake.description,
        notes: intake.notes,
        createdAt: intake.createdAt.toISOString(),
        updatedAt: intake.updatedAt.toISOString(),
        reviewer: intake.reviewer,
        redacted: intake.redacted,
      }}
      documents={documents.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        description: doc.description,
        createdAt: doc.createdAt.toISOString(),
      }))}
      auditEntries={auditLogs.map((log) => ({
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

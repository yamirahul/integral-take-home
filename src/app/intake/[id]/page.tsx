// A patient's own application detail — same shared IntakeDetail component the Review
// Queue uses, with the toggle turned off: per the README's Privacy Model, a Patient
// always sees their own data complete and unmasked, so there's no "redacted" state to
// toggle out of in the first place. getIntakeDetail() already enforces this regardless
// of what `privileged` is passed (see its role check), and also enforces that a Patient
// can only reach their own intakes — anyone else's id here 404s.
import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { getIntakeDetail } from "@/lib/intakes";
import { prisma } from "@/lib/prisma";
import IntakeDetail from "@/components/IntakeDetail";
import { PATIENT_NAV } from "@/components/AppHeader";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function IntakeDetailPage({ params }: PageProps) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "PATIENT") redirect("/queue");

  const [intake, documents] = await Promise.all([
    getIntakeDetail(id, user, { privileged: false }),
    prisma.document.findMany({ where: { intakeId: id }, orderBy: { createdAt: "desc" } }),
  ]);

  if (!intake) notFound();

  return (
    <IntakeDetail
      currentUser={{ name: user.name, role: "PATIENT" }}
      navItems={PATIENT_NAV}
      backHref="/intake"
      backLabel="Back to Your Applications"
      canToggle={false}
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
    />
  );
}

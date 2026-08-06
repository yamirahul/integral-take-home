// Server Component: reads the session, loads the patient's intakes (needed to populate
// the "Attach to" picker) and their full document library in one shot. proxy.ts already
// guarantees only a signed-in PATIENT reaches this far; the checks below are a defensive
// fallback, same reasoning as /intake's page.tsx.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { listIntakesForUser } from "@/lib/intakes";
import { prisma } from "@/lib/prisma";
import DocumentsView from "./DocumentsView";

export default async function DocumentsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "PATIENT") redirect("/queue");

  const [intakes, documents] = await Promise.all([
    listIntakesForUser(user),
    prisma.document.findMany({
      where: { intake: { submittedById: user.id } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <DocumentsView
      user={{ id: user.id, name: user.name, email: user.email }}
      intakes={intakes.map((intake) => ({
        id: intake.id,
        status: intake.status,
        createdAt: intake.createdAt.toISOString(),
      }))}
      initialDocuments={documents.map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        fileType: doc.fileType,
        fileSize: doc.fileSize,
        filePath: doc.filePath,
        description: doc.description,
        createdAt: doc.createdAt.toISOString(),
        intakeId: doc.intakeId,
      }))}
    />
  );
}

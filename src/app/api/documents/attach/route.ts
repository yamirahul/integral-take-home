import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

// POST /api/documents/attach — "reuse a document I already uploaded" on one or more other
// applications, instead of uploading the same file again. Body: { documentId, intakeIds }
// (intakeIds is an array — this covers both "attach to one more application" and
// "attach to all of them at once" through the same call).
//
// Document is scoped to exactly one Intake in the given schema, so reuse means creating a
// new Document row per target intake — but every one points at the SAME stored file
// (src/lib/documents.ts is content-addressed), so no bytes are re-uploaded or re-written
// to disk regardless of how many applications a file ends up attached to.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role !== "PATIENT") {
    return NextResponse.json({ error: "Only patients can attach documents." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const documentId = body?.documentId;
  const intakeIds = body?.intakeIds;

  if (
    typeof documentId !== "string" ||
    !documentId ||
    !Array.isArray(intakeIds) ||
    intakeIds.length === 0 ||
    !intakeIds.every((id) => typeof id === "string" && id)
  ) {
    return NextResponse.json({ error: "documentId and at least one intakeId are required." }, { status: 400 });
  }

  const requestedIntakeIds = [...new Set(intakeIds)];

  const sourceDocument = await prisma.document.findUnique({
    where: { id: documentId },
    include: { intake: { select: { submittedById: true } } },
  });

  // Same "not found" for someone else's document as for a real 404 — don't reveal that a
  // documentId belongs to another patient.
  if (!sourceDocument || sourceDocument.intake.submittedById !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  const ownedTargetIntakes = await prisma.intake.findMany({
    where: { id: { in: requestedIntakeIds }, submittedById: user.id },
    select: { id: true },
  });
  const ownedIntakeIds = new Set(ownedTargetIntakes.map((i) => i.id));
  const skippedNotOwned = requestedIntakeIds.filter((id) => !ownedIntakeIds.has(id));

  if (ownedIntakeIds.size === 0) {
    return NextResponse.json({ error: "Those applications don't belong to you." }, { status: 403 });
  }

  const alreadyAttached = await prisma.document.findMany({
    where: { filePath: sourceDocument.filePath, intakeId: { in: [...ownedIntakeIds] } },
    select: { intakeId: true },
  });
  const alreadyAttachedIds = new Set(alreadyAttached.map((d) => d.intakeId));
  const intakeIdsToAttach = [...ownedIntakeIds].filter((id) => !alreadyAttachedIds.has(id));

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const intakeId of intakeIdsToAttach) {
      const row = await tx.document.create({
        data: {
          fileName: sourceDocument.fileName,
          fileType: sourceDocument.fileType,
          fileSize: sourceDocument.fileSize,
          filePath: sourceDocument.filePath,
          description: sourceDocument.description,
          intakeId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "DOCUMENT_UPLOADED",
          details: JSON.stringify({ fileName: row.fileName, reusedFrom: sourceDocument.id }),
          userId: user.id,
          intakeId,
        },
      });

      rows.push(row);
    }
    return rows;
  });

  return NextResponse.json(
    {
      created,
      alreadyAttachedCount: alreadyAttachedIds.size,
      skippedNotOwnedCount: skippedNotOwned.length,
    },
    { status: created.length > 0 ? 201 : 200 }
  );
}

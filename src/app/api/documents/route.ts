import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES, isAllowedFileType, saveDocumentFile } from "@/lib/documents";

// GET /api/documents — a patient's own document library, or (with ?intakeId=) one
// intake's documents. Patients: scoped to intakes they submitted, same rule as
// GET /api/intakes. Reviewers must pass ?intakeId= — browsing every document
// platform-wide isn't a need Goal 3 has, and would want the same redaction thinking
// Goal 5 owes GET /api/intakes before it's safe to build.
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const intakeId = searchParams.get("intakeId");

  if (user.role === "REVIEWER") {
    if (!intakeId) {
      return NextResponse.json({ error: "intakeId is required." }, { status: 400 });
    }
    const documents = await prisma.document.findMany({
      where: { intakeId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(documents);
  }

  const documents = await prisma.document.findMany({
    where: {
      intake: { submittedById: user.id },
      ...(intakeId ? { intakeId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(documents);
}

// POST /api/documents — upload a new supporting document, optionally attaching it to
// several applications at once (not just the one it's "originally" for).
// multipart/form-data body: file (required), intakeIds (required, one or more — repeat
// the field to send several: body.append("intakeIds", id) per id), description (optional).
// Patient-only; every target intake must be one they submitted themselves.
//
// The file is written to disk exactly once regardless of how many intakeIds are given —
// src/lib/documents.ts is content-addressed, so a second Document row pointed at the same
// bytes never triggers a second write. Structurally this mirrors POST /api/documents/attach
// (also intakeIds-plural, also "one file, many Document rows, one transaction"); the two
// stay separate endpoints because only this one needs to accept and store new bytes.
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role !== "PATIENT") {
    return NextResponse.json({ error: "Only patients can upload documents." }, { status: 403 });
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file");
  const intakeIds = [...new Set(formData.getAll("intakeIds").filter((v): v is string => typeof v === "string" && v.length > 0))];
  const description = formData.get("description");

  const fieldErrors: Record<string, string> = {};
  if (!(file instanceof File) || file.size === 0) {
    fieldErrors.file = "Choose a file to upload.";
  }
  if (intakeIds.length === 0) {
    fieldErrors.intakeIds = "Choose at least one application to attach this to.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ fieldErrors }, { status: 400 });
  }

  // Narrowed by the checks above, but TypeScript doesn't know that from a Record lookup.
  const uploadedFile = file as File;

  if (!isAllowedFileType(uploadedFile.type)) {
    return NextResponse.json(
      {
        fieldErrors: {
          file: `Unsupported file type. Accepted: PDF or photos (${[...ALLOWED_MIME_TYPES]
            .filter((t) => t.startsWith("image/"))
            .map((t) => t.replace("image/", "").toUpperCase())
            .join(", ")}).`,
        },
      },
      { status: 400 }
    );
  }
  if (uploadedFile.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { fieldErrors: { file: `File is too large — the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB.` } },
      { status: 400 }
    );
  }

  const ownedIntakes = await prisma.intake.findMany({
    where: { id: { in: intakeIds }, submittedById: user.id },
    select: { id: true },
  });
  const ownedIntakeIds = ownedIntakes.map((i) => i.id);
  const skippedNotOwnedCount = intakeIds.length - ownedIntakeIds.length;

  if (ownedIntakeIds.length === 0) {
    return NextResponse.json({ error: "Those applications don't belong to you." }, { status: 403 });
  }

  const bytes = Buffer.from(await uploadedFile.arrayBuffer());
  const storedFileName = await saveDocumentFile(bytes, uploadedFile.type);
  const trimmedDescription = typeof description === "string" && description.trim() ? description.trim() : null;

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (const intakeId of ownedIntakeIds) {
      const row = await tx.document.create({
        data: {
          fileName: uploadedFile.name,
          fileType: uploadedFile.type,
          fileSize: uploadedFile.size,
          filePath: storedFileName,
          description: trimmedDescription,
          intakeId,
        },
      });

      await tx.auditLog.create({
        data: {
          action: "DOCUMENT_UPLOADED",
          details: JSON.stringify({ fileName: row.fileName, fileType: row.fileType }),
          userId: user.id,
          intakeId,
        },
      });

      rows.push(row);
    }
    return rows;
  });

  return NextResponse.json({ created, skippedNotOwnedCount }, { status: 201 });
}

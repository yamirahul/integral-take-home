import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { readDocumentFile } from "@/lib/documents";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/documents/[id]/file — streams the actual file bytes. This is the ONLY way to
// read an uploaded document's contents: files live outside `public/` specifically so this
// auth check can't be bypassed by hitting a static URL directly.
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const document = await prisma.document.findUnique({
    where: { id },
    include: { intake: { select: { submittedById: true } } },
  });

  if (!document) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }
  // Patients only see their own documents; Reviewers can view any document (same access
  // level they already have to full intake data via GET /api/intakes).
  if (user.role === "PATIENT" && document.intake.submittedById !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  let bytes: Buffer;
  try {
    bytes = await readDocumentFile(document.filePath);
  } catch {
    return NextResponse.json({ error: "File is missing from storage." }, { status: 500 });
  }

  // Buffer is a Uint8Array under the hood, but TS's DOM lib won't accept Node's Buffer
  // type (backed by ArrayBufferLike, which includes SharedArrayBuffer) as BlobPart
  // directly — re-wrapping in a plain Uint8Array satisfies the stricter DOM type.
  return new NextResponse(new Blob([new Uint8Array(bytes)]), {
    headers: {
      "Content-Type": document.fileType,
      // "inline" so PDFs/images preview in a browser tab instead of forcing a download.
      "Content-Disposition": `inline; filename="${document.fileName.replace(/"/g, "")}"`,
      "Cache-Control": "private, no-store",
    },
  });
}

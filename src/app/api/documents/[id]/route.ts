import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// DELETE /api/documents/[id] — remove one attachment (a patient's own Document row).
// Only the DB row is deleted — never the underlying file on disk. Storage is
// content-addressed (src/lib/documents.ts), so another Document row — on a different
// intake, from a "reuse" — may point at the exact same stored file; deleting bytes that
// might still be in use elsewhere isn't this endpoint's call to make. An orphaned file
// left on disk after the last row referencing it is deleted is an acceptable tradeoff
// here — there's no cleanup job, but nothing user-facing depends on one existing.
export async function DELETE(request: Request, { params }: RouteParams) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role !== "PATIENT") {
    return NextResponse.json({ error: "Only patients can remove documents." }, { status: 403 });
  }

  const document = await prisma.document.findUnique({
    where: { id },
    include: { intake: { select: { submittedById: true } } },
  });

  if (!document || document.intake.submittedById !== user.id) {
    return NextResponse.json({ error: "Document not found." }, { status: 404 });
  }

  await prisma.document.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}

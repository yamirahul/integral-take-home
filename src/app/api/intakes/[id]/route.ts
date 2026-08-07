import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getIntakeDetail } from "@/lib/intakes";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/intakes/[id] — the full-record fetch behind the detail view.
//   ?view=privileged  — Reviewer only: full, unmasked ssn/clientPhone/dateOfBirth.
//   (anything else)   — default: those three fields masked (src/lib/redact.ts).
// A Patient always gets their own data unmasked either way — `view` only matters for a
// Reviewer looking at someone else's application.
//
// The detail page's initial server render always requests the redacted view — this
// route is the ONLY path that ever returns unmasked PII to a Reviewer, and only in
// direct response to an explicit request, never as a page-load default. That's also why
// it's the one place worth a VIEWED audit entry: every time a Reviewer unmasks a SSN,
// that access is logged, the same way a real compliance system would log it. Viewing the
// already-redacted default isn't logged — it's not the sensitive action.
export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const wantsPrivileged = searchParams.get("view") === "privileged";

  const intake = await getIntakeDetail(id, user, { privileged: wantsPrivileged });
  if (!intake) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (user.role === "REVIEWER" && wantsPrivileged) {
    await prisma.auditLog.create({
      data: {
        action: "VIEWED",
        details: JSON.stringify({ view: "privileged" }),
        userId: user.id,
        intakeId: id,
      },
    });
  }

  return NextResponse.json(intake);
}

// PATCH /api/intakes/[id] — currently handles Reviewer self-assignment only:
//   { reviewerId: <your own id> }  — claim an unassigned application
//   { reviewerId: null }           — release one you're currently assigned to
//
// Deliberately narrow: a Reviewer can only assign *themselves*, and can only release a
// claim that's already theirs — not reassign someone else's. TODO(Goal 6): extend this
// same handler with a `status` field for the PENDING -> IN_REVIEW -> APPROVED/REJECTED
// transitions; it'll want a STATUS_CHANGED audit entry alongside the ASSIGNED one this
// already writes.
export async function PATCH(request: Request, { params }: RouteParams) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role !== "REVIEWER") {
    return NextResponse.json({ error: "Only reviewers can update applications." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || !("reviewerId" in body)) {
    return NextResponse.json({ error: "reviewerId is required." }, { status: 400 });
  }

  const requestedReviewerId = body.reviewerId;
  if (requestedReviewerId !== null && requestedReviewerId !== user.id) {
    return NextResponse.json({ error: "You can only assign an application to yourself." }, { status: 403 });
  }

  const intake = await prisma.intake.findUnique({
    where: { id },
    select: { id: true, reviewerId: true },
  });
  if (!intake) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  const isClaiming = requestedReviewerId === user.id;
  const isReleasing = requestedReviewerId === null;

  if (isClaiming && intake.reviewerId !== null && intake.reviewerId !== user.id) {
    return NextResponse.json({ error: "This application is already assigned to another reviewer." }, { status: 409 });
  }
  if (isReleasing && intake.reviewerId !== null && intake.reviewerId !== user.id) {
    return NextResponse.json({ error: "You can only release an application assigned to you." }, { status: 403 });
  }

  // Already in the requested state — idempotent no-op, not an error (a double-click on
  // "Assign to me," or two tabs racing, shouldn't surface a confusing failure).
  if (intake.reviewerId === requestedReviewerId) {
    return NextResponse.json({ id: intake.id, reviewerId: intake.reviewerId });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedIntake = await tx.intake.update({
      where: { id },
      data: { reviewerId: requestedReviewerId },
      select: {
        id: true,
        reviewerId: true,
        reviewer: { select: { id: true, name: true } },
      },
    });

    await tx.auditLog.create({
      data: {
        action: "ASSIGNED",
        details: JSON.stringify({ reviewerId: requestedReviewerId, previousReviewerId: intake.reviewerId }),
        userId: user.id,
        intakeId: id,
      },
    });

    return updatedIntake;
  });

  return NextResponse.json(updated);
}

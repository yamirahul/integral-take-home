import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";

// TODO(Goal 5): Implement GET — the full-record fetch with the privileged/redacted PII
// toggle described in the README's Privacy Model. Until then, the Review Queue's "View"
// action (src/app/queue/[id]/page.tsx) uses getSafeIntakeById() from src/lib/intakes.ts
// directly rather than this route, the same way /intake's own page queries Prisma
// server-side instead of calling its own API.

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, { params }: RouteParams) {
  const { id } = await params;

  // TODO: Implement fetching single intake (Goal 5)

  return NextResponse.json({ message: `TODO: Implement GET /api/intakes/${id}` });
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

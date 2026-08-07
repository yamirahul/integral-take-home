import { NextResponse } from "next/server";
import type { IntakeStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { getIntakeDetail } from "@/lib/intakes";

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES: IntakeStatus[] = ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"];

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

// PATCH /api/intakes/[id] — Reviewer self-assignment and/or status changes. Either or
// both keys can be present in one request:
//   { reviewerId: <your own id> | null }  — claim / release (see src/app/api/intakes/
//     route.ts's sibling comment in the Goal 4 commit for why this is self-only)
//   { status: "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED" }  — set the review
//     status. Deliberately NOT restricted to a linear PENDING -> IN_REVIEW ->
//     APPROVED/REJECTED pipeline — any Reviewer can set any of the 4 statuses at any
//     time, so a wrong call is correctable without a special "reopen" flow. What's
//     actually enforced is that every change is real: each one gets its own
//     STATUS_CHANGED audit entry (from/to), and a no-op re-set of the current status is
//     a 200 no-op like the assignment idempotency below, not a fake audit entry.
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
  const hasReviewerId = !!body && typeof body === "object" && "reviewerId" in body;
  const hasStatus = !!body && typeof body === "object" && "status" in body;
  if (!hasReviewerId && !hasStatus) {
    return NextResponse.json({ error: "reviewerId and/or status is required." }, { status: 400 });
  }

  const requestedReviewerId: string | null | undefined = hasReviewerId ? body.reviewerId : undefined;
  if (hasReviewerId && requestedReviewerId !== null && requestedReviewerId !== user.id) {
    return NextResponse.json({ error: "You can only assign an application to yourself." }, { status: 403 });
  }

  const requestedStatus: IntakeStatus | undefined = hasStatus ? body.status : undefined;
  if (hasStatus && !VALID_STATUSES.includes(requestedStatus as IntakeStatus)) {
    return NextResponse.json(
      { error: `status must be one of ${VALID_STATUSES.join(", ")}.` },
      { status: 400 }
    );
  }

  const intake = await prisma.intake.findUnique({
    where: { id },
    select: { id: true, reviewerId: true, status: true },
  });
  if (!intake) {
    return NextResponse.json({ error: "Application not found." }, { status: 404 });
  }

  if (hasReviewerId) {
    const isClaiming = requestedReviewerId === user.id;
    const isReleasing = requestedReviewerId === null;

    if (isClaiming && intake.reviewerId !== null && intake.reviewerId !== user.id) {
      return NextResponse.json(
        { error: "This application is already assigned to another reviewer." },
        { status: 409 }
      );
    }
    if (isReleasing && intake.reviewerId !== null && intake.reviewerId !== user.id) {
      return NextResponse.json(
        { error: "You can only release an application assigned to you." },
        { status: 403 }
      );
    }
  }

  const reviewerChanged = hasReviewerId && requestedReviewerId !== intake.reviewerId;
  const statusChanged = hasStatus && requestedStatus !== intake.status;

  // Already in the requested state on every field asked about — idempotent no-op, not
  // an error (a double-click, or two tabs racing, shouldn't surface a confusing failure
  // or write a misleading "changed from X to X" audit entry).
  if (!reviewerChanged && !statusChanged) {
    return NextResponse.json({ id: intake.id, status: intake.status, reviewerId: intake.reviewerId });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updatedIntake = await tx.intake.update({
      where: { id },
      data: {
        ...(reviewerChanged ? { reviewerId: requestedReviewerId } : {}),
        ...(statusChanged ? { status: requestedStatus } : {}),
      },
      select: {
        id: true,
        status: true,
        reviewerId: true,
        reviewer: { select: { id: true, name: true } },
      },
    });

    if (reviewerChanged) {
      await tx.auditLog.create({
        data: {
          action: "ASSIGNED",
          details: JSON.stringify({ reviewerId: requestedReviewerId, previousReviewerId: intake.reviewerId }),
          userId: user.id,
          intakeId: id,
        },
      });
    }

    if (statusChanged) {
      await tx.auditLog.create({
        data: {
          action: "STATUS_CHANGED",
          details: JSON.stringify({ from: intake.status, to: requestedStatus }),
          userId: user.id,
          intakeId: id,
        },
      });
    }

    return updatedIntake;
  });

  return NextResponse.json(updated);
}

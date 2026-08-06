import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/current-user";
import { listIntakesForUser } from "@/lib/intakes";

// GET /api/intakes — list enrollment applications, scoped by role:
//   - PATIENT: only the applications they submitted (their own data is never masked —
//     see the Privacy Model in the README).
//   - REVIEWER: every application, across all patients.
//
// NOTE: this does NOT yet apply the redacted/privileged PII masking described in the
// README's Privacy Model (Goal 5, "Detail View"). Right now it returns full rows to
// whichever role is allowed to see the application at all. Before this list powers the
// Reviewer queue UI, wrap the REVIEWER branch in a redaction step so SSN/phone/DOB are
// masked by default there too.
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const intakes = await listIntakesForUser(user);

  return NextResponse.json(intakes);
}

// Required fields from prisma/schema.prisma's Intake model, each with a human-readable
// label used in validation error messages.
const REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: "clientName", label: "Full name" },
  { key: "clientEmail", label: "Email address" },
  { key: "clientPhone", label: "Phone number" },
  { key: "dateOfBirth", label: "Date of birth" },
  { key: "ssn", label: "Social Security Number" },
  // Not shown in the /public/design-inspiration mockup (which predates this field), but
  // required by prisma/schema.prisma ("Reason for enrollment, medical history, etc."),
  // and the README says the schema wins when the two disagree.
  { key: "description", label: "Reason for enrollment" },
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SSN_PATTERN = /^\d{3}-\d{2}-\d{4}$/;

// Validates the POST body and returns a map of field -> error message. Empty object means
// the submission is valid. Keyed by field name so the frontend can show each error next
// to the input it belongs to, matching the mockup's per-field required markers.
function validateIntakeBody(body: Record<string, unknown>): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const { key, label } of REQUIRED_FIELDS) {
    const value = body[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      errors[key] = `${label} is required.`;
    }
  }

  const email = body.clientEmail;
  if (typeof email === "string" && email.trim() && !EMAIL_PATTERN.test(email.trim())) {
    errors.clientEmail = "Enter a valid email address.";
  }

  const ssn = body.ssn;
  if (typeof ssn === "string" && ssn.trim() && !SSN_PATTERN.test(ssn.trim())) {
    errors.ssn = "SSN must be in the format XXX-XX-XXXX.";
  }

  const dob = body.dateOfBirth;
  if (typeof dob === "string" && dob.trim()) {
    const parsed = new Date(dob);
    if (Number.isNaN(parsed.getTime())) {
      errors.dateOfBirth = "Enter a valid date.";
    } else if (parsed.getTime() > Date.now()) {
      errors.dateOfBirth = "Date of birth can't be in the future.";
    }
  }

  const description = body.description;
  if (typeof description === "string" && description.trim() && description.trim().length < 10) {
    errors.description = "Please provide a bit more detail (at least 10 characters).";
  }

  return errors;
}

// POST /api/intakes — a Patient submits a new enrollment application. Only PATIENTs can
// call this: a Reviewer has nothing to "submit," they only screen what patients send in.
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  if (user.role !== "PATIENT") {
    return NextResponse.json({ error: "Only patients can submit enrollment applications." }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const fieldErrors = validateIntakeBody(body);
  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json({ fieldErrors }, { status: 400 });
  }

  const notes = typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null;

  // Create the intake and its opening audit log entry together — an intake should never
  // exist without a CREATED entry explaining how it got there (see Goal 7, Audit Trail).
  const intake = await prisma.$transaction(async (tx) => {
    const created = await tx.intake.create({
      data: {
        clientName: (body.clientName as string).trim(),
        clientEmail: (body.clientEmail as string).trim(),
        clientPhone: (body.clientPhone as string).trim(),
        dateOfBirth: (body.dateOfBirth as string).trim(),
        ssn: (body.ssn as string).trim(),
        description: (body.description as string).trim(),
        notes,
        submittedById: user.id,
        // status defaults to PENDING per prisma/schema.prisma — every new application
        // starts in the reviewer's queue awaiting screening.
      },
    });

    await tx.auditLog.create({
      data: {
        action: "CREATED",
        details: JSON.stringify({ status: created.status }),
        userId: user.id,
        intakeId: created.id,
      },
    });

    return created;
  });

  return NextResponse.json(intake, { status: 201 });
}

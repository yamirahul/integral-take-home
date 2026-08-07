// Shared across every client component that displays an Intake's status (the intake
// list, the document library's "attached to" chips, eventually the review queue).

export type IntakeStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export const STATUS_LABEL: Record<IntakeStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

// The 4 statuses, in the order the README's workflow (and the status-change control on
// the Goal 6 detail view) presents them.
export const ALL_STATUSES: IntakeStatus[] = ["PENDING", "IN_REVIEW", "APPROVED", "REJECTED"];

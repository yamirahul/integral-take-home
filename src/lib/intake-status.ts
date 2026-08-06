// Shared across every client component that displays an Intake's status (the intake
// list, the document library's "attached to" chips, eventually the review queue).

export type IntakeStatus = "PENDING" | "IN_REVIEW" | "APPROVED" | "REJECTED";

export const STATUS_LABEL: Record<IntakeStatus, string> = {
  PENDING: "Pending",
  IN_REVIEW: "In Review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

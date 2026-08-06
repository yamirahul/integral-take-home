// Server Component: reads the session via getCurrentUser() and loads every application
// (via the shared src/lib/intakes.ts helper — same query GET /api/intakes uses) before
// the page ever reaches the browser. proxy.ts already guarantees only a signed-in
// REVIEWER reaches this far; the checks below are a defensive fallback, same reasoning
// as /intake's and /documents' page.tsx.
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { listIntakesForUser } from "@/lib/intakes";
import QueueView from "./QueueView";

export default async function QueuePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "REVIEWER") redirect("/intake");

  const intakes = await listIntakesForUser(user);

  return (
    <QueueView
      currentUser={{ id: user.id, name: user.name }}
      initialIntakes={intakes.map((intake) => ({
        id: intake.id,
        status: intake.status,
        clientName: intake.clientName,
        clientEmail: intake.clientEmail,
        createdAt: intake.createdAt.toISOString(),
        reviewer: intake.reviewer,
      }))}
    />
  );
}

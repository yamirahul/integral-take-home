// Server Component: reads the session via getCurrentUser() and loads the patient's own
// intakes (via the shared src/lib/intakes.ts helper — same query GET /api/intakes uses)
// before the page ever reaches the browser. proxy.ts already guarantees only a signed-in
// PATIENT reaches this far; the checks below are a defensive fallback (e.g. the user row
// was deleted, or the role changed, after the session cookie was issued).
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/current-user";
import { listIntakesForUser } from "@/lib/intakes";
import IntakeView from "./IntakeView";

export default async function IntakePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  if (user.role !== "PATIENT") redirect("/queue");

  const intakes = await listIntakesForUser(user);

  return (
    <IntakeView
      user={{ id: user.id, name: user.name, email: user.email }}
      initialIntakes={intakes.map((intake) => ({
        id: intake.id,
        status: intake.status,
        createdAt: intake.createdAt.toISOString(),
      }))}
    />
  );
}

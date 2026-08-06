// Server Component: reads the session via getCurrentUser() on the server, before render.
// middleware.ts already guarantees only a signed-in PATIENT reaches this far, but we still
// use the real user record here (not just the cookie's role) since the enrollment form
// (next up) will need the patient's id/name/email to submit against.
import { getCurrentUser } from "@/lib/current-user";
import LogoutButton from "@/components/LogoutButton";

export default async function IntakePage() {
  const user = await getCurrentUser();

  return (
    <main style={{ padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Submit Intake</h1>
        <LogoutButton />
      </div>
      <p>Signed in as {user?.name} ({user?.email}).</p>
      <p>Use this form to submit a new intake for review. (Coming next.)</p>
    </main>
  );
}

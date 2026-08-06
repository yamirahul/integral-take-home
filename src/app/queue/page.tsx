// Server Component: reads the session via getCurrentUser() on the server, before render.
// middleware.ts already guarantees only a signed-in REVIEWER reaches this far.
import { getCurrentUser } from "@/lib/current-user";
import LogoutButton from "@/components/LogoutButton";

export default async function QueuePage() {
  const user = await getCurrentUser();

  return (
    <main style={{ padding: "2rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1>Review Queue</h1>
        <LogoutButton />
      </div>
      <p>Signed in as {user?.name} ({user?.organization}).</p>
      <p>Review and manage submitted intakes. (Coming next.)</p>
    </main>
  );
}

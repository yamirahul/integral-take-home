"use client";

// Small client component so the surrounding pages (intake, queue) can stay Server
// Components — only the click handler needs the browser.
export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Full navigation so proxy.ts sees the cleared cookie; "/" is the sign-in page.
    window.location.href = "/";
  }

  return (
    <button onClick={handleLogout} style={{ padding: "0.4rem 0.8rem" }}>
      Log out
    </button>
  );
}

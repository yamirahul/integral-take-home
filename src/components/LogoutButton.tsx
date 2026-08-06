"use client";

// Small client component so the surrounding pages (intake, documents, queue) can stay
// Server Components — only the click handler needs the browser.
function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export default function LogoutButton() {
  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    // Full navigation so proxy.ts sees the cleared cookie; "/" is the sign-in page.
    window.location.href = "/";
  }

  return (
    <button
      onClick={handleLogout}
      aria-label="Log out"
      title="Log out"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "2.1rem",
        height: "2.1rem",
        borderRadius: "8px",
        border: "1px solid #d1d5db",
        background: "#fff",
        color: "#374151",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <LogoutIcon />
    </button>
  );
}

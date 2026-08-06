"use client";

// Root page ("/") IS the sign-in page — this used to live at /login, moved here so
// "not logged in" always lands on a useful screen instead of a placeholder overview.
// proxy.ts is what makes this safe to render unconditionally: it already redirects an
// authenticated visitor away from "/" (to /intake or /queue) before this component ever
// renders, so by the time we get here we can assume nobody is signed in yet.
//
// Role toggle (Patient / Reviewer) + email/password, POSTs to /api/auth/login. The
// selected role is sent as `expectedRole` so the server can catch "signed into the wrong
// tab" with a clear message — see the comment in src/app/api/auth/login/route.ts for why
// that check is safe to be specific about.
//
// Layout follows /public/design-inspiration/login-page.png; labels use "Patient" (not
// the mockup's "Client") per the README/schema, which the README says wins on conflicts.

import { useState, FormEvent } from "react";
import styles from "./page.module.css";

type Role = "PATIENT" | "REVIEWER";

const ROLE_COPY: Record<Role, { label: string; emailPlaceholder: string; helperText: string }> = {
  PATIENT: {
    label: "Patient",
    emailPlaceholder: "patient@example.com",
    helperText: "Submit and track your enrollment application",
  },
  REVIEWER: {
    label: "Reviewer",
    emailPlaceholder: "reviewer@example.com",
    helperText: "Screen and manage enrollment applications",
  },
};

// Small inline icons (document / shield) instead of pulling in an icon library.
function DocumentIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

export default function LoginPage() {
  const [role, setRole] = useState<Role>("PATIENT");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const copy = ROLE_COPY[role];

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, expectedRole: role }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Full navigation (not client-side routing) so proxy.ts re-evaluates the new
      // cookie and Server Components re-fetch with the now-authenticated request.
      window.location.href = data.role === "PATIENT" ? "/intake" : "/queue";
    } catch {
      setError("Could not reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Intake Review System</h1>
        <p className={styles.subtitle}>Privacy-conscious clinical trial enrollment platform</p>
      </div>

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>Sign In</h2>
        <p className={styles.cardSubtitle}>Choose your role to continue</p>

        <div className={styles.roleToggle} role="tablist" aria-label="Choose role">
          {(Object.keys(ROLE_COPY) as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              role="tab"
              aria-selected={role === r}
              className={`${styles.roleButton} ${role === r ? styles.roleButtonActive : ""}`}
              onClick={() => {
                setRole(r);
                setError(null);
              }}
            >
              {r === "PATIENT" ? <DocumentIcon /> : <ShieldIcon />}
              {ROLE_COPY[r].label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder={copy.emailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={styles.input}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={styles.input}
            />
          </div>

          {error && (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          )}

          <button type="submit" disabled={isSubmitting} className={styles.submit}>
            {isSubmitting ? "Signing in..." : `Sign in as ${copy.label}`}
          </button>
        </form>

        <p className={styles.helperText}>{copy.helperText}</p>
      </div>

      <p className={styles.demoNote}>
        Demo accounts: <code>patient@demo.com</code> / <code>reviewer@demo.com</code>, password{" "}
        <code>password123</code> for both.
      </p>
    </main>
  );
}

"use client";

// Shared top bar for every signed-in page (/intake, /documents, /queue): brand, a pill
// tab nav (which links show depends on the caller's role — see PATIENT_NAV/REVIEWER_NAV
// below), the current user's name + role, and an icon Log Out button. Chrome follows
// /public/design-inspiration/reviewer-dashboard.png (full-width bar, pill nav, stacked
// name/role, icon-only logout) — adopted for the patient pages too rather than keeping
// two different header styles in the same app. One label deviates from the mockup: it
// says "Intake Review", this says "Intake Review System" to match the title already
// established on the sign-in page.
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";
import styles from "./AppHeader.module.css";

interface NavItem {
  href: string;
  label: string;
}

export const PATIENT_NAV: NavItem[] = [
  { href: "/intake", label: "New Intake" },
  { href: "/documents", label: "Documents" },
];

export const REVIEWER_NAV: NavItem[] = [
  { href: "/queue", label: "Review Queue" },
  { href: "/queue/audit", label: "Audit Trail" },
];

const ROLE_LABEL: Record<"PATIENT" | "REVIEWER", string> = {
  PATIENT: "Patient",
  REVIEWER: "Reviewer",
};

function BrandIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export default function AppHeader({
  user,
  navItems,
}: {
  user: { name: string; role: "PATIENT" | "REVIEWER" };
  navItems: NavItem[];
}) {
  const pathname = usePathname();

  return (
    <header className={styles.topBar}>
      <div className={styles.inner}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}>
            <BrandIcon />
          </span>
          Intake Review System
        </div>

        <nav className={styles.nav}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className={styles.right}>
          <div className={styles.userInfo}>
            <div className={styles.userName}>{user.name}</div>
            <div className={styles.userRole}>{ROLE_LABEL[user.role]}</div>
          </div>
          <LogoutButton />
        </div>
      </div>
    </header>
  );
}

"use client";

// Shared header for the patient-facing pages (/intake, /documents): brand, current user,
// a tab nav between the two, and Log Out. Factored out once a second patient page needed
// the exact same block IntakeView.tsx already had, rather than duplicating it again.
import Link from "next/link";
import { usePathname } from "next/navigation";
import LogoutButton from "./LogoutButton";
import styles from "./AppHeader.module.css";

const PATIENT_NAV = [
  { href: "/intake", label: "New Intake" },
  { href: "/documents", label: "Documents" },
];

export default function AppHeader({ user }: { user: { name: string; email: string } }) {
  const pathname = usePathname();

  return (
    <div className={styles.topBar}>
      <div>
        <div className={styles.brand}>Intake Review System</div>
        <div className={styles.userInfo}>
          Signed in as {user.name} ({user.email})
        </div>
        <nav className={styles.nav}>
          {PATIENT_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navLink} ${pathname === item.href ? styles.navLinkActive : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
      <LogoutButton />
    </div>
  );
}

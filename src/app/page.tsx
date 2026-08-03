import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Intake Review System</h1>
        </header>
        <nav className={styles.nav}>
          <Link href="/login" className={styles.link}>
            Sign In
          </Link>
          <Link href="/intake" className={styles.link}>
            Submit Intake
          </Link>
          <Link href="/queue" className={styles.link}>
            Review Queue
          </Link>
        </nav>
      </div>
    </main>
  );
}

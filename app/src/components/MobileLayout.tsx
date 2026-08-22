"use client";

import { ReactNode } from "react";
import Link from "next/link";
import styles from "./MobileLayout.module.css";

interface MobileLayoutProps {
  children: ReactNode;
  title?: string;
  backHref?: string;
  showNav?: boolean;
}

export function MobileLayout({
  children,
  title,
  backHref,
  showNav = true,
}: MobileLayoutProps) {
  return (
    <div className={styles.container}>
      {title && (
        <div className={styles.header}>
          {backHref && (
            <Link href={backHref} className={styles.backButton}>
              ← Back
            </Link>
          )}
          <h1 className={styles.title}>{title}</h1>
          <div style={{ width: backHref ? "auto" : "40px" }} />
        </div>
      )}

      <main className={styles.content}>{children}</main>

      {showNav && <MobileNav />}
    </div>
  );
}

function MobileNav() {
  return (
    <nav className={styles.nav}>
      <Link href="/" className={styles.navItem} title="Home">
        <span className={styles.icon}>🏠</span>
        <span className={styles.label}>Home</span>
      </Link>
      <Link href="/wander" className={styles.navItem} title="Wander">
        <span className={styles.icon}>🌍</span>
        <span className={styles.label}>Wander</span>
      </Link>
      <Link href="/rings" className={styles.navItem} title="Rings">
        <span className={styles.icon}>⭕</span>
        <span className={styles.label}>Rings</span>
      </Link>
      <Link href="/studio" className={styles.navItem} title="Studio">
        <span className={styles.icon}>✏️</span>
        <span className={styles.label}>Studio</span>
      </Link>
      <Link href="/settings" className={styles.navItem} title="Settings">
        <span className={styles.icon}>⚙️</span>
        <span className={styles.label}>Settings</span>
      </Link>
    </nav>
  );
}

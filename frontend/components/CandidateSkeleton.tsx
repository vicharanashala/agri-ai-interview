import React from 'react';
import BrandLogos from '@/components/BrandLogos';
import navStyles from '@/components/CandidateNavbar.module.css';
import styles from './CandidateSkeleton.module.css';

// Shared building blocks for candidate page skeletons.

export function Bone({ className = '', style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={`${styles.bone} ${className}`} style={style} aria-hidden="true" />;
}

// Static copy rendered invisibly over a shimmer background, so the placeholder
// wraps line-for-line like the real text at every width (no layout jump).
export function TextBone({ children }: { children: React.ReactNode }) {
  return (
    <span className={styles.textBone} aria-hidden="true">
      {children}
    </span>
  );
}

// Emoji inside a TextBone (colour glyphs ignore `color`); keeps the width, hides the glyph
export function Glyph({ children }: { children: React.ReactNode }) {
  return <span className={styles.glyph}>{children}</span>;
}

// Mirrors the navbar on the declaration / onboarding pages (Raise Tickets, FAQ &
// Help, Sign Out). Takes that page's CSS module so sizes come from the real styles;
// inert <button>s so they get the same UA font metrics as the real ones.
export function HeaderButtonsNavbarSkeleton({ pageStyles }: { pageStyles: Record<string, string> }) {
  return (
    <nav className={pageStyles.topNavbar}>
      <div className={pageStyles.navbarContent}>
        <BrandLogos variant="header" />
        <div className={pageStyles.headerButtons} aria-hidden="true">
          <button type="button" tabIndex={-1} className={`${pageStyles.raiseTicketBtn} ${styles.inertButton}`}>
            <TextBone><Glyph>⚠️</Glyph> Raise Tickets</TextBone>
          </button>
          <button type="button" tabIndex={-1} className={`${pageStyles.faqHelpBtn} ${styles.inertButton}`}>
            <TextBone><Glyph>💬</Glyph> FAQ & Help</TextBone>
          </button>
          <button type="button" tabIndex={-1} className={`${pageStyles.signOutBtn} ${styles.inertButton}`}>
            <TextBone>Sign Out</TextBone>
          </button>
        </div>
      </div>
    </nav>
  );
}

// Mirrors CandidateNavbar: real logos (static), placeholders for FAQ + profile menu
export function CandidateNavbarSkeleton() {
  return (
    <nav className={navStyles.topNavbar}>
      <div className={navStyles.navbarContent}>
        <BrandLogos variant="header" />
        <div className={navStyles.navbarRight}>
          <Bone className={styles.faqPill} />
          <span className={styles.avatarPill}>
            <Bone className={styles.avatarCircle} />
            <Bone className={styles.avatarName} />
          </span>
        </div>
      </div>
    </nav>
  );
}

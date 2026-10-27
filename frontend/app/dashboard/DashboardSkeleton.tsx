import React from 'react';
import { Bone, CandidateNavbarSkeleton } from '@/components/CandidateSkeleton';
import pageStyles from './page.module.css';
import styles from './DashboardSkeleton.module.css';

// Loading placeholder that reuses the dashboard's own layout classes so every
// block sits exactly where the real content will appear (no layout jump).
const STEP_COUNT = 6;

export default function DashboardSkeleton() {
  return (
    <main className={pageStyles.container} aria-busy="true" aria-label="Loading dashboard">
      <div className={pageStyles.bgDecoration} aria-hidden="true">
        <div className={pageStyles.bgWaveTopLeft} />
        <div className={pageStyles.bgWaveBottomRight} />
      </div>

      <CandidateNavbarSkeleton />

      <div className={pageStyles.contentContainer}>
        {/* Hero title + subtitle, then action pills + progress card.
            The real hero animates in on mount, so the placeholder stays still. */}
        <section className={pageStyles.heroSection} style={{ animation: 'none' }}>
          <div className={pageStyles.heroCenter}>
            <Bone className={styles.title} />
            <Bone className={styles.subtitle} />
          </div>

          <div className={pageStyles.topActionsRow}>
            <div className={pageStyles.topButtonsGroup}>
              <Bone className={`${styles.pill} ${styles.pillWide}`} />
              <Bone className={`${styles.pill} ${styles.pillMid}`} />
              <Bone className={`${styles.pill} ${styles.pillShort}`} />
            </div>

            <div className={pageStyles.progressCard}>
              <div className={pageStyles.progressCardHeader}>
                <Bone className={styles.textSm} style={{ width: 96 }} />
                <Bone className={styles.textSm} style={{ width: 54 }} />
              </div>
              <div className={pageStyles.progressCardBarRow}>
                <div className={pageStyles.progressCardTrack} />
                <Bone className={styles.textSm} style={{ width: 30 }} />
              </div>
            </div>
          </div>
        </section>

        {/* Journey stepper — 6 phase circles with connectors */}
        <section className={pageStyles.stepperWrapper}>
          <div className={pageStyles.stepperRow}>
            {Array.from({ length: STEP_COUNT }, (_, index) => (
              <React.Fragment key={index}>
                <div className={`${pageStyles.stepNode} ${styles.staticNode}`}>
                  <Bone className={styles.stepCircle} />
                  <Bone className={styles.textSm} style={{ width: 76 }} />
                </div>
                {index < STEP_COUNT - 1 && (
                  <div className={`${pageStyles.stepConnector} ${styles.connector}`} />
                )}
              </React.Fragment>
            ))}
          </div>
        </section>

        {/* Mascot & tip banner */}
        <section className={pageStyles.mascotBannerCard}>
          <div className={pageStyles.mascotSection}>
            <div className={pageStyles.sproutMascotWrapper}>
              <Bone className={styles.mascot} />
            </div>
            <div className={styles.bubbleLines}>
              <Bone className={styles.textMd} style={{ width: '90%' }} />
              <Bone className={styles.textMd} style={{ width: '65%' }} />
            </div>
          </div>
          <div className={pageStyles.bannerDivider} />
          <div className={pageStyles.tipSection}>
            <Bone className={styles.tipIcon} />
            <div className={`${pageStyles.tipContent} ${styles.tipLines}`}>
              <Bone className={styles.textSm} style={{ width: 32 }} />
              <Bone className={styles.textMd} style={{ width: '95%' }} />
              <Bone className={styles.textMd} style={{ width: '70%' }} />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

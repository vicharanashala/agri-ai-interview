'use client';

import React from 'react';
import BrandLogos from '@/components/BrandLogos';
import ProfileNavButton from '@/components/ProfileNavButton';
import styles from './CandidateNavbar.module.css';

export default function CandidateNavbar() {
  return (
    <nav className={styles.topNavbar}>
      <div className={styles.navbarContent}>
        {/* 3 Brand Logos */}
        <BrandLogos variant="header" />

        {/* Right Header: FAQ & Help + Profile Menu */}
        <div className={styles.navbarRight}>
          <ProfileNavButton showFaqHeaderButton={true} />
        </div>
      </div>
    </nav>
  );
}

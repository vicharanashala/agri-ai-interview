import React from 'react';
import styles from './BrandLogos.module.css';

interface BrandLogosProps {
  variant?: 'header' | 'login';
  showSubtitle?: boolean;
  className?: string;
}

export default function BrandLogos({
  variant = 'header',
  showSubtitle = true,
  className = '',
}: BrandLogosProps) {
  const isLogin = variant === 'login';

  return (
    <div className={`${styles.wrapper} ${isLogin ? styles.wrapperLogin : ''} ${className}`}>
      <div className={`${styles.logoGroup} ${isLogin ? styles.logoGroupLogin : ''}`}>
        <img
          src="/annam-logo.png"
          alt="ANNAM.AI"
          className={`${styles.logo} ${styles.annamLogo} ${isLogin ? styles.annamLogoLogin : ''}`}
        />
        <span className={styles.divider} />
        <img
          src="/samagama-logo.png"
          alt="Samagama"
          className={`${styles.logo} ${styles.samagamaLogo} ${isLogin ? styles.samagamaLogoLogin : ''}`}
        />
        <span className={styles.divider} />
        <img
          src="/vibe-logo.png"
          alt="ViBe"
          className={`${styles.logo} ${styles.vibeLogo} ${isLogin ? styles.vibeLogoLogin : ''}`}
        />
      </div>
    </div>
  );
}

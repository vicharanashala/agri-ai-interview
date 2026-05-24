'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface CandidateInfo {
  name: string;
  email: string;
}

export default function SigningPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [hasSigned, setHasSigned] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [isAgreed, setIsAgreed] = useState(false);
  const [candidate, setCandidate] = useState<CandidateInfo | null>(null);
  const [isOfferSigned, setIsOfferSigned] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('offerSigned') === 'true';
    }
    return false;
  });
  const router = useRouter();

  useEffect(() => {
    const currentPhase = localStorage.getItem('interviewPhase');
    if (currentPhase && parseInt(currentPhase) < 4) {
      router.push('/dashboard');
    } else {
      // Fetch candidate info for the offer letter name
      const fetchCandidate = async () => {
        try {
          const response = await fetch('/api/candidate');
          if (response.ok) {
            const data = await response.json();
            setCandidate(data);
          }
        } catch (error) {
          console.error('Error fetching candidate:', error);
        }
      };
      fetchCandidate();
      setIsLoading(false);
    }
  }, [router]);

  const getSigningDate = () => {
    return new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const handleSignatureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSignatureName(e.target.value);
    updateSigningState(e.target.value, isAgreed);
  };

  const handleAgreementChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsAgreed(e.target.checked);
    updateSigningState(signatureName, e.target.checked);
  };

  const updateSigningState = (name: string, agreed: boolean) => {
    if (name.trim().length > 2 && agreed) {
      setHasSigned(true);
    } else {
      setHasSigned(false);
    }
  };

  const handleSign = () => {
    if (!hasSigned) {
      alert('Please enter your full legal name and agree to the terms to sign.');
      return;
    }
    // Update phase to 6 (Signing complete, Joining Details in progress)
    // Also update sessionStorage to ensure dashboard picks up the change
    localStorage.setItem('interviewPhase', '6');
    sessionStorage.setItem('interviewPhase', '6');
    localStorage.setItem('offerSigned', 'true');
    setIsOfferSigned(true);
  };

  const handleDownloadSignedOfferLetter = () => {
    const name = candidate?.name || 'Candidate';
    const email = candidate?.email || '';
    window.open(`/api/offer-letter?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&action=sign`, '_blank');
  };

  const handleGoToDashboard = () => {
    // Force a hard navigation to ensure dashboard re-reads phase from storage
    window.location.href = '/dashboard';
  };

  if (isLoading) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        {isOfferSigned ? (
          <>
            <div className={styles.icon}>🎉</div>
            <h1 className={styles.title}>Offer Signed Successfully!</h1>
            <p className={styles.subtitle}>
              Congratulations! You have accepted the offer. Download your signed offer letter below.
            </p>

            <div className={styles.signatureCard}>
              <div className={styles.successMessage}>
                <span className={styles.successIcon}>✓</span>
                <span>Your signature has been recorded on {getSigningDate()}</span>
              </div>

              <button 
                onClick={handleDownloadSignedOfferLetter} 
                className={styles.downloadSignedButton}
              >
                📄 Download Signed Offer Letter
              </button>

              <button 
                onClick={handleGoToDashboard} 
                className={styles.dashboardButton}
              >
                Go to Dashboard
              </button>
            </div>
          </>
        ) : (
          <>
            <div className={styles.icon}>✍️</div>
            <h1 className={styles.title}>Sign Your Offer</h1>
            <p className={styles.subtitle}>
              Review your offer details and sign to confirm your acceptance.
            </p>

            <div className={styles.signatureCard}>
              <div className={styles.detailsGrid}>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Position</span>
                  <span className={styles.detailValue}>Senior Agricultural Consultant</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Start Date</span>
                  <span className={styles.detailValue}>January 15, 2025</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Location</span>
                  <span className={styles.detailValue}>Remote / Hybrid</span>
                </div>
                <div className={styles.detailItem}>
                  <span className={styles.detailLabel}>Salary</span>
                  <span className={styles.detailValue}>₹5,000 per month</span>
                </div>
              </div>

              <div className={styles.signatureBox}>
                <label className={styles.signatureLabel}>Digital Signature</label>
                <p className={styles.signatureInstructions}>
                  Enter your full legal name below to sign
                </p>
                <input
                  type="text"
                  className={styles.signatureInput}
                  value={signatureName}
                  onChange={handleSignatureChange}
                  placeholder="Type your full name"
                />
                {signatureName.trim().length > 2 && (
                  <div className={styles.signaturePreview}>
                    <span className={styles.signatureLabel}>Signature Preview:</span>
                    <div className={styles.signatureDisplay}>{signatureName}</div>
                  </div>
                )}
              </div>

              <div className={styles.dateField}>
                <span className={styles.detailLabel}>Date of Signing</span>
                <span className={styles.dateValue}>{getSigningDate()}</span>
              </div>

              <div className={styles.agreementBox}>
                <label className={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={isAgreed}
                    onChange={handleAgreementChange}
                    className={styles.checkbox}
                  />
                  <span>
                    I have read and agree to the terms and conditions of the employment offer.
                    I understand that this digital signature is legally binding.
                  </span>
                </label>
              </div>

              <button 
                onClick={handleSign} 
                className={styles.signButton}
                disabled={!hasSigned}
              >
                {hasSigned ? 'Sign & Accept Offer' : 'Agree to terms and enter your name to sign'}
              </button>

              <p className={styles.terms}>
                By signing, you agree to the terms and conditions of your employment offer.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

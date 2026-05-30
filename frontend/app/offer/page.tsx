'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';

export default function OfferPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [candidateInfo, setCandidateInfo] = useState({ name: '', email: '', phone: '' });
  const router = useRouter();

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [isPdfLoading, setIsPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [isOfferSigned, setIsOfferSigned] = useState(false);

  useEffect(() => {
    (async () => {
      const currentPhase = localStorage.getItem('interviewPhase');
      const offerSigned = localStorage.getItem('offerSigned') === 'true';
      setIsOfferSigned(offerSigned);

      if (currentPhase && parseInt(currentPhase) < 3) {
        router.push('/dashboard');
      } else {
        // Phase 4 (View Offer Letter) — only update phase if offer is not already signed
        if (!offerSigned) {
          localStorage.setItem('interviewPhase', '4');
          await syncPhaseToDb(4); // Sync to DB so admin sees correct phase
        }

        // Get candidate info from localStorage
        const name = localStorage.getItem('candidateName') || 'Candidate';
        const email = localStorage.getItem('candidateEmail') || 'candidate@email.com';
        const phone = localStorage.getItem('candidatePhone') || '+91 9876543210';
        setCandidateInfo({ name, email, phone });
        setIsLoading(false);
      }
    })();
  }, [router]);

  const fetchPdfUrl = async () => {
    setIsPdfLoading(true);
    setPdfError(null);

    try {
      const { name, email, phone } = candidateInfo;
      const response = await fetch(
        `/api/offer-letter?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&action=view`
      );

      if (!response.ok) {
        throw new Error('Failed to load offer letter');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      // Mark that the offer letter has been viewed — unlocks "Submit Signed Offer" in dashboard
      localStorage.setItem('offerLetterViewed', 'true');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to load offer letter');
    } finally {
      setIsPdfLoading(false);
    }
  };

  const handleViewOffer = async () => {
    setIsModalOpen(true);
    await fetchPdfUrl();
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    setPdfError(null);
  };

  const handleRetry = async () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl);
      setPdfUrl(null);
    }
    await fetchPdfUrl();
  };

  const handleDownloadOffer = () => {
    // Download offer letter
    const { name, email, phone } = candidateInfo;
    const url = `/api/offer-letter?name=${encodeURIComponent(name)}&email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}&action=download`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `Offer_Letter_${name.replace(/\s+/g, '_')}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleESign = async () => {
    // Advance to Phase 5 (Submit Signed Offer)
    await syncPhaseToDb(5);
    router.push('/dashboard');
  };

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isModalOpen) {
        handleCloseModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isModalOpen]);

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
        <div className={styles.successIcon}>🎉</div>
        <h1 className={styles.title}>Congratulations!</h1>
        <p className={styles.subtitle}>
          You have successfully completed your interview. Find your offer details
        </p>

        <div className={styles.offerCard}>
          <h2 className={styles.offerTitle}>Your Offer Letter</h2>
          <p className={styles.offerDescription}>
            Your offer letter is ready for review. Click below to view or download the details.
          </p>
          
          <div className={styles.offerPreview}>
            <div className={styles.offerDoc}>
              <div className={styles.docIcon}>📄</div>
              <div className={styles.docInfo}>
                <span className={styles.docName}>Offer_Letter_{new Date().getFullYear()}.pdf</span>
                <span className={styles.docDate}>Agri Expert Internship</span>
              </div>
            </div>
          </div>

          <div className={styles.buttonGroup}>
            <button onClick={handleViewOffer} className={styles.viewButton}>
              View Offer Letter
            </button>
            <button onClick={handleDownloadOffer} className={styles.downloadButton}>
              Download Offer Letter
            </button>
          </div>

          <div className={styles.esignSection}>
            {isOfferSigned ? (
              <button disabled className={styles.esignButton} style={{ opacity: 0.6, cursor: 'not-allowed' }}>
                ✓ Offer Letter Signed
              </button>
            ) : (
              <button onClick={handleESign} className={styles.esignButton}>
                E-Sign the offer letter
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Offer Letter Modal */}
      {isModalOpen && (
        <div className={styles.modalOverlay} onClick={handleCloseModal}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>Offer Letter</h3>
              <button className={styles.closeButton} onClick={handleCloseModal} aria-label="Close">
                ×
              </button>
            </div>
            <div className={styles.modalContent}>
              {isPdfLoading && (
                <div className={styles.modalLoading}>
                  <div className={styles.spinner}></div>
                </div>
              )}
              {pdfError && (
                <div className={styles.modalError}>
                  <p>⚠️ {pdfError}</p>
                  <button onClick={handleRetry} className={styles.retryButton}>
                    Try Again
                  </button>
                </div>
              )}
              {pdfUrl && !pdfError && (
                <div className={styles.pdfContainer}>
                  <iframe
                    src={pdfUrl}
                    title="Offer Letter"
                    allow="autoplay"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import PhotoCaptureModal from '@/components/PhotoCaptureModal';
import { authFetch } from '@/lib/auth-fetch';
import { compareFaces, loadFaceModels, detectSingleFace } from '@/lib/faceMatch';

type VerifyState =
  | 'loading'
  | 'no_photo'
  | 'camera'
  | 'verifying'
  | 'success'
  | 'fail'
  | 'retries_exhausted';

const MAX_RETRIES = 3;

export default function VerifyPage() {
  const router = useRouter();

  // Guard: require session token before loading
  useEffect(() => {
    const token = sessionStorage.getItem('candidate_session_token');
    if (!token) {
      router.replace('/post-login?callbackUrl=/verify');
    }
  }, [router]);
  const [state, setState] = useState<VerifyState>('loading');
  const [storedPhotoData, setStoredPhotoData] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [matchResult, setMatchResult] = useState<{
    message: string;
    score: number;
  } | null>(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [modelsReady, setModelsReady] = useState(false);
  const [cameraStreamError, setCameraStreamError] = useState<string | null>(null);
  const verificationAttempts = useRef(0);

  // ── Load stored onboarding photo + warm up face-api models ──────────────
  useEffect(() => {
    const init = async () => {
      try {
        // Load face-api.js models in background (non-blocking)
        loadFaceModels().then(() => setModelsReady(true)).catch(() => {});

        const photoRes = await authFetch('/api/candidate/photo');
        if (!photoRes.ok) {
          setState('no_photo');
          return;
        }
        const photoJson = await photoRes.json();
        if (!photoJson.photoData) {
          setState('no_photo');
          return;
        }

        setStoredPhotoData(photoJson.photoData);
        setState('camera');
        // Auto-open camera immediately
        setShowCameraModal(true);
      } catch {
        setState('no_photo');
      }
    };
    init();
  }, []);

  // ── Handle captured verification photo ─────────────────────────────────
  const handleVerifyCapture = useCallback(
    async (capturedPhoto: string) => {
      setShowCameraModal(false);
      setState('verifying');

      try {
        // First: ensure the captured photo has exactly one face
        const detection = await detectSingleFace(capturedPhoto);
        if (!detection.ok) {
          setMatchResult({ message: detection.message, score: 0 });
          verificationAttempts.current += 1;
          setState('fail');
          return;
        }

        // Second: compare against stored onboarding photo
        const result = await compareFaces(storedPhotoData!, capturedPhoto);
        setMatchResult({ message: result.message, score: result.matchScore });

        if (result.match) {
          sessionStorage.setItem('identityVerified', 'true');
          setState('success');
          // Redirect to interview after brief success display
          setTimeout(() => {
            router.push('/interview');
          }, 1500);
        } else {
          verificationAttempts.current += 1;
          setRetryCount(verificationAttempts.current);
          if (verificationAttempts.current >= MAX_RETRIES) {
            setState('retries_exhausted');
            // Log flag event to backend
            authFetch('/api/candidate/presence/check', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ event: 'identity_retry_exhausted' }),
            }).catch(() => {});
          } else {
            setState('fail');
          }
        }
      } catch (err) {
        setMatchResult({ message: 'Verification failed. Please try again.', score: 0 });
        setState('fail');
      }
    },
    [storedPhotoData, router]
  );

  const handleRetry = () => {
    setMatchResult(null);
    setState('camera');
    setShowCameraModal(true);
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  return (
    <main className={styles.container}>
      <div className={styles.card}>

        {/* ── Loading ─────────────────────────────────────────────────── */}
        {state === 'loading' && (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <h2>Preparing verification…</h2>
            <p>Loading your identity photo and warming up the camera.</p>
          </div>
        )}

        {/* ── No onboarding photo ─────────────────────────────────────── */}
        {state === 'no_photo' && (
          <div className={styles.stateBox}>
            <div className={styles.iconBox}>🖼️</div>
            <h2>No Identity Photo Found</h2>
            <p>
              We couldn&apos;t find your onboarding photo. Please go back and complete
              onboarding again to capture your identity photo.
            </p>
            <button className={styles.primaryBtn} onClick={handleGoToDashboard}>
              Go to Dashboard
            </button>
          </div>
        )}

        {/* ── Verifying ───────────────────────────────────────────────── */}
        {state === 'verifying' && (
          <div className={styles.stateBox}>
            <div className={styles.spinner} />
            <h2>Verifying Identity…</h2>
            <p>Comparing your photo against your onboarding photo. Please wait.</p>
            {!modelsReady && (
              <p className={styles.subNote}>Loading face recognition models (first time only)…</p>
            )}
          </div>
        )}

        {/* ── Success ─────────────────────────────────────────────────── */}
        {state === 'success' && (
          <div className={styles.stateBox}>
            <div className={`${styles.iconBox} ${styles.successIcon}`}>✓</div>
            <h2>Identity Verified!</h2>
            <p>Your identity has been confirmed. Starting your interview…</p>
          </div>
        )}

        {/* ── Fail ────────────────────────────────────────────────────── */}
        {state === 'fail' && (
          <div className={styles.stateBox}>
            <div className={`${styles.iconBox} ${styles.failIcon}`}>✕</div>
            <h2>Verification Failed</h2>
            <p>{matchResult?.message ?? 'Your photo did not match your onboarding photo.'}</p>
            <p className={styles.retryInfo}>
              Retry {retryCount} of {MAX_RETRIES}
            </p>
            <div className={styles.btnRow}>
              <button className={styles.secondaryBtn} onClick={handleGoToDashboard}>
                Go to Dashboard
              </button>
              <button className={styles.primaryBtn} onClick={handleRetry}>
                Try Again
              </button>
            </div>
          </div>
        )}

        {/* ── Retries exhausted ───────────────────────────────────────── */}
        {state === 'retries_exhausted' && (
          <div className={styles.stateBox}>
            <div className={`${styles.iconBox} ${styles.failIcon}`}>⚠️</div>
            <h2>Verification Unsuccessful</h2>
            <p>
              We were unable to verify your identity after {MAX_RETRIES} attempts.
              Your session has been flagged for review.
            </p>
            <p className={styles.subNote}>
              Please contact the recruitment team or try again later.
            </p>
            <button className={styles.secondaryBtn} onClick={handleGoToDashboard}>
              Go to Dashboard
            </button>
          </div>
        )}

        {/* ── Camera auto-trigger (no photo taken yet) ────────────────── */}
        {state === 'camera' && !showCameraModal && (
          <div className={styles.stateBox}>
            <div className={styles.iconBox}>📷</div>
            <h2>Identity Verification Required</h2>
            <p>Position your face clearly in the camera to verify your identity.</p>
            <button className={styles.primaryBtn} onClick={() => setShowCameraModal(true)}>
              Open Camera & Verify
            </button>
          </div>
        )}
      </div>

      {/* Photo Capture Modal */}
      {showCameraModal && state === 'camera' && storedPhotoData && (
        <PhotoCaptureModal
          title="Verify Your Identity"
          subtitle="Look directly at the camera and ensure your face is clearly visible"
          instruction="Position your face in the center of the frame with good lighting"
          confirmLabel="Verify Identity"
          onCapture={handleVerifyCapture}
          onClose={() => {
            setShowCameraModal(false);
            // If user closed without capturing, go back to dashboard
            if (state === 'camera') {
              router.push('/dashboard');
            }
          }}
          showRetake
          required
        />
      )}
    </main>
  );
}
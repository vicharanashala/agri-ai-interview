'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './CameraCorner.module.css';
import { useCamera } from '@/hooks/useCamera';
import { compareFaces } from '@/lib/faceMatch';
import { authFetch } from '@/lib/auth-fetch';

interface CameraCornerProps {
  /** Reference photo (base64 data URL) used for presence comparison */
  referencePhoto: string;
  /** How often to run a presence check, in milliseconds. 0 = disabled. Default: 0 (opt-in). */
  presenceCheckIntervalMs?: number;
  /** Called when a presence violation is detected */
  onPresenceViolation?: (msg: string) => void;
  /** Called when camera becomes unavailable */
  onCameraError?: (msg: string) => void;
  /** Extra class for the wrapper */
  className?: string;
}

const PRESENCE_CHECK_INTERVAL_DEFAULT = 45_000; // 45 seconds
const CAMERA_ERRORS = {
  NOT_FOUND: 'Camera not found.',
  NOT_ALLOWED: 'Camera access denied.',
  NOT_READABLE: 'Camera is in use by another app.',
  UNKNOWN: 'Camera unavailable.',
};

export default function CameraCorner({
  referencePhoto,
  presenceCheckIntervalMs = 0,
  onPresenceViolation,
  onCameraError,
  className,
}: CameraCornerProps) {
  const { videoRef, error: cameraError, isReady, startCamera, stopCamera, captureFrame } = useCamera({ autoStart: false });
  const [cameraVisible, setCameraVisible] = useState(false);
  const [cameraWarning, setCameraWarning] = useState<string | null>(null);
  const [presenceOk, setPresenceOk] = useState(true);
  const presenceIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCheckRef = useRef<number>(0);
  const violationCountRef = useRef(0);

  // ── Start camera on mount ──────────────────────────────────────────────
  useEffect(() => {
    startCamera();
    return () => {
      stopCamera();
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Notify parent of camera errors ────────────────────────────────────
  useEffect(() => {
    if (cameraError) {
      const msg = CAMERA_ERRORS[cameraError as keyof typeof CAMERA_ERRORS] ?? cameraError;
      setCameraWarning(msg);
      onCameraError?.(msg);
    } else {
      setCameraWarning(null);
    }
  }, [cameraError, onCameraError]);

  // ── Presence check loop ────────────────────────────────────────────────
  const runPresenceCheck = useCallback(async () => {
    if (!isReady || presenceCheckIntervalMs <= 0) return;

    const frame = captureFrame();
    if (!frame) return;

    try {
      const result = await compareFaces(referencePhoto, frame);
      if (!result.detected || !result.match) {
        violationCountRef.current += 1;
        setPresenceOk(false);
        const msg = result.detected
          ? `Identity mismatch detected (${violationCountRef.current})`
          : result.message;

        onPresenceViolation?.(msg);

        // Log to backend
        authFetch('/api/candidate/presence/check', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: 'presence_mismatch',
            violation_count: violationCountRef.current,
            match_score: result.matchScore,
          }),
        }).catch(() => {});

        setTimeout(() => setPresenceOk(true), 5000);
      }
    } catch {
      // Silent — don't disrupt interview for network/model errors
    }
  }, [isReady, captureFrame, referencePhoto, presenceCheckIntervalMs, onPresenceViolation]);

  useEffect(() => {
    if (!isReady || presenceCheckIntervalMs <= 0) return;

    // Run first check after half the interval
    const initial = setTimeout(runPresenceCheck, presenceCheckIntervalMs / 2);

    presenceIntervalRef.current = setInterval(() => {
      // Skip if last check was very recent (tab may have been hidden)
      if (Date.now() - lastCheckRef.current < presenceCheckIntervalMs * 0.5) return;
      lastCheckRef.current = Date.now();
      runPresenceCheck();
    }, presenceCheckIntervalMs);

    return () => {
      clearTimeout(initial);
      if (presenceIntervalRef.current) clearInterval(presenceIntervalRef.current);
    };
  }, [isReady, presenceCheckIntervalMs, runPresenceCheck]);

  const toggleCamera = () => {
    if (cameraVisible) {
      stopCamera();
      setCameraVisible(false);
    } else {
      startCamera();
      setCameraVisible(true);
    }
  };

  return (
    <div className={`${styles.wrapper} ${className ?? ''}`}>
      {/* Camera pill */}
      <div className={styles.pill}>
        {/* Video / placeholder */}
        <div className={styles.videoBox}>
          {cameraWarning ? (
            <div className={styles.errorState} title={cameraWarning}>
              <span className={styles.errorIcon}>⚠️</span>
              <span className={styles.errorDot} />
            </div>
          ) : isReady ? (
            // eslint-disable-next-line jsx-a11y/media-has-caption
            <video
              ref={videoRef as React.RefObject<HTMLVideoElement>}
              autoPlay
              playsInline
              muted
              className={styles.video}
            />
          ) : (
            <div className={styles.loadingState}>
              <div className={styles.miniSpinner} />
            </div>
          )}
          {/* Presence indicator dot */}
          {isReady && !cameraWarning && (
            <span
              className={`${styles.presenceDot} ${presenceOk ? styles.dotOk : styles.dotFail}`}
              title={presenceOk ? 'Identity confirmed' : 'Identity check failed'}
            />
          )}
        </div>

        {/* Controls */}
        <div className={styles.controls}>
          <span className={styles.label}>📷 Live</span>
          <button
            className={styles.toggleBtn}
            onClick={toggleCamera}
            title={cameraVisible ? 'Hide camera' : 'Show camera'}
          >
            {cameraVisible ? '−' : '+'}
          </button>
        </div>
      </div>

      {/* Camera warning toast */}
      {cameraWarning && (
        <div className={styles.warningToast}>
          <span>⚠️ Camera: {cameraWarning}</span>
          <button className={styles.retryBtn} onClick={() => startCamera()}>Retry</button>
        </div>
      )}
    </div>
  );
}
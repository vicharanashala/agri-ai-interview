'use client';

import React, { useState, useCallback } from 'react';
import styles from './PhotoCaptureModal.module.css';
import { useCamera } from '@/hooks/useCamera';

export interface PhotoCaptureModalProps {
  title: string;
  subtitle?: string;
  instruction?: string;
  retakeLabel?: string;
  confirmLabel?: string;
  onCapture: (photoData: string) => void;
  onClose?: () => void;
  initialPhoto?: string | null;  // if provided, show this as pre-captured
  showRetake?: boolean;
  required?: boolean;
}

export default function PhotoCaptureModal({
  title,
  subtitle,
  instruction = 'Position your face in the center of the frame',
  retakeLabel = 'Retake',
  confirmLabel = 'Confirm',
  onCapture,
  onClose,
  initialPhoto = null,
  showRetake = true,
  required = true,
}: PhotoCaptureModalProps) {
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(initialPhoto);
  const [hasRetaken, setHasRetaken] = useState(false);
  const { videoRef, error: cameraError, isLoading, isReady, startCamera, stopCamera, captureFrame } = useCamera();

  const handleCapture = useCallback(() => {
    const frame = captureFrame();
    if (frame) {
      setCapturedPhoto(frame);
      setHasRetaken(true);
    }
  }, [captureFrame]);

  const handleRetake = useCallback(() => {
    setCapturedPhoto(null);
    setHasRetaken(false);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!capturedPhoto) return;
    onCapture(capturedPhoto);
  }, [capturedPhoto, onCapture]);

  const handleClose = useCallback(() => {
    stopCamera();
    onClose?.();
  }, [stopCamera, onClose]);

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerContent}>
            <div className={styles.icon}>📷</div>
            <div>
              <h2 className={styles.title}>{title}</h2>
              {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            </div>
          </div>
          {onClose && (
            <button className={styles.closeButton} onClick={handleClose} aria-label="Close">
              ✕
            </button>
          )}
        </div>

        {/* Camera / Preview area */}
        <div className={styles.cameraArea}>
          {cameraError ? (
            <div className={styles.cameraError}>
              <div className={styles.errorIcon}>⚠️</div>
              <p className={styles.errorText}>{cameraError}</p>
              <button className={styles.retryButton} onClick={() => startCamera()}>
                Try Again
              </button>
            </div>
          ) : capturedPhoto ? (
            <div className={styles.previewWrapper}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={capturedPhoto} alt="Captured" className={styles.previewImage} />
              <div className={styles.previewOverlay}>
                <div className={styles.faceOutline} />
              </div>
            </div>
          ) : (
            <div className={styles.cameraWrapper}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <video
                ref={videoRef as React.RefObject<HTMLVideoElement>}
                autoPlay
                playsInline
                muted
                className={styles.video}
              />
              <div className={styles.cameraOverlay}>
                <div className={styles.faceOutline} />
              </div>
              {isLoading && (
                <div className={styles.loadingOverlay}>
                  <div className={styles.spinner} />
                  <p>Starting camera...</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Instruction text */}
        <div className={styles.instructionBox}>
          <p className={styles.instruction}>
            {capturedPhoto
              ? '✅ Photo captured successfully!'
              : isLoading
              ? '⏳ Please wait, accessing your camera...'
              : instruction}
          </p>
        </div>

        {/* Action buttons */}
        <div className={styles.actions}>
          {capturedPhoto ? (
            <>
              {showRetake && (
                <button
                  className={styles.retakeButton}
                  onClick={handleRetake}
                  disabled={isLoading}
                >
                  {retakeLabel}
                </button>
              )}
              <button
                className={styles.confirmButton}
                onClick={handleConfirm}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button
              className={styles.captureButton}
              onClick={handleCapture}
              disabled={!isReady || isLoading}
            >
              {isReady ? '📸 Capture Photo' : 'Waiting for camera...'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
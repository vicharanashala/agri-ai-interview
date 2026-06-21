'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface CameraState {
  stream: MediaStream | null;
  error: string | null;
  isLoading: boolean;
  isReady: boolean;
}

export interface UseCameraReturn {
  stream: MediaStream | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: string | null;
  isLoading: boolean;
  isReady: boolean;
  startCamera: () => Promise<void>;
  stopCamera: () => void;
  captureFrame: () => string | null;  // returns base64 data URL
}

const CAMERA_ERRORS = {
  NOT_FOUND: 'No camera found. Please connect a camera and try again.',
  NOT_ALLOWED: 'Camera access denied. Please allow camera access in your browser settings.',
  NOT_READABLE: 'Camera is in use by another application.',
  UNKNOWN: 'Unable to access camera. Please check your device settings.',
};

function getCameraError(error: Error): string {
  const e = error as Error & { name?: string };
  if (e.name === 'NotAllowedError' || e.name === 'PermissionDeniedError') {
    return CAMERA_ERRORS.NOT_ALLOWED;
  }
  if (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') {
    return CAMERA_ERRORS.NOT_FOUND;
  }
  if (e.name === 'NotReadableError' || e.name === 'TrackStartError') {
    return CAMERA_ERRORS.NOT_READABLE;
  }
  return CAMERA_ERRORS.UNKNOWN;
}

export interface UseCameraOptions {
  /** If true, camera starts automatically on mount and stops on unmount. Default: true. */
  autoStart?: boolean;
}

export function useCamera(options: UseCameraOptions = {}): UseCameraReturn {
  const { autoStart = true } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(false);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsReady(false);
    setError(null);
  }, []);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    stopCamera();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 640 },
          height: { ideal: 480 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsReady(true);
    } catch (err) {
      const message = getCameraError(err as Error);
      setError(message);
      stopCamera();
    } finally {
      setIsLoading(false);
    }
  }, [stopCamera]);

  // Auto-start on mount only when autoStart is true
  useEffect(() => {
    if (autoStart) {
      startCamera();
      return () => {
        stopCamera();
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  const captureFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !isReady) return null;

    // Ensure video has a valid frame
    if (video.readyState < 2) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Mirror the image (selfie view)
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);

    return canvas.toDataURL('image/jpeg', 0.92);
  }, [isReady]);

  return {
    stream: streamRef.current,
    videoRef,
    error,
    isLoading,
    isReady,
    startCamera,
    stopCamera,
    captureFrame,
  };
}
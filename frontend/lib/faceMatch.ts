'use client';

/**
 * Face matching utilities using face-api.js (browser-based).
 *
 * Model weights are loaded from a CDN on first use and cached in IndexedDB.
 * This avoids bundling ~5MB of model files into the app.
 *
 * Required models:
 *   - tiny_face_detector_model (fast detection)
 *   - face_recognition_model (128D embedding)
 */

import * as faceapi from 'face-api.js';

// ── Model manifest ────────────────────────────────────────────────────────────

const MODEL_URL = 'https://justadudewhohacks.github.io/face-api.js/weights';

let modelsLoaded = false;
let _loadPromise: Promise<void> | null = null;

export async function loadFaceModels(): Promise<void> {
  if (modelsLoaded) return;
  if (_loadPromise) return _loadPromise;

  _loadPromise = (async () => {
    console.log('[FaceMatch] Loading face-api.js models...');
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
    modelsLoaded = true;
    console.log('[FaceMatch] Models loaded successfully');
  })();

  return _loadPromise;
}

export function areModelsLoaded(): boolean {
  return modelsLoaded;
}

// ── Detection options ─────────────────────────────────────────────────────────

const DETECT_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

// ── Core matching function ────────────────────────────────────────────────────

export interface FaceMatchResult {
  matchScore: number;      // 0.0 – 1.0
  match: boolean;
  detected: boolean;       // was a face found in both images?
  message: string;
}

/**
 * Compare a verification photo against the stored onboarding photo.
 * Returns a match score based on Euclidean distance between 128D face embeddings.
 */
export async function compareFaces(
  storedPhotoDataUrl: string,   // base64 data URL of onboarding photo
  freshPhotoDataUrl: string,    // base64 data URL of freshly captured photo
  threshold = 0.45,
): Promise<FaceMatchResult> {
  await loadFaceModels();

  // Load both images
  const [img1, img2] = await Promise.all([
    faceapi.fetchImage(storedPhotoDataUrl),
    faceapi.fetchImage(freshPhotoDataUrl),
  ]);

  // Detect faces in both images
  const detections1 = await faceapi
    .detectAllFaces(img1, DETECT_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptors();

  const detections2 = await faceapi
    .detectAllFaces(img2, DETECT_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections1.length === 0 || detections2.length === 0) {
    return {
      matchScore: 0,
      match: false,
      detected: false,
      message:
        detections1.length === 0
          ? 'No face detected in stored photo. Please retake your onboarding photo.'
          : 'No face detected in verification photo. Please ensure your face is clearly visible.',
    };
  }

  if (detections1.length > 1 || detections2.length > 1) {
    return {
      matchScore: 0,
      match: false,
      detected: false,
      message: 'Multiple faces detected. Please ensure only one face is visible.',
    };
  }

  // Compute Euclidean distance between descriptors
  const distance = faceapi.euclideanDistance(
    detections1[0].descriptor,
    detections2[0].descriptor,
  );

  // Convert distance to a 0–1 similarity score
  // face-api.js distance is 0 (identical) to 1 (completely different)
  // We want matchScore to be 1 (identical) to 0 (different)
  const matchScore = Math.max(0, 1 - distance * 2);  // scale and invert
  const match = matchScore >= threshold;

  return {
    matchScore: parseFloat(matchScore.toFixed(3)),
    match,
    detected: true,
    message: match
      ? 'Face verified successfully.'
      : 'Face does not match the onboarding photo. Please try again.',
  };
}

/**
 * Verify a single photo has exactly one clear face.
 */
export async function detectSingleFace(
  photoDataUrl: string,
): Promise<{ ok: boolean; message: string }> {
  await loadFaceModels();

  const img = await faceapi.fetchImage(photoDataUrl);
  const detections = await faceapi
    .detectAllFaces(img, DETECT_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptors();

  if (detections.length === 0) {
    return { ok: false, message: 'No face detected. Please ensure your face is clearly visible.' };
  }
  if (detections.length > 1) {
    return { ok: false, message: 'Multiple faces detected. Only one face should be visible.' };
  }
  return { ok: true, message: 'Face detected.' };
}
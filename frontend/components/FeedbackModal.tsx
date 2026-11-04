'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './FeedbackModal.module.css';

const MAX_TEXT_LENGTH = 2000;
const SUCCESS_AUTO_CONTINUE_MS = 2500;

/** Window event dispatched once feedback is stored, so other mounted UI (dashboard, profile menu) can update. */
export const FEEDBACK_SUBMITTED_EVENT = 'candidate-feedback-submitted';

interface FeedbackModalProps {
  /** Called when the candidate skips (X) or after a successful submission. */
  onFinish: () => void;
}

function extractError(data: { detail?: unknown; message?: string; error?: string }): string {
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return 'Some of the values you entered are invalid. Please review and try again.';
  return data.message || data.error || 'Failed to submit feedback. Please try again.';
}

export default function FeedbackModal({ onFinish }: FeedbackModalProps) {
  const [rating, setRating] = useState<number | null>(null);
  const [comments, setComments] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inFlightRef = useRef(false);

  // After a successful submission, continue automatically to the next modal
  useEffect(() => {
    if (!successMsg) return;
    const timer = setTimeout(onFinish, SUCCESS_AUTO_CONTINUE_MS);
    return () => clearTimeout(timer);
  }, [successMsg, onFinish]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;

    if (!rating) {
      setErrorMsg('Please select a star rating.');
      return;
    }
    setErrorMsg(null);

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/candidate/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionStorage.getItem('candidate_session_token') || ''}`,
        },
        credentials: 'include',
        body: JSON.stringify({
          overall_rating: rating,
          additional_comments: comments.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) {
        window.dispatchEvent(new Event(FEEDBACK_SUBMITTED_EVENT));
        setSuccessMsg(
          data.already_submitted
            ? 'You have already shared your feedback. Thank you!'
            : 'Thank you! Your feedback has been submitted.'
        );
      } else if (res.status === 401) {
        setErrorMsg('Your session has expired. Please log in again to submit feedback.');
      } else {
        setErrorMsg(extractError(data));
      }
    } catch {
      setErrorMsg('Failed to submit feedback. Please check your connection and try again.');
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="feedback-modal-title">
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={styles.closeBtn}
          onClick={onFinish}
          disabled={submitting}
          aria-label="Skip feedback"
          title="Close"
        >
          ✕
        </button>

        {successMsg ? (
          <div className={styles.successState}>
            <div className={styles.successIcon}>✓</div>
            <h2 id="feedback-modal-title" className={styles.title}>Share Your Feedback</h2>
            <p className={styles.successText}>{successMsg}</p>
            <button type="button" className={styles.submitBtn} onClick={onFinish}>
              Continue
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <h2 id="feedback-modal-title" className={styles.title}>Share Your Feedback</h2>

            <span className={styles.label} id="feedback-overall-label">Overall Experience</span>
            <div className={styles.stars} role="radiogroup" aria-labelledby="feedback-overall-label">
              {[1, 2, 3, 4, 5].map((star) => {
                const active = rating !== null && star <= rating;
                return (
                  <button
                    key={star}
                    type="button"
                    role="radio"
                    aria-checked={rating === star}
                    aria-label={`${star} star${star > 1 ? 's' : ''}`}
                    className={`${styles.star} ${active ? styles.starActive : ''}`}
                    onClick={() => {
                      setRating(star);
                      setErrorMsg(null);
                    }}
                    disabled={submitting}
                  >
                    <svg viewBox="0 0 24 24" className={styles.starSvg} aria-hidden="true">
                      <path d="M12 2.5l2.94 5.96 6.56.95-4.75 4.63 1.12 6.54L12 17.5l-5.87 3.08 1.12-6.54L2.5 9.41l6.56-.95L12 2.5z" />
                    </svg>
                  </button>
                );
              })}
            </div>

            <textarea
              className={styles.textarea}
              rows={4}
              maxLength={MAX_TEXT_LENGTH}
              placeholder="Share your experience, any issues you faced, or suggestions for improvement (optional)"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              disabled={submitting}
              aria-label="Written feedback (optional)"
            />

            {errorMsg && <p className={styles.error}>{errorMsg}</p>}

            <button type="submit" className={styles.submitBtn} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

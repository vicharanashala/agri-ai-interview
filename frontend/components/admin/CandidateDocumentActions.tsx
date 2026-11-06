'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  type AdminFetch,
  type CandidateFlag,
  candidateFlagConfirmation,
  candidateFlagMarkedMessage,
  canUseDocumentActions,
  documentsZipFilename,
  fetchDocumentsZip,
  toggleCandidateFlag,
} from '@/lib/admin-candidate-actions';

// Document actions moved from the former Admin → Documents tab (same styles and rules),
// used in the All Candidates "Action" column and on the candidate profile.

export interface ActionCandidate {
  id: string;
  fullName?: string | null;
  email?: string | null;
  currentPhase?: string | null;
  documentsSubmitted?: boolean | null;
  isSelected?: boolean | null;
  isNotJoined?: boolean | null;
  isDeleted?: boolean | null;
}

interface CommonProps {
  candidate: ActionCandidate;
  adminFetch: AdminFetch;
  onError: (message: string) => void;
}

// Buttons may sit inside a clickable table row: keep their clicks from opening the profile.
const stop = (e: React.SyntheticEvent) => e.stopPropagation();

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** "Download ZIP" of all the candidate's documents. Link-style by default; pass className to restyle. */
export function DocumentsZipButton({ candidate, adminFetch, onError, className }: CommonProps & { className?: string }) {
  const [busy, setBusy] = useState(false);
  const download = async (e: React.MouseEvent) => {
    stop(e);
    setBusy(true);
    try {
      saveBlob(await fetchDocumentsZip(adminFetch, candidate.id), documentsZipFilename(candidate.fullName));
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Documents ZIP download failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      className={className}
      style={
        className
          ? undefined
          : {
              color: '#08CB00',
              background: 'none',
              border: 'none',
              cursor: busy ? 'default' : 'pointer',
              fontSize: 13,
              padding: 0,
              opacity: busy ? 0.6 : 1,
              whiteSpace: 'nowrap',
            }
      }
    >
      {busy ? 'Downloading…' : className ? '⬇ Download ZIP' : 'Download ZIP'}
    </button>
  );
}

/**
 * Label that always reserves the width of its longest alternative (the others are rendered invisibly in
 * the same grid cell), so toggling "Mark" ↔ "Unmark" does not resize a table column.
 */
function StableLabel({ text, alternatives }: { text: string; alternatives: string[] }) {
  return (
    <span style={{ display: 'inline-grid' }}>
      <span style={{ gridArea: '1 / 1' }}>{text}</span>
      {alternatives
        .filter((alt) => alt !== text)
        .map((alt) => (
          <span key={alt} aria-hidden="true" style={{ gridArea: '1 / 1', visibility: 'hidden' }}>
            {alt}
          </span>
        ))}
    </span>
  );
}

/** Confirmation before marking a candidate (same look as the Course Completion bypass modal). */
function MarkConfirmModal({
  flag,
  candidate,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  flag: CandidateFlag;
  candidate: ActionCandidate;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const { title, label, explanation } = candidateFlagConfirmation[flag];
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);
  // Portal events still bubble through the React tree, so the row's handlers must be stopped here.
  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.6)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
      }}
      onClick={(e) => {
        stop(e);
        if (!busy) onCancel();
      }}
      onContextMenu={stop}
      onKeyDown={stop}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="mark-confirm-title"
        style={{
          background: '#fff',
          borderRadius: '12px',
          padding: '24px',
          width: '420px',
          maxWidth: '90vw',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }}
        onClick={stop}
      >
        <h3 id="mark-confirm-title" style={{ margin: '0 0 16px', fontSize: '18px', fontWeight: 700, color: '#111827' }}>
          {title}
        </h3>
        <p style={{ margin: '0 0 12px', fontSize: '14px', color: '#4b5563', lineHeight: '1.5', overflowWrap: 'anywhere' }}>
          Mark <strong>{candidate.fullName?.trim() || 'this candidate'}</strong>
          {candidate.email ? ` (${candidate.email})` : ''} as {label}?
        </p>
        <p style={{ margin: '0 0 24px', fontSize: '14px', color: '#4b5563', lineHeight: '1.5' }}>{explanation}</p>
        {error && (
          <p role="alert" style={{ margin: '0 0 16px', fontSize: '14px', color: '#dc2626', lineHeight: '1.5' }}>
            {error}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button
            type="button"
            autoFocus
            disabled={busy}
            onClick={onCancel}
            style={{
              background: '#f3f4f6',
              color: '#4b5563',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={onConfirm}
            style={{
              background: flag === 'selected' ? '#08CB00' : '#dc2626',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              padding: '8px 16px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Updating…' : 'Confirm'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Confirm-then-mark flow shared by the All Candidates and Documents tabs. Call `request` from a Mark button and
 * render `modal`; failures stay in the modal for retry. `onUpdated` receives the value the backend stored.
 */
export function useMarkConfirmation({
  adminFetch,
  onUpdated,
  onMarked,
}: {
  adminFetch: AdminFetch;
  onUpdated: (candidateId: string, patch: { isSelected?: boolean; isNotJoined?: boolean }) => void;
  onMarked: (message: string) => void;
}) {
  const [pending, setPending] = useState<{ candidate: ActionCandidate; flag: CandidateFlag } | null>(null);
  const [submitting, setSubmitting] = useState<CandidateFlag | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The endpoints toggle, so a second request would undo the first: guard synchronously, ahead of the re-render.
  const inFlight = useRef(false);

  const request = (candidate: ActionCandidate, flag: CandidateFlag) => {
    setError(null);
    setPending({ candidate, flag });
  };

  const confirm = async () => {
    if (!pending || inFlight.current) return;
    const { candidate, flag } = pending;
    inFlight.current = true;
    setSubmitting(flag);
    setError(null);
    try {
      const value = await toggleCandidateFlag(adminFetch, candidate.id, flag);
      onUpdated(candidate.id, flag === 'selected' ? { isSelected: value } : { isNotJoined: value });
      setPending(null);
      onMarked(candidateFlagMarkedMessage(flag, value, candidate.fullName));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update candidate status');
    } finally {
      inFlight.current = false;
      setSubmitting(null);
    }
  };

  const modal = pending && (
    <MarkConfirmModal
      flag={pending.flag}
      candidate={pending.candidate}
      busy={submitting !== null}
      error={error}
      onCancel={() => setPending(null)}
      onConfirm={confirm}
    />
  );

  return { request, submitting, modal };
}

/** Mark Selected / Mark Not Joined toggles; reports the value the backend stored. Marking asks for confirmation first. */
export function CandidateStatusToggles({
  candidate,
  adminFetch,
  onError,
  onUpdated,
  onMarked,
  centered = false,
}: CommonProps & {
  onUpdated: (patch: { isSelected?: boolean; isNotJoined?: boolean }) => void;
  onMarked: (message: string) => void;
  centered?: boolean;
}) {
  const [unmarking, setUnmarking] = useState<CandidateFlag | null>(null);
  const confirmation = useMarkConfirmation({ adminFetch, onUpdated: (_id, patch) => onUpdated(patch), onMarked });
  const busy = unmarking ?? confirmation.submitting;

  const unmark = async (flag: CandidateFlag) => {
    setUnmarking(flag);
    try {
      const value = await toggleCandidateFlag(adminFetch, candidate.id, flag);
      onUpdated(flag === 'selected' ? { isSelected: value } : { isNotJoined: value });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update candidate status');
    } finally {
      setUnmarking(null);
    }
  };

  const handleClick = (e: React.MouseEvent, flag: CandidateFlag) => {
    stop(e);
    const alreadyMarked = flag === 'selected' ? candidate.isSelected : candidate.isNotJoined;
    if (alreadyMarked) {
      unmark(flag);
    } else {
      confirmation.request(candidate, flag);
    }
  };

  const base: React.CSSProperties = {
    padding: '6px 12px',
    border: '1px solid',
    borderRadius: '6px',
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: 'nowrap',
    cursor: busy ? 'default' : 'pointer',
    opacity: busy ? 0.7 : 1,
  };
  return (
    <div
      // centered (table): wrapping is controlled by the table's CSS so it can switch at narrow widths
      style={{ display: 'flex', gap: '8px', ...(centered ? { justifyContent: 'center' } : { flexWrap: 'wrap' }) }}
      onClick={stop}
    >
      <button
        type="button"
        disabled={busy !== null}
        onClick={(e) => handleClick(e, 'selected')}
        style={{
          ...base,
          background: candidate.isSelected ? '#d1fae5' : '#dbeafe',
          color: candidate.isSelected ? '#059669' : '#2563eb',
          borderColor: candidate.isSelected ? '#6ee7b7' : '#bfdbfe',
        }}
      >
        {(() => {
          const text = busy === 'selected' ? 'Updating…' : candidate.isSelected ? 'Unmark Selected' : 'Mark Selected';
          return centered ? <StableLabel text={text} alternatives={['Mark Selected', 'Unmark Selected', 'Updating…']} /> : text;
        })()}
      </button>
      <button
        type="button"
        disabled={busy !== null}
        onClick={(e) => handleClick(e, 'notJoined')}
        style={{
          ...base,
          background: candidate.isNotJoined ? '#fee2e2' : '#f3f4f6',
          color: candidate.isNotJoined ? '#dc2626' : '#4b5563',
          borderColor: candidate.isNotJoined ? '#fca5a5' : '#d1d5db',
        }}
      >
        {(() => {
          const text = busy === 'notJoined' ? 'Updating…' : candidate.isNotJoined ? 'Unmark Not Joined' : 'Mark Not Joined';
          return centered ? <StableLabel text={text} alternatives={['Mark Not Joined', 'Unmark Not Joined', 'Updating…']} /> : text;
        })()}
      </button>
      {confirmation.modal}
    </div>
  );
}

/** All Candidates "Action" column: status toggles only (ZIP download lives on the candidate profile). */
export default function CandidateDocumentActions({
  candidate,
  adminFetch,
  onError,
  onUpdated,
  onMarked,
  centered = false,
}: CommonProps & {
  onUpdated: (patch: { isSelected?: boolean; isNotJoined?: boolean }) => void;
  onMarked: (message: string) => void;
  centered?: boolean;
}) {
  if (!canUseDocumentActions(candidate)) {
    return <span style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>{candidate.isDeleted ? '—' : 'Document Not Submitted'}</span>;
  }
  return <CandidateStatusToggles candidate={candidate} adminFetch={adminFetch} onError={onError} onUpdated={onUpdated} onMarked={onMarked} centered={centered} />;
}

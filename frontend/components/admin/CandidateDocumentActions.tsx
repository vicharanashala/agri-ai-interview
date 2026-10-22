'use client';

import { useState } from 'react';
import {
  type AdminFetch,
  type CandidateFlag,
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

/** Mark Selected / Mark Not Joined toggles; reports the value the backend stored. */
export function CandidateStatusToggles({
  candidate,
  adminFetch,
  onError,
  onUpdated,
  centered = false,
}: CommonProps & { onUpdated: (patch: { isSelected?: boolean; isNotJoined?: boolean }) => void; centered?: boolean }) {
  const [busy, setBusy] = useState<CandidateFlag | null>(null);
  const toggle = async (e: React.MouseEvent, flag: CandidateFlag) => {
    stop(e);
    setBusy(flag);
    try {
      const value = await toggleCandidateFlag(adminFetch, candidate.id, flag);
      onUpdated(flag === 'selected' ? { isSelected: value } : { isNotJoined: value });
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Could not update candidate status');
    } finally {
      setBusy(null);
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
        onClick={(e) => toggle(e, 'selected')}
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
        onClick={(e) => toggle(e, 'notJoined')}
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
    </div>
  );
}

/** All Candidates "Action" column: status toggles only (ZIP download lives on the candidate profile). */
export default function CandidateDocumentActions({
  candidate,
  adminFetch,
  onError,
  onUpdated,
  centered = false,
}: CommonProps & { onUpdated: (patch: { isSelected?: boolean; isNotJoined?: boolean }) => void; centered?: boolean }) {
  if (!canUseDocumentActions(candidate)) {
    return <span style={{ color: '#9ca3af', fontSize: 13, fontStyle: 'italic' }}>{candidate.isDeleted ? '—' : 'Document Not Submitted'}</span>;
  }
  return <CandidateStatusToggles candidate={candidate} adminFetch={adminFetch} onError={onError} onUpdated={onUpdated} centered={centered} />;
}

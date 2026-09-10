'use client';

import { useState, useEffect, useCallback } from 'react';

interface CandidateRow {
  id: string;
  fullName: string | null;
  email: string | null;
  currentPhase: string;
  foundationCourseCompleted: boolean;
  foundationCourseStatus: string;
}

interface Props {
  adminToken: string | null;
  adminApiBase: string;
  onRefreshCandidates?: () => void;
}

export default function CourseCompletionTab({ adminToken, adminApiBase, onRefreshCandidates }: Props) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{ open: boolean; candidateId: string; candidateName: string } | null>(null);

  const withAuth = useCallback((url: string, opts: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      ...((opts.headers as Record<string, string>) || {}),
    };
    if (adminToken) headers['X-Admin-Token'] = adminToken;
    return fetch(`${adminApiBase}${url}`, { ...opts, headers, credentials: 'include' });
  }, [adminToken, adminApiBase]);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await withAuth('/api/admin/candidates');
      if (res.ok) {
        const data = await res.json();
        // Filter candidates who are either in 'foundation', 'documents' phase or completed foundation course
        const filtered = (data.candidates || []).filter(
          (c: CandidateRow) =>
            c.currentPhase === 'foundation' ||
            c.currentPhase === 'documents' ||
            c.currentPhase === 'offer' ||
            c.currentPhase === 'signing' ||
            c.currentPhase === 'joining' ||
            c.foundationCourseCompleted
        );
        setCandidates(filtered);
      }
    } catch (e) {
      console.error('Failed to load candidates for course completion:', e);
    } finally {
      setLoading(false);
    }
  }, [withAuth]);

  useEffect(() => {
    loadCandidates();
  }, [loadCandidates]);

  const triggerBypassConfirmation = (candidateId: string, candidateName: string | null) => {
    setConfirmModal({
      open: true,
      candidateId,
      candidateName: candidateName || 'this candidate'
    });
  };

  const handleConfirmBypass = async () => {
    if (!confirmModal) return;
    const { candidateId } = confirmModal;
    setConfirmModal(null);
    setActionInProgress(candidateId);
    try {
      const res = await withAuth(`/api/admin/candidates/${candidateId}/bypass-course`, {
        method: 'POST',
      });
      if (res.ok) {
        await loadCandidates();
        if (onRefreshCandidates) {
          onRefreshCandidates();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Bypass action failed');
      }
    } catch (e) {
      console.error(e);
      alert('Bypass action failed');
    } finally {
      setActionInProgress(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return { text: '#08CB00', bg: 'rgba(8,203,0,0.1)', border: '1px solid rgba(8,203,0,0.3)' };
      case 'in_progress':
        return { text: '#d97706', bg: 'rgba(217,119,6,0.1)', border: '1px solid rgba(217,119,6,0.3)' };
      default:
        return { text: '#6b7280', bg: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)' };
    }
  };

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px', color: '#111827' }}>
        Foundation Course Completion Status
      </h2>

      {loading ? (
        <div>Loading...</div>
      ) : candidates.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', background: '#f9fafb', borderRadius: '8px' }}>
          No candidates in the foundation course phase.
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Name</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Email</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Status</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', color: '#4b5563', fontWeight: 600, fontSize: 12 }}>Take Action</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const status = c.foundationCourseStatus || (c.foundationCourseCompleted ? 'completed' : 'not_started');
                const colors = getStatusColor(status);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '16px', fontWeight: 500, color: '#111827' }}>{c.fullName || '-'}</td>
                    <td style={{ padding: '16px', color: '#4b5563' }}>{c.email || '-'}</td>
                    <td style={{ padding: '16px' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: 600,
                        color: colors.text,
                        background: colors.bg,
                        border: colors.border
                      }}>
                        {status === 'in_progress' ? 'In Progress' : status === 'completed' ? 'Completed' : 'Not Started'}
                      </span>
                    </td>
                    <td style={{ padding: '16px', textAlign: 'right' }}>
                      {status !== 'completed' ? (
                        <button
                          onClick={() => triggerBypassConfirmation(c.id, c.fullName)}
                          disabled={actionInProgress !== null}
                          style={{
                            background: '#08CB00',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '6px 12px',
                            fontSize: '13px',
                            fontWeight: 600,
                            cursor: 'pointer',
                            opacity: actionInProgress !== null ? 0.6 : 1,
                            transition: 'background-color 0.2s'
                          }}
                        >
                          {actionInProgress === c.id ? 'Bypassing...' : 'Bypass Course'}
                        </button>
                      ) : (
                        <span style={{ fontSize: '13px', color: '#08CB00', fontWeight: 600 }}>
                          ✓ Completed
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Custom Confirmation Modal ── */}
      {confirmModal && confirmModal.open && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)', // Sleek slate backdrop color matching onboarding/dashboard theme
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2000,
            animation: 'fadeIn 0.2s ease-out'
          }}
          onClick={() => setConfirmModal(null)}
        >
          <div
            style={{
              background: '#fff',
              borderRadius: '12px',
              padding: '24px',
              width: '420px',
              maxWidth: '90vw',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
              transform: 'scale(1)',
              animation: 'scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                background: 'rgba(245, 158, 11, 0.1)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                ⚠️
              </div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#111827' }}>
                Bypass Foundation Course
              </h3>
            </div>
            
            <p style={{ margin: '0 0 24px 0', fontSize: '14px', color: '#4b5563', lineHeight: '1.5' }}>
              Are you sure you want to bypass the foundation course requirement for <strong>{confirmModal.candidateName}</strong>? 
              This will mark the course step as completed and transition the candidate to the document upload phase.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                onClick={() => setConfirmModal(null)}
                style={{
                  background: '#f3f4f6',
                  color: '#4b5563',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'background-color 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e5e7eb'}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f3f4f6'}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmBypass}
                style={{
                  background: '#08CB00',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  padding: '8px 16px',
                  fontSize: '14px',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s'
                }}
                onMouseOver={(e) => e.currentTarget.style.opacity = '0.9'}
                onMouseOut={(e) => e.currentTarget.style.opacity = '1'}
              >
                Confirm Bypass
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Animation Styles */}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleIn {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

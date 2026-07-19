'use client';

import { useState, useEffect, useCallback } from 'react';

interface CandidateRow {
  id: string;
  fullName: string | null;
  email: string | null;
  currentPhase: string;
  documentsSubmitted: boolean;
}

interface Props {
  adminToken: string | null;
}

// Pass candidates = offer phase or beyond, or documents phase (mid-pipeline doc collection)
const PASS_PHASES = ['documents', 'offer', 'signing', 'joining'];

export default function DocumentsTab({ adminToken }: Props) {
  const [candidates, setCandidates] = useState<CandidateRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const withAuth = useCallback((url: string, opts: RequestInit = {}): Promise<Response> => {
    const headers: Record<string, string> = {
      ...((opts.headers as Record<string, string>) || {}),
    };
    if (adminToken) headers['X-Admin-Token'] = adminToken;
    return fetch(url, { ...opts, headers, credentials: 'include' });
  }, [adminToken]);

  const downloadZip = useCallback(async (candidateId: string, fullName: string | null) => {
    setDownloading(candidateId);
    try {
      const res = await withAuth(`/api/admin/candidates/${candidateId}/documents/zip`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.detail || 'Download failed');
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="(.+)"/);
      const filename = match
        ? match[1]
        : `${fullName || candidateId}_documents.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
      alert('Download failed');
    } finally {
      setDownloading(null);
    }
  }, [withAuth]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await withAuth('/api/admin/candidates');
        if (res.ok) {
          const data = await res.json();
          const passed = (data.candidates || []).filter(
            (c: CandidateRow) => PASS_PHASES.includes(c.currentPhase)
          );
          setCandidates(passed);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [withAuth]);

  return (
    <div style={{ padding: '24px' }}>
      <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 20px' }}>
        Candidate Documents
      </h2>

      {loading ? (
        <div>Loading...</div>
      ) : candidates.length === 0 ? (
        <div>No candidates found</div>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, fontSize: 12 }}>Name</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, fontSize: 12 }}>Email</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, fontSize: 12 }}>Documents</th>
              <th style={{ padding: '8px 12px', textAlign: 'left', color: '#6b7280', fontWeight: 500, fontSize: 12 }}>Download</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map(c => (
              <tr
                key={c.id}
                style={{ borderBottom: '1px solid #f3f4f6' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#f9fafb')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <td style={{ padding: '10px 12px' }}>{c.fullName || '—'}</td>
                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{c.email || '—'}</td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{
                    color: c.documentsSubmitted ? '#16a34a' : '#d97706',
                    fontWeight: 600,
                  }}>
                    {c.documentsSubmitted ? 'Yes' : 'No'}
                  </span>
                </td>
                <td style={{ padding: '10px 12px' }}>
                  {c.documentsSubmitted ? (
                    <button
                      onClick={() => downloadZip(c.id, c.fullName)}
                      disabled={downloading === c.id}
                      style={{
                        color: '#08CB00',
                        background: 'none',
                        border: 'none',
                        cursor: downloading === c.id ? 'default' : 'pointer',
                        fontSize: 13,
                        padding: 0,
                        opacity: downloading === c.id ? 0.6 : 1,
                      }}
                    >
                      {downloading === c.id ? 'Downloading…' : 'Download ZIP'}
                    </button>
                  ) : (
                    <span style={{ color: '#d1d5db', fontSize: 13 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
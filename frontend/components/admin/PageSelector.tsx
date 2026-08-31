'use client';

import React from 'react';

interface PageSelectorProps {
  total: number;
  page: number;          // 0-indexed
  limit: number;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  loading?: boolean;
  limits?: number[];
}

const DEFAULT_LIMITS = [10, 20, 50, 100, 200];

export default function PageSelector({
  total,
  page,
  limit,
  onPageChange,
  onLimitChange,
  loading = false,
  limits = DEFAULT_LIMITS,
}: PageSelectorProps) {
  const totalPages = Math.ceil(total / limit);

  const go = (p: number) => {
    if (p < 0 || p >= totalPages || loading) return;
    onPageChange(p);
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
      {/* Prev */}
      <button
        onClick={() => go(page - 1)}
        disabled={page === 0 || loading}
        style={{
          padding: '5px 12px',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          background: page === 0 ? '#f3f4f6' : '#fff',
          color: page === 0 ? '#9ca3af' : '#374151',
          cursor: page === 0 || loading ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          transition: 'background-color 0.15s',
        }}
      >
        ← Prev
      </button>

      {/* Page indicator */}
      <span style={{ fontSize: '13px', color: '#4b5563', whiteSpace: 'nowrap' }}>
        Page <strong style={{ color: '#111827' }}>{page + 1}</strong> of{' '}
        <strong style={{ color: '#111827' }}>{totalPages || 1}</strong>
        &nbsp;·&nbsp;
        <span style={{ color: '#6b7280' }}>{total} total</span>
      </span>

      {/* Next */}
      <button
        onClick={() => go(page + 1)}
        disabled={page >= totalPages - 1 || loading}
        style={{
          padding: '5px 12px',
          borderRadius: '6px',
          border: '1px solid #d1d5db',
          background: page >= totalPages - 1 ? '#f3f4f6' : '#fff',
          color: page >= totalPages - 1 ? '#9ca3af' : '#374151',
          cursor: page >= totalPages - 1 || loading ? 'not-allowed' : 'pointer',
          fontSize: '13px',
          fontWeight: 500,
          transition: 'background-color 0.15s',
        }}
      >
        Next →
      </button>

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Limit selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <label style={{ fontSize: '13px', color: '#4b5563' }}>Show:</label>
        <select
          value={limit}
          onChange={e => { onLimitChange(Number(e.target.value)); onPageChange(0); }}
          disabled={loading}
          style={{
            padding: '5px 8px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '13px',
            color: '#374151',
            background: '#fff',
            cursor: loading ? 'not-allowed' : 'pointer',
            opacity: loading ? 0.6 : 1,
          }}
        >
          {limits.map(n => (
            <option key={n} value={n}>{n} per page</option>
          ))}
        </select>
      </div>
    </div>
  );
}
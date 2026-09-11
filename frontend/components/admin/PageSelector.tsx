import React from 'react';

interface PageSelectorProps {
  total: number;
  page: number;
  limit: number;
  onPageChange: (newPage: number) => void;
  onLimitChange: (newLimit: number) => void;
  loading?: boolean;
}

export default function PageSelector({
  total,
  page,
  limit,
  onPageChange,
  onLimitChange,
  loading = false,
}: PageSelectorProps) {
  const totalPages = Math.ceil(total / limit);

  const getPageNumbers = () => {
    const pages = [];
    let start = Math.max(0, page - 2);
    let end = Math.min(totalPages - 1, page + 2);
    
    if (end - start < 4) {
      if (start === 0) end = Math.min(totalPages - 1, start + 4);
      else if (end === totalPages - 1) start = Math.max(0, end - 4);
    }
    
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }
    return pages;
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: '16px',
      padding: '12px 16px',
      borderTop: '1px solid #e5e7eb',
      backgroundColor: '#f9fafb',
      borderBottomLeftRadius: '8px',
      borderBottomRightRadius: '8px',
      fontSize: '13px',
      color: '#4b5563'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label htmlFor="limit-select">Rows per page:</label>
        <select
          id="limit-select"
          value={limit}
          onChange={(e) => onLimitChange(Number(e.target.value))}
          disabled={loading}
          style={{
            padding: '4px 8px',
            borderRadius: '4px',
            border: '1px solid #d1d5db',
            fontSize: '13px',
            cursor: loading ? 'not-allowed' : 'pointer',
            backgroundColor: 'white'
          }}
        >
          {[10, 20, 50, 100].map(n => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      <div>
        {total === 0 ? '0-0 of 0' : `${page * limit + 1}-${Math.min((page + 1) * limit, total)} of ${total}`}
      </div>

      <div style={{ display: 'flex', gap: '4px' }}>
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 0 || loading}
          style={{
            padding: '4px 8px',
            border: '1px solid #d1d5db',
            backgroundColor: page === 0 || loading ? '#f3f4f6' : 'white',
            color: page === 0 || loading ? '#9ca3af' : '#374151',
            borderRadius: '4px',
            cursor: page === 0 || loading ? 'not-allowed' : 'pointer',
          }}
        >
          Prev
        </button>
        
        {getPageNumbers().map(p => (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            disabled={loading}
            style={{
              padding: '4px 10px',
              border: '1px solid #d1d5db',
              backgroundColor: p === page ? '#10b981' : 'white',
              color: p === page ? 'white' : '#374151',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: p === page ? 600 : 400
            }}
          >
            {p + 1}
          </button>
        ))}

        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages - 1 || loading || total === 0}
          style={{
            padding: '4px 8px',
            border: '1px solid #d1d5db',
            backgroundColor: page >= totalPages - 1 || loading || total === 0 ? '#f3f4f6' : 'white',
            color: page >= totalPages - 1 || loading || total === 0 ? '#9ca3af' : '#374151',
            borderRadius: '4px',
            cursor: page >= totalPages - 1 || loading || total === 0 ? 'not-allowed' : 'pointer',
          }}
        >
          Next
        </button>
      </div>
    </div>
  );
}

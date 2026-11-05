'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import styles from './FeedbacksTab.module.css';
import PageSelector from './PageSelector';
import { serialNumber } from '@/lib/serial-number';

const SEARCH_DEBOUNCE_MS = 300;

export interface FeedbackItem {
  id: string;
  candidateId: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string;
  candidatePhase?: string;
  candidateRole?: string;
  candidateState?: string;
  candidateDistrict?: string;
  overallRating: number;
  additionalComments: string;
  submittedAt: string | null;
}

export interface FeedbackStats {
  averageRating: number;
  totalResponses: number;
  breakdown: Record<number, number>;
}

const DEFAULT_STATS: FeedbackStats = {
  averageRating: 0,
  totalResponses: 0,
  breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
};

interface FeedbacksTabProps {
  adminToken: string | null;
  adminApiBase?: string;
}

function formatDateTime(isoString: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function renderStars(rating: number, max = 5) {
  const stars = [];
  for (let i = 1; i <= max; i++) {
    stars.push(
      <span
        key={i}
        className={i <= rating ? styles.starFilled : styles.starEmpty}
        aria-hidden="true"
      >
        ★
      </span>
    );
  }
  return <div className={styles.starsRow}>{stars}</div>;
}

function renderTopAverageStars(avg: number, totalResponses: number, max = 5) {
  const stars = [];
  const rounded = Math.round(avg * 10) / 10;
  for (let i = 1; i <= max; i++) {
    const isFilled = totalResponses > 0 && (rounded >= i || rounded >= i - 0.5);
    stars.push(
      <span
        key={i}
        className={isFilled ? styles.topStarFilled : styles.topStarEmpty}
        aria-hidden="true"
      >
        ★
      </span>
    );
  }
  return <div className={styles.averageStarsRow}>{stars}</div>;
}

export default function FeedbacksTab({ adminToken, adminApiBase: propApiBase }: FeedbacksTabProps) {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [stats, setStats] = useState<FeedbackStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);

  const requestIdRef = useRef(0);

  const withAuth = useCallback(
    (url: string, opts: RequestInit = {}): Promise<Response> => {
      const headers: Record<string, string> = {
        ...((opts.headers as Record<string, string>) || {}),
      };
      if (adminToken) headers['X-Admin-Token'] = adminToken;
      const base = propApiBase || process.env.NEXT_PUBLIC_ADMIN_API_URL || '';
      return fetch(`${base}${url}`, { ...opts, headers, credentials: 'include' });
    },
    [adminToken, propApiBase]
  );

  // Debounce search input
  useEffect(() => {
    if (searchQuery === debouncedSearch) return;
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(0);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchQuery, debouncedSearch]);

  const loadFeedbacks = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(limit),
        offset: String(page * limit),
      });
      if (debouncedSearch.trim()) {
        params.append('search', debouncedSearch.trim());
      }
      if (ratingFilter !== '') {
        params.append('rating', String(ratingFilter));
      }

      const res = await withAuth(`/api/admin/feedbacks?${params.toString()}`);
      if (res.ok && requestId === requestIdRef.current) {
        const data = await res.json();
        setFeedbacks(data.feedbacks || []);
        setTotal(data.total || 0);
        if (data.stats) {
          setStats(data.stats);
        }
      }
    } catch (err) {
      console.error('Failed to load candidate feedbacks:', err);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [withAuth, page, limit, debouncedSearch, ratingFilter]);

  useEffect(() => {
    loadFeedbacks();
  }, [loadFeedbacks]);

  // Handle ESC key to close modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedFeedback) {
        setSelectedFeedback(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedFeedback]);

  const handleClearFilters = () => {
    setSearchQuery('');
    setDebouncedSearch('');
    setRatingFilter('');
    setPage(0);
  };

  const hasActiveFilters = searchQuery.trim() !== '' || ratingFilter !== '';

  return (
    <div className={styles.container}>
      {/* ─── Top Rating Summary & Breakdown (Image Match) ─────────── */}
      <div className={styles.summaryContainer}>
        {/* Left Card: Average Rating */}
        <div className={styles.averageCard}>
          <div className={styles.summaryHeader}>AVERAGE RATING</div>
          <div className={styles.averageValue}>
            {stats.totalResponses > 0 ? stats.averageRating.toFixed(1) : '0.0'}
          </div>
          {renderTopAverageStars(stats.averageRating, stats.totalResponses)}
          <div className={styles.averageSubtext}>
            from {stats.totalResponses} response{stats.totalResponses === 1 ? '' : 's'}
          </div>
        </div>

        {/* Right Card: Rating Breakdown */}
        <div className={styles.breakdownCard}>
          <div className={styles.summaryHeader}>RATING BREAKDOWN</div>
          <div className={styles.breakdownList}>
            {[5, 4, 3, 2, 1].map((star) => {
              const count = stats.breakdown[star] || 0;
              const percentage =
                stats.totalResponses > 0 ? (count / stats.totalResponses) * 100 : 0;
              const isSelected = ratingFilter === star;

              return (
                <div
                  key={star}
                  className={`${styles.breakdownRow} ${isSelected ? styles.breakdownRowActive : ''}`}
                  onClick={() => {
                    const next = ratingFilter === star ? '' : star;
                    setRatingFilter(next);
                    setPage(0);
                  }}
                  title={
                    isSelected
                      ? `Selected ${star} stars — click to show all ratings`
                      : `Click to filter by ${star} star${star > 1 ? 's' : ''}`
                  }
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      const next = ratingFilter === star ? '' : star;
                      setRatingFilter(next);
                      setPage(0);
                    }
                  }}
                >
                  <div className={styles.breakdownStarLabel}>
                    <span>{star}</span>
                    <span className={styles.breakdownStarIcon}>★</span>
                  </div>
                  <div className={styles.progressTrack}>
                    <div
                      className={styles.progressFill}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className={styles.breakdownCount}>{count}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ─── Filter Bar ────────────────────────────────────────────── */}
      <div className={styles.filters}>
        <div className={styles.searchWrapper}>
          <input
            type="text"
            className={styles.searchInput}
            placeholder="Search by candidate name, email, or feedback text..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setDebouncedSearch(searchQuery);
                setPage(0);
              }
            }}
          />
          {searchQuery && (
            <button
              type="button"
              className={styles.clearSearchBtn}
              onClick={() => setSearchQuery('')}
              title="Clear search"
              aria-label="Clear search"
            >
              ✕
            </button>
          )}
        </div>

        <select
          className={styles.filterSelect}
          value={ratingFilter}
          onChange={(e) => {
            const val = e.target.value ? Number(e.target.value) : '';
            setRatingFilter(val);
            setPage(0);
          }}
          aria-label="Filter by star rating"
        >
          <option value="">All Ratings </option>
          <option value="5">5 Stars</option>
          <option value="4">4 Stars</option>
          <option value="3">3 Stars</option>
          <option value="2">2 Stars</option>
          <option value="1">1 Star</option>
        </select>


        <span className={styles.totalCount}>
          {loading ? 'Loading...' : `Total: ${total} feedback${total === 1 ? '' : 's'}`}
        </span>
      </div>

      {/* ─── Table ─────────────────────────────────────────────────── */}
      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.serialCol}>S. No.</th>
              <th className={styles.candidateCol}>Candidate</th>
              <th className={styles.ratingCol}>Stars</th>
              <th className={styles.feedbackCol}>Feedback Text</th>
              <th className={styles.dateCol}>Submitted At</th>
              <th className={styles.actionsCol}>Action</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6}>
                  <div className={styles.loading}>
                    <div className={styles.spinner} />
                    <div>Loading candidate feedbacks...</div>
                  </div>
                </td>
              </tr>
            ) : feedbacks.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className={styles.emptyState}>
                    <span className={styles.emptyIcon}>💬</span>
                    <div className={styles.emptyTitle}>No Feedbacks Found</div>
                    <div className={styles.emptyDescription}>
                      {hasActiveFilters
                        ? 'No feedbacks matched your search criteria. Try clearing filters.'
                        : 'No candidate feedbacks have been submitted yet.'}
                    </div>
                    {hasActiveFilters && (
                      <button
                        type="button"
                        className={styles.clearFiltersBtn}
                        onClick={handleClearFilters}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              feedbacks.map((fb, idx) => {
                const sNo = serialNumber(page, limit, idx);
                return (
                  <tr key={fb.id}>
                    <td className={styles.serialCol}>{sNo}</td>
                    <td className={styles.candidateCol}>
                      <span className={styles.candidateName}>{fb.candidateName}</span>
                      <span className={styles.candidateEmail}>{fb.candidateEmail || 'No email'}</span>
                    </td>
                    <td className={styles.ratingCol}>
                      <div style={{ display: 'inline-flex', alignItems: 'center' }}>
                        {renderStars(fb.overallRating)}
                        <span className={styles.ratingNumber}>{fb.overallRating}/5</span>
                      </div>
                    </td>
                    <td className={styles.feedbackCol}>
                      {fb.additionalComments ? (
                        <div className={styles.feedbackTextPreview} title={fb.additionalComments}>
                          {fb.additionalComments}
                        </div>
                      ) : (
                        <span className={styles.feedbackEmptyText}>No written comments</span>
                      )}
                    </td>
                    <td className={styles.dateCol}>{formatDateTime(fb.submittedAt)}</td>
                    <td className={styles.actionsCol}>
                      <button
                        type="button"
                        className={styles.viewBtn}
                        onClick={() => setSelectedFeedback(fb)}
                        title="View complete feedback"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {/* ─── Pagination ──────────────────────────────────────────── */}
        {total > 0 && (
          <PageSelector
            total={total}
            page={page}
            limit={limit}
            onPageChange={(newPage) => setPage(newPage)}
            onLimitChange={(newLimit) => {
              setLimit(newLimit);
              setPage(0);
            }}
            loading={loading}
          />
        )}
      </div>

      {/* ─── View Modal ────────────────────────────────────────────── */}
      {selectedFeedback && (
        <div
          className={styles.modalOverlay}
          role="dialog"
          aria-modal="true"
          aria-labelledby="feedback-dialog-title"
          onClick={() => setSelectedFeedback(null)}
        >
          <div className={styles.modalDialog} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 id="feedback-dialog-title" className={styles.modalTitle}>
                Candidate Feedback Details
              </h2>
              <button
                type="button"
                className={styles.modalCloseBtn}
                onClick={() => setSelectedFeedback(null)}
                aria-label="Close dialog"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Candidate Info Card */}
              <div className={styles.candidateCard}>
                <div className={styles.avatar}>
                  {(selectedFeedback.candidateName[0] || 'C').toUpperCase()}
                </div>
                <div className={styles.candidateDetails}>
                  <h3 className={styles.modalCandidateName}>{selectedFeedback.candidateName}</h3>
                  <div className={styles.modalCandidateMeta}>
                    <span className={styles.metaItem}> {selectedFeedback.candidateEmail || 'No email'}</span>
                    {selectedFeedback.candidatePhone && (
                      <span className={styles.metaItem}>📞 {selectedFeedback.candidatePhone}</span>
                    )}
                    {selectedFeedback.candidatePhase && (
                      <span className={styles.phaseBadge}>{selectedFeedback.candidatePhase}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Rating Section */}
              <div className={styles.ratingSection}>
                <div className={styles.ratingLeft}>
                  <span className={styles.ratingLabel}>Overall Experience Rating</span>
                  <div className={styles.modalStars}>
                    {renderStars(selectedFeedback.overallRating)}
                  </div>
                </div>
                <div className={styles.ratingScore}>
                  {selectedFeedback.overallRating} / 5 Stars
                </div>
              </div>

              {/* Comments Section */}
              <div className={styles.commentSection}>
                <span className={styles.commentLabel}>Candidate Feedback / Comments</span>
                {selectedFeedback.additionalComments ? (
                  <div className={styles.commentBox}>
                    {selectedFeedback.additionalComments}
                  </div>
                ) : (
                  <div className={`${styles.commentBox} ${styles.commentEmpty}`}>
                    No additional written feedback was provided by the candidate.
                  </div>
                )}
              </div>

              {/* Meta Section */}
              <div className={styles.metaSection}>
                <span>Submitted: {formatDateTime(selectedFeedback.submittedAt)}</span>
                {selectedFeedback.candidateId && (
                  <Link
                    href={`/admin/candidates/${selectedFeedback.candidateId}?from=feedbacks`}
                    className={styles.profileLink}
                  >
                    View Candidate Profile ↗
                  </Link>
                )}
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalCloseSecondaryBtn}
                onClick={() => setSelectedFeedback(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

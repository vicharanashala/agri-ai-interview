'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BrandLogos from '@/components/BrandLogos';
import ProfileNavButton from '@/components/ProfileNavButton';
import { syncPhaseToDb } from '@/lib/phaseSync';
import styles from './page.module.css';

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const VIDEO_ID = 'VpZJjahrZSA';
const PLAYBACK_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export default function FoundationCourseVideoPage() {
  const router = useRouter();
  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const speedMenuRef = useRef<HTMLDivElement>(null);
  const maxWatchedRef = useRef<number>(0);
  const hasCompletedRef = useRef<boolean>(false);
  const playbackSpeedRef = useRef<number>(1);

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(100);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  const [isSpeedMenuOpen, setIsSpeedMenuOpen] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isAlreadyCompleted, setIsAlreadyCompleted] = useState(false);

  playbackSpeedRef.current = playbackSpeed;

  // Check if candidate previously completed the video or the course
  useEffect(() => {
    const videoDone = localStorage.getItem('foundation_video_completed') === 'true';
    const courseDone = localStorage.getItem('foundationCourseCompleted') === 'completed';
    if (videoDone || courseDone) {
      setIsAlreadyCompleted(true);
    }

    // Verify with backend profile
    fetch('/api/candidate', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((cand) => {
        if (cand && (cand.foundationVideoCompleted || cand.foundationCourseCompleted)) {
          setIsAlreadyCompleted(true);
          localStorage.setItem('foundation_video_completed', 'true');
        }
      })
      .catch(() => {});
  }, []);

  // Completion handler — records completion and immediately navigates
  const handleVideoCompleted = useCallback(() => {
    if (hasCompletedRef.current) return;
    hasCompletedRef.current = true;
    setIsCompleted(true);
    setIsPlaying(false);
    localStorage.setItem('foundation_video_completed', 'true');

    // Notify backend and save to MongoDB
    syncPhaseToDb(4, { foundationVideoCompleted: true }).catch(() => {});

    // Immediately navigate to the foundation course page to launch the course
    setTimeout(() => {
      router.push('/foundation-course');
    }, 1200);
  }, [router]);

  // Load YouTube IFrame API script and initialize player
  useEffect(() => {
    const initPlayer = () => {
      if (!window.YT || !window.YT.Player) return;
      if (playerRef.current) return;

      playerRef.current = new window.YT.Player('foundation-yt-player', {
        videoId: VIDEO_ID,
        playerVars: {
          autoplay: 0,
          controls: 0,        // Hide native controls
          disablekb: 1,       // Disable keyboard controls
          modestbranding: 1,
          rel: 0,
          fs: 0,
          playsinline: 1,
          iv_load_policy: 3,
          origin: typeof window !== 'undefined' ? window.location.origin : '',
        },
        events: {
          onReady: (event: any) => {
            setIsPlayerReady(true);
            const dur = event.target.getDuration();
            if (dur && dur > 0) setDuration(dur);
          },
          onStateChange: (event: any) => {
            // YT.PlayerState: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering
            if (event.data === 1) {
              setIsPlaying(true);
              setHasStarted(true);
            } else if (event.data === 2) {
              setIsPlaying(false);
            } else if (event.data === 0) {
              handleVideoCompleted();
            }
          },
          onPlaybackRateChange: (event: any) => {
            if (event.data) {
              setPlaybackSpeed(event.data);
            }
          },
        },
      });
    };

    if (window.YT && window.YT.Player) {
      initPlayer();
    } else {
      const existingScript = document.getElementById('yt-iframe-api-script');
      if (!existingScript) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api-script';
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag?.parentNode?.insertBefore(tag, firstScriptTag);
      }

      const prevReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        if (prevReady) prevReady();
        initPlayer();
      };
    }

    return () => {
      if (playerRef.current && typeof playerRef.current.destroy === 'function') {
        try {
          playerRef.current.destroy();
        } catch {}
        playerRef.current = null;
      }
    };
  }, [handleVideoCompleted]);

  // Anti-skip enforcement ticker: checks every 250ms during playback
  useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      if (!playerRef.current || typeof playerRef.current.getCurrentTime !== 'function') return;

      try {
        const curr = playerRef.current.getCurrentTime();
        const dur = playerRef.current.getDuration() || duration;
        if (dur > 0 && duration === 0) setDuration(dur);

        // Threshold accommodates current playback speed
        const jumpThreshold = Math.max(2.0, playbackSpeedRef.current * 1.5);

        // If current time jumped ahead of maxWatchedRef by more than threshold, clamp back!
        if (curr > maxWatchedRef.current + jumpThreshold) {
          setShowSkipWarning(true);
          playerRef.current.seekTo(maxWatchedRef.current, true);
          setTimeout(() => setShowSkipWarning(false), 3000);
        } else if (curr > maxWatchedRef.current) {
          maxWatchedRef.current = curr;
          setCurrentTime(curr);
        } else {
          setCurrentTime(curr);
        }

        // Check if finished (within 0.5s of the end of the video)
        if (dur > 5 && curr >= dur - 0.5) {
          handleVideoCompleted();
        }
      } catch {
        // Player might be re-buffering
      }
    }, 250);

    return () => clearInterval(interval);
  }, [isPlaying, duration, handleVideoCompleted]);

  // Prevent keyboard seek shortcuts (arrow keys, J, L, 0-9)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const blockedKeys = ['ArrowRight', 'ArrowLeft', 'PageUp', 'PageDown', 'Home', 'End', 'j', 'l'];
      if (
        blockedKeys.includes(e.key) ||
        (e.key >= '0' && e.key <= '9' && !e.ctrlKey && !e.altKey && !e.metaKey)
      ) {
        const tag = (document.activeElement?.tagName || '').toLowerCase();
        if (tag !== 'input' && tag !== 'textarea') {
          e.preventDefault();
          e.stopPropagation();
          setShowSkipWarning(true);
          setTimeout(() => setShowSkipWarning(false), 3000);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, []);

  // Close speed menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (speedMenuRef.current && !speedMenuRef.current.contains(e.target as Node)) {
        setIsSpeedMenuOpen(false);
      }
    };
    if (isSpeedMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isSpeedMenuOpen]);

  // Play / Pause toggle
  const togglePlay = () => {
    if (!playerRef.current) return;
    if (isPlaying) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
      setHasStarted(true);
    }
  };

  // Mute / Unmute toggle
  const toggleMute = () => {
    if (!playerRef.current) return;
    if (isMuted) {
      playerRef.current.unMute();
      setIsMuted(false);
      playerRef.current.setVolume(volume || 80);
    } else {
      playerRef.current.mute();
      setIsMuted(true);
    }
  };

  // Volume change
  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    setVolume(val);
    if (!playerRef.current) return;
    if (val === 0) {
      playerRef.current.mute();
      setIsMuted(true);
    } else {
      if (isMuted) {
        playerRef.current.unMute();
        setIsMuted(false);
      }
      playerRef.current.setVolume(val);
    }
  };

  // Playback speed change
  const handleSelectSpeed = (speed: number) => {
    setPlaybackSpeed(speed);
    setIsSpeedMenuOpen(false);
    if (playerRef.current && typeof playerRef.current.setPlaybackRate === 'function') {
      playerRef.current.setPlaybackRate(speed);
    }
  };

  // Prevent scrubbing forward when clicking on progress bar
  const handleProgressClick = () => {
    setShowSkipWarning(true);
    setTimeout(() => setShowSkipWarning(false), 3000);
  };

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Helper format seconds -> mm:ss
  const formatTime = (sec: number) => {
    if (isNaN(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, Math.round((currentTime / duration) * 100)) : 0;

  return (
    <main className={styles.container}>
      {/* Top Navbar */}
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
            <ProfileNavButton />
          </div>
        </div>
      </nav>

      <div className={styles.content}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div className={styles.badgeRow}>
            <span className={styles.phaseBadge}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                <path d="M6 12v5c3 3 9 3 12 0v-5" />
              </svg>
              Phase 4: Foundation Course
            </span>
            {isAlreadyCompleted && (
              <span className={styles.completedBadge}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Orientation Completed
              </span>
            )}
          </div>
          <h1 className={styles.title}>Foundation Course Orientation</h1>
          <p className={styles.subtitle}>
            Please watch this orientation video before launching your Foundation Course on ViBe.
          </p>
        </div>

        {/* If user already completed the video previously */}
        {isAlreadyCompleted && (
          <div className={styles.alreadyCompletedBanner}>
            <div className={styles.alreadyCompletedText}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <span>
                You have already completed this orientation video. You can re-watch it or proceed to launch your course.
              </span>
            </div>
            <button onClick={() => router.push('/foundation-course')} className={styles.proceedTopBtn}>
              Proceed to Launch Course →
            </button>
          </div>
        )}

        {/* Video Cinema Theater Card */}
        <div ref={containerRef} className={styles.theaterCard}>
          <div className={styles.videoWrapper}>
            {/* The YouTube iframe mount target */}
            <div id="foundation-yt-player" className={styles.iframeTarget} />

            {/* Click overlay to play/pause and intercept direct clicks */}
            {hasStarted && (
              <div
                className={styles.clickOverlay}
                onClick={togglePlay}
                onContextMenu={(e) => e.preventDefault()}
              >
                {!isPlaying && (
                  <div className={styles.centerPauseIndicator}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                )}
              </div>
            )}

            {/* Big Start / Poster Overlay before user starts watching */}
            {!hasStarted && (
              <div
                className={styles.startPosterOverlay}
                style={{
                  backgroundImage: `url('https://img.youtube.com/vi/${VIDEO_ID}/maxresdefault.jpg')`,
                }}
                onClick={togglePlay}
                onContextMenu={(e) => e.preventDefault()}
              >
                <div className={styles.posterBackdrop} />
                <div className={styles.startContent}>
                  <div className={styles.bigPlayButton}>
                    <span className={styles.pulseRing} />
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" style={{ marginLeft: '4px' }}>
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                  <h3 className={styles.startTitle}>Click to Play Orientation Video</h3>
                </div>
              </div>
            )}
          </div>

          {/* Custom Modern Controls Bar */}
          <div className={styles.controlsBar}>
            {/* Progress Bar (Clicking forward is blocked) */}
            <div className={styles.progressContainer} onClick={handleProgressClick}>
              {showSkipWarning && (
                <div className={styles.skipWarningTooltip}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  Skipping is disabled. Please watch the video to proceed.
                </div>
              )}
              <div className={styles.progressBarTrack}>
                <div className={styles.progressBarFill} style={{ width: `${progressPercent}%` }} />
              </div>
            </div>

            {/* Controls Buttons Row */}
            <div className={styles.controlsRow}>
              {/* Left Controls: Play/Pause, Volume, Time */}
              <div className={styles.leftControls}>
                <button
                  type="button"
                  onClick={togglePlay}
                  className={styles.controlBtn}
                  title={isPlaying ? 'Pause' : 'Play'}
                  disabled={!isPlayerReady}
                >
                  {isPlaying ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" rx="1" />
                      <rect x="14" y="4" width="4" height="16" rx="1" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                </button>

                <div className={styles.volumeGroup}>
                  <button
                    type="button"
                    onClick={toggleMute}
                    className={styles.controlBtn}
                    title={isMuted ? 'Unmute' : 'Mute'}
                  >
                    {isMuted || volume === 0 ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <line x1="23" y1="9" x2="17" y2="15" />
                        <line x1="17" y1="9" x2="23" y2="15" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className={styles.volumeSlider}
                    title={`Volume: ${isMuted ? 0 : volume}%`}
                  />
                </div>

                <span className={styles.timeText}>
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Right Controls: Playback Speed Selector, Progress %, Fullscreen */}
              <div className={styles.rightControls}>
                {/* YouTube-like Playback Speed Selector */}
                <div ref={speedMenuRef} className={styles.speedControlGroup}>
                  <button
                    type="button"
                    onClick={() => setIsSpeedMenuOpen((prev) => !prev)}
                    className={styles.speedBtn}
                    title="Playback Speed"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <span>{playbackSpeed === 1 ? '1x' : `${playbackSpeed}x`}</span>
                  </button>

                  {isSpeedMenuOpen && (
                    <div className={styles.speedMenu}>
                      <div className={styles.speedMenuHeader}>Playback Speed</div>
                      {PLAYBACK_SPEEDS.map((speed) => (
                        <button
                          key={speed}
                          type="button"
                          onClick={() => handleSelectSpeed(speed)}
                          className={`${styles.speedMenuItem} ${
                            playbackSpeed === speed ? styles.speedMenuItemActive : ''
                          }`}
                        >
                          <span>{speed === 1 ? 'Normal' : `${speed}x`}</span>
                          {playbackSpeed === speed && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <span className={styles.progressPill}>{progressPercent}%</span>

                <button
                  type="button"
                  onClick={toggleFullscreen}
                  className={styles.controlBtn}
                  title="Fullscreen"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Completion Notification Banner */}
        {isCompleted && (
          <div className={styles.completionBanner}>
            <div className={styles.completionLeft}>
              <div className={styles.checkIconCircle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div>
                <h3 className={styles.completionHeading}>Orientation Completed!</h3>
                <p className={styles.completionSub}>
                  Redirecting you to the Foundation Course page to launch your course...
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/foundation-course')}
              className={styles.proceedButton}
            >
              Launch Course Now →
            </button>
          </div>
        )}

        {/* Back to Dashboard row */}
        <div className={styles.backRow}>
          <button onClick={() => router.push('/dashboard')} className={styles.backButton}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </main>
  );
}

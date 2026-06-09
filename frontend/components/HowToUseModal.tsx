'use client';

import styles from './HowToUseModal.module.css';

interface HowToUseModalProps {
  onClose: () => void;
  videoUrl?: string; // YouTube URL or local file path e.g. /videos/tutorial.mp4
}

function getYouTubeEmbedUrl(url: string): string | null {
  // Handles:
  // - https://www.youtube.com/watch?v=VIDEO_ID
  // - https://youtu.be/VIDEO_ID
  // - https://www.youtube.com/embed/VIDEO_ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return `https://www.youtube-nocookie.com/embed/${match[1]}?autoplay=1`;
  }
  return null;
}

export default function HowToUseModal({ onClose, videoUrl }: HowToUseModalProps) {
  const youtubeEmbedUrl = videoUrl ? getYouTubeEmbedUrl(videoUrl) : null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h2 className={styles.title}>📺 How to Use This App & Take the Interview</h2>
            <p className={styles.subtitle}>Watch this short guide before you begin</p>
          </div>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>

        {/* Video Area */}
        <div className={styles.videoWrapper}>
          {videoUrl ? (
            youtubeEmbedUrl ? (
              <iframe
                src={youtubeEmbedUrl}
                allow="autoplay; encrypted-media"
                allowFullScreen
                className={styles.video}
              />
            ) : (
              <video
                src={videoUrl}
                controls
                autoPlay
                className={styles.video}
              />
            )
          ) : (
            // Placeholder — replace with your actual tutorial video
            <div className={styles.videoPlaceholder}>
              <div className={styles.placeholderIcon}>🎬</div>
              <p className={styles.placeholderTitle}>Tutorial Video Coming Soon</p>
              <p className={styles.placeholderText}>
                Upload your video file and set the <code>videoUrl</code> prop on the <code>HowToUseModal</code> component in <code>dashboard/page.tsx</code>.
              </p>
              <div className={styles.guideSteps}>
                <div className={styles.guideStep}>
                  <span className={styles.stepNum}>1</span>
                  <span>Complete your <strong>Onboarding</strong> form and upload your resume</span>
                </div>
                <div className={styles.guideStep}>
                  <span className={styles.stepNum}>2</span>
                  <span>Click <strong>Start Interview</strong> and ensure you have a stable internet connection</span>
                </div>
                <div className={styles.guideStep}>
                  <span className={styles.stepNum}>3</span>
                  <span>Answer each question <strong>honestly</strong> — the AI evaluates your responses</span>
                </div>
                <div className={styles.guideStep}>
                  <span className={styles.stepNum}>4</span>
                  <span><strong>Do not</strong> copy-paste, switch tabs, or minimize the window — anti-cheat is active</span>
                </div>
                <div className={styles.guideStep}>
                  <span className={styles.stepNum}>5</span>
                  <span>After the interview, view your <strong>results</strong> and if passed, accept your offer letter</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button className={styles.gotItBtn} onClick={onClose}>
            Got it — Let's Begin! →
          </button>
        </div>
      </div>
    </div>
  );
}
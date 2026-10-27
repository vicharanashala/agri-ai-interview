import React from 'react';
import { CandidateNavbarSkeleton, Glyph, TextBone } from '@/components/CandidateSkeleton';
import pageStyles from './page.module.css';
import styles from './InterviewGuidelinesSkeleton.module.css';

// Loading placeholder for the Interview Guidelines screen. It renders the real
// page's elements and classes with the same static copy as page.tsx, shown as
// shimmer bones, so the card wraps and sizes exactly like the page that
// replaces it at every width. Keep the copy in sync with page.tsx.
const GUIDELINES = [
  'This is an AI powered chat interview.',
  'The interview will adapt based on your responses and evaluate accordingly.',
  'Try to answer the questions in depth to get better results.',
];

const RULES: [string, string, string][] = [
  ['🚫', 'Tab Switching', 'Do not switch to other browser tabs or windows'],
  ['🚫', 'Leaving the Window', 'Do not click outside or Alt+Tab away from this window'],
  ['🚫', 'Exiting Fullscreen', 'The interview runs in fullscreen mode; do not exit it'],
  ['🚫', 'Copy / Paste', 'Copy and paste are disabled during the interview'],
  ['🚫', 'Right-Click', 'Right-click context menu is disabled'],
  ['🚫', 'Text Selection', 'Selecting text on the page is not allowed'],
  ['🚫', 'Multi-Monitor', 'Moving the browser to another display is not allowed'],
  ['⏳', 'Idle Timeout', 'If no activity is detected for 10 seconds, a warning will be triggered'],
];

export default function InterviewGuidelinesSkeleton() {
  return (
    <div className={pageStyles.instructionScreen} aria-busy="true" aria-label="Loading interview guidelines">
      <CandidateNavbarSkeleton />
      <div className={pageStyles.instructionBody}>
        <div className={pageStyles.instructionCard}>
          <h1 className={pageStyles.instructionTitle}>
            <TextBone>Interview Guidelines</TextBone>
          </h1>
          <p className={pageStyles.instructionSubtitle}>
            <TextBone>Please read the following guidelines carefully before starting your interview</TextBone>
          </p>

          <div className={pageStyles.guidelines}>
            <ul>
              {GUIDELINES.map((text) => (
                <li key={text}>
                  <TextBone>{text}</TextBone>
                </li>
              ))}
            </ul>

            <h3 className={pageStyles.antiCheatTitle}>
              <TextBone><Glyph>⚠️</Glyph> Anti-Cheating Rules</TextBone>
            </h3>
            <p className={pageStyles.antiCheatSubtitle}>
              <TextBone>The following actions are monitored and will result in interview termination after 5 violations:</TextBone>
            </p>
            <ul className={pageStyles.antiCheatList}>
              {RULES.map(([icon, label, detail]) => (
                <li key={label} className={styles.rule}>
                  <TextBone><Glyph>{icon}</Glyph> <strong>{label}</strong> — {detail}</TextBone>
                </li>
              ))}
            </ul>
            <p className={`${pageStyles.antiCheatNote} ${styles.note}`}>
              <TextBone>
                <Glyph>🔒</Glyph> All violations are logged and reported to the review team. Please stay focused throughout the interview.
              </TextBone>
            </p>
          </div>

          {/* Inert copy of the Begin Interview button (a real <button> so it gets the
              same UA font metrics), shown as a pale placeholder */}
          <button
            type="button"
            className={`${pageStyles.beginButton} ${styles.beginButton}`}
            tabIndex={-1}
            aria-hidden="true"
          >
            Begin Interview
          </button>
        </div>
      </div>
    </div>
  );
}

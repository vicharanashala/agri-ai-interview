import React from 'react';
import { Bone, HeaderButtonsNavbarSkeleton, TextBone } from '@/components/CandidateSkeleton';
import pageStyles from './page.module.css';
import styles from './DeclarationSkeleton.module.css';

// Loading placeholder for the Declarations wizard (slide 1). Uses the real page's
// classes and static copy shown as shimmer bones, so the stepper, wizard header,
// document pane and acceptance area keep their real size at every width.
const STEPS = ['AI Assessment', 'ViBe Platform', 'Ground Truth', 'Data & Docs'];

// Enough placeholder text to fill the document pane, which scrolls in the real page
const DOC_SECTIONS: [string, string][] = [
  ['AI-Enabled Assessment', 'I acknowledge that the interview and/or assessment may be conducted through an Artificial Intelligence enabled platform. The platform may use automated computational processes, Large Language Models (LLMs), evaluation algorithms, pre-processing mechanisms, response analysis, and other technology-assisted assessment methodologies for processing and evaluating my submissions.'],
  ['Multi-Layer Evaluation', 'I understand that my responses may be processed through multiple stages, including automated processing and evaluation, contextual analysis, quality and consistency checks, and expert or subject-matter review where required.'],
  ['Review and Re-evaluation', 'I understand that assessment outcomes may be reviewed or re-evaluated in accordance with the applicable process, and that results may be revised following such review.'],
];

export default function DeclarationSkeleton() {
  return (
    <div className={pageStyles.container} aria-busy="true" aria-label="Loading declarations">
      <HeaderButtonsNavbarSkeleton pageStyles={pageStyles} />

      {/* Stepper */}
      <div className={pageStyles.stepperContainer}>
        <div className={pageStyles.stepperHeader}>
          <div className={pageStyles.stepperTitleGroup}>
            <Bone className={styles.stepperIcon} />
            <span className={pageStyles.stepperTitle}>
              <TextBone>Candidate Declarations & Consents</TextBone>
            </span>
          </div>
          <span className={pageStyles.stepperProgressText}>
            <TextBone>Step 1 of 4 • 25% Complete</TextBone>
          </span>
        </div>
        <div className={pageStyles.stepsRow}>
          {STEPS.map((title, idx) => (
            <div key={title} className={pageStyles.stepItem}>
              <Bone className={styles.stepCircle} />
              <div className={pageStyles.stepInfo}>
                <span className={pageStyles.stepLabel}><TextBone>Step {idx + 1}</TextBone></span>
                <span className={pageStyles.stepName}><TextBone>{title}</TextBone></span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Wizard */}
      <div className={pageStyles.wizardBox}>
        <div className={pageStyles.wizardHeader}>
          <div className={pageStyles.badgeRow}>
            <span className={pageStyles.platformBadge}><TextBone>Annam AI Platform</TextBone></span>
            <span className={pageStyles.versionBadge}><TextBone>Assessment Process</TextBone></span>
            <span className={pageStyles.stepIndicatorBadge}><TextBone>Slide 1 of 4</TextBone></span>
          </div>
          <h1 className={pageStyles.mainTitle}>
            <TextBone>Candidate Declaration and Consent: AI-Based Interview & Assessment Process</TextBone>
          </h1>
          <p className={pageStyles.subtitle}>
            <TextBone>
              Please review and accept the official terms governing AI-assisted evaluation, review mechanisms, and integrity standards before continuing.
            </TextBone>
          </p>
        </div>

        <div className={`${pageStyles.documentPane} ${styles.documentPane}`}>
          <div className={pageStyles.docAlert}>
            <TextBone>
              Voluntary Participation Notice: I, the undersigned candidate, hereby acknowledge that I am voluntarily participating in an AI-enabled interview and assessment process and agree to the following terms.
            </TextBone>
          </div>
          {DOC_SECTIONS.map(([title, text], idx) => (
            <div key={title} className={pageStyles.docSection}>
              <h3 className={pageStyles.docSectionTitle}>
                <Bone className={styles.docSectionNumber} />
                <TextBone>{`${idx + 1}. ${title}`}</TextBone>
              </h3>
              <p className={pageStyles.docParagraph}>
                <TextBone>{text}</TextBone>
              </p>
            </div>
          ))}
        </div>

        <div className={pageStyles.acceptanceCard}>
          <div className={pageStyles.scrollHintBanner}>
            <span className={pageStyles.scrollHintText}>
              <TextBone>
                Please scroll through the entire document above to read all points. The consent checkbox will unlock once you reach the bottom.
              </TextBone>
            </span>
          </div>
          <div className={pageStyles.checkboxContainer}>
            <Bone className={styles.checkbox} />
            <span className={pageStyles.checkboxText}>
              <TextBone>
                I agree to the terms and conditions outlined in the Candidate Declaration and Consent. I confirm that all information provided is accurate and I will comply with the assessment process. *
              </TextBone>
            </span>
          </div>
          <div className={pageStyles.signatureSection}>
            <div className={pageStyles.signatureField}>
              <span className={pageStyles.signatureLabel}><TextBone>Candidate Name</TextBone></span>
              <div className={pageStyles.signatureDateBadge}><TextBone>Candidate Name</TextBone></div>
            </div>
            <div className={pageStyles.signatureField}>
              <span className={pageStyles.signatureLabel}><TextBone>Electronic Signature (Full Legal Name) *</TextBone></span>
              <input className={pageStyles.signatureInput} readOnly tabIndex={-1} aria-hidden="true" />
            </div>
            <div className={pageStyles.signatureField}>
              <span className={pageStyles.signatureLabel}><TextBone>Effective Date</TextBone></span>
              <div className={pageStyles.signatureDateBadge}><TextBone>
                  {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </TextBone></div>
            </div>
          </div>
        </div>

        <div className={pageStyles.actionBar}>
          <span className={pageStyles.actionHelp}>
            <TextBone>Step 1 of 4 • Please accept and sign to enable Next</TextBone>
          </span>
          <div className={pageStyles.buttonGroup}>
            <button type="button" tabIndex={-1} aria-hidden="true" className={`${pageStyles.nextBtn} ${styles.nextBtn}`}>
              <span>Next: ViBe Consent</span>
              <span className={styles.arrow} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

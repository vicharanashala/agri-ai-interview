'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import BrandLogos from '@/components/BrandLogos';
import { signOut, useSession } from 'next-auth/react';

interface CandidateProfile {
  id?: string;
  fullName?: string;
  email?: string;
  declarationAccepted?: boolean;
}

export default function DeclarationPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Candidate Information
  const [candidateInfo, setCandidateInfo] = useState<{
    fullName: string;
    email: string;
    assessmentName: string;
  }>({
    fullName: '',
    email: '',
    assessmentName: 'Foundation Course For Farm Advisors',
  });

  // Current Date string
  const todayFormatted = new Date().toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const timestampFormatted = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  // Slide 1 State: AI Assessment Declaration
  const [slide1Agreed, setSlide1Agreed] = useState(false);
  const [slide1Signature, setSlide1Signature] = useState('');

  // Slide 2 State: ViBe Platform Consent
  const [vibeFullName, setVibeFullName] = useState('');
  const [vibeEmail, setVibeEmail] = useState('');
  const [vibeAssessmentName, setVibeAssessmentName] = useState('Foundation Course For Farm Advisors');
  const [vibeAgreed, setVibeAgreed] = useState(false);
  const [vibeSignature, setVibeSignature] = useState('');

  // Slide 3 State: Ground Truth Module Consent
  const [gtFullName, setGtFullName] = useState('');
  const [gtAgreed, setGtAgreed] = useState(false);
  const [gtSignature, setGtSignature] = useState('');

  // Slide 4 State: Document & Personal Data Consent (DPDP Act)
  const [docFullName, setDocFullName] = useState('');
  const [docAgreed, setDocAgreed] = useState(false);
  const [docSignature, setDocSignature] = useState('');

  // Helper to apply candidate name and email across all form inputs and signatures
  const applyCandidateData = (name: string, mail: string) => {
    if (name) {
      setCandidateInfo((prev) => ({ ...prev, fullName: name }));
      setSlide1Signature((prev) => prev || name);
      setVibeFullName((prev) => prev || name);
      setVibeSignature((prev) => prev || name);
      setGtFullName((prev) => prev || name);
      setGtSignature((prev) => prev || name);
      setDocFullName((prev) => prev || name);
      setDocSignature((prev) => prev || name);
    }
    if (mail) {
      setCandidateInfo((prev) => ({ ...prev, email: mail }));
      setVibeEmail((prev) => prev || mail);
    }
  };

  // Fetch candidate profile to prefill candidate information and verify completion status
  useEffect(() => {
    let isCancelled = false;

    async function loadCandidate() {
      // 1. Check session directly first
      const sessName = session?.user?.name || '';
      const sessMail = session?.user?.email || '';
      if (sessName || sessMail) {
        applyCandidateData(sessName, sessMail);
      }

      // 2. Fetch candidate profile from backend API
      try {
        const emailQuery = sessMail ? `?email=${encodeURIComponent(sessMail)}` : '';
        const res = await fetch(`/api/candidate${emailQuery}`, {
          cache: 'no-store',
          credentials: 'include',
        });
        if (res.ok && !isCancelled) {
          const data: CandidateProfile = await res.json();

          if (data.declarationAccepted) {
            console.log('[Declaration] All declarations already accepted, redirecting away to post-login...');
            setIsRedirecting(true);
            router.replace('/post-login');
            return;
          }

          const resolvedName = data.fullName || sessName || '';
          const resolvedEmail = data.email || sessMail || '';
          applyCandidateData(resolvedName, resolvedEmail);
        }
      } catch (err) {
        console.error('Failed to load candidate details:', err);
      }
    }

    loadCandidate();

    return () => {
      isCancelled = true;
    };
  }, [session, status, router]);

  // Synchronize name edits across slides
  const handleSlide1SignatureChange = (val: string) => {
    const oldVal = slide1Signature;
    setSlide1Signature(val);
    setVibeFullName((prev) => (!prev || prev === oldVal ? val : prev));
    setVibeSignature((prev) => (!prev || prev === oldVal ? val : prev));
    setGtFullName((prev) => (!prev || prev === oldVal ? val : prev));
    setGtSignature((prev) => (!prev || prev === oldVal ? val : prev));
    setDocFullName((prev) => (!prev || prev === oldVal ? val : prev));
    setDocSignature((prev) => (!prev || prev === oldVal ? val : prev));
  };

  const handleVibeFullNameChange = (val: string) => {
    const oldVal = vibeFullName;
    setVibeFullName(val);
    if (!vibeSignature || vibeSignature === oldVal) {
      setVibeSignature(val);
    }
    setGtFullName((prev) => (!prev || prev === oldVal ? val : prev));
    setGtSignature((prev) => (!prev || prev === oldVal ? val : prev));
    setDocFullName((prev) => (!prev || prev === oldVal ? val : prev));
    setDocSignature((prev) => (!prev || prev === oldVal ? val : prev));
  };

  const handleGtFullNameChange = (val: string) => {
    const oldVal = gtFullName;
    setGtFullName(val);
    if (!gtSignature || gtSignature === oldVal) {
      setGtSignature(val);
    }
    setDocFullName((prev) => (!prev || prev === oldVal ? val : prev));
    setDocSignature((prev) => (!prev || prev === oldVal ? val : prev));
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut({ callbackUrl: '/login' });
  };

  // Validation checkers for each slide:
  // Each slide requires the agreement checkbox to be checked.
  // Signatures and names are pre-populated from registration.
  const candidateName =
    slide1Signature.trim() ||
    candidateInfo.fullName.trim() ||
    session?.user?.name ||
    '';

  const isSlide1Valid = slide1Agreed && (slide1Signature.trim().length > 0 || candidateName.length > 0);
  const isSlide2Valid = vibeAgreed && (vibeSignature.trim().length > 0 || candidateName.length > 0);
  const isSlide3Valid = gtAgreed && (gtSignature.trim().length > 0 || candidateName.length > 0);
  const isSlide4Valid = docAgreed && (docSignature.trim().length > 0 || candidateName.length > 0);

  const handleNext = () => {
    setErrorMsg(null);
    if (currentSlide === 0) {
      if (!isSlide1Valid) {
        setErrorMsg('Please read and tick the agreement checkbox to continue.');
        return;
      }
      // Forward slide 1 signature & name to slide 2 & subsequent slides if empty
      const s1Sig = slide1Signature.trim() || candidateName;
      if (s1Sig) {
        setVibeFullName((prev) => prev || s1Sig);
        setVibeSignature((prev) => prev || s1Sig);
        setGtFullName((prev) => prev || s1Sig);
        setGtSignature((prev) => prev || s1Sig);
        setDocFullName((prev) => prev || s1Sig);
        setDocSignature((prev) => prev || s1Sig);
      }
      const activeMail = candidateInfo.email || session?.user?.email || '';
      if (activeMail) {
        setVibeEmail((prev) => prev || activeMail);
      }
    }
    if (currentSlide === 1) {
      if (!isSlide2Valid) {
        setErrorMsg('Please check the ViBe acceptance declaration and enter your digital signature.');
        return;
      }
      const s2Name = vibeFullName.trim() || vibeSignature.trim() || candidateName;
      if (s2Name) {
        setGtFullName((prev) => prev || s2Name);
        setGtSignature((prev) => prev || s2Name);
        setDocFullName((prev) => prev || s2Name);
        setDocSignature((prev) => prev || s2Name);
      }
    }
    if (currentSlide === 2) {
      if (!isSlide3Valid) {
        setErrorMsg('Please confirm your Ground Truth consent and enter your digital signature.');
        return;
      }
      const s3Name = gtFullName.trim() || gtSignature.trim() || candidateName;
      if (s3Name) {
        setDocFullName((prev) => prev || s3Name);
        setDocSignature((prev) => prev || s3Name);
      }
    }
    if (currentSlide < 3) {
      setCurrentSlide((prev) => prev + 1);
      // Scroll to top of window or wizard box
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    setErrorMsg(null);
    if (currentSlide > 0) {
      setCurrentSlide((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmitAll = async () => {
    setErrorMsg(null);
    if (!isSlide1Valid || !isSlide2Valid || !isSlide3Valid || !isSlide4Valid) {
      setErrorMsg('Please ensure all 4 declarations and consent forms are accepted and signed before submitting.');
      return;
    }

    setLoading(true);
    try {
      const resolvedName =
        slide1Signature.trim() ||
        vibeSignature.trim() ||
        gtSignature.trim() ||
        docSignature.trim() ||
        vibeFullName.trim() ||
        gtFullName.trim() ||
        docFullName.trim() ||
        candidateInfo.fullName.trim() ||
        session?.user?.name ||
        'Candidate';

      const resolvedEmail =
        candidateInfo.email.trim() ||
        vibeEmail.trim() ||
        session?.user?.email ||
        '';

      const payload = {
        declarationAccepted: true,
        consents: {
          slide1_aiAssessment: {
            consentName: 'AI-Based Interview & Assessment Process Declaration',
            accepted: true,
            acceptedAt: new Date().toISOString(),
            fullName: resolvedName,
            signature: slide1Signature.trim() || resolvedName,
          },
          slide2_vibePlatform: {
            consentName: 'ViBe Platform Candidate Consent, Camera Access & Assessment Declaration',
            version: '1.1',
            platform: 'ViBe',
            accepted: true,
            acceptedAt: new Date().toISOString(),
            fullName: resolvedName,
            email: resolvedEmail,
            assessmentName: vibeAssessmentName.trim(),
            signature: vibeSignature.trim() || resolvedName,
          },
          slide3_groundTruthModule: {
            consentName: 'Ground Truth Module - Field-Based Agricultural Assessment Consent',
            platform: 'AnnaDatha',
            module: 'Ground Truth – Field-Based Agricultural Assessment',
            accepted: true,
            acceptedAt: new Date().toISOString(),
            fullName: resolvedName,
            signature: gtSignature.trim() || resolvedName,
          },
          slide4_documentVerificationDPDP: {
            consentName: 'Candidate Consent & Data Verification Declaration (DPDP Act 2023)',
            organisation: 'Annam / Samagama',
            accepted: true,
            acceptedAt: new Date().toISOString(),
            fullName: resolvedName,
            signature: docSignature.trim() || resolvedName,
          },
        },
      };

      const res = await fetch('/api/candidate/declaration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setIsRedirecting(true);
        router.replace('/post-login');
      } else {
        const data = await res.json().catch(() => ({}));
        setErrorMsg(data.detail || data.error || 'Failed to submit declaration. Please try again.');
      }
    } catch (e: any) {
      console.error(e);
      setErrorMsg('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const steps = [
    { title: 'AI Assessment', subtitle: 'Platform Declaration' },
    { title: 'ViBe Platform', subtitle: 'Camera & Proctoring' },
    { title: 'Ground Truth', subtitle: 'Field Assessment' },
    { title: 'Data & Docs', subtitle: 'DPDP Act Consent' },
  ];

  if (isRedirecting) {
    return (
      <div className={styles.container}>
        <nav className={styles.topNavbar}>
          <div className={styles.navbarContent}>
            <BrandLogos variant="header" />
            <div className={styles.headerButtons}>
              <button
                type="button"
                onClick={() => window.open('/raise-ticket.html', '_blank')}
                className={styles.raiseTicketBtn}
              >
                ⚠️ Raise Tickets
              </button>
              <button
                type="button"
                onClick={() => router.push('/faq')}
                className={styles.faqHelpBtn}
              >
                💬 FAQ & Help
              </button>
              <button
                type="button"
                onClick={handleLogout}
                disabled={loggingOut}
                className={styles.signOutBtn}
              >
                {loggingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </nav>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: '16px' }}>
          <div style={{ width: '42px', height: '42px', border: '3px solid #bbf7d0', borderTopColor: '#16a34a', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
          <p style={{ color: '#0f2238', fontSize: '16px', fontWeight: 700 }}>Declarations Submitted Successfully</p>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '-8px' }}>Redirecting to your dashboard...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* ─── Top Navbar ─── */}
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
            <button
              type="button"
              onClick={() => window.open('/raise-ticket.html', '_blank')}
              className={styles.raiseTicketBtn}
            >
              ⚠️ Raise Tickets
            </button>
            <button
              type="button"
              onClick={() => router.push('/faq')}
              className={styles.faqHelpBtn}
            >
              💬 FAQ & Help
            </button>
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className={styles.signOutBtn}
            >
              {loggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </nav>

      {/* ─── Stepper Progress Bar ─── */}
      <div className={styles.stepperContainer}>
        <div className={styles.stepperHeader}>
          <div className={styles.stepperTitleGroup}>
            <svg className={styles.stepperIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <span className={styles.stepperTitle}>Candidate Declarations & Consents</span>
          </div>
          <span className={styles.stepperProgressText}>
            Step {currentSlide + 1} of 4 • {((currentSlide + 1) * 25)}% Complete
          </span>
        </div>

        <div className={styles.stepsRow}>
          {steps.map((step, idx) => {
            const isCompleted = idx < currentSlide;
            const isActive = idx === currentSlide;
            const isAccessible = idx <= currentSlide;

            return (
              <div
                key={idx}
                className={`${styles.stepItem} ${isActive ? styles.stepItemActive : ''} ${isCompleted ? styles.stepItemCompleted : ''} ${!isAccessible ? styles.stepItemDisabled : ''}`}
                onClick={() => {
                  if (idx < currentSlide) {
                    setCurrentSlide(idx);
                  }
                }}
              >
                <div
                  className={`${styles.stepCircle} ${isActive ? styles.stepCircleActive : ''} ${isCompleted ? styles.stepCircleCompleted : ''}`}
                >
                  {isCompleted ? '✓' : idx + 1}
                </div>
                <div className={styles.stepInfo}>
                  <span className={styles.stepLabel}>Step {idx + 1}</span>
                  <span className={`${styles.stepName} ${isActive ? styles.stepNameActive : ''}`}>
                    {step.title}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Error Banner ─── */}
      {errorMsg && (
        <div className={styles.errorBanner} style={{ maxWidth: '980px', width: 'calc(100% - 48px)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* ─── Main Content Wizard Box ─── */}
      <div className={styles.wizardBox}>
        {/* ═══════════════════════════════════════════════════════════════════
            SLIDE 1: Existing Candidate Declaration (AI-Based Interview)
        ═══════════════════════════════════════════════════════════════════ */}
        {currentSlide === 0 && (
          <>
            <div className={styles.wizardHeader}>
              <div className={styles.badgeRow}>
                <span className={styles.platformBadge}>Annam AI Platform</span>
                <span className={styles.versionBadge}>Assessment Process</span>
                <span className={styles.stepIndicatorBadge}>Slide 1 of 4</span>
              </div>
              <h1 className={styles.mainTitle}>
                Candidate Declaration and Consent: AI-Based Interview & Assessment Process
              </h1>
              <p className={styles.subtitle}>
                Please review and accept the official terms governing AI-assisted evaluation, review mechanisms, and integrity standards before continuing.
              </p>
            </div>

            <div className={styles.documentPane}>
              <div className={styles.docAlert}>
                <strong>Voluntary Participation Notice:</strong> I, the undersigned candidate, hereby acknowledge that I am voluntarily participating in an AI-enabled interview and assessment process and agree to the following terms governing my participation, use of the platform, processing of my responses, and communication of concerns.
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>1</span>
                  AI-Enabled Assessment
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that the interview and/or assessment may be conducted through an Artificial Intelligence enabled platform. The platform may use automated computational processes, Large Language Models (LLMs), evaluation algorithms, pre-processing mechanisms, response analysis, and other technology-assisted assessment methodologies for processing and evaluating my submissions.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>2</span>
                  Automated Processing and Human Review
                </h3>
                <p className={styles.docParagraph}>
                  I understand that the assessment process may involve multiple stages, including but not limited to:
                </p>
                <ul className={styles.docList}>
                  <li className={styles.docListItem}>automated processing and evaluation;</li>
                  <li className={styles.docListItem}>response normalisation and pre-processing;</li>
                  <li className={styles.docListItem}>contextual analysis;</li>
                  <li className={styles.docListItem}>AI-generated evaluation;</li>
                  <li className={styles.docListItem}>quality and consistency checks;</li>
                  <li className={styles.docListItem}>expert or subject-matter review; and</li>
                  <li className={styles.docListItem}>re-evaluation or secondary verification where required.</li>
                </ul>
                <p className={styles.docParagraph}>
                  I acknowledge that an assessment outcome may therefore not be determined solely by a single AI-generated response or a single automated evaluation event.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>3</span>
                  Context, Interpretation and Perception of AI Responses
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that AI-generated responses and system outputs are generated through computational models that interpret the question, linguistic context, available information, system instructions, and other relevant inputs.
                </p>
                <p className={styles.docParagraph}>
                  Accordingly, an output may, in certain circumstances, appear different from what a candidate expects because of differences in context, interpretation, terminology, linguistic expression, or human perception. Such an apparent difference should not, by itself, be treated as evidence of a technical defect, malfunction, bias, or issue with the assessment process.
                </p>
                <p className={styles.docParagraph}>
                  I understand that any concern, clarification, or query regarding an AI response, assessment outcome, or platform behaviour can and should be raised through the designated review or grievance mechanism so that the relevant records and evaluation process can be examined.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>4</span>
                  Re-Evaluation and Verification Mechanism
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that the platform may have an in-built mechanism for pre-processing, re-evaluation, verification, quality assurance, or expert review of responses.
                </p>
                <p className={styles.docParagraph}>
                  Where a concern is raised, the organisation may review the relevant submission, system output, assessment records, and applicable evaluation criteria before determining whether the matter represents:
                </p>
                <ul className={styles.docList}>
                  <li className={styles.docListItem}>an expected platform behaviour or feature;</li>
                  <li className={styles.docListItem}>a difference in interpretation or context;</li>
                  <li className={styles.docListItem}>an assessment-related matter requiring review; or</li>
                  <li className={styles.docListItem}>a genuine technical or system issue.</li>
                </ul>
                <p className={styles.docParagraph}>
                  The outcome of such review shall be communicated through the applicable process.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>5</span>
                  Candidate Responsibility and Authenticity
                </h3>
                <p className={styles.docParagraph}>I confirm that:</p>
                <ul className={styles.docList} style={{ listStyleType: 'none', paddingLeft: '8px' }}>
                  <li className={styles.docListItem}><strong>a.</strong> The information provided by me is true and accurate to the best of my knowledge;</li>
                  <li className={styles.docListItem}><strong>b.</strong> The responses submitted during the assessment are my own, unless assistance is expressly permitted;</li>
                  <li className={styles.docListItem}><strong>c.</strong> I will not intentionally manipulate, circumvent, exploit, or interfere with the assessment system;</li>
                  <li className={styles.docListItem}><strong>d.</strong> I will not attempt to gain an unfair advantage through unauthorised technological or external assistance; and</li>
                  <li className={styles.docListItem}><strong>e.</strong> I will comply with the instructions communicated to me during the assessment process.</li>
                </ul>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>6</span>
                  Confidentiality and Non-Disclosure
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that assessment questions, prompts, evaluation criteria, system behaviour, platform interfaces, screenshots, recordings, responses, technical documentation, and other assessment-related information may constitute confidential or restricted information.
                </p>
                <p className={styles.docParagraph}>I therefore agree not to, without prior written authorisation:</p>
                <ul className={styles.docList}>
                  <li className={styles.docListItem}>reproduce or distribute assessment questions;</li>
                  <li className={styles.docListItem}>share screenshots or recordings of the assessment;</li>
                  <li className={styles.docListItem}>publish confidential assessment content;</li>
                  <li className={styles.docListItem}>disclose assessment materials on social-media platforms or public forums;</li>
                  <li className={styles.docListItem}>attempt to reverse engineer or circumvent assessment mechanisms; or</li>
                  <li className={styles.docListItem}>otherwise disclose restricted information to third parties.</li>
                </ul>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>7</span>
                  Official Communication and Grievance Mechanism
                </h3>
                <p className={styles.docParagraph}>
                  If I experience a technical problem, have a concern regarding the assessment, observe unexpected system behaviour, or require clarification, I agree to use the official ticketing, grievance, or support mechanism provided on the platform.
                </p>
                <p className={styles.docParagraph}>
                  I understand that using the prescribed mechanism enables the organisation to examine the relevant technical logs, submission records, evaluation information, and other available evidence before responding to the concern.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>8</span>
                  Responsible Social-Media and Public Communication
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that concerns relating to the assessment, AI-generated responses, candidate evaluation, platform behaviour, or selection process can and should be raised through the designated official channels (1. Tickets; 2. Email), so that they can be appropriately reviewed and addressed.
                </p>
                <p className={styles.docParagraph}>
                  I agree not to make or circulate unverified allegations, confidential assessment information, misleading representations, or conclusions regarding the functioning or integrity of the platform through public social-media platforms or other public forums before the matter has been submitted through the prescribed review mechanism.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>9</span>
                  Compliance with Institutional and Organisational Policies
                </h3>
                <p className={styles.docParagraph}>
                  I agree to comply with all applicable instructions, policies, codes of conduct, confidentiality requirements, information-security requirements, and social-media guidelines communicated by the organisation and/or the institution governing the selection process.
                </p>
                <p className={styles.docParagraph}>
                  Where the assessment is conducted in association with an educational institution, government body, research institution, or other partner organisation, I acknowledge that applicable institutional policies may also apply to my participation.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>10</span>
                  Personal Data and Digital Information
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that participation in the assessment may require the collection and processing of certain personal information and assessment-related data. Such information may include candidate identification details, contact info, responses, recordings or transcripts, interaction data, and evaluation records.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>11</span>
                  Assessment Integrity and Consequences of Non-Compliance
                </h3>
                <p className={styles.docParagraph}>
                  I understand that any material violation of the assessment rules, including unauthorised disclosure of confidential assessment content, deliberate manipulation of the assessment process, impersonation, fraudulent submissions, or other material misconduct may result in disqualification from the assessment or cancellation of candidature.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>12</span>
                  Electronic Acceptance and Record
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that my acceptance of this declaration through an electronic checkbox, digital confirmation, electronic signature, or other authorised electronic mechanism may be recorded as evidence of my acknowledgement and acceptance of the applicable terms.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>13</span>
                  Candidate Acknowledgement
                </h3>
                <p className={styles.docParagraph}>
                  I have read and understood this declaration, including the provisions relating to AI-assisted evaluation, contextual interpretation, re-evaluation, confidentiality, responsible communication, data processing, and assessment integrity.
                </p>
              </div>
            </div>

            <div className={styles.acceptanceCard}>
              <label
                className={`${styles.checkboxContainer} ${slide1Agreed ? styles.checkboxContainerChecked : ''}`}
              >
                <input
                  type="checkbox"
                  checked={slide1Agreed}
                  onChange={(e) => setSlide1Agreed(e.target.checked)}
                  className={styles.customCheckbox}
                />
                <span className={styles.checkboxText}>
                  <strong>I agree to the terms and conditions</strong> outlined in the Candidate Declaration and Consent. I confirm that all information provided is accurate and I will comply with the assessment process. <span className={styles.requiredStar}>*</span>
                </span>
              </label>

              <div className={styles.signatureSection}>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Candidate Name</label>
                  <div className={styles.signatureDateBadge}>
                    {candidateInfo.fullName || slide1Signature || session?.user?.name || 'Candidate Name'}
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Electronic Signature (Full Legal Name) *</label>
                  <input
                    type="text"
                    value={slide1Signature}
                    onChange={(e) => handleSlide1SignatureChange(e.target.value)}
                    placeholder="Type your full legal name"
                    className={styles.signatureInput}
                  />
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Effective Date</label>
                  <div className={styles.signatureDateBadge}>{todayFormatted}</div>
                </div>
              </div>
            </div>

            <div className={styles.actionBar}>
              <span className={styles.actionHelp}>
                Step 1 of 4 • Please accept and sign to enable Next
              </span>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!isSlide1Valid}
                  className={styles.nextBtn}
                >
                  <span>Next: ViBe Consent</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SLIDE 2: ViBe Platform Consent (PDF 1)
        ═══════════════════════════════════════════════════════════════════ */}
        {currentSlide === 1 && (
          <>
            <div className={styles.wizardHeader}>
              <div className={styles.badgeRow}>
                <span className={styles.platformBadge}>Platform: ViBe</span>
                <span className={styles.versionBadge}>Version 1.1</span>
                <span className={styles.versionBadge}>Course: Foundation Course For Farm Advisors</span>
                <span className={styles.versionBadge}>Camera & Mic Access</span>
                <span className={styles.stepIndicatorBadge}>Slide 2 of 4</span>
              </div>
              <h1 className={styles.mainTitle}>
                Candidate Consent, Camera Access and Online Assessment Declaration
              </h1>
              <p className={styles.subtitle}>
                ViBe Platform Candidate Consent and Data Processing Declaration governing camera, microphone, identity verification, and assessment proctoring.
              </p>
            </div>

            <div className={styles.documentPane}>
              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>2</span>
                  Purpose and Scope of This Declaration
                </h3>
                <p className={styles.docParagraph}>
                  This declaration explains the circumstances in which the ViBe platform and the organisation responsible for the relevant assessment may request camera and, where applicable, microphone access, verify candidate identity, administer online assessments, and process associated personal data.
                </p>
                <p className={styles.docParagraph}>
                  By proceeding with an assessment, I acknowledge that I have been informed of the applicable assessment requirements and the purposes for which my personal data may be processed, as described in this declaration and the applicable Privacy Notice.
                </p>
                <p className={styles.docParagraph}>
                  This declaration applies only to the assessment or activity identified above and to the functionalities actually enabled for that activity.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>3</span>
                  Camera and Microphone Access
                </h3>
                <p className={styles.docParagraph}>I understand and acknowledge that:</p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}>The platform may request permission to access my device&apos;s camera and, where required, microphone for an assessment, interview, identity verification, or another activity disclosed to me in advance.</li>
                  <li className={styles.docListItem}>Camera access may be used to verify my identity, confirm my participation, or support assessment-integrity checks where such functions are enabled.</li>
                  <li className={styles.docListItem}>Microphone access may be required to record or transmit my verbal responses, facilitate an interview, or support another activity requiring audio input.</li>
                  <li className={styles.docListItem}>The permissions requested will depend on the requirements of the specific assessment and the features enabled for that session.</li>
                  <li className={styles.docListItem}>I may manage or revoke camera and microphone permissions through my browser or device settings. I understand that withdrawing a permission during an activity that requires it may interrupt the session or prevent its completion.</li>
                  <li className={styles.docListItem}>If a required permission is unavailable, I may contact the designated assessment support channel for assistance. The applicable assessment policy will govern any consequences for incomplete participation.</li>
                </ol>
                <div className={styles.docAlert}>
                  Camera or microphone permission does not, by itself, establish that continuous audio or video recording is taking place. Any recording, storage, transmission, or further analysis will depend on the functionality enabled for the relevant activity and the information disclosed in the applicable Privacy Notice.
                </div>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>4</span>
                  Identity Verification and Assessment Integrity
                </h3>
                <p className={styles.docParagraph}>
                  Where identity verification or proctoring functionality is enabled and disclosed for my assessment, I understand that the platform may:
                </p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}>Capture an image of me for identity verification or assessment-integrity purposes.</li>
                  <li className={styles.docListItem}>Compare a captured image with a reference image or other permitted identity information, where the relevant functionality is enabled and disclosed.</li>
                  <li className={styles.docListItem}>Conduct periodic or session-based visual checks to help establish that the registered candidate is participating.</li>
                  <li className={styles.docListItem}>Maintain session records, including commencement and completion times, interruptions, and technical events relevant to assessment administration.</li>
                  <li className={styles.docListItem}>Generate alerts or flags relating to apparent irregularities, where such functionality is enabled.</li>
                </ol>
                <p className={styles.docParagraph}>
                  I understand that automated checks may produce inaccurate results and that a system-generated flag should not automatically be treated as conclusive evidence of misconduct. Where applicable, flagged events will be handled in accordance with the relevant assessment policy and reviewed by authorised personnel before consequential action is taken.
                </p>
                <p className={styles.docParagraph}>
                  The platform will not be presumed to use facial recognition, biometric identification, continuous recording, or automated decision-making unless the relevant functionality is actually implemented and appropriately disclosed.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>5</span>
                  Personal Data Collected and Its Purpose
                </h3>
                <p className={styles.docParagraph}>
                  Depending on the assessment and the functionality enabled, the following categories of personal data may be processed:
                </p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}><strong>Candidate Information:</strong> Name, registered email address, and candidate ID may be processed for candidate identification, communication, and assessment administration.</li>
                  <li className={styles.docListItem}><strong>Camera Images and Photographs:</strong> Images or photographs may be collected for identity verification and assessment-integrity purposes, where applicable.</li>
                  <li className={styles.docListItem}><strong>Audio Information:</strong> Audio input may be collected for interviews, verbal responses, or other disclosed assessment activities requiring microphone access, where applicable.</li>
                  <li className={styles.docListItem}><strong>Assessment Information:</strong> Candidate responses, submissions, scores, and results may be processed for evaluation, scoring, and assessment administration.</li>
                  <li className={styles.docListItem}><strong>Session Information:</strong> Session timestamps, login records, interruptions, and relevant activity logs may be processed for session management, troubleshooting, and assessment-integrity checks.</li>
                  <li className={styles.docListItem}><strong>Technical Information:</strong> Relevant device, browser, connectivity, and technical logs may be collected, where applicable, for platform operation, security, and troubleshooting.</li>
                  <li className={styles.docListItem}><strong>Identity Verification Records:</strong> Information generated or collected during identity verification may be processed, where applicable, to confirm candidate identity and review potential assessment irregularities.</li>
                </ol>
                <p className={styles.docParagraph}>
                  The organisation will process personal data only for the purposes disclosed to the candidate and in accordance with the applicable Privacy Notice, relevant organisational policies, and applicable law. The collection and processing of each category of data will be limited to what is reasonably necessary for the relevant assessment or activity.
                </p>
                <p className={styles.docParagraph}>
                  Where an additional category of personal data or a new processing purpose is introduced, the organisation will provide the required information and obtain consent or establish another lawful basis, as applicable under relevant data-protection laws.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>6</span>
                  Recording, Storage, Access and Retention
                </h3>
                <p className={styles.docParagraph}>
                  I understand that the collection and retention of photographs, audio, video, assessment records, and technical logs depend on the functionality enabled for my assessment. Where such information is recorded or retained:
                </p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}>It will be handled by the organisation responsible for the assessment and, where applicable, its authorised service providers acting in accordance with their authorised roles and contractual obligations.</li>
                  <li className={styles.docListItem}>Access will be restricted to authorised persons who require the information for legitimate assessment, recruitment, training, security, support, or compliance purposes.</li>
                  <li className={styles.docListItem}>Personal data will be retained in accordance with the retention period or criteria specified in the applicable Privacy Notice, subject to applicable legal requirements.</li>
                  <li className={styles.docListItem}>Appropriate technical and organisational safeguards will be implemented to protect personal data against unauthorised access, disclosure, alteration, loss, or misuse.</li>
                  <li className={styles.docListItem}>Disclosures to third parties will be governed by the applicable Privacy Notice and applicable law.</li>
                </ol>
                <p className={styles.docParagraph}>
                  Before the assessment begins, the organisation should make available relevant information concerning the identity of the responsible organisation, applicable retention periods, authorised recipients or service providers, and the designated privacy contact.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>7</span>
                  Candidate Responsibilities and Assessment Integrity
                </h3>
                <p className={styles.docParagraph}>I declare that:</p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}>I will participate using my own registered account and will not impersonate another person or permit another person to take the assessment on my behalf.</li>
                  <li className={styles.docListItem}>The information I provide for identity verification and assessment purposes will be accurate to the best of my knowledge.</li>
                  <li className={styles.docListItem}>I will comply with the applicable assessment instructions, platform rules, and code of conduct.</li>
                  <li className={styles.docListItem}>I will not deliberately manipulate, obstruct, or circumvent authorised identity-verification or assessment-integrity mechanisms.</li>
                  <li className={styles.docListItem}>I will make reasonable efforts to use a suitable device and maintain the internet connectivity, camera access, and other technical requirements communicated for the assessment.</li>
                  <li className={styles.docListItem}>I will promptly report technical difficulties that materially affect my ability to participate.</li>
                </ol>
                <p className={styles.docParagraph}>
                  Suspected violations of assessment rules may be examined under the applicable assessment or recruitment policy. Any resulting action will be based on the relevant circumstances, the applicable policy, and applicable law.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>8</span>
                  Consent, Choice and Withdrawal
                </h3>
                <p className={styles.docParagraph}>
                  I confirm that I have been informed of the purposes for which my personal data may be processed and the circumstances in which camera or microphone access may be required. I understand that:
                </p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}>Where consent is the applicable legal basis for processing my personal data, the organisation will seek my consent for the disclosed purposes in accordance with applicable law.</li>
                  <li className={styles.docListItem}>I may withdraw consent through the mechanism or contact channel specified in the applicable Privacy Notice.</li>
                  <li className={styles.docListItem}>Withdrawing consent may prevent the organisation from continuing an activity for which the relevant processing is necessary, where no other lawful basis is available.</li>
                  <li className={styles.docListItem}>Withdrawal will not affect the lawfulness of processing carried out before withdrawal. Information may continue to be retained or processed where permitted or required by applicable law.</li>
                  <li className={styles.docListItem}>I may contact the designated privacy or grievance contact to ask questions, raise concerns, or exercise rights available to me under applicable law.</li>
                </ol>
                <p className={styles.docParagraph}>
                  The organisation will communicate any material assessment-specific consequences of withholding or withdrawing consent before the candidate proceeds, including applicable rules concerning incomplete assessments.
                </p>
                <p className={styles.docParagraph}>
                  Where an activity genuinely requires camera or microphone access, the organisation may specify those requirements as conditions of participation, provided they are disclosed in advance and implemented in accordance with applicable law.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>9</span>
                  Confidentiality and Information Security
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that assessment materials, interview questions, candidate information, and other non-public content made available to me may be confidential.
                </p>
                <p className={styles.docParagraph}>
                  I agree not to make unauthorised recordings, screenshots, copies, or disclosures of confidential assessment content or another person&apos;s personal information, except where expressly permitted by the organisation or required by applicable law.
                </p>
                <p className={styles.docParagraph}>
                  I understand that the organisation will implement appropriate safeguards to protect personal data. However, no online platform can guarantee absolute security against every possible threat.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>10</span>
                  Candidate Declaration and Electronic Acceptance
                </h3>
                <p className={styles.docParagraph}>
                  By selecting the applicable checkbox and proceeding with the assessment, I confirm that:
                </p>
                <ol className={styles.docList} style={{ paddingLeft: '24px' }}>
                  <li className={styles.docListItem}>I have read and understood this declaration.</li>
                  <li className={styles.docListItem}>I have been given an opportunity to review the applicable Privacy Notice.</li>
                  <li className={styles.docListItem}>I understand why camera access and, where applicable, microphone access may be required.</li>
                  <li className={styles.docListItem}>I understand the categories of personal data that may be collected and the purposes for which they may be processed.</li>
                  <li className={styles.docListItem}>I understand the distinction between granting device permission and consenting to the recording or further processing of audio or video.</li>
                  <li className={styles.docListItem}>I voluntarily provide the consent expressly requested for the disclosed processing activities where consent is the applicable legal basis.</li>
                  <li className={styles.docListItem}>I understand that electronic acceptance may be recorded as evidence of my acknowledgement and consent.</li>
                  <li className={styles.docListItem}>I confirm that the information I have provided is accurate to the best of my knowledge.</li>
                </ol>
                <p className={styles.docParagraph}>
                  I understand that this declaration does not waive any rights or exclude any legal responsibilities that cannot lawfully be waived or excluded.
                </p>
              </div>
            </div>

            {/* Acceptance Section (PDF 1 Page 6) */}
            <div className={styles.acceptanceCard}>
              <label
                className={`${styles.checkboxContainer} ${vibeAgreed ? styles.checkboxContainerChecked : ''}`}
              >
                <input
                  type="checkbox"
                  checked={vibeAgreed}
                  onChange={(e) => setVibeAgreed(e.target.checked)}
                  className={styles.customCheckbox}
                />
                <span className={styles.checkboxText}>
                  <strong>I have read and understood this declaration and the applicable Privacy Notice.</strong> I acknowledge the camera and microphone requirements applicable to my assessment and provide the consent expressly requested for the disclosed processing of my personal data, where consent is the applicable legal basis. <span className={styles.requiredStar}>*</span>
                </span>
              </label>

              <div className={styles.signatureSection}>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Candidate Name</label>
                  <div className={styles.signatureDateBadge}>
                    {vibeFullName || slide1Signature || candidateInfo.fullName || session?.user?.name || 'Candidate Name'}
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Registered Email Address</label>
                  <div className={styles.signatureDateBadge}>
                    {vibeEmail || candidateInfo.email || session?.user?.email || 'email@example.com'}
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Assessment / Course Name</label>
                  <div className={styles.signatureDateBadge}>
                    Foundation Course For Farm Advisors
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Electronic Acceptance / Digital Signature *</label>
                  <input
                    type="text"
                    value={vibeSignature}
                    onChange={(e) => setVibeSignature(e.target.value)}
                    placeholder="Type your full legal name to sign"
                    className={styles.signatureInput}
                  />
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Date and Time</label>
                  <div className={styles.signatureDateBadge}>{timestampFormatted}</div>
                </div>
              </div>
            </div>

            <div className={styles.actionBar}>
              <button
                type="button"
                onClick={handleBack}
                className={styles.backBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Back</span>
              </button>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!isSlide2Valid}
                  className={styles.nextBtn}
                >
                  <span>Next: Ground Truth Consent</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SLIDE 3: Ground Truth Module Consent (PDF 2)
        ═══════════════════════════════════════════════════════════════════ */}
        {currentSlide === 2 && (
          <>
            <div className={styles.wizardHeader}>
              <div className={styles.badgeRow}>
                <span className={styles.platformBadge}>Platform: AnnaDatha</span>
                <span className={styles.versionBadge}>Ground Truth Module</span>
                <span className={styles.versionBadge}>Weightage: 150 Marks</span>
                <span className={styles.stepIndicatorBadge}>Slide 3 of 4</span>
              </div>
              <h1 className={styles.mainTitle}>
                Ground Truth – Field-Based Agricultural Assessment Declaration
              </h1>
              <p className={styles.subtitle}>
                AnnaDatha Assessment Process terms governing independent village visits, farmer interaction, ethical conduct, risk awareness, and assessment weightage.
              </p>
            </div>

            <div className={styles.documentPane}>
              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>1</span>
                  Purpose of the Assessment
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that the Ground Truth Module is a prescribed component of the AnnaDatha assessment process, designed to evaluate my practical agricultural knowledge, ability to engage with farmers, identify field-level agricultural challenges, document observations, and communicate scientifically supported agricultural advisory.
                </p>
                <div className={styles.docAlert}>
                  I understand that the module carries a <strong>maximum weightage of 150 marks</strong> and that completion and evaluation of the prescribed field-based task are required for assessment under the published criteria.
                </div>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>2</span>
                  Voluntary Decision to Participate
                </h3>
                <p className={styles.docParagraph}>
                  I understand that applying for or participating in the AnnaDatha selection process is my choice. Having reviewed the assessment requirements, I have independently decided to proceed with the Ground Truth Module.
                </p>
                <p className={styles.docParagraph}>
                  I acknowledge that I am not being compelled to undertake the field activity and that I have had the opportunity to seek clarification regarding its requirements before proceeding. I further understand that if I choose not to undertake or complete the prescribed module, my assessment may remain incomplete and my eligibility for further consideration may be affected in accordance with the assessment rules communicated to me.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>3</span>
                  Independent Field Visit Arrangements
                </h3>
                <p className={styles.docParagraph}>
                  I understand that I am expected to identify a suitable nearby village and interact with a willing farmer for the purpose of completing the prescribed assessment task.
                </p>
                <p className={styles.docParagraph}>
                  I will independently plan my visit, arrange my transportation, and bear the expenses associated with participation. The organisation has not promised reimbursement of travel, food, communication, or other incidental expenses, nor any payment or reimbursement to the farmer.
                </p>
                <p className={styles.docParagraph}>
                  I understand that the organisation does not undertake to arrange or accompany me on the visit, provide transportation, or supervise the field activity unless expressly agreed otherwise in writing.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>4</span>
                  Personal Safety and Risk Awareness
                </h3>
                <p className={styles.docParagraph}>
                  I acknowledge that a village visit involves travel and field conditions that may vary depending on the location, weather, accessibility, and other local circumstances.
                </p>
                <div className={styles.docWarning}>
                  <strong>Safety Protocol:</strong> I will independently assess the suitability of the proposed visit, take reasonable precautions, preferably conduct the visit during daylight hours, inform a trusted person of my itinerary, and avoid locations or situations that I consider unsafe. I will discontinue the activity if circumstances present an unreasonable risk to my safety.
                </div>
                <p className={styles.docParagraph}>
                  I understand that the organisation does not guarantee my personal safety or provide insurance coverage for an independently arranged field visit. I acknowledge that this declaration records my understanding of the arrangements and risks associated with the activity.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>5</span>
                  Ethical Conduct and Farmer Consent
                </h3>
                <p className={styles.docParagraph}>
                  I undertake to identify myself and explain the purpose of the assessment honestly to the farmer. I will seek the farmer&apos;s permission before conducting an interview, accessing private agricultural land, collecting relevant information, or capturing photographs where permission is required.
                </p>
                <p className={styles.docParagraph}>
                  I will respect the farmer&apos;s decision to decline participation or photography. I will not promise any payment, benefit, or service on behalf of the organisation.
                </p>
                <p className={styles.docParagraph}>
                  I will document crop conditions, pest infestations, disease symptoms, and other agricultural observations accurately, and will use credible scientific sources when developing my proposed advisory. I will handle collected information and photographs in accordance with the assessment instructions and applicable privacy requirements.
                </p>
              </div>

              <div className={styles.docSection}>
                <h3 className={styles.docSectionTitle}>
                  <span className={styles.docSectionNumber}>6</span>
                  Assessment and Selection
                </h3>
                <p className={styles.docParagraph}>
                  I understand that the Ground Truth Module is intended to assess my field readiness and practical agricultural competencies. I acknowledge that completing the module does not guarantee shortlisting, selection, appointment, employment, or any other engagement with the organisation.
                </p>
                <p className={styles.docParagraph}>
                  I confirm that I have read and understood this declaration and am choosing to proceed with the assessment with an understanding of the stated requirements and responsibilities.
                </p>
              </div>
            </div>

            {/* Acceptance Section (PDF 2 Page 2) */}
            <div className={styles.acceptanceCard}>
              <label
                className={`${styles.checkboxContainer} ${gtAgreed ? styles.checkboxContainerChecked : ''}`}
              >
                <input
                  type="checkbox"
                  checked={gtAgreed}
                  onChange={(e) => setGtAgreed(e.target.checked)}
                  className={styles.customCheckbox}
                />
                <span className={styles.checkboxText}>
                  <strong>Consent Confirmation:</strong> I have read, understood, and agree to proceed with the Ground Truth Module under the stated assessment conditions. <span className={styles.requiredStar}>*</span>
                </span>
              </label>

              <div className={styles.signatureSection}>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Candidate Name</label>
                  <div className={styles.signatureDateBadge}>
                    {gtFullName || vibeFullName || slide1Signature || candidateInfo.fullName || session?.user?.name || 'Candidate Name'}
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Assessment Component</label>
                  <div className={styles.signatureDateBadge}>Ground Truth (150 Marks)</div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Electronic Confirmation / Signature *</label>
                  <input
                    type="text"
                    value={gtSignature}
                    onChange={(e) => setGtSignature(e.target.value)}
                    placeholder="Type your full legal name to sign"
                    className={styles.signatureInput}
                  />
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Date</label>
                  <div className={styles.signatureDateBadge}>{todayFormatted}</div>
                </div>
              </div>
            </div>

            <div className={styles.actionBar}>
              <button
                type="button"
                onClick={handleBack}
                className={styles.backBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Back</span>
              </button>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!isSlide3Valid}
                  className={styles.nextBtn}
                >
                  <span>Next: Data & Document Consent</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="5" y1="12" x2="19" y2="12" />
                    <polyline points="12 5 19 12 12 19" />
                  </svg>
                </button>
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            SLIDE 4: Candidate Consent & Declaration for Personal Data & Docs (DPDP Act)
        ═══════════════════════════════════════════════════════════════════ */}
        {currentSlide === 3 && (
          <>
            <div className={styles.wizardHeader}>
              <div className={styles.badgeRow}>
                <span className={styles.platformBadge}>Annam / Samagama</span>
                <span className={styles.versionBadge}>DPDP Act 2023 Compliance</span>
                <span className={styles.versionBadge}>Document & Identity Verification</span>
                <span className={styles.stepIndicatorBadge}>Slide 4 of 4 • Final</span>
              </div>
              <h1 className={styles.mainTitle}>
                Candidate Consent & Declaration for Personal Data and Document Verification
              </h1>
              <p className={styles.subtitle}>
                Digital Personal Data Protection Act, 2023 consent governing collection, verification, storage, and processing of application records, certificates, and identity documents.
              </p>
            </div>

            <div className={styles.documentPane}>
              <div className={styles.docSection}>
                <p className={styles.docParagraph}>
                  By registering on this recruitment platform and submitting my application and/or documents, I acknowledge that I have read and understood the information provided regarding the collection and processing of my personal data.
                </p>
                <div className={styles.docAlert}>
                  I hereby provide my <strong>free, specific, informed and unambiguous consent</strong> to <strong>Annam / Samagama</strong> (&ldquo;Organisation&rdquo;) to collect, process, use and retain the personal data and documents submitted by me, <strong>only to the extent necessary and for the purposes of recruitment and selection</strong>, including application processing, eligibility assessment, interview scheduling, candidate evaluation, communication, document verification, background verification and other activities directly related to the recruitment process.
                </div>
                <p className={styles.docParagraph}>
                  The personal data and documents submitted by me may include, as applicable, my name, contact details, educational qualifications, professional and employment information, identification and supporting documents, certificates, references, photographs, and other information that is reasonably necessary for assessing my candidature.
                </p>
                <p className={styles.docParagraph}>
                  I authorise the Organisation to verify the <strong>authenticity, accuracy and validity</strong> of the information and documents submitted by me. Such verification may include verification of my educational qualifications, professional experience, employment details, references, certificates, identity documents and, where applicable, my <strong>No Objection Certificate (NOC) or equivalent authorisation</strong> from my current institution, employer or other relevant authority.
                </p>
                <p className={styles.docParagraph}>
                  Where such verification requires the Organisation to contact an institution, employer, issuing authority, reference or other relevant third party, I consent to such communication <strong>solely for the purpose of verifying information or documents submitted as part of my candidature</strong>.
                </p>
                <div className={styles.docWarning}>
                  <strong>Truthfulness Warranty:</strong> I declare that all information and documents submitted by me are <strong>true, complete, accurate and genuine</strong> to the best of my knowledge and belief. I understand that submission of false, misleading, forged or materially inaccurate information or documents may result in rejection or withdrawal of my candidature and, where applicable, further action in accordance with applicable law and the Organisation&apos;s policies.
                </div>
                <p className={styles.docParagraph}>
                  I understand that the Organisation shall process my personal data in accordance with the <strong>Digital Personal Data Protection Act, 2023, the applicable rules thereunder, and other applicable laws</strong>, and shall take reasonable measures to protect such personal data against unauthorised processing, access, use or disclosure.
                </p>
                <p className={styles.docParagraph}>
                  I understand that, where consent is the legal basis for processing my personal data, I may withdraw such consent in accordance with applicable law. I understand that withdrawal of consent may affect the Organisation&apos;s ability to continue processing my application or providing recruitment-related services, except where continued processing is permitted or required under applicable law.
                </p>
                <p className={styles.docParagraph}>
                  I further understand that I may exercise the rights available to me under applicable data protection law through the mechanism and contact details provided by the Organisation in its Privacy Notice.
                </p>
                <p className={styles.docParagraph}>
                  By selecting the checkbox below and submitting my application/documents, I confirm that I have <strong>read, understood and voluntarily consented</strong> to the collection and processing of my personal data for the purposes specified above.
                </p>
              </div>
            </div>

            {/* Acceptance Section (DPDP Document Consent) */}
            <div className={styles.acceptanceCard}>
              <label
                className={`${styles.checkboxContainer} ${docAgreed ? styles.checkboxContainerChecked : ''}`}
              >
                <input
                  type="checkbox"
                  checked={docAgreed}
                  onChange={(e) => setDocAgreed(e.target.checked)}
                  className={styles.customCheckbox}
                />
                <span className={styles.checkboxText}>
                  <strong>I have read and understood the Candidate Privacy Notice and Consent.</strong> I voluntarily consent to Annam / Samagama collecting and processing my personal data and documents, to the extent necessary for recruitment and selection, including eligibility assessment, interview, communication, and verification of the information and documents submitted by me, including NOC verification where applicable. <span className={styles.requiredStar}>*</span>
                </span>
              </label>

              <div className={styles.signatureSection}>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Candidate Legal Name</label>
                  <div className={styles.signatureDateBadge}>
                    {docFullName || gtFullName || vibeFullName || slide1Signature || candidateInfo.fullName || session?.user?.name || 'Candidate Legal Name'}
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Registered Email Address</label>
                  <div className={styles.signatureDateBadge}>
                    {vibeEmail || candidateInfo.email || session?.user?.email || 'email@example.com'}
                  </div>
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Electronic Signature (Full Legal Name) *</label>
                  <input
                    type="text"
                    value={docSignature}
                    onChange={(e) => setDocSignature(e.target.value)}
                    placeholder="Type your legal name to electronically sign"
                    className={styles.signatureInput}
                  />
                </div>
                <div className={styles.signatureField}>
                  <label className={styles.signatureLabel}>Submission Timestamp</label>
                  <div className={styles.signatureDateBadge}>{timestampFormatted}</div>
                </div>
              </div>
            </div>

            <div className={styles.actionBar}>
              <button
                type="button"
                onClick={handleBack}
                disabled={loading}
                className={styles.backBtn}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="19" y1="12" x2="5" y2="12" />
                  <polyline points="12 19 5 12 12 5" />
                </svg>
                <span>Back</span>
              </button>
              <div className={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  disabled={!isSlide4Valid || loading}
                  className={styles.submitBtn}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span>{loading ? 'Submitting Consents...' : 'Submit All Declarations & Continue'}</span>
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

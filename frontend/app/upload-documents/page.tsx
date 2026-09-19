'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { syncPhaseToDb } from '@/lib/phaseSync';
import styles from './page.module.css';
import BrandLogos from '@/components/BrandLogos';
import ProfileNavButton from '@/components/ProfileNavButton';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'aadhaar', label: 'Aadhaar Card (Front and Back side)', required: true, maxSizeMB: 5, multi: false },
      { key: 'pan', label: 'PAN Card (Front and Back side)', required: true, maxSizeMB: 5, multi: false },
      { key: 'bank_details', label: 'Bank Account Details', required: true, maxSizeMB: 5, multi: false },
    ],
  },
  {
    title: 'Education',
    fields: [
      { key: 'updated_resume', label: 'Updated Resume', required: true, maxSizeMB: 5, multi: false },
      { key: 'marksheet_10', label: '10th Class Marksheet', required: true, maxSizeMB: 10, multi: false },
      { key: 'marksheet_12', label: '12th Class Marksheet', required: true, maxSizeMB: 10, multi: false },
      { key: 'grad_marksheets', label: 'Graduation mark sheets (all semesters) and Degree Certificate', required: true, maxSizeMB: 10, multi: false },
      { key: 'pg_marksheets', label: 'Post-Graduation mark sheets (all semesters) and Degree Certificate (if applicable)', required: false, maxSizeMB: 10, multi: false },
      { key: 'noc', label: 'NOC from the institute, if currently pursuing studies', required: false, maxSizeMB: 5, multi: false },
    ],
  },
  {
    title: 'Experience',
    fields: [
      { key: 'experience_letter', label: 'Offer Letter / Experience Letter from previous organization (if applicable)', required: false, maxSizeMB: 5, multi: false },
      { key: 'salary_slips', label: "Last three months' salary slips (if applicable)", required: false, maxSizeMB: 5, multi: false },
      { key: 'other_docs', label: 'Any other supporting documents mentioned in the resume', required: false, maxSizeMB: 5, multi: false },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap((section) => section.fields);

interface UploadedFile {
  name: string;
  size: string;
  type: string;
  data: string;
  file: File;
}

type FileMap = Record<string, UploadedFile[]>;

export default function UploadDocumentsPage() {
  const [files, setFiles] = useState<FileMap>(
    Object.fromEntries(ALL_FIELDS.map((field) => [field.key, []]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [foundationCompleted, setFoundationCompleted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useRouter();

  useEffect(() => {
    const checkFoundation = async () => {
      const stored = localStorage.getItem('foundationCourseCompleted');
      const lsCompleted = stored === 'true' || stored === 'completed';
      if (lsCompleted) {
        setFoundationCompleted(true);
        return;
      }

      try {
        const res = await fetch('/api/candidate');
        if (res.ok) {
          const candidate = await res.json();
          if (candidate && candidate.foundationCourseCompleted) {
            setFoundationCompleted(true);
            localStorage.setItem('foundationCourseCompleted', 'completed');
          }
        }
      } catch (err) {
        console.error('Failed to verify foundation completion via profile API:', err);
      }
    };

    checkFoundation();
  }, []);

  useEffect(() => {
    const checkSubmitted = async () => {
      try {
        const rt = sessionStorage.getItem('candidate_session_token');
        const headers: HeadersInit = rt ? { 'x-redis-token': rt } : {};
        const res = await fetch('/api/candidate/documents', { headers, credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.documents && data.documents.length > 0) {
            const requiredFields = ALL_FIELDS.filter((field) => field.required).map((field) => field.key);
            const uploadedFields = data.documents.map((doc: any) => doc.fieldName);
            const allUploaded = requiredFields.every((key) => uploadedFields.includes(key));
            if (allUploaded) {
              setAlreadySubmitted(true);
            }
          }
        }
      } catch (_) {}
    };

    checkSubmitted();
  }, []);

  const requiredKeys = ALL_FIELDS.filter((field) => field.required).map((field) => field.key);
  const allRequiredUploaded = requiredKeys.every((key) => files[key] && files[key].length > 0);

  const validateFile = (file: File, fieldKey: string): string | null => {
    const field = ALL_FIELDS.find((item) => item.key === fieldKey);
    if (!field) return null;

    if (
      !ALLOWED_TYPES.includes(file.type) &&
      !file.name.toLowerCase().endsWith('.pdf') &&
      !file.name.toLowerCase().endsWith('.doc') &&
      !file.name.toLowerCase().endsWith('.docx')
    ) {
      return 'Only PDF and DOCX files allowed';
    }

    if (file.size > field.maxSizeMB * 1024 * 1024) {
      return `Exceeds ${field.maxSizeMB}MB limit`;
    }

    return null;
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleFileChange = async (fieldKey: string, fileList: FileList | null) => {
    const file = fileList?.[0];
    if (!file) return;

    const field = ALL_FIELDS.find((item) => item.key === fieldKey)!;
    const error = validateFile(file, fieldKey);
    if (error) {
      setErrors((prev) => ({ ...prev, [fieldKey]: error }));
      return;
    }

    const [base64, sizeStr] = await Promise.all([
      fileToBase64(file),
      Promise.resolve(formatSize(file.size)),
    ]);

    const uploaded: UploadedFile = {
      name: file.name,
      size: sizeStr,
      type: file.type || 'application/octet-stream',
      data: base64,
      file,
    };

    setFiles((prev) =>
      field.multi
        ? { ...prev, [fieldKey]: [...prev[fieldKey], uploaded] }
        : { ...prev, [fieldKey]: [uploaded] }
    );
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldKey];
      delete next._form;
      return next;
    });
  };

  const handleRemove = (fieldKey: string, index: number) => {
    setFiles((prev) => ({
      ...prev,
      [fieldKey]: prev[fieldKey].filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handleSubmit = async () => {
    if (!allRequiredUploaded) {
      setErrors({ _form: 'Please upload all required documents.' });
      return;
    }

    if (!consentAccepted) {
      setErrors({ _form: 'Please read and accept the Candidate Consent & Declaration to proceed.' });
      return;
    }

    setIsLoading(true);
    try {
      const formData = new FormData();
      for (const field of ALL_FIELDS) {
        for (const uploaded of files[field.key]) {
          formData.append(field.key, uploaded.file);
        }
      }

      const rt = sessionStorage.getItem('candidate_session_token');
      const headers: HeadersInit = rt ? { 'x-redis-token': rt } : {};
      const res = await fetch('/api/candidate/documents', {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Upload failed.');
      }

      await syncPhaseToDb(5, {
        documentsSubmitted: true,
        consentAccepted: true,
        consentTimestamp: new Date().toISOString(),
      });
      setSubmitSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setErrors({ _form: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFaqClick = () => {
    router.push('/faq');
  };

  const handleLogout = async () => {
    setLoggingOut(true);

    const redisToken = sessionStorage.getItem('candidate_session_token');
    if (redisToken) {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL;
      fetch(`${backendUrl}/api/candidate/session/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${redisToken}` },
      }).catch(() => {});
    }

    sessionStorage.clear();
    localStorage.clear();
    await signOut({ redirect: false });
    router.push('/login');
  };

  const renderHeader = () => (
    <nav className={styles.topNavbar}>
      <div className={styles.navbarContent}>
        <BrandLogos variant="header" />
        <div className={styles.headerButtons}>
          <ProfileNavButton />
        </div>
      </div>
    </nav>
  );

  const renderCenteredState = (
    title: string,
    message: string,
    actionLabel: string,
    onAction: () => void,
    eyebrow?: string
  ) => (
    <main className={styles.container}>
      {renderHeader()}
      <div className={styles.stateWrap}>
        <div className={styles.stateCard}>
          {eyebrow && <div className={styles.stateEyebrow}>{eyebrow}</div>}
          <h1 className={styles.stateTitle}>{title}</h1>
          <p className={styles.stateText}>{message}</p>
          <button onClick={onAction} className={styles.primaryButton}>
            {actionLabel}
          </button>
        </div>
      </div>
    </main>
  );

  if (!foundationCompleted) {
    return renderCenteredState(
      'Foundation Course Required',
      'You must complete the Foundation Course before uploading documents.',
      'Go to Foundation Course',
      () => router.push('/foundation-course'),
      'Locked'
    );
  }

  if (submitSuccess) {
    return renderCenteredState(
      'Documents Submitted!',
      'Your documents have been uploaded. The hiring team will review them and get back to you shortly.',
      'Go to Dashboard',
      () => router.push('/dashboard'),
      'Submitted'
    );
  }

  if (alreadySubmitted) {
    return renderCenteredState(
      'Documents Already Submitted',
      'You have already submitted your documents. The hiring team is reviewing your application.',
      'Go to Dashboard',
      () => router.push('/dashboard'),
      'Complete'
    );
  }

  return (
    <main className={styles.container}>
      {renderHeader()}

      <div className={styles.content}>
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Upload Documents</h1>
          <p className={styles.subtitle}>
            Upload the following documents to complete your application.
          </p>
        </div>

        {errors._form && (
          <div className={styles.formError}>
            {errors._form}
          </div>
        )}

        <div className={styles.notice}>
          Please upload all documents only in .pdf, .doc, or .docx format (Max 5MB/10MB per file). Only attach one document per field.
        </div>

        <div className={styles.sections}>
          {SECTIONS.map((section) => (
            <section key={section.title} className={styles.section}>
              <h2 className={styles.sectionTitle}>{section.title}</h2>
              <div className={styles.fieldList}>
                {section.fields.map((field) => {
                  const fieldFiles = files[field.key] || [];

                  return (
                    <div key={field.key} className={styles.uploadRow}>
                      <div className={styles.rowTop}>
                        <div className={styles.rowText}>
                          <div className={styles.fieldLabel}>
                            {field.label}
                            {field.required && <span className={styles.required}>*</span>}
                          </div>
                          <div className={styles.fieldHint}>
                            {field.multi ? 'Multiple files' : 'Single file'} - max {field.maxSizeMB}MB
                          </div>
                        </div>

                        <label className={styles.chooseButton}>
                          <span>{fieldFiles.length === 0 ? 'Choose file' : field.multi ? 'Add more' : 'Replace'}</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            ref={(el) => {
                              fileInputRefs.current[field.key] = el;
                            }}
                            className={styles.fileInput}
                            onChange={(event) => {
                              handleFileChange(field.key, event.target.files);
                              if (fileInputRefs.current[field.key]) {
                                fileInputRefs.current[field.key]!.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {fieldFiles.length > 0 && (
                        <div className={styles.fileList}>
                          {fieldFiles.map((file, index) => (
                            <div key={`${file.name}-${index}`} className={styles.fileItem}>
                              <span className={styles.fileName} title={file.name}>
                                {file.name}
                              </span>
                              <span className={styles.fileSize}>{file.size}</span>
                              <button
                                onClick={() => handleRemove(field.key, index)}
                                className={styles.removeButton}
                                aria-label={`Remove ${file.name}`}
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {errors[field.key] && (
                        <p className={styles.fieldError}>{errors[field.key]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* ─── Candidate Consent and Declaration Card ─── */}
        <div className={styles.consentCard}>
          <div className={styles.consentHeader}>
            <div className={styles.consentHeaderLeft}>
              <div className={styles.consentIconBadge}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h3 className={styles.consentTitle}>Candidate Consent and Declaration</h3>
            </div>
            <button
              type="button"
              onClick={() => setShowConsentModal(true)}
              className={styles.consentNoticeLinkBtn}
            >
              <span>View Privacy Notice & Consent</span>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </button>
          </div>

          <label className={styles.consentCheckboxLabel}>
            <input
              type="checkbox"
              checked={consentAccepted}
              onChange={(e) => {
                setConsentAccepted(e.target.checked);
                if (errors._form) {
                  setErrors((prev) => {
                    const next = { ...prev };
                    delete next._form;
                    return next;
                  });
                }
              }}
              className={styles.consentCheckbox}
            />
            <span className={styles.consentCheckboxText}>
              I have read and understood the Candidate Privacy Notice and Consent. I voluntarily consent to Annam / Samagama collecting and processing my personal data and documents, to the extent necessary for recruitment and selection, including eligibility assessment, interview, communication, and verification of the information and documents submitted by me, including NOC verification where applicable. <span className={styles.requiredAsterisk}>*</span>
            </span>
          </label>
        </div>

        <div className={styles.actions}>
          <button onClick={() => router.push('/dashboard')} className={styles.cancelButton}>
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !allRequiredUploaded || !consentAccepted}
            className={styles.primaryButton}
          >
            {isLoading ? 'Submitting...' : 'Submit Documents'}
          </button>
        </div>
      </div>

      {/* ─── Full Candidate Privacy Notice & Consent Modal ─── */}
      {showConsentModal && (
        <div className={styles.modalOverlay} onClick={() => setShowConsentModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Candidate Consent & Declaration</h2>
              <button
                type="button"
                onClick={() => setShowConsentModal(false)}
                className={styles.modalCloseButton}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className={styles.modalBody}>
              <p>
                By registering on this recruitment platform and submitting my application and/or documents, I acknowledge that I have read and understood the information provided regarding the collection and processing of my personal data.
              </p>
              <p>
                I hereby provide my <strong>free, specific, informed and unambiguous consent</strong> to <strong>Annam / Samagama</strong> (“Organisation”) to collect, process, use and retain the personal data and documents submitted by me, <strong>only to the extent necessary and for the purposes of recruitment and selection</strong>, including application processing, eligibility assessment, interview scheduling, candidate evaluation, communication, document verification, background verification and other activities directly related to the recruitment process.
              </p>
              <p>
                The personal data and documents submitted by me may include, as applicable, my name, contact details, educational qualifications, professional and employment information, identification and supporting documents, certificates, references, photographs, and other information that is reasonably necessary for assessing my candidature.
              </p>
              <p>
                I authorise the Organisation to verify the <strong>authenticity, accuracy and validity</strong> of the information and documents submitted by me. Such verification may include verification of my educational qualifications, professional experience, employment details, references, certificates, identity documents and, where applicable, my <strong>No Objection Certificate (NOC) or equivalent authorisation</strong> from my current institution, employer or other relevant authority.
              </p>
              <p>
                Where such verification requires the Organisation to contact an institution, employer, issuing authority, reference or other relevant third party, I consent to such communication <strong>solely for the purpose of verifying information or documents submitted as part of my candidature</strong>.
              </p>
              <p>
                I declare that all information and documents submitted by me are <strong>true, complete, accurate and genuine</strong> to the best of my knowledge and belief. I understand that submission of false, misleading, forged or materially inaccurate information or documents may result in rejection or withdrawal of my candidature and, where applicable, further action in accordance with applicable law and the Organisation’s policies.
              </p>
              <p>
                I understand that the Organisation shall process my personal data in accordance with the <strong>Digital Personal Data Protection Act, 2023, the applicable rules thereunder, and other applicable laws</strong>, and shall take reasonable measures to protect such personal data against unauthorised processing, access, use or disclosure.
              </p>
              <p>
                I understand that, where consent is the legal basis for processing my personal data, I may withdraw such consent in accordance with applicable law. I understand that withdrawal of consent may affect the Organisation’s ability to continue processing my application or providing recruitment-related services, except where continued processing is permitted or required under applicable law.
              </p>
              <p>
                I further understand that I may exercise the rights available to me under applicable data protection law through the mechanism and contact details provided by the Organisation in its Privacy Notice.
              </p>
              <p>
                By selecting the checkbox below and submitting my application/documents, I confirm that I have <strong>read, understood and voluntarily consented</strong> to the collection and processing of my personal data for the purposes specified above.
              </p>
            </div>
            <div className={styles.modalFooter}>
              <button
                type="button"
                onClick={() => {
                  setConsentAccepted(true);
                  setShowConsentModal(false);
                }}
                className={styles.modalAcceptBtn}
              >
                I Understand & Agree
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

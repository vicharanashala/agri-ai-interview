'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { syncPhaseToDb } from '@/lib/phaseSync';
import styles from './page.module.css';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'aadhaar', label: 'Aadhaar Card (Front and Back side)', required: true, maxSizeMB: 5, multi: true },
      { key: 'pan', label: 'PAN Card (Front and Back side)', required: true, maxSizeMB: 5, multi: true },
      { key: 'bank_details', label: 'Bank Account Details', required: true, maxSizeMB: 5, multi: false },
    ],
  },
  {
    title: 'Education',
    fields: [
      { key: 'updated_resume', label: 'Updated Resume', required: true, maxSizeMB: 5, multi: false },
      { key: 'marksheet_10', label: '10th Class Marksheet', required: true, maxSizeMB: 10, multi: false },
      { key: 'marksheet_12', label: '12th Class Marksheet', required: true, maxSizeMB: 10, multi: false },
      { key: 'grad_marksheets', label: 'Graduation mark sheets (all semesters) and Degree Certificate', required: false, maxSizeMB: 10, multi: true },
      { key: 'pg_marksheets', label: 'Post-Graduation mark sheets (all semesters) and Degree Certificate (if applicable)', required: false, maxSizeMB: 10, multi: true },
      { key: 'noc', label: 'NOC from the institute, if currently pursuing studies', required: false, maxSizeMB: 5, multi: false },
    ],
  },
  {
    title: 'Experience',
    fields: [
      { key: 'experience_letter', label: 'Offer Letter / Experience Letter from previous organization (if applicable)', required: false, maxSizeMB: 5, multi: false },
      { key: 'salary_slips', label: "Last three months' salary slips (if applicable)", required: false, maxSizeMB: 5, multi: true },
      { key: 'other_docs', label: 'Any other supporting documents mentioned in the resume', required: false, maxSizeMB: 5, multi: true },
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
            setAlreadySubmitted(true);
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

      await syncPhaseToDb(5, { documentsSubmitted: true });
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
        <div className={styles.logoWrapper}>
          <div className={styles.logo} aria-label="ANNAM.AI" />
          <p className={styles.brandSub}>Center of Excellence for AI in Agriculture, IIT Ropar</p>
        </div>
        <div className={styles.headerButtons}>
          <button onClick={handleFaqClick} className={styles.faqHelpBtn}>
            FAQ & Help
          </button>
          <button onClick={handleLogout} disabled={loggingOut} className={styles.signOutBtn}>
            {loggingOut ? 'Signing out...' : 'Sign Out'}
          </button>
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
          Please upload all documents only in .pdf, .doc, or .docx format
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

        <div className={styles.actions}>
          <button onClick={() => router.push('/dashboard')} className={styles.cancelButton}>
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !allRequiredUploaded}
            className={styles.primaryButton}
          >
            {isLoading ? 'Submitting...' : 'Submit Documents'}
          </button>
        </div>
      </div>
    </main>
  );
}

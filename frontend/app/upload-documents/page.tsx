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
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
];

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'aadhaar_front', label: 'Aadhaar Card (Front side)', required: true, maxSizeMB: 5, multi: false },
      { key: 'aadhaar_back', label: 'Aadhaar Card (Back side)', required: true, maxSizeMB: 5, multi: false },
      { key: 'pan_front', label: 'PAN Card (Front side)', required: true, maxSizeMB: 5, multi: false },
      { key: 'pan_back', label: 'PAN Card (Back side)', required: true, maxSizeMB: 5, multi: false },
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
  const [validatingFields, setValidatingFields] = useState<Record<string, boolean>>({});
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [foundationCompleted, setFoundationCompleted] = useState(false);
  const [moduleCompleted, setModuleCompleted] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useRouter();

  useEffect(() => {
    const checkFoundationAndModule = async () => {
      const modStored = localStorage.getItem('moduleCompleted');
      if (modStored === 'true' || modStored === 'completed') {
        setModuleCompleted(true);
      }
      const stored = localStorage.getItem('foundationCourseCompleted');
      const lsCompleted = stored === 'true' || stored === 'completed';
      if (lsCompleted) {
        setFoundationCompleted(true);
        return;
      }

      try {
        const res = await fetch('/api/candidate');
        if (res.status === 401) {
          sessionStorage.removeItem('candidate_session_token');
          router.push('/post-login?callbackUrl=/upload-documents');
          return;
        }
        if (res.ok) {
          const candidate = await res.json();
          if (candidate && candidate.foundationCourseCompleted) {
            setFoundationCompleted(true);
            localStorage.setItem('foundationCourseCompleted', 'completed');
          }
          if (candidate && candidate.moduleCompleted) {
            setModuleCompleted(true);
            localStorage.setItem('moduleCompleted', 'completed');
          }
        }
      } catch (err) {
        console.error('Failed to verify foundation completion via profile API:', err);
      }
    };

    checkFoundationAndModule();
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
      !file.name.toLowerCase().endsWith('.docx') &&
      !file.name.toLowerCase().endsWith('.jpg') &&
      !file.name.toLowerCase().endsWith('.jpeg') &&
      !file.name.toLowerCase().endsWith('.png')
    ) {
      return `Invalid format for ${field.label}. Please upload .jpg, .jpeg, .png, .pdf, or .docx only.`;
    }

    if (file.size > field.maxSizeMB * 1024 * 1024) {
      return `File too large for ${field.label}. Maximum allowed size is ${field.maxSizeMB}MB.`;
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
    
    // 1. Local validation (size, type)
    const localError = validateFile(file, fieldKey);
    if (localError) {
      setErrors((prev) => ({ ...prev, [fieldKey]: localError }));
      return;
    }

    // 2. Set UI to "Validating..." for this specific field
    setValidatingFields((prev) => ({ ...prev, [fieldKey]: true }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[fieldKey]; // Clear previous errors while validating
      delete next._form;
      return next;
    });

    try {
      // 3. Send to backend for AI validation
      const formData = new FormData();
      formData.append('file', file);
      formData.append('field_name', fieldKey);

      const rt = sessionStorage.getItem('candidate_session_token');
      const headers: HeadersInit = rt ? { 'x-redis-token': rt } : {};
      
      const res = await fetch('/api/candidate/validate-single', {
        method: 'POST',
        body: formData,
        headers,
      });
      
      if (!res.ok) {
        if (res.status === 413) {
          setErrors((prev) => ({ ...prev, [fieldKey]: `File is too large. Maximum size is ${field.maxSizeMB}MB.` }));
          return;
        }
        if (res.status === 401) {
          setErrors((prev) => ({ ...prev, [fieldKey]: 'Your session has expired. Please log in again.' }));
          return;
        }
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.detail || errData.error || errData.message || 'Validation error. Please try again.';
        setErrors((prev) => ({ ...prev, [fieldKey]: errMsg }));
        return;
      }
      
      const data = await res.json();

      if (!data.success) {
        // AI Rejected it! Set the error and DO NOT add the file to state.
        setErrors((prev) => ({ ...prev, [fieldKey]: `Validation Failed: ${data.reason}` }));
        return;
      }

      // 4. AI Approved! Convert to Base64 and add to UI state
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
      
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [fieldKey]: `Validation request failed: ${err.message || 'Network error'}` }));
    } finally {
      // 5. Remove the "Validating..." spinner
      setValidatingFields((prev) => ({ ...prev, [fieldKey]: false }));
    }
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
        let errorMsg = 'Upload failed. Please try again.';
        if (res.status === 413) {
          errorMsg = 'Files are too large. Please compress them and try again.';
        } else if (res.status === 401) {
          errorMsg = 'Your session has expired. Please log in again.';
        } else {
          const data = await res.json().catch(() => ({}));
          // Prevent raw JSON string dumps if data.error contains it
          let parsedError = data.detail || data.error || data.message;
          if (typeof parsedError === 'string' && parsedError.includes('{')) {
            try {
              const innerParse = JSON.parse(parsedError.replace(/^Backend status \d+: /, ''));
              parsedError = innerParse.detail || innerParse.message || 'Upload failed.';
            } catch (e) {}
          }
          errorMsg = parsedError || 'Upload failed. Please try again.';
        }
        throw new Error(errorMsg);
      }

      await syncPhaseToDb(6, {
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

  if (!moduleCompleted && foundationCompleted) {
    return renderCenteredState(
      'Ground Truth Module Required',
      'You must complete the Ground Truth Module before uploading documents.',
      'Go to Module',
      () => router.push('/module'),
      'Locked'
    );
  }

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
          Please upload all documents in .jpg, .jpeg, .png, .pdf, or .docx format (Max 5MB/10MB per file). Only attach one document per field.
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

                        <label className={styles.chooseButton} style={{ opacity: validatingFields[field.key] ? 0.7 : 1 }}>
                          {validatingFields[field.key] ? (
                            <span>Validating...</span>
                          ) : (
                            <span>{fieldFiles.length === 0 ? 'Choose file' : field.multi ? 'Add more' : 'Replace'}</span>
                          )}
                          <input
                            type="file"
                            accept=".pdf,.docx,.jpg,.jpeg,.png"
                            disabled={validatingFields[field.key]}
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
            disabled={isLoading || !allRequiredUploaded || Object.values(validatingFields).some(Boolean)}
            className={styles.primaryButton}
          >
            {isLoading ? 'Submitting...' : Object.values(validatingFields).some(Boolean) ? 'Validating Docs...' : 'Submit Documents'}
          </button>
        </div>
      </div>
    </main>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { syncPhaseToDb } from '@/lib/phaseSync';

const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const SECTIONS = [
  {
    title: 'Identity',
    fields: [
      { key: 'aadhaar',       label: 'Aadhaar Card (Front and Back side)',    required: true,  maxSizeMB: 5,  multi: true  },
      { key: 'pan',           label: 'PAN Card (Front and Back side)',        required: true,  maxSizeMB: 5,  multi: true  },
      { key: 'bank_details',  label: 'Bank Account Details',                 required: true,  maxSizeMB: 5,  multi: false },
    ],
  },
  {
    title: 'Education',
    fields: [
      { key: 'updated_resume',   label: 'Updated Resume',                                                                             required: true,  maxSizeMB: 5,  multi: false },
      { key: 'marksheet_10',     label: '10th Class Marksheet',                                                                     required: true,  maxSizeMB: 10, multi: false },
      { key: 'marksheet_12',     label: '12th Class Marksheet',                                                                     required: true,  maxSizeMB: 10, multi: false },
      { key: 'grad_marksheets',  label: 'Graduation mark sheets (all semesters) and Degree Certificate',                               required: false, maxSizeMB: 10, multi: true  },
      { key: 'pg_marksheets',    label: 'Post-Graduation mark sheets (all semesters) and Degree Certificate (if applicable)',           required: false, maxSizeMB: 10, multi: true  },
      { key: 'noc',             label: 'NOC (No Objection Certificate) from the institute, if currently pursuing studies',              required: false, maxSizeMB: 5,  multi: false },
    ],
  },
  {
    title: 'Experience',
    fields: [
      { key: 'experience_letter', label: 'Offer Letter / Experience Letter from previous organization (if applicable)', required: false, maxSizeMB: 5, multi: false },
      { key: 'salary_slips',      label: "Last three months' salary slips (if applicable)",                                                 required: false, maxSizeMB: 5, multi: true  },
      { key: 'other_docs',        label: 'Any other supporting documents mentioned in the resume',                                        required: false, maxSizeMB: 5, multi: true  },
    ],
  },
];

const ALL_FIELDS = SECTIONS.flatMap(s => s.fields);

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
    Object.fromEntries(ALL_FIELDS.map(f => [f.key, []]))
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const router = useRouter();

  const requiredKeys = ALL_FIELDS.filter(f => f.required).map(f => f.key);
  const allRequiredUploaded = requiredKeys.every(
    key => files[key] && files[key].length > 0
  );

  useEffect(() => {
    const checkSubmitted = async () => {
      try {
        const rt = sessionStorage.getItem('candidate_session_token');
        const headers: HeadersInit = rt ? { 'x-redis-token': rt } : {};
        const res = await fetch('/api/candidate/documents', { headers });
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

  const validateFile = (file: File, fieldKey: string): string | null => {
    const field = ALL_FIELDS.find(f => f.key === fieldKey);
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

    const field = ALL_FIELDS.find(f => f.key === fieldKey)!;
    const error = validateFile(file, fieldKey);
    if (error) {
      setErrors(prev => ({ ...prev, [fieldKey]: error }));
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

    setFiles(prev =>
      field.multi
        ? { ...prev, [fieldKey]: [...prev[fieldKey], uploaded] }
        : { ...prev, [fieldKey]: [uploaded] }
    );
    setErrors(prev => { const n = { ...prev }; delete n[fieldKey]; return n; });
  };

  const handleRemove = (fieldKey: string, index: number) => {
    setFiles(prev => ({
      ...prev,
      [fieldKey]: prev[fieldKey].filter((_, i) => i !== index),
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
      await syncPhaseToDb(4, { documentsSubmitted: true });
      setSubmitSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Upload failed.';
      setErrors({ _form: message });
    } finally {
      setIsLoading(false);
    }
  };

  if (submitSuccess) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 32, maxWidth: 440, width: '100%', color: '#fff' }}>
          <h1 style={{ color: '#08CB00', fontSize: 22, margin: '0 0 12px' }}>Documents Submitted!</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 24px', fontSize: 14, lineHeight: 1.6 }}>
            Your documents have been uploaded. The hiring team will review them and get back to you shortly.
          </p>
          <button onClick={() => router.push('/dashboard')} style={{ background: '#08CB00', color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 32, maxWidth: 440, width: '100%', color: '#fff' }}>
          <h1 style={{ color: '#08CB00', fontSize: 22, margin: '0 0 12px' }}>Documents Already Submitted</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', margin: '0 0 24px', fontSize: 14, lineHeight: 1.6 }}>
            You have already submitted your documents. The hiring team is reviewing your application.
          </p>
          <button onClick={() => router.push('/dashboard')} style={{ background: '#08CB00', color: '#000', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Go to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', padding: '40px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', color: '#fff' }}>

        <h1 style={{ color: '#08CB00', fontSize: 22, margin: '0 0 6px' }}>Congratulations on Passing!</h1>
        <p style={{ color: 'rgba(255,255,255,0.6)', margin: '0 0 28px', fontSize: 14 }}>
          Upload the following documents to complete your application.
        </p>

        {errors._form && (
          <div style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 20 }}>
            {errors._form}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 4 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,200,0,0.85)', background: 'rgba(255,200,0,0.08)', border: '1px solid rgba(255,200,0,0.2)', borderRadius: 6, padding: '5px 12px' }}>
              Please upload all documents only in .pdf, .doc, or .docx format
            </span>
          </div>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {section.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {section.fields.map(field => {
                  const fieldFiles = files[field.key] || [];
                  return (
                    <div key={field.key} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '14px 16px' }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: fieldFiles.length > 0 ? 10 : 0 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: 'rgba(255,255,255,0.9)', lineHeight: 1.4 }}>{field.label}</span>
                            {field.required && <span style={{ color: '#ef4444', fontSize: 13 }}>*</span>}
                          </div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                            {field.multi ? 'Multiple files' : 'Single file'} · max {field.maxSizeMB}MB
                          </div>
                        </div>

                        {/* Add file button — always visible, separate from label */}
                        <label style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px dashed rgba(255,255,255,0.2)', borderRadius: 7, padding: '7px 14px', fontSize: 13, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                          <span>+</span>
                          <span>{fieldFiles.length === 0 ? 'Choose file' : field.multi ? 'Add more' : 'Replace'}</span>
                          <input
                            type="file"
                            accept=".pdf,.doc,.docx"
                            ref={el => { fileInputRefs.current[field.key] = el; }}
                            style={{ display: 'none' }}
                            onChange={e => {
                              handleFileChange(field.key, e.target.files);
                              // Reset so same file can be re-selected after removal
                              if (fileInputRefs.current[field.key]) {
                                fileInputRefs.current[field.key]!.value = '';
                              }
                            }}
                          />
                        </label>
                      </div>

                      {/* File list */}
                      {fieldFiles.length > 0 && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                          {fieldFiles.map((f, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(8,203,0,0.08)', border: '1px solid rgba(8,203,0,0.2)', borderRadius: 6, padding: '7px 10px' }}>
                              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.name}>
                                {f.name}
                              </span>
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', flexShrink: 0 }}>{f.size}</span>
                              <button
                                onClick={() => handleRemove(field.key, idx)}
                                style={{ background: 'rgba(239,68,68,0.2)', border: 'none', color: '#fca5a5', fontSize: 11, width: 20, height: 20, borderRadius: '50%', cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui' }}
                              >
                                x
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {errors[field.key] && (
                        <p style={{ color: '#f87171', fontSize: 12, margin: '6px 0 0' }}>{errors[field.key]}</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={() => router.push('/dashboard')}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.7)', borderRadius: 8, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontFamily: 'system-ui' }}
          >
            Back
          </button>
          <button
            onClick={handleSubmit}
            disabled={isLoading || !allRequiredUploaded}
            style={{ background: '#08CB00', border: 'none', color: '#000', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 600, cursor: isLoading || !allRequiredUploaded ? 'not-allowed' : 'pointer', opacity: isLoading || !allRequiredUploaded ? 0.4 : 1, fontFamily: 'system-ui' }}
          >
            {isLoading ? 'Submitting...' : 'Submit Documents'}
          </button>
        </div>
      </div>
    </div>
  );
}
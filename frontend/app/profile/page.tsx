'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import BrandLogos from '@/components/BrandLogos';
import ProfileNavButton from '@/components/ProfileNavButton';
import { roleDisplayName, phaseLabel } from '@/lib/candidate-profile-display';

interface EducationItem {
  id: string;
  level: string;
  levelOther?: string;
  discipline: string;
  disciplineOther?: string;
  status: string;
  institution: string;
  yearOfCompletion: string;
}

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);

  // Candidate personal & contact data (read-only)
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');

  // Professional & agricultural background state (read-only)
  const [currentRole, setCurrentRole] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [farmingBackground, setFarmingBackground] = useState('No');
  const [cropsGrown, setCropsGrown] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [primaryExpertise, setPrimaryExpertise] = useState('');

  // Educational qualifications & progress (read-only)
  const [currentPhase, setCurrentPhase] = useState('onboarding');
  const [eligibleRole, setEligibleRole] = useState<string | null>(null);
  const [documentsSubmitted, setDocumentsSubmitted] = useState(false);
  const [educationList, setEducationList] = useState<EducationItem[]>([]);

  // Resume state (the only field that can be added / replaced)
  const [resume, setResume] = useState<{ id?: string; name: string; size?: string } | null>(null);
  const [stagedFile, setStagedFile] = useState<File | null>(null);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeFeedback, setResumeFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Consent state
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/candidate', { cache: 'no-store' });
        if (!res.ok) {
          router.push('/login');
          return;
        }
        const data = await res.json();
        if (data) {
          // If consent has been withdrawn or declarations not accepted, redirect immediately to declaration
          if (data.consentWithdrawn || !data.declarationAccepted) {
            router.replace('/declaration');
            return;
          }

          const rawState = data.state || '';
          const displayDistrict = data.districtCustom
            ? `${data.districtCustom} (Others)`
            : (data.district || '');

          setEmail(data.email || '');
          setFullName(data.fullName || '');
          setPhone(data.phone || '');
          setState(rawState);
          setDistrict(displayDistrict);
          setPincode(data.pincode || '');
          setAddress(data.address || '');

          setCurrentRole(data.currentRole || '');
          setYearsOfExperience(
            data.yearsOfExperience !== undefined && data.yearsOfExperience !== null
              ? String(data.yearsOfExperience)
              : ''
          );
          setFarmingBackground(data.farmingBackground || 'No');
          setCropsGrown(data.cropsGrown || '');
          setFarmSize(data.farmSize || '');
          setPrimaryExpertise(data.primaryExpertise || '');
          setEligibleRole(data.eligibleRole || null);
          setCurrentPhase(data.currentPhase || 'onboarding');
          setDocumentsSubmitted(Boolean(data.documentsSubmitted));

          // Consent info
          setConsentTimestamp(data.consentTimestamp || null);

          // Education list (read-only)
          if (Array.isArray(data.education) && data.education.length > 0) {
            setEducationList(
              data.education.map((item: any, idx: number) => ({
                id: item.id || `edu_${idx}_${Date.now()}`,
                level: item.level || '',
                levelOther: item.levelOther || '',
                discipline: item.discipline || '',
                disciplineOther: item.disciplineOther || '',
                status: item.status || '',
                institution: item.institution || '',
                yearOfCompletion: item.yearOfCompletion || '',
              }))
            );
          } else if (data.highestEducation || data.discipline) {
            setEducationList([
              {
                id: `edu_0_${Date.now()}`,
                level: data.highestEducation || '',
                discipline: data.discipline || '',
                disciplineOther: data.disciplineOther || '',
                status: data.educationStatus || 'Completed',
                institution: data.institution || '',
                yearOfCompletion: '',
              },
            ]);
          }

          // Resume info
          if (data.resumeName) {
            setResume({
              id: data.resumeId,
              name: data.resumeName,
              size: data.resumeSize || 'Uploaded',
            });
          } else {
            setResume(null);
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setResumeFeedback({ type: 'error', text: 'Resume file size must be less than 5MB.' });
        return;
      }
      setResumeFeedback(null);
      setStagedFile(file);
    }
    e.target.value = '';
  };

  const handleCancelStaged = () => {
    setStagedFile(null);
    setResumeFeedback(null);
  };

  const handleUploadResume = async () => {
    if (!stagedFile) return;

    setUploadingResume(true);
    setResumeFeedback(null);

    try {
      const formData = new FormData();
      formData.append('file', stagedFile);

      const res = await fetch('/api/resume', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to upload resume.');
      }

      const isReplacement = Boolean(resume);
      const newResumeData = {
        name: stagedFile.name,
        size: (stagedFile.size / (1024 * 1024)).toFixed(2) + ' MB',
      };

      setResume(newResumeData);
      setStagedFile(null);
      setResumeFeedback({
        type: 'success',
        text: isReplacement ? 'Resume successfully replaced!' : 'Resume successfully uploaded!',
      });
      setTimeout(() => setResumeFeedback(null), 5000);
    } catch (err: any) {
      setResumeFeedback({ type: 'error', text: err.message || 'Failed to update resume.' });
    } finally {
      setUploadingResume(false);
    }
  };

  const handleWithdrawConsent = async () => {
    try {
      const res = await fetch('/api/candidate/consent/withdraw', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to withdraw consent');
      setShowWithdrawModal(false);
      try {
        sessionStorage.removeItem('documentsSubmitted');
        localStorage.removeItem('documentsSubmitted');
      } catch {}
      router.replace('/declaration');
    } catch (err: any) {
      setResumeFeedback({ type: 'error', text: err.message || 'Error withdrawing consent.' });
    }
  };

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  if (loading) {
    return (
      <main className={styles.container}>
        <nav className={styles.topNavbar}>
          <div className={styles.navbarContent}>
            <BrandLogos variant="header" />
          </div>
        </nav>
        <div className={styles.content}>
          <p style={{ textAlign: 'center', padding: '60px 0', color: '#64748b' }}>Loading candidate profile...</p>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      {/* Top Navbar */}
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
            <ProfileNavButton forceShow={true} />
          </div>
        </div>
      </nav>

      {/* Main Profile Body */}
      <div className={styles.content}>
        {/* Profile Hero Header */}
        <div className={styles.profileHero}>
          <div className={styles.heroLeft}>
            <div className={styles.avatar}>{getInitials(fullName || email)}</div>
            <div className={styles.heroDetails}>
              <h1>{fullName || 'Candidate Profile'}</h1>
              <p className={styles.heroEmail}>
                <span>✉ {email || '—'}</span>
                {phone && <span> • 📞 {phone}</span>}
              </p>
            </div>
          </div>
          <div className={styles.heroBadges}>
            {eligibleRole && (
              <span className={styles.roleBadge} title="Role assigned based on qualifications and experience">
              Eligible Role: <strong>{roleDisplayName(eligibleRole)}</strong>
              </span>
            )}
            {!documentsSubmitted && (
              <span className={styles.phaseBadge}>Phase: {phaseLabel(currentPhase)}</span>
            )}
          </div>
        </div>

        {/* Candidate Declarations & Consent Section */}
        <section className={styles.consentSection}>
          <div className={styles.consentHeader}>
            <div className={styles.consentTitleWrap}>
              <div className={styles.consentIconBadge}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  <path d="m9 12 2 2 4-4" />
                </svg>
              </div>
              <h2 className={styles.consentTitle}>Candidate Declarations &amp; Consent (4 Declarations)</h2>
            </div>
            <span className={`${styles.consentStatusBadge} ${styles.consentStatusGranted}`}>
              ✓ All 4 Consents Granted
            </span>
          </div>

          <div>
            <p className={styles.consentDescription}>
              You have voluntarily reviewed, acknowledged, and submitted all <strong>4 assessment and privacy declarations</strong> required for recruitment and selection:
            </p>
            <div className={styles.declarationsList}>
              <div className={styles.declarationItem}>
                <span className={styles.declarationCheck}>✓</span>
                <span className={styles.declarationName}>AI-Based Interview &amp; Assessment Process Declaration</span>
              </div>
              <div className={styles.declarationItem}>
                <span className={styles.declarationCheck}>✓</span>
                <span className={styles.declarationName}>ViBe Platform Consent (Audio, Video &amp; Proctoring)</span>
              </div>
              <div className={styles.declarationItem}>
                <span className={styles.declarationCheck}>✓</span>
                <span className={styles.declarationName}>Ground Truth Module Consent (Field Assessment)</span>
              </div>
              <div className={styles.declarationItem}>
                <span className={styles.declarationCheck}>✓</span>
                <span className={styles.declarationName}>Document Verification &amp; Data Privacy Consent (DPDP Act)</span>
              </div>
            </div>
            {consentTimestamp && (
              <p className={styles.consentTimestamp}>
                All 4 declarations signed &amp; granted on: {new Date(consentTimestamp).toLocaleString()}
              </p>
            )}
            <div className={styles.consentActions}>
              <button
                type="button"
                onClick={() => setShowWithdrawModal(true)}
                className={styles.withdrawBtn}
              >
                Withdraw Consent
              </button>
            </div>
          </div>
        </section>

        {/* Profile Details Container (All Read-only except Resume Update) */}
        <div className={styles.formCard}>
          {/* Section 1: Personal Details (Read-only) */}
          <div>
            <h3 className={styles.sectionTitle}>1. Personal Information</h3>
            <div className={styles.grid2}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Full Name</label>
                <div className={styles.readOnlyBox}>{fullName || '—'}</div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Phone Number</label>
                <div className={styles.readOnlyBox}>{phone || '—'}</div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>State</label>
                <div className={styles.readOnlyBox}>{state || '—'}</div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>District</label>
                <div className={styles.readOnlyBox}>{district || '—'}</div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Pincode</label>
                <div className={styles.readOnlyBox}>{pincode || '—'}</div>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Residential Address</label>
                <div
                  className={styles.readOnlyBox}
                  style={{ minHeight: '60px', alignItems: 'flex-start', paddingTop: '10px' }}
                >
                  {address || '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Professional & Farming Background (Read-only) */}
          <div>
            <h3 className={styles.sectionTitle}>2. Professional &amp; Agricultural Background</h3>
            <div className={styles.grid2}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Current Role / Designation</label>
                <div className={styles.readOnlyBox}>{currentRole || '—'}</div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Years of Experience</label>
                <div className={styles.readOnlyBox}>
                  {yearsOfExperience !== '' ? `${yearsOfExperience} Years` : '0 Years'}
                </div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Farming / RAWE Background</label>
                <div className={styles.readOnlyBox}>{farmingBackground || 'No'}</div>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Farm Size</label>
                <div className={styles.readOnlyBox}>{farmSize || 'Not applicable'}</div>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Crops Grown / Handled</label>
                <div className={styles.readOnlyBox}>{cropsGrown || '—'}</div>
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Primary Agricultural Expertise</label>
                <div className={styles.readOnlyBox}>{primaryExpertise || '—'}</div>
              </div>
            </div>
          </div>

          {/* Section 3: Educational Qualifications (Read-only) */}
          <div>
            <div className={styles.sectionTitle}>
              <span>3. Educational Qualifications</span>
            </div>

            {educationList.length === 0 ? (
              <p style={{ color: '#64748b', fontSize: '14px', fontStyle: 'italic', padding: '10px 0' }}>
                No qualifications recorded.
              </p>
            ) : (
              educationList.map((edu, index) => (
                <div key={edu.id || index} className={styles.educationCard}>
                  <div className={styles.educationCardHeader}>
                    <span className={styles.educationNumber}>Qualification #{index + 1}</span>
                    <span
                      className={
                        edu.status === 'Completed'
                          ? styles.statusBadgeCompleted
                          : styles.statusBadgePursuing
                      }
                    >
                      {edu.status || 'Completed'}
                    </span>
                  </div>

                  <div className={styles.grid2}>
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Degree Level</label>
                      <div className={styles.readOnlyBox}>
                        {edu.level === 'Other' ? (edu.levelOther || 'Other') : (edu.level || '—')}
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Discipline / Major</label>
                      <div className={styles.readOnlyBox}>
                        {edu.discipline === 'Other'
                          ? (edu.disciplineOther || 'Other')
                          : (edu.discipline || '—')}
                      </div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Institution / University</label>
                      <div className={styles.readOnlyBox}>{edu.institution || '—'}</div>
                    </div>

                    <div className={styles.formGroup}>
                      <label className={styles.label}>Year of Completion</label>
                      <div className={styles.readOnlyBox}>{edu.yearOfCompletion || '—'}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Section 4: Resume / CV (Add if missing, Replace if present) */}
          <div>
            <h3 className={styles.sectionTitle}>
              <span>4. Resume / CV</span>
            </h3>

            <div className={styles.resumeSection}>
              {/* Feedback messages */}
              {resumeFeedback && (
                <div
                  style={{ marginBottom: '12px' }}
                  className={resumeFeedback.type === 'success' ? styles.toastSuccess : styles.toastError}
                >
                  {resumeFeedback.type === 'success' ? '✓ ' : '⚠️ '}
                  {resumeFeedback.text}
                </div>
              )}

              {/* Case A: Resume is already present */}
              {resume ? (
                <div>
                  <div className={styles.resumePreview}>
                    <span className={styles.resumeIcon}>📄</span>
                    <div className={styles.resumeInfo}>
                      <p className={styles.resumeName}>{resume.name}</p>
                      <p className={styles.resumeSize}>{resume.size || 'Uploaded'}</p>
                    </div>
                    <div className={styles.resumeActions}>
                      <label className={styles.changeResumeBtn}>
                        Update Resume
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx"
                          className={styles.resumeInput}
                          onChange={handleFileSelect}
                        />
                      </label>
                    </div>
                  </div>

                  {/* Staged file card for replacement confirmation */}
                  {stagedFile && (
                    <div className={styles.stagedResumeCard}>
                      <div className={styles.stagedResumeInfo}>
                        <span style={{ fontSize: '24px' }}>📎</span>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{stagedFile.name}</strong>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {(stagedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to replace current resume
                          </div>
                        </div>
                      </div>
                      <div className={styles.stagedResumeActions}>
                        <button
                          type="button"
                          onClick={handleCancelStaged}
                          disabled={uploadingResume}
                          className={styles.cancelResumeBtn}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleUploadResume}
                          disabled={uploadingResume}
                          className={styles.saveResumeBtn}
                        >
                          {uploadingResume ? 'Replacing...' : '✓ Confirm & Update Resume'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Case B: Resume is NOT present (e.g. rare onboarding network drop) */
                <div>
                  <div className={styles.noResumeWarning}>
                    <span style={{ fontSize: '18px' }}>⚠️</span>
                    <div>
                      <strong>No resume attached:</strong> A resume was not saved during onboarding. Please upload your resume below to complete your application profile.
                    </div>
                  </div>

                  {!stagedFile ? (
                    <label className={styles.resumeUpload}>
                      <span className={styles.uploadIcon}>📄</span>
                      <p className={styles.uploadText}>Click to upload your resume *</p>
                      <p className={styles.uploadHint}>PDF or DOCX (Max 5MB) • Mandatory</p>
                      <input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        className={styles.resumeInput}
                        onChange={handleFileSelect}
                      />
                    </label>
                  ) : (
                    <div className={styles.stagedResumeCard}>
                      <div className={styles.stagedResumeInfo}>
                        <span style={{ fontSize: '24px' }}>📎</span>
                        <div>
                          <strong style={{ fontSize: '14px', color: '#0f172a' }}>{stagedFile.name}</strong>
                          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
                            {(stagedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to upload
                          </div>
                        </div>
                      </div>
                      <div className={styles.stagedResumeActions}>
                        <button
                          type="button"
                          onClick={handleCancelStaged}
                          disabled={uploadingResume}
                          className={styles.cancelResumeBtn}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={handleUploadResume}
                          disabled={uploadingResume}
                          className={styles.saveResumeBtn}
                        >
                          {uploadingResume ? 'Uploading...' : '✓ Upload & Save Resume'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Confirmation Modal for Consent Withdrawal */}
      {showWithdrawModal && (
        <div className={styles.modalOverlay} onClick={() => setShowWithdrawModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Withdraw All 4 Declarations &amp; Consents?</h3>
            <p className={styles.modalText}>
              Are you sure you want to withdraw your consent? This will revoke <strong>all 4 accepted declarations</strong>:
            </p>
            <ul className={styles.modalDeclarationsList}>
              <li>1. AI-Based Interview &amp; Assessment Process Declaration</li>
              <li>2. ViBe Platform Candidate Consent (Audio, Video &amp; Proctoring)</li>
              <li>3. Ground Truth Module Consent (Field Assessment)</li>
              <li>4. Document Verification &amp; Data Privacy Consent (DPDP Act, 2023)</li>
            </ul>
            <div className={styles.modalWarningBox}>
              ⚠️ <strong>Warning:</strong> Withdrawing consent will pause your recruitment process and permanently delete all documents uploaded in the document verification phase. You will be redirected to the declaration page to review and sign all 4 declarations again before you can proceed.
            </div>
            <div className={styles.modalButtons}>
              <button
                type="button"
                onClick={() => setShowWithdrawModal(false)}
                className={styles.modalCancelBtn}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleWithdrawConsent}
                className={styles.modalConfirmBtn}
              >
                Yes, Withdraw All Consents
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

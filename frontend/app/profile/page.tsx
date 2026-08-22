'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import styles from './page.module.css';
import BrandLogos from '@/components/BrandLogos';
import SearchableSelect from '@/components/SearchableSelect';
import ProfileNavButton from '@/components/ProfileNavButton';
import { INDIAN_STATES, INDIA_STATES_DISTRICTS } from '@/data/india-states-districts';
import { EDUCATION_LEVELS, DISCIPLINES } from '@/data/education-data';

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
  const [saving, setSaving] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Candidate data state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [currentRole, setCurrentRole] = useState('');
  const [yearsOfExperience, setYearsOfExperience] = useState('');
  const [farmingBackground, setFarmingBackground] = useState('No');
  const [cropsGrown, setCropsGrown] = useState('');
  const [farmSize, setFarmSize] = useState('');
  const [primaryExpertise, setPrimaryExpertise] = useState('');
  const [currentPhase, setCurrentPhase] = useState('onboarding');
  const [educationList, setEducationList] = useState<EducationItem[]>([]);

  // Consent state
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [consentTimestamp, setConsentTimestamp] = useState<string | null>(null);
  const [consentWithdrawn, setConsentWithdrawn] = useState(false);
  const [consentWithdrawnAt, setConsentWithdrawnAt] = useState<string | null>(null);

  const availableDistricts = state && INDIA_STATES_DISTRICTS[state] ? INDIA_STATES_DISTRICTS[state] : [];

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
          setEmail(data.email || '');
          setFullName(data.fullName || '');
          setPhone(data.phone || '');
          setState(data.state || '');
          setDistrict(data.district || '');
          setPincode(data.pincode || '');
          setAddress(data.address || '');
          setCurrentRole(data.currentRole || '');
          setYearsOfExperience(data.yearsOfExperience !== undefined && data.yearsOfExperience !== null ? String(data.yearsOfExperience) : '');
          setFarmingBackground(data.farmingBackground || 'No');
          setCropsGrown(data.cropsGrown || '');
          setFarmSize(data.farmSize || '');
          setPrimaryExpertise(data.primaryExpertise || '');
          setCurrentPhase(data.currentPhase || 'onboarding');

          // Consent info
          setConsentAccepted(Boolean(data.consentAccepted || data.documentsSubmitted));
          setConsentTimestamp(data.consentTimestamp || null);
          setConsentWithdrawn(Boolean(data.consentWithdrawn));
          setConsentWithdrawnAt(data.consentWithdrawnAt || null);

          // Education list
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
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [router]);

  const handleAddEducation = () => {
    setEducationList((prev) => [
      ...prev,
      {
        id: `edu_${Date.now()}`,
        level: '',
        discipline: '',
        status: '',
        institution: '',
        yearOfCompletion: '',
      },
    ]);
  };

  const handleRemoveEducation = (index: number) => {
    setEducationList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleEducationChange = (index: number, field: keyof EducationItem, val: string) => {
    setEducationList((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);

    try {
      const payload = {
        fullName,
        phone,
        state,
        district,
        pincode,
        address,
        currentRole,
        yearsOfExperience: yearsOfExperience ? parseFloat(yearsOfExperience) : 0,
        farmingBackground,
        cropsGrown,
        farmSize,
        primaryExpertise,
        education: educationList,
        highestEducation: educationList[0]?.level || '',
        institution: educationList[0]?.institution || '',
        discipline: educationList[0]?.discipline || '',
        disciplineOther: educationList[0]?.disciplineOther || '',
        educationStatus: educationList[0]?.status || '',
      };

      const res = await fetch('/api/candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to save profile changes.');
      }

      setFeedback({ type: 'success', text: 'Profile updated successfully!' });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Failed to save profile.' });
    } finally {
      setSaving(false);
    }
  };

  const handleWithdrawConsent = async () => {
    try {
      const res = await fetch('/api/candidate/consent/withdraw', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to withdraw consent');
      setConsentWithdrawn(true);
      setConsentAccepted(false);
      setConsentWithdrawnAt(new Date().toISOString());
      setShowWithdrawModal(false);
      setFeedback({ type: 'success', text: 'Data access consent has been withdrawn.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error withdrawing consent.' });
    }
  };

  const handleGrantConsent = async () => {
    try {
      const res = await fetch('/api/candidate/consent/grant', { method: 'POST' });
      if (!res.ok) throw new Error('Failed to grant consent');
      setConsentAccepted(true);
      setConsentWithdrawn(false);
      setConsentTimestamp(new Date().toISOString());
      setFeedback({ type: 'success', text: 'Data access consent has been restored.' });
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message || 'Error granting consent.' });
    }
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

  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

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
                <span>✉️ {email || '—'}</span>
                {phone && <span>• 📞 {phone}</span>}
              </p>
            </div>
          </div>
          <div className={styles.heroBadges}>
            <span className={styles.phaseBadge}>Phase: {currentPhase}</span>
          </div>
        </div>

        {/* ─── DPDP Data Access Consent Section ─── */}
        <section
          className={`${styles.consentSection} ${
            consentWithdrawn ? styles.consentSectionWithdrawn : ''
          }`}
        >
          <div className={styles.consentHeader}>
            <div className={styles.consentTitleWrap}>
              <div
                className={`${styles.consentIconBadge} ${
                  consentWithdrawn ? styles.consentIconBadgeWithdrawn : ''
                }`}
              >
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
              <h2 className={styles.consentTitle}>Data Access & Privacy Consent (DPDP Act)</h2>
            </div>
            {consentWithdrawn ? (
              <span className={`${styles.consentStatusBadge} ${styles.consentStatusWithdrawn}`}>
                ⚠️ Consent Withdrawn
              </span>
            ) : consentAccepted ? (
              <span className={`${styles.consentStatusBadge} ${styles.consentStatusGranted}`}>
                ✓ Consent Granted
              </span>
            ) : (
              <span className={`${styles.consentStatusBadge} ${styles.consentStatusPending}`}>
                Pending Submission
              </span>
            )}
          </div>

          <div>
            {consentWithdrawn ? (
              <>
                <p className={styles.consentDescription}>
                  You have withdrawn your consent for processing and verifying your documents. Document verification and recruitment processing are currently paused.
                </p>
                {consentWithdrawnAt && (
                  <p className={styles.consentTimestamp}>
                    Withdrawn on: {new Date(consentWithdrawnAt).toLocaleString()}
                  </p>
                )}
                <div className={styles.consentActions}>
                  <button
                    type="button"
                    onClick={handleGrantConsent}
                    className={styles.grantBtn}
                  >
                    Restore & Grant Consent
                  </button>
                </div>
              </>
            ) : consentAccepted ? (
              <>
                <p className={styles.consentDescription}>
                  You have voluntarily provided consent to <strong>Annam / Samagama</strong> to collect, process, and verify your submitted documents and personal data solely for recruitment and selection purposes under the <em>Digital Personal Data Protection Act, 2023</em>.
                </p>
                {consentTimestamp && (
                  <p className={styles.consentTimestamp}>
                    Granted on: {new Date(consentTimestamp).toLocaleString()}
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
              </>
            ) : (
              <p className={styles.consentDescription}>
                You have not submitted documents yet. You will be prompted to review and grant consent during Phase 5 (Document Upload).
              </p>
            )}
          </div>
        </section>

        {/* ─── Profile Edit Form ─── */}
        <form onSubmit={handleSave} className={styles.formCard}>
          {/* Section 1: Personal Details */}
          <div>
            <h3 className={styles.sectionTitle}>1. Personal Information</h3>
            <div className={styles.grid2}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Full Name *</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className={styles.input}
                  placeholder="Enter your full name"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Phone Number *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={styles.input}
                  placeholder="10-digit mobile number"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>State *</label>
                <SearchableSelect
                  id="profile_state"
                  name="profile_state"
                  options={INDIAN_STATES}
                  value={state}
                  onChange={(e) => {
                    setState(e.target.value);
                    setDistrict('');
                  }}
                  placeholder="Select State"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>District *</label>
                <SearchableSelect
                  id="profile_district"
                  name="profile_district"
                  options={availableDistricts}
                  value={district}
                  onChange={(e) => setDistrict(e.target.value)}
                  placeholder={state ? 'Select District' : 'Select State First'}
                  disabled={!state}
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Pincode *</label>
                <input
                  type="text"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value)}
                  className={styles.input}
                  placeholder="6-digit PIN"
                  maxLength={6}
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Residential Address</label>
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className={styles.textarea}
                  placeholder="Enter your current address"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Professional & Farming Background */}
          <div>
            <h3 className={styles.sectionTitle}>2. Professional & Agricultural Background</h3>
            <div className={styles.grid2}>
              <div className={styles.formGroup}>
                <label className={styles.label}>Current Role / Designation</label>
                <input
                  type="text"
                  value={currentRole}
                  onChange={(e) => setCurrentRole(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. Agri Intern / Young Professional / Student"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Years of Experience</label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={yearsOfExperience}
                  onChange={(e) => setYearsOfExperience(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. 0 or 1.5"
                />
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Farming / RAWE Background</label>
                <select
                  value={farmingBackground}
                  onChange={(e) => setFarmingBackground(e.target.value)}
                  className={styles.select}
                >
                  <option value="Yes">Yes</option>
                  <option value="No">No</option>
                </select>
              </div>

              <div className={styles.formGroup}>
                <label className={styles.label}>Farm Size (in acres, if applicable)</label>
                <input
                  type="text"
                  value={farmSize}
                  onChange={(e) => setFarmSize(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. 2.5 acres"
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Crops Grown / Handled</label>
                <input
                  type="text"
                  value={cropsGrown}
                  onChange={(e) => setCropsGrown(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. Paddy, Cotton, Chilli, Wheat, Maize"
                />
              </div>

              <div className={`${styles.formGroup} ${styles.fullWidth}`}>
                <label className={styles.label}>Primary Agricultural Expertise</label>
                <input
                  type="text"
                  value={primaryExpertise}
                  onChange={(e) => setPrimaryExpertise(e.target.value)}
                  className={styles.input}
                  placeholder="e.g. Pest Management, Soil Testing, Crop Advisory, Agronomy"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Educational Qualifications */}
          <div>
            <div className={styles.sectionTitle}>
              <span>3. Educational Qualifications</span>
            </div>

            {educationList.map((edu, index) => (
              <div key={edu.id} className={styles.educationCard}>
                <div className={styles.educationCardHeader}>
                  <span className={styles.educationNumber}>Qualification #{index + 1}</span>
                  {educationList.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveEducation(index)}
                      className={styles.removeEduBtn}
                    >
                      ✕ Remove
                    </button>
                  )}
                </div>

                <div className={styles.grid2}>
                  <div className={styles.formGroup}>
                    <label className={styles.label}>Degree Level *</label>
                    <select
                      value={edu.level}
                      onChange={(e) => handleEducationChange(index, 'level', e.target.value)}
                      className={styles.select}
                      required
                    >
                      <option value="">Select Degree Level</option>
                      {EDUCATION_LEVELS.map((lvl) => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </select>
                  </div>

                  {edu.level === 'Other' && (
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Specify Other Degree *</label>
                      <input
                        type="text"
                        value={edu.levelOther || ''}
                        onChange={(e) => handleEducationChange(index, 'levelOther', e.target.value)}
                        className={styles.input}
                        placeholder="Enter degree name"
                      />
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Discipline / Major *</label>
                    <select
                      value={edu.discipline}
                      onChange={(e) => handleEducationChange(index, 'discipline', e.target.value)}
                      className={styles.select}
                      required
                    >
                      <option value="">Select Discipline</option>
                      {DISCIPLINES.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>

                  {edu.discipline === 'Other' && (
                    <div className={styles.formGroup}>
                      <label className={styles.label}>Specify Other Discipline *</label>
                      <input
                        type="text"
                        value={edu.disciplineOther || ''}
                        onChange={(e) => handleEducationChange(index, 'disciplineOther', e.target.value)}
                        className={styles.input}
                        placeholder="Enter discipline name"
                      />
                    </div>
                  )}

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Status *</label>
                    <select
                      value={edu.status}
                      onChange={(e) => handleEducationChange(index, 'status', e.target.value)}
                      className={styles.select}
                    >
                      <option value="">Select Status</option>
                      <option value="Completed">Completed</option>
                      <option value="Pursuing">Pursuing</option>
                    </select>
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Institution / University *</label>
                    <input
                      type="text"
                      value={edu.institution}
                      onChange={(e) => handleEducationChange(index, 'institution', e.target.value)}
                      className={styles.input}
                      placeholder="College or University name"
                    />
                  </div>

                  <div className={styles.formGroup}>
                    <label className={styles.label}>Year of Completion</label>
                    <input
                      type="text"
                      value={edu.yearOfCompletion}
                      onChange={(e) => handleEducationChange(index, 'yearOfCompletion', e.target.value)}
                      className={styles.input}
                      placeholder="e.g. 2024"
                      maxLength={4}
                    />
                  </div>
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={handleAddEducation}
              className={styles.addEduBtn}
            >
              <span>+</span> Add Another Education Entry
            </button>
          </div>

          {/* Bottom Actions */}
          <div className={styles.bottomActions}>
            <div>
              {feedback && (
                <span className={feedback.type === 'success' ? styles.toastSuccess : styles.toastError}>
                  {feedback.type === 'success' ? '✓ ' : '⚠️ '}
                  {feedback.text}
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={saving}
              className={styles.saveBtn}
            >
              {saving ? 'Saving...' : 'Save Profile Changes'}
            </button>
          </div>
        </form>
      </div>

      {/* Confirmation Modal for Consent Withdrawal */}
      {showWithdrawModal && (
        <div className={styles.modalOverlay} onClick={() => setShowWithdrawModal(false)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <h3 className={styles.modalTitle}>Withdraw Data Access Consent?</h3>
            <p className={styles.modalText}>
              Are you sure you want to withdraw your data access and document verification consent?
            </p>
            <p className={styles.modalText}>
              Withdrawing consent will pause the organisation&apos;s ability to verify your documents and process your application for recruitment. You can re-grant consent at any time from this profile page.
            </p>
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
                Yes, Withdraw Consent
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

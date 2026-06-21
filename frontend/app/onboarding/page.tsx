'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { INDIA_STATES_DISTRICTS, INDIAN_STATES } from '@/data/india-states-districts';
import SearchableSelect from '@/components/SearchableSelect';
import PhotoCaptureModal from '@/components/PhotoCaptureModal';
import { authFetch } from '@/lib/auth-fetch';

interface ResumeData {
  name: string;
  size: string;
  data: string; // base64 encoded file
}

interface FormData {
  fullName: string;
  phone: string;
  state: string;
  district: string;
  pincode: string;
  address: string;
  currentRole: string;
  yearsOfExperience: string;
  highestEducation: string;
  institution: string;
  farmingBackground: string;
  cropsGrown: string;
  primaryExpertise: string;
  districtCustom?: string;
}

export default function OnboardingPage() {
  const [formData, setFormData] = useState<FormData>({
    fullName: '',
    phone: '',
    state: '',
    district: '',
    pincode: '',
    address: '',
    currentRole: '',
    yearsOfExperience: '',
    highestEducation: '',
    institution: '',
    farmingBackground: '',
    cropsGrown: '',
    primaryExpertise: '',
    districtCustom: '',
  });
  const [phoneError, setPhoneError] = useState('');
  const [pincodeError, setPincodeError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);

  // ── Identity Photo ───────────────────────────────────────────────────────
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);
  const [onboardingPhoto, setOnboardingPhoto] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // Check if onboarding is already completed on mount
  useEffect(() => {
    // Always check the DB for existing profile — sessionStorage is cleared on logout,
    // so we can't rely on it here. The DB is the source of truth.
    const checkProfile = async () => {
      try {
        const response = await fetch('/api/candidate');
        if (response.ok) {
          const candidate = await response.json();
          // Only freeze the form if the candidate has at least one meaningful field filled in.
          // An empty candidate record (created at signup) means onboarding is not complete yet.
          const hasProfileData = candidate && (
            candidate.fullName ||
            candidate.phone ||
            candidate.state ||
            candidate.district ||
            candidate.pincode ||
            candidate.currentRole
          );
          if (hasProfileData) {
            setIsFrozen(true);
            // Load stored onboarding photo if available
            if (candidate.onboardingPhoto) {
              try {
                const photoRes = await authFetch('/api/candidate/photo');
                if (photoRes.ok) {
                  const photoData = await photoRes.json();
                  if (photoData.photoData) setOnboardingPhoto(photoData.photoData);
                }
              } catch { /* non-fatal */ }
            }
            setFormData({
              fullName: candidate.fullName || '',
              phone: candidate.phone || '',
              state: candidate.state || '',
              district: candidate.district || '',
              pincode: candidate.pincode || '',
              address: candidate.address || '',
              currentRole: candidate.currentRole || '',
              yearsOfExperience: candidate.yearsOfExperience?.toString() || '',
              highestEducation: candidate.highestEducation || '',
              institution: candidate.institution || '',
              farmingBackground: candidate.farmingBackground || '',
              cropsGrown: candidate.cropsGrown || '',
              primaryExpertise: candidate.primaryExpertise || '',
              districtCustom: candidate.districtCustom || '',
            });
          }
        }
      } catch (error) {
        console.error('Error fetching candidate profile:', error);
      }
    };

    checkProfile();
  }, []);

  const validatePhone = (value: string): boolean => {
    // Only integers allowed, exactly 10 digits
    if (value.length !== 10 || /\D/.test(value)) {
      setPhoneError('Phone number must be exactly 10 digits (numbers only)');
      return false;
    }
    
    setPhoneError('');
    return true;
  };

  const validatePincode = (value: string): boolean => {
    const digitsOnly = value.replace(/\D/g, '');
    
    if (digitsOnly.length !== 6) {
      setPincodeError('Pincode must be exactly 6 digits');
      return false;
    }
    
    setPincodeError('');
    return true;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Only allow digits (no + sign for Indian numbers)
    const filtered = value.replace(/\D/g, '');
    // Max 10 digits
    const truncated = filtered.slice(0, 10);
    setFormData((prev) => ({ ...prev, phone: truncated }));
    
    // Validate on full entry
    if (truncated.length >= 10) {
      validatePhone(truncated);
    } else {
      setPhoneError('');
    }
  };

  const handlePincodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '');
    setFormData((prev) => ({ ...prev, pincode: value }));
    
    if (value.length >= 6) {
      validatePincode(value);
    } else {
      setPincodeError('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleStateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setFormData((prev) => ({ ...prev, state: value, district: '' }));
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Check file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
      setError('Please upload a PDF or Word document');
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    // Clear error on successful file selection
    setError('');

    // Read file as base64
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setResume({
        name: file.name,
        size: formatFileSize(file.size),
        data: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveResume = () => {
    setResume(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // ── Phase 1: validate form fields ─────────────────────────────────────────
  const _validateForm = (): boolean => {
    if (!formData.fullName.trim()) { setError('Please enter your full name'); return false; }
    if (!formData.state.trim()) { setError('Please select your state'); return false; }
    if (!formData.district.trim()) { setError('Please select your district'); return false; }
    if (formData.district === 'Others' && !formData.districtCustom?.trim()) {
      setError('Please specify your district name'); return false;
    }
    if (!validatePhone(formData.phone)) return false;
    if (!validatePincode(formData.pincode)) return false;
    if (!formData.address.trim()) { setError('Please enter your address'); return false; }
    if (!formData.currentRole.trim()) { setError('Please enter your current role'); return false; }
    if (!formData.yearsOfExperience.trim()) { setError('Please enter your years of experience'); return false; }
    if (!formData.highestEducation.trim()) { setError('Please select your highest education'); return false; }
    if (!formData.institution.trim()) { setError('Please enter your institution/university'); return false; }
    if (!formData.farmingBackground.trim()) { setError('Please describe your farming experience'); return false; }
    if (!formData.cropsGrown.trim()) { setError('Please enter the crops you have grown/handled'); return false; }
    if (!formData.primaryExpertise.trim()) { setError('Please select your primary area of expertise'); return false; }
    if (!resume) { setError('Please upload your resume'); return false; }
    return true;
  };

  // ── Phase 2: save profile + resume (called after photo capture) ───────────
  const _saveProfile = async (capturedPhoto: string) => {
    setIsLoading(true);
    setError('');

    try {
      const districtToSubmit =
        formData.district === 'Others' ? formData.districtCustom?.trim() : formData.district;
      const payload = { ...formData, district: districtToSubmit || formData.district };

      const response = await fetch('/api/candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save profile');
      }

      const candidate = await response.json();

      // Upload onboarding photo first (needed before moving to phase 2)
      try {
        await authFetch('/api/candidate/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photoData: capturedPhoto }),
        });
      } catch (photoErr) {
        console.error('Photo upload failed (non-blocking):', photoErr);
        // Non-fatal — continue even if photo upload fails
      }

      // Upload resume (server-side async: file on disk + raw text in DB)
      if (resume?.data && candidate?.id) {
        try {
          const res = await fetch(resume.data);
          const blob = await res.blob();
          const fileName = resume.name || 'resume.pdf';
          const fileType = fileName.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf';
          const file = new File([blob], fileName, { type: fileType });
          const fd = new FormData();
          fd.append('file', file);
          fd.append('candidateId', candidate.id);
          await fetch('/api/resume', { method: 'POST', body: fd, credentials: 'include' });
        } catch (uploadErr) {
          console.error('Resume upload failed (non-blocking):', uploadErr);
        }
      }

      if (candidate?.id) sessionStorage.setItem('candidateId', candidate.id);
      if (formData.fullName) sessionStorage.setItem('candidateFullName', formData.fullName);

      sessionStorage.setItem('interviewPhase', '2');
      await syncPhaseToDb(2);

      window.location.href = '/dashboard';
    } catch (err) {
      setError('Failed to save profile. Please try again.');
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!_validateForm()) return;
    // Show photo capture BEFORE saving — candidate must provide identity photo
    setShowPhotoCapture(true);
  };

  const handlePhotoCapture = (photoData: string) => {
    setOnboardingPhoto(photoData);
    setShowPhotoCapture(false);
    // Proceed to save profile with the captured photo
    _saveProfile(photoData);
  };

  // Helper function to display field value or placeholder
  const displayValue = (value: string) => value || '—';

  // Helper function to get display text for select fields
  const getSelectDisplayText = (value: string) => {
    if (!value) return '—';
    return value;
  };

  if (isFrozen) {
    return (
      <main className={styles.container}>
        <div className={styles.formBox}>
          <div className={styles.frozenBanner}>
            <span className={styles.frozenIcon}>🔒</span>
            <span className={styles.frozenText}>Profile Completed</span>
          </div>
          <h1 className={styles.title}>Your Profile</h1>
          <p className={styles.subtitle}>Your profile details are saved and cannot be modified</p>

          <div className={styles.frozenForm}>
            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Personal Information</h2>
              
              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Full Name</span>
                <span className={styles.displayValue}>{displayValue(formData.fullName)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Phone Number</span>
                <span className={styles.displayValue}>{displayValue(formData.phone)}</span>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Location</h2>
              
              <div className={styles.displayField}>
                <span className={styles.displayLabel}>State</span>
                <span className={styles.displayValue}>{displayValue(formData.state)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>District</span>
                <span className={styles.displayValue}>{displayValue(formData.district)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Pincode</span>
                <span className={styles.displayValue}>{displayValue(formData.pincode)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Address</span>
                <span className={styles.displayValue}>{displayValue(formData.address)}</span>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Professional Background</h2>
              
              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Current Role</span>
                <span className={styles.displayValue}>{displayValue(formData.currentRole)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Years of Experience</span>
                <span className={styles.displayValue}>{displayValue(formData.yearsOfExperience)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Highest Education</span>
                <span className={styles.displayValue}>{getSelectDisplayText(formData.highestEducation)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Institution/University</span>
                <span className={styles.displayValue}>{displayValue(formData.institution)}</span>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Agricultural Field Experience</h2>
              
              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Rural Agricultural Work Experience (RAWE)</span>
                <span className={styles.displayValue}>{displayValue(formData.farmingBackground)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Crops Grown/Handled</span>
                <span className={styles.displayValue}>{displayValue(formData.cropsGrown)}</span>
              </div>

              <div className={styles.displayField}>
                <span className={styles.displayLabel}>Primary Area of Expertise</span>
                <span className={styles.displayValue}>{getSelectDisplayText(formData.primaryExpertise)}</span>
              </div>
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Resume</h2>
              
              {resume ? (
                <div className={styles.resumePreview}>
                  <span className={styles.resumeIcon}>📄</span>
                  <div className={styles.resumeInfo}>
                    <p className={styles.resumeName}>{resume.name}</p>
                    <p className={styles.resumeSize}>{resume.size}</p>
                  </div>
                </div>
              ) : (
                <div className={styles.displayField}>
                  <span className={styles.displayLabel}>Resume</span>
                  <span className={styles.displayValue}>No resume uploaded</span>
                </div>
              )}
            </section>
          </div>

          <button 
            onClick={() => router.push('/dashboard')} 
            className={styles.backButton}
          >
            Back to Dashboard
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.formBox}>
        <h1 className={styles.title}>Complete Your Profile</h1>
        <p className={styles.subtitle}>Tell us about yourself for your AI interview preparation</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Personal Information</h2>
            
            <div className={styles.field}>
              <label htmlFor="fullName" className={styles.label}>
                Full Name <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="fullName"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                className={styles.input}
                placeholder="Enter your full name"
                maxLength={30}
                required
              />
              <span className={styles.charCount}>{formData.fullName.length}/30</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="phone" className={styles.label}>
                Phone Number (India) <span className={styles.required}>*</span>
              </label>
              <input
                type="tel"
                id="phone"
                name="phone"
                value={formData.phone}
                onChange={handlePhoneChange}
                className={styles.input}
                placeholder="Enter 10-digit phone number"
                maxLength={10}
                required
              />
              {phoneError && <span className={styles.fieldError}>{phoneError}</span>}
              <span className={styles.charCount}>{formData.phone.length}/10 digits</span>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Location</h2>
            
            <div className={styles.field}>
              <label htmlFor="state" className={styles.label}>
                State <span className={styles.required}>*</span>
              </label>
              <SearchableSelect
                id="state"
                name="state"
                value={formData.state}
                onChange={handleStateChange}
                options={INDIAN_STATES}
                placeholder="Search or select state…"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="district" className={styles.label}>
                District <span className={styles.required}>*</span>
              </label>
              <SearchableSelect
                id="district"
                name="district"
                value={formData.district}
                onChange={handleChange}
                options={[
                  ...(INDIA_STATES_DISTRICTS[formData.state] || []),
                  'Others',
                ]}
                placeholder={formData.state ? 'Search or select district…' : 'Select a state first'}
                disabled={!formData.state}
                required
              />
            </div>

            {formData.district === 'Others' && (
              <div className={styles.field}>
                <label htmlFor="districtCustom" className={styles.label}>
                  Specify District <span className={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  id="districtCustom"
                  name="districtCustom"
                  value={formData.districtCustom || ''}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, districtCustom: e.target.value }))
                  }
                  className={styles.input}
                  placeholder="Enter your district name"
                  maxLength={30}
                  required
                />
              </div>
            )}

            <div className={styles.field}>
              <label htmlFor="pincode" className={styles.label}>
                Pincode <span className={styles.required}>*</span>
              </label>
              <input
                type="tel"
                id="pincode"
                name="pincode"
                value={formData.pincode}
                onChange={handlePincodeChange}
                className={styles.input}
                placeholder="6-digit pincode"
                maxLength={6}
                required
              />
              {pincodeError && <span className={styles.fieldError}>{pincodeError}</span>}
            </div>

            <div className={styles.field}>
              <label htmlFor="address" className={styles.label}>
                Address <span className={styles.required}>*</span>
              </label>
              <textarea
                id="address"
                name="address"
                value={formData.address}
                onChange={handleChange}
                className={styles.textarea}
                placeholder="Enter your full address"
                rows={3}
                maxLength={150}
                required
              />
              <span className={styles.charCount}>{formData.address.length}/150</span>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Professional Background</h2>
            
            <div className={styles.field}>
              <label htmlFor="currentRole" className={styles.label}>
                Current Role <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="currentRole"
                name="currentRole"
                value={formData.currentRole}
                onChange={handleChange}
                className={styles.input}
                placeholder="e.g., Farmer, Agronomist"
                maxLength={30}
                required
              />
              <span className={styles.charCount}>{formData.currentRole.length}/30</span>
            </div>

            <div className={styles.field}>
              <label htmlFor="yearsOfExperience" className={styles.label}>
                Years of Experience <span className={styles.required}>*</span>
              </label>
              <input
                type="number"
                id="yearsOfExperience"
                name="yearsOfExperience"
                value={formData.yearsOfExperience}
                onChange={handleChange}
                className={styles.input}
                placeholder="e.g., 2.5"
                min="0"
                step="0.1"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="highestEducation" className={styles.label}>
                Highest Education <span className={styles.required}>*</span>
              </label>
              <select
                id="highestEducation"
                name="highestEducation"
                value={formData.highestEducation}
                onChange={handleChange}
                className={styles.input}
                required
              >
                <option value="">Select...</option>
                <option value="High School">High School</option>
                <option value="Diploma">Diploma</option>
                <option value="Bachelor's">Bachelor's</option>
                <option value="Master's">Master's</option>
                <option value="PhD">PhD</option>
              </select>
            </div>

            <div className={styles.field}>
              <label htmlFor="institution" className={styles.label}>
                Institution/University <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="institution"
                name="institution"
                value={formData.institution}
                onChange={handleChange}
                className={styles.input}
                placeholder="Name of your institution"
                maxLength={30}
                required
              />
              <span className={styles.charCount}>{formData.institution.length}/30</span>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Agricultural Field Experience</h2>
            
            <div className={styles.field}>
              <label htmlFor="farmingBackground" className={styles.label}>
                Rural Agricultural Work Experience (RAWE) <span className={styles.required}>*</span>
              </label>
              <textarea
                id="farmingBackground"
                name="farmingBackground"
                value={formData.farmingBackground}
                onChange={handleChange}
                className={styles.textarea}
                placeholder="Describe your farming experience..."
                rows={3}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="cropsGrown" className={styles.label}>
                Crops Grown/Handled <span className={styles.required}>*</span>
              </label>
              <input
                type="text"
                id="cropsGrown"
                name="cropsGrown"
                value={formData.cropsGrown}
                onChange={handleChange}
                className={styles.input}
                placeholder="e.g., Wheat, Rice, Cotton"
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="primaryExpertise" className={styles.label}>
                Primary Area of Expertise <span className={styles.required}>*</span>
              </label>
              <select
                id="primaryExpertise"
                name="primaryExpertise"
                value={formData.primaryExpertise}
                onChange={handleChange}
                className={styles.input}
                required
              >
                <option value="">Select...</option>
                <option value="Crop Production">Crop Production</option>
                <option value="Livestock Management">Livestock Management</option>
                <option value="Horticulture">Horticulture</option>
                <option value="Agri-Business">Agri-Business</option>
                <option value="Agricultural Engineering">Agricultural Engineering</option>
                <option value="Soil Science">Soil Science</option>
                <option value="Pest Management">Pest Management</option>
                <option value="Organic Farming">Organic Farming</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Resume <span className={styles.required}>*</span></h2>
            
            <div className={styles.resumeSection}>
              {resume ? (
                <div className={styles.resumePreview}>
                  <span className={styles.resumeIcon}>📄</span>
                  <div className={styles.resumeInfo}>
                    <p className={styles.resumeName}>{resume.name}</p>
                    <p className={styles.resumeSize}>{resume.size}</p>
                  </div>
                  <div className={styles.resumeActions}>
                    <button
                      type="button"
                      onClick={handleRemoveResume}
                      className={styles.removeButton}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <label className={styles.resumeUpload}>
                  <span className={styles.uploadIcon}>📎</span>
                  <p className={styles.uploadText}>Click to upload your resume</p>
                  <p className={styles.uploadHint}>PDF or Word document (max 5MB)</p>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                    accept=".pdf,.doc,.docx"
                    className={styles.resumeInput}
                  />
                </label>
              )}
            </div>
          </section>

          {error && <p className={styles.error}>{error}</p>}

          {/* Identity Photo step — shown as a visual indicator */}
          <div className={styles.photoStep}>
            <div className={styles.photoStepHeader}>
              <span className={styles.photoStepLabel}>📷 Identity Verification Photo</span>
              {!onboardingPhoto && (
                <span className={styles.photoRequired}>Required</span>
              )}
              {onboardingPhoto && (
                <span className={styles.photoDone}>✓ Captured</span>
              )}
            </div>
            {photoError && <p className={styles.error}>{photoError}</p>}
            {onboardingPhoto ? (
              <div className={styles.photoThumbWrapper}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={onboardingPhoto} alt="Identity" className={styles.photoThumb} />
                <button
                  type="button"
                  className={styles.retakePhotoButton}
                  onClick={() => setShowPhotoCapture(true)}
                >
                  Retake
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={styles.capturePhotoButton}
                onClick={() => setShowPhotoCapture(true)}
              >
                📷 Take Identity Photo
              </button>
            )}
          </div>

          <button type="submit" className={styles.button} disabled={isLoading}>
            {isLoading ? 'Saving...' : 'Complete Profile'}
          </button>
        </form>
      </div>

      {/* Identity Photo Capture Modal */}
      {showPhotoCapture && (
        <PhotoCaptureModal
          title="Identity Verification Photo"
          subtitle="A clear photo is required to verify your identity before the interview"
          instruction="Position your face in the center of the frame and ensure good lighting"
          confirmLabel="Use This Photo"
          onCapture={handlePhotoCapture}
          onClose={() => setShowPhotoCapture(false)}
          showRetake={false}
          required
        />
      )}
    </main>
  );
}
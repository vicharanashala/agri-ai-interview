'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import { syncPhaseToDb } from '@/lib/phaseSync';
import { INDIA_STATES_DISTRICTS, INDIAN_STATES } from '@/data/india-states-districts';
import SearchableSelect from '@/components/SearchableSelect';
import { interceptAuthFetch } from '@/lib/auth-fetch';
import { signOut } from 'next-auth/react';
import BrandLogos from '@/components/BrandLogos';

interface ResumeData {
  id?: string;
  name: string;
  size: string;
  data: string | null; // base64 encoded file
}

interface EducationItem {
  id: string;
  level: string;
  levelOther?: string;
  discipline: string;
  disciplineOther?: string;
  status: string; // 'Pursuing' | 'Completed' | ''
  institution: string;
  yearOfCompletion: string;
}

const EDUCATION_LEVELS = [
  'Diploma',
  'B.Sc.',
  'B.Sc. (Hons.)',
  'B.Tech.',
  'B.E.',
  'B.A.',
  'B.Com.',
  'BCA',
  'BBA',
  'B.Pharm.',
  'B.V.Sc. & A.H.',
  'B.F.Sc.',
  'LLB',
  'MBBS',
  'BDS',
  'BAMS',
  'BHMS',
  "Other Bachelor's Degree",
  'M.Sc.',
  'M.Tech.',
  'M.E.',
  'MCA',
  'MBA',
  'M.Com.',
  'M.A.',
  'M.Pharm.',
  'M.V.Sc.',
  'M.F.Sc.',
  'MSW',
  'LLM',
  'MD',
  'MS',
  "Other Master's Degree",
  'PG Diploma',
  'M.Phil.',
  'Ph.D.',
  'D.Sc.',
  'D.Litt.',
  'Postdoctoral',
  'Other',
];

const DISCIPLINES = [
  'Agriculture',
  'Agronomy',
  'Horticulture',
  'Agricultural Engineering',
  'Agricultural Economics',
  'Agricultural Extension',
  'Soil Science',
  'Entomology',
  'Plant Pathology',
  'Genetics & Plant Breeding',
  'Seed Science & Technology',
  'Agrometeorology',
  'Food Technology',
  'Biotechnology',
  'Botany',
  'Zoology',
  'Microbiology',
  'Environmental Science',
  'Computer Science',
  'Computer Applications',
  'Information Technology',
  'Data Science',
  'Engineering',
  'Management',
  'Commerce',
  'Economics',
  'Mathematics',
  'Statistics',
  'Physics',
  'Chemistry',
  'Life Sciences',
  'Veterinary Science',
  'Fisheries Science',
  'Forestry',
  'Pharmacy',
  'Medicine',
  'Nursing',
  'Law',
  'Arts & Humanities',
  'Social Sciences',
  'Other',
];

interface FormData {
  fullName: string;
  phone: string;
  state: string;
  district: string;
  pincode: string;
  address: string;
  currentRole: string;
  yearsOfExperience: string;
  nonAgriConsent?: boolean;
  farmingBackground: string;
  cropsGrown: string;
  primaryExpertise: string;
  districtCustom?: string;
}

const createEmptyEducation = (): EducationItem => ({
  id: Math.random().toString(36).substring(2, 9),
  level: '',
  levelOther: '',
  discipline: '',
  disciplineOther: '',
  status: '',
  institution: '',
  yearOfCompletion: '',
});

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
    nonAgriConsent: false,
    farmingBackground: '',
    cropsGrown: '',
    primaryExpertise: '',
    districtCustom: '',
  });
  const [education, setEducation] = useState<EducationItem[]>([createEmptyEducation()]);
  const [phoneError, setPhoneError] = useState('');
  const [pincodeError, setPincodeError] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [isFrozen, setIsFrozen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await signOut({ redirect: false });
      sessionStorage.removeItem('currentPhase');
      sessionStorage.removeItem('interviewStarted');
      sessionStorage.removeItem('documentsSubmitted');
      router.push('/login');
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setLoggingOut(false);
    }
  };

  const handleFaqClick = () => {
    router.push('/faq');
  };

  // Check if onboarding is already completed on mount
  useEffect(() => {
    const restore = interceptAuthFetch();
    // Always check the DB for existing profile — sessionStorage is cleared on logout,
    // so we can't rely on it here. The DB is the source of truth.
    const checkProfile = async () => {
      try {
        const response = await fetch('/api/candidate', { cache: 'no-store' });
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
            candidate.address ||
            candidate.currentRole ||
            candidate.yearsOfExperience ||
            candidate.highestEducation ||
            candidate.institution ||
            candidate.farmingBackground ||
            candidate.cropsGrown ||
            candidate.primaryExpertise
          );
          if (hasProfileData) {
            setIsFrozen(true);
            setFormData({
              fullName: candidate.fullName || '',
              phone: candidate.phone || '',
              state: candidate.state || '',
              district: candidate.district || '',
              pincode: candidate.pincode || '',
              address: candidate.address || '',
              currentRole: candidate.currentRole || '',
              yearsOfExperience: candidate.yearsOfExperience?.toString() || '',
              nonAgriConsent: !!(candidate.nonAgriConsent || candidate.isInternshipConsent),
              farmingBackground: candidate.farmingBackground || '',
              cropsGrown: candidate.cropsGrown || '',
              primaryExpertise: candidate.primaryExpertise || '',
              districtCustom: candidate.districtCustom || '',
            });

            if (candidate.education && Array.isArray(candidate.education) && candidate.education.length > 0) {
              setEducation(
                candidate.education.map((e: any) => ({
                  id: Math.random().toString(36).substring(2, 9),
                  level: e.level || '',
                  levelOther: e.levelOther || '',
                  discipline: e.discipline || '',
                  disciplineOther: e.disciplineOther || '',
                  status: e.status || '',
                  institution: e.institution || '',
                  yearOfCompletion: e.yearOfCompletion || '',
                }))
              );
            } else if (candidate.highestEducation) {
              setEducation([
                {
                  id: Math.random().toString(36).substring(2, 9),
                  level: candidate.highestEducation || '',
                  levelOther: '',
                  discipline: candidate.discipline || '',
                  disciplineOther: candidate.disciplineOther || '',
                  status: candidate.educationStatus || '',
                  institution: candidate.institution || '',
                  yearOfCompletion: '',
                },
              ]);
            }

            if (candidate.resumeName) {
              setResume({
                id: candidate.resumeId,
                name: candidate.resumeName,
                size: '',
                data: null,
              });
            }
          }
        }
      } catch (error) {
        console.error('Error fetching candidate profile:', error);
      }
    };

    checkProfile();

    return () => {
      restore();
    };
  }, []);

  // ── Education Management ───────────────────────────────────────────────────
  const isOtherLevel = (level: string) =>
    level === 'Other' ||
    level === "Other Bachelor's Degree" ||
    level === "Other Master's Degree";

  const handleAddEducation = () => {
    setEducation((prev) => [...prev, createEmptyEducation()]);
  };

  const handleRemoveEducation = (index: number) => {
    setEducation((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEducationChange = (index: number, field: keyof EducationItem, value: string) => {
    setEducation((prev) => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
        ...(field === 'level' && !isOtherLevel(value) ? { levelOther: '' } : {}),
        ...(field === 'discipline' && value !== 'Other' ? { disciplineOther: '' } : {}),
      };
      return updated;
    });
    setError('');
  };

  // ── Eligibility Calculation ────────────────────────────────────────────────
  // Young Professional ONLY Allowed Qualifications (must be Completed):
  // 1. B.Sc. (Hons.) Agriculture (normal B.Sc. Agriculture is NOT allowed on its own)
  // 2. M.Sc. Agronomy
  // 3. M.Sc. Soil Science & Agricultural Chemistry (Soil Science)
  // 4. M.Sc. Horticulture (with a B.Sc. Agriculture / Diploma Agriculture background)
  // 5. M.Sc. Entomology
  // 6. M.Sc. Plant Pathology
  // 7. M.Sc. Agrometeorology
  // 8. M.Sc. Post-Harvest Technology (Food Technology)
  // 9. M.Sc. Extension & Communication (Agricultural Extension)
  // 10. M.Sc. Genetics & Plant Breeding
  // 11. M.Sc. Seed Science & Technology
  // 12. Diploma in Agriculture
  const STANDALONE_QUALIFYING_MSC_DISCIPLINES = [
    'Agriculture',
    'Agronomy',
    'Soil Science',
    'Entomology',
    'Plant Pathology',
    'Agrometeorology',
    'Food Technology',
    'Agricultural Extension',
    'Genetics & Plant Breeding',
    'Seed Science & Technology',
  ];

  // Checks if the candidate has AT LEAST ONE education entry that matches our
  // agricultural criteria AND has status = 'Completed'
  const hasCompletedQualifyingDegree = (eduList: EducationItem[]): boolean => {
    if (!eduList || eduList.length === 0) return false;

    // 1. Diploma in Agriculture (Completed)
    const hasDiplomaAgri = eduList.some(
      (e) => e.level === 'Diploma' && e.discipline === 'Agriculture' && e.status === 'Completed'
    );
    if (hasDiplomaAgri) return true;

    // 2. B.Sc. and B.Sc. (Hons.) Agriculture (Completed)
    const hasBScAgri = eduList.some(
      (e) =>
        (e.level === 'B.Sc.' || e.level === 'B.Sc. (Hons.)') &&
        e.discipline === 'Agriculture' &&
        e.status === 'Completed'
    );
    if (hasBScAgri) return true;

    // 3. M.Sc. Horticulture (with a B.Sc. / Diploma Agriculture background, both Completed)
    const hasMScHorticulture = eduList.some(
      (e) =>
        (e.level === 'M.Sc.' || e.level === 'Ph.D.') &&
        e.discipline === 'Horticulture' &&
        e.status === 'Completed'
    );
    const hasBScOrDiplomaAgriBg = eduList.some(
      (e) =>
        (e.level === 'B.Sc.' || e.level === 'B.Sc. (Hons.)' || e.level === 'Diploma') &&
        e.discipline === 'Agriculture' &&
        e.status === 'Completed'
    );
    if (hasMScHorticulture && hasBScOrDiplomaAgriBg) return true;

    // 4. M.Sc. / Ph.D. in standalone qualifying agricultural disciplines (Completed)
    const hasMScAgri = eduList.some(
      (e) =>
        (e.level === 'M.Sc.' || e.level === 'Ph.D.') &&
        STANDALONE_QUALIFYING_MSC_DISCIPLINES.includes(e.discipline) &&
        e.status === 'Completed'
    );
    if (hasMScAgri) return true;

    return false;
  };

  const hasFilledEducationDetails = education.some(
    (e) => Boolean(e.level && e.discipline && e.status)
  );

  type EligibleRole = 'Intern' | 'YP' | 'Junior' | 'Agri' | 'Senior' | null;

  const getEligibleRole = (): EligibleRole => {
    if (!hasFilledEducationDetails) return null;
    
    if (!hasCompletedQualifyingDegree(education)) return 'Intern';
    
    // Determine maximum role allowed based on education level
    let maxRole: EligibleRole = 'YP';
    
    const hasBScAgri = education.some(
      (e) => (e.level === 'B.Sc.' || e.level === 'B.Sc. (Hons.)') && e.discipline === 'Agriculture' && e.status === 'Completed'
    );
    const hasMScHorticulture = education.some(
      (e) => (e.level === 'M.Sc.' || e.level === 'Ph.D.') && e.discipline === 'Horticulture' && e.status === 'Completed'
    );
    const hasBScOrDiplomaAgriBg = education.some(
      (e) => (e.level === 'B.Sc.' || e.level === 'B.Sc. (Hons.)' || e.level === 'Diploma') && e.discipline === 'Agriculture' && e.status === 'Completed'
    );
    const hasAdvancedAgri = education.some(
      (e) => (e.level === 'M.Sc.' || e.level === 'Ph.D.' || e.level === 'Postdoctoral') && STANDALONE_QUALIFYING_MSC_DISCIPLINES.includes(e.discipline) && e.status === 'Completed'
    ) || (hasMScHorticulture && hasBScOrDiplomaAgriBg);

    if (hasAdvancedAgri) {
      maxRole = 'Senior';
    } else if (hasBScAgri) {
      maxRole = 'Agri';
    } else {
      maxRole = 'YP'; // Diploma
    }
    
    const exp = formData.yearsOfExperience ? parseFloat(formData.yearsOfExperience) : 0;
    
    let rawRole: EligibleRole = 'YP';
    if (exp < 2) rawRole = 'YP';
    else if (exp >= 2 && exp < 3) rawRole = 'Junior';
    else if (exp >= 3 && exp < 5) rawRole = 'Agri';
    else if (exp >= 5) rawRole = 'Senior';
    
    const roleLevels = { 'Intern': 0, 'YP': 1, 'Junior': 2, 'Agri': 3, 'Senior': 4 };
    
    if (roleLevels[rawRole as keyof typeof roleLevels] > roleLevels[maxRole as keyof typeof roleLevels]) {
      return maxRole;
    }
    
    return rawRole;
  };

  const eligibleRole = getEligibleRole();
  const needsConsent = eligibleRole !== null;
  const isBelowDisabled = needsConsent && !formData.nonAgriConsent;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Check all required fields are filled
    if (!formData.fullName.trim()) {
      setError('Please enter your full name');
      return;
    }

    if (!formData.state.trim()) {
      setError('Please select your state');
      return;
    }

    if (!formData.district.trim()) {
      setError('Please select your district');
      return;
    }

    if (formData.district === 'Others' && !formData.districtCustom?.trim()) {
      setError('Please specify your district name');
      return;
    }

    // Validate phone
    if (!validatePhone(formData.phone)) {
      return;
    }

    // Validate pincode
    if (!validatePincode(formData.pincode)) {
      return;
    }

    if (!formData.address.trim()) {
      setError('Please enter your address');
      return;
    }

    if (!formData.currentRole.trim()) {
      setError('Please enter your current role');
      return;
    }

    if (!formData.yearsOfExperience.trim()) {
      setError('Please enter your years of experience');
      return;
    }

    if (!education || education.length === 0) {
      setError('Please add at least one education record');
      return;
    }

    for (let i = 0; i < education.length; i++) {
      const edu = education[i];
      const num = i + 1;
      if (!edu.level) {
        setError(`Please select the education level for Education #${num}`);
        return;
      }
      if (isOtherLevel(edu.level) && !edu.levelOther?.trim()) {
        setError(`Please specify the degree / qualification for Education #${num}`);
        return;
      }
      if (!edu.discipline) {
        setError(`Please select the discipline for Education #${num}`);
        return;
      }
      if (edu.discipline === 'Other' && !edu.disciplineOther?.trim()) {
        setError(`Please specify the discipline for Education #${num}`);
        return;
      }
      if (!edu.status) {
        setError(`Please select the current status for Education #${num}`);
        return;
      }
      if (!edu.institution.trim()) {
        setError(`Please enter the institution/university for Education #${num}`);
        return;
      }
      if (!edu.yearOfCompletion.trim()) {
        setError(`Please enter the year of completion for Education #${num}`);
        return;
      }
    }

    if (needsConsent && !formData.nonAgriConsent) {
      setError('Please acknowledge and tick the role declaration to proceed');
      return;
    }

    if (!formData.farmingBackground.trim()) {
      setError('Please describe your farming experience');
      return;
    }

    if (!formData.cropsGrown.trim()) {
      setError('Please enter the crops you have grown/handled');
      return;
    }

    if (!formData.primaryExpertise.trim()) {
      setError('Please select your primary area of expertise');
      return;
    }

    // Validate resume is uploaded
    if (!resume) {
      setError('Please upload your resume');
      return;
    }

    setIsLoading(true);

    try {
      // When "Others" is selected, use the custom district name instead
      const districtToSubmit =
        formData.district === 'Others' ? formData.districtCustom?.trim() : formData.district;

      const highestEdu =
        education.find((e) => e.level === 'PhD') ||
        education.find((e) => e.level === "Master's") ||
        education.find((e) => e.level === "Bachelor's") ||
        education.find((e) => e.level === 'Diploma') ||
        education[0] ||
        {};

      const payload = {
        ...formData,
        highestEducation: highestEdu.level || '',
        institution: highestEdu.institution || '',
        educationStatus: highestEdu.status || '',
        discipline: highestEdu.discipline || '',
        disciplineOther: highestEdu.disciplineOther || '',
        education: education.map(({ id, ...rest }) => rest),
        eligibleRole: eligibleRole,
        nonAgriConsent: formData.nonAgriConsent,
        isInternshipConsent: eligibleRole === 'Intern' ? formData.nonAgriConsent : false,
        yearsOfExperience: formData.yearsOfExperience ? parseFloat(formData.yearsOfExperience) : undefined,
        district: districtToSubmit || formData.district,
      };

      // Save candidate profile to database via API
      const response = await fetch('/api/candidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        let msg = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          msg = errorData.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const candidate = await response.json();

      // Upload resume to backend (server-side async: file on disk + raw text in DB)
      if (resume?.data && candidate?.id) {
          // Convert base64 to a File object
          const res = await fetch(resume.data);
          const blob = await res.blob();
          const fileName = resume.name || 'resume.pdf';
          const fileType = fileName.endsWith('.docx')
            ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
            : 'application/pdf';
          const file = new File([blob], fileName, { type: fileType });

          const formData = new FormData();
          formData.append('file', file);
          formData.append('candidateId', candidate.id);

        const resumeRes = await fetch('/api/resume', { method: 'POST', body: formData, credentials: 'include' });
        if (!resumeRes.ok) {
          const errorData = await resumeRes.json().catch(() => ({}));
          throw new Error(errorData.error || 'Failed to upload resume');
        }
      }

      // Save candidate ID and fullName to sessionStorage (used by interview page)
      if (candidate?.id) {
        sessionStorage.setItem('candidateId', candidate.id);
      }
      if (formData.fullName) {
        sessionStorage.setItem('candidateFullName', formData.fullName);
      }

      // Save phase as completed to sessionStorage and redirect
      sessionStorage.setItem('interviewPhase', '2');

      // Sync to DB so admin dashboard sees the correct phase
      await syncPhaseToDb(2);

      // Redirect to dashboard
      window.location.href = '/dashboard';
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
      console.error('[onboarding] save error:', msg);
      setError(msg);
      setIsLoading(false);
    }
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
        {/* Top Navbar */}
        <nav className={styles.topNavbar}>
          <div className={styles.navbarContent}>
            <BrandLogos variant="header" />
            <div className={styles.headerButtons}>
              <button
              onClick={() => window.open('/raise-ticket.html', '_blank')}
              className={styles.raiseTicketBtn}
            >
              ⚠️ Raise Tickets
            </button>
            <button
              onClick={handleFaqClick}
                className={styles.faqHelpBtn}
              >
                💬 FAQ & Help
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className={styles.signOutBtn}
              >
                {loggingOut ? 'Signing out...' : 'Sign Out'}
              </button>
            </div>
          </div>
        </nav>

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
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Educational Background</h2>
              {education.map((edu, idx) => (
                <div key={edu.id || idx} style={{ marginBottom: '12px', padding: '14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <div style={{ fontWeight: 600, color: '#1e293b', marginBottom: '4px' }}>
                    {(isOtherLevel(edu.level) && edu.levelOther) ? edu.levelOther : (edu.level || 'Education')} in {edu.discipline === 'Other' ? (edu.disciplineOther || 'Other') : (edu.discipline || 'N/A')} {edu.status ? `(${edu.status})` : ''}
                  </div>
                  <div style={{ fontSize: '13px', color: '#64748b' }}>
                    {edu.institution || ''} {edu.yearOfCompletion ? `• Year: ${edu.yearOfCompletion}` : ''}
                  </div>
                </div>
              ))}
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
      {/* Top Navbar */}
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
            <button
              onClick={handleFaqClick}
              className={styles.faqHelpBtn}
            >
              💬 FAQ & Help
            </button>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className={styles.signOutBtn}
            >
              {loggingOut ? 'Signing out...' : 'Sign Out'}
            </button>
          </div>
        </div>
      </nav>

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
                placeholder="e.g., Farmer, Agronomist, Student"
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
          </section>

          {/* ─── Educational Background (Repeatable LinkedIn Style) ─── */}
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>Educational Background <span className={styles.required}>*</span></h2>
              <p className={styles.sectionSubtitle}>Add all your relevant education qualifications</p>
            </div>

            <div className={styles.educationList}>
              {education.map((edu, index) => (
                <div key={edu.id} className={styles.educationCard}>
                  <div className={styles.educationCardHeader}>
                    <h3 className={styles.educationCardTitle}>
                      Education #{index + 1} {edu.level ? `— ${edu.level}` : ''}
                    </h3>
                    {education.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveEducation(index)}
                        className={styles.removeEduBtn}
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>

                  <div className={styles.educationGrid}>
                    {/* Education Level */}
                    <div className={styles.field}>
                      <label className={styles.label}>
                        Level <span className={styles.required}>*</span>
                      </label>
                      <select
                        value={edu.level}
                        onChange={(e) => handleEducationChange(index, 'level', e.target.value)}
                        className={styles.input}
                        required
                      >
                        <option value="">Select level...</option>
                        {EDUCATION_LEVELS.map((lvl) => (
                          <option key={lvl} value={lvl}>
                            {lvl}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Discipline */}
                    <div className={styles.field}>
                      <label className={styles.label}>
                        Discipline <span className={styles.required}>*</span>
                      </label>
                      <select
                        value={edu.discipline}
                        onChange={(e) => handleEducationChange(index, 'discipline', e.target.value)}
                        className={styles.input}
                        required
                      >
                        <option value="">Select discipline...</option>
                        {DISCIPLINES.map((disc) => (
                          <option key={disc} value={disc}>
                            {disc}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* If Other Level: Specify Degree */}
                    {isOtherLevel(edu.level) && (
                      <div className={`${styles.field} ${styles.fullWidth}`}>
                        <label className={styles.label}>
                          Specify Degree / Qualification <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          value={edu.levelOther || ''}
                          onChange={(e) => handleEducationChange(index, 'levelOther', e.target.value)}
                          className={styles.input}
                          placeholder="Enter your exact degree / qualification name"
                          maxLength={60}
                          required
                        />
                      </div>
                    )}

                    {/* If Other Discipline: Specify Discipline */}
                    {edu.discipline === 'Other' && (
                      <div className={`${styles.field} ${styles.fullWidth}`}>
                        <label className={styles.label}>
                          Specify Discipline / Branch <span className={styles.required}>*</span>
                        </label>
                        <input
                          type="text"
                          value={edu.disciplineOther || ''}
                          onChange={(e) => handleEducationChange(index, 'disciplineOther', e.target.value)}
                          className={styles.input}
                          placeholder="e.g., Computer Science, Mechanical Engineering, Commerce..."
                          maxLength={60}
                          required
                        />
                      </div>
                    )}

                    {/* Current Status */}
                    <div className={styles.field}>
                      <label className={styles.label}>
                        Current Status <span className={styles.required}>*</span>
                      </label>
                      <select
                        value={edu.status}
                        onChange={(e) => handleEducationChange(index, 'status', e.target.value)}
                        className={styles.input}
                        required
                      >
                        <option value="">Select status...</option>
                        <option value="Pursuing">Pursuing</option>
                        <option value="Completed">Completed</option>
                      </select>
                    </div>

                    {/* Year of Completion */}
                    <div className={styles.field}>
                      <label className={styles.label}>
                        Year of Completion {edu.status === 'Pursuing' ? '(Expected)' : ''} <span className={styles.required}>*</span>
                      </label>
                      <input
                        type="number"
                        value={edu.yearOfCompletion}
                        onChange={(e) => handleEducationChange(index, 'yearOfCompletion', e.target.value)}
                        className={styles.input}
                        placeholder="e.g., 2024"
                        min="1970"
                        max="2035"
                        required
                      />
                    </div>

                    {/* Institution Name */}
                    <div className={`${styles.field} ${styles.fullWidth}`}>
                      <label className={styles.label}>
                        Institution / University <span className={styles.required}>*</span>
                      </label>
                      <input
                        type="text"
                        value={edu.institution}
                        onChange={(e) => handleEducationChange(index, 'institution', e.target.value)}
                        className={styles.input}
                        placeholder="Name of your college / university"
                        maxLength={80}
                        required
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={handleAddEducation}
              className={styles.addEducationBtn}
            >
              + Add Another Education
            </button>
          </section>

          {/* ─── Role Eligibility & Declaration (Compact) ─── */}
          {needsConsent && (
            <div className={styles.declarationCard}>
              <div className={styles.declarationHeader}>
                <span className={styles.declarationIcon}>⚠️</span>
                <h3 className={styles.declarationTitle}>Role Eligibility & Declaration</h3>
              </div>
              <p className={styles.declarationNotice}>
                {eligibleRole === 'Intern' && (
                  <>Based on your qualifications, you are eligible for the <strong>Internship Program</strong> (minimum 3-month commitment, 3 hours/day, ₹5,000/month stipend). Please check our <a href="/faq" target="_blank" rel="noopener noreferrer" className={styles.faqLink}>FAQs</a> for full details.</>
                )}
                {eligibleRole === 'YP' && (
                  <>Based on your qualifications and experience, you are eligible for the <strong>Young Agriculture Professional</strong> role (₹20,000 per month / 2.40 - 3.00 LPA).</>
                )}
                {eligibleRole === 'Junior' && (
                  <>Based on your qualifications and experience, you are eligible for the <strong>Junior Agriculture Professional</strong> role (₹30,000 per month / 3.00 - 4.50 LPA).</>
                )}
                {eligibleRole === 'Agri' && (
                  <>Based on your qualifications and experience, you are eligible for the <strong>Agriculture Professional</strong> role (₹45,000 per month / 4.50 - 6.00 LPA).</>
                )}
                {eligibleRole === 'Senior' && (
                  <>Based on your qualifications and experience, you are eligible for the <strong>Senior Agriculture Professional</strong> role (₹70,000 per month / 8.40 - 10.00 LPA).</>
                )}
              </p>

              <label className={styles.consentCheckboxLabel}>
                <input
                  type="checkbox"
                  name="nonAgriConsent"
                  checked={!!formData.nonAgriConsent}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, nonAgriConsent: e.target.checked }))
                  }
                  className={styles.consentCheckbox}
                  required
                />
                <span className={styles.consentCheckboxText}>
                  I accept the terms for this role and wish to proceed with the application. <span className={styles.required}>*</span>
                </span>
              </label>
            </div>
          )}

          {/* ─── Remaining Sections (Disabled until Declaration is accepted if non-eligible) ─── */}
          {isBelowDisabled && (
            <div className={styles.lockNoticeBanner}>
              🔒 Please accept the Role Declaration above to unlock and complete the remaining sections.
            </div>
          )}

          <div className={isBelowDisabled ? styles.disabledSectionWrapper : ''}>
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
                  disabled={isBelowDisabled}
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
                  disabled={isBelowDisabled}
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
                  disabled={isBelowDisabled}
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
                        disabled={isBelowDisabled}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className={`${styles.resumeUpload} ${isBelowDisabled ? styles.disabledUpload : ''}`}>
                    <span className={styles.uploadIcon}>📎</span>
                    <p className={styles.uploadText}>Click to upload your resume</p>
                    <p className={styles.uploadHint}>PDF or Word document (max 5MB)</p>
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx"
                      className={styles.resumeInput}
                      disabled={isBelowDisabled}
                    />
                  </label>
                )}
              </div>
            </section>

            {error && <p className={styles.error}>{error}</p>}

            <button
              type="submit"
              className={styles.button}
              disabled={isLoading || isBelowDisabled}
            >
              {isLoading ? 'Saving...' : 'Complete Profile'}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

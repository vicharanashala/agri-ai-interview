'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import BrandLogos from '@/components/BrandLogos';
import { signOut } from 'next-auth/react';

export default function DeclarationPage() {
  const router = useRouter();
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    await signOut({ callbackUrl: '/login' });
  };

  const handleSubmit = async () => {
    if (!agreed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/candidate/declaration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ declarationAccepted: true })
      });
      
      if (res.ok) {
        router.push('/post-login');
      } else {
        alert('Failed to submit declaration. Please try again.');
      }
    } catch (e) {
      console.error(e);
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      {/* Top Navbar */}
      <nav className={styles.topNavbar}>
        <div className={styles.navbarContent}>
          <BrandLogos variant="header" />
          <div className={styles.headerButtons}>
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

      <div className={styles.formBox} style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        
        <div style={{ padding: '32px 32px 24px', backgroundColor: '#fff', borderBottom: '1px solid #e5e7eb' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f2238', marginBottom: '8px', textAlign: 'center' }}>Candidate Declaration & Consent</h1>
          <p style={{ color: '#4b5563', textAlign: 'center', fontSize: '15px' }}>Please read and accept the terms of the AI-based interview and assessment process before continuing.</p>
        </div>

        <div style={{ padding: '32px', flex: '1 1 auto', overflowY: 'auto', maxHeight: '55vh', backgroundColor: '#fafafa', color: '#374151', lineHeight: '1.6', fontSize: '15px' }}>
          
          <h2 style={{ fontSize: '17px', fontWeight: 700, color: '#0f2238', marginBottom: '16px' }}>CANDIDATE DECLARATION AND CONSENT<br/>AI-BASED INTERVIEW & ASSESSMENT PROCESS</h2>
          
          <p style={{ marginBottom: '20px' }}>I, the undersigned candidate, hereby acknowledge that I am voluntarily participating in an AI-enabled interview and assessment process and agree to the following terms governing my participation, use of the platform, processing of my responses, and communication of concerns.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>1. AI-Enabled Assessment</h3>
          <p style={{ marginBottom: '16px' }}>I acknowledge that the interview and/or assessment may be conducted through an Artificial Intelligence enabled platform. The platform may use automated computational processes, Large Language Models (LLMs), evaluation algorithms, pre-processing mechanisms, response analysis, and other technology-assisted assessment methodologies for processing and evaluating my submissions.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>2. Automated Processing and Human Review</h3>
          <p style={{ marginBottom: '8px' }}>I understand that the assessment process may involve multiple stages, including but not limited to:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'disc' }}>
            <li>automated processing and evaluation;</li>
            <li>response normalisation and pre-processing;</li>
            <li>contextual analysis;</li>
            <li>AI-generated evaluation;</li>
            <li>quality and consistency checks;</li>
            <li>expert or subject-matter review; and</li>
            <li>re-evaluation or secondary verification where required.</li>
          </ul>
          <p style={{ marginBottom: '16px' }}>I acknowledge that an assessment outcome may therefore not be determined solely by a single AI-generated response or a single automated evaluation event.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>3. Context, Interpretation and Perception of AI Responses</h3>
          <p style={{ marginBottom: '8px' }}>I acknowledge that AI-generated responses and system outputs are generated through computational models that interpret the question, linguistic context, available information, system instructions, and other relevant inputs.</p>
          <p style={{ marginBottom: '8px' }}>Accordingly, an output may, in certain circumstances, appear different from what a candidate expects because of differences in context, interpretation, terminology, linguistic expression, or human perception. Such an apparent difference should not, by itself, be treated as evidence of a technical defect, malfunction, bias, or issue with the assessment process.</p>
          <p style={{ marginBottom: '16px' }}>I understand that any concern, clarification, or query regarding an AI response, assessment outcome, or platform behaviour can and should be raised through the designated review or grievance mechanism so that the relevant records and evaluation process can be examined.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>4. Re-Evaluation and Verification Mechanism</h3>
          <p style={{ marginBottom: '8px' }}>I acknowledge that the platform may have an in-built mechanism for pre-processing, re-evaluation, verification, quality assurance, or expert review of responses.</p>
          <p style={{ marginBottom: '8px' }}>Where a concern is raised, the organisation may review the relevant submission, system output, assessment records, and applicable evaluation criteria before determining whether the matter represents:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'disc' }}>
            <li>an expected platform behaviour or feature;</li>
            <li>a difference in interpretation or context;</li>
            <li>an assessment-related matter requiring review; or</li>
            <li>a genuine technical or system issue.</li>
          </ul>
          <p style={{ marginBottom: '16px' }}>The outcome of such review shall be communicated through the applicable process.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>5. Candidate Responsibility and Authenticity</h3>
          <p style={{ marginBottom: '8px' }}>I confirm that:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'none' }}>
            <li style={{ marginBottom: '4px' }}>a. the information provided by me is true and accurate to the best of my knowledge;</li>
            <li style={{ marginBottom: '4px' }}>b. the responses submitted during the assessment are my own, unless assistance is expressly permitted;</li>
            <li style={{ marginBottom: '4px' }}>c. I will not intentionally manipulate, circumvent, exploit, or interfere with the assessment system;</li>
            <li style={{ marginBottom: '4px' }}>d. I will not attempt to gain an unfair advantage through unauthorised technological or external assistance; and</li>
            <li style={{ marginBottom: '4px' }}>e. I will comply with the instructions communicated to me during the assessment process.</li>
          </ul>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>6. Confidentiality and Non-Disclosure</h3>
          <p style={{ marginBottom: '8px' }}>I acknowledge that assessment questions, prompts, evaluation criteria, system behaviour, platform interfaces, screenshots, recordings, responses, technical documentation, and other assessment-related information may constitute confidential or restricted information.</p>
          <p style={{ marginBottom: '8px' }}>I therefore agree not to, without prior written authorisation:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'disc' }}>
            <li>reproduce or distribute assessment questions;</li>
            <li>share screenshots or recordings of the assessment;</li>
            <li>publish confidential assessment content;</li>
            <li>disclose assessment materials on social-media platforms or public forums;</li>
            <li>attempt to reverse engineer or circumvent assessment mechanisms; or</li>
            <li>otherwise disclose restricted information to third parties.</li>
          </ul>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>7. Official Communication and Grievance Mechanism</h3>
          <p style={{ marginBottom: '8px' }}>If I experience a technical problem, have a concern regarding the assessment, observe unexpected system behaviour, or require clarification, I agree to use the official ticketing, grievance, or support mechanism provided on the platform.</p>
          <p style={{ marginBottom: '16px' }}>I understand that using the prescribed mechanism enables the organisation to examine the relevant technical logs, submission records, evaluation information, and other available evidence before responding to the concern.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>8. Responsible Social-Media and Public Communication</h3>
          <p style={{ marginBottom: '8px' }}>I acknowledge that concerns relating to the assessment, AI-generated responses, candidate evaluation, platform behaviour, or selection process can and should be raised through the designated official channels (1. Tickets; 2. Email), so that they can be appropriately reviewed and addressed.</p>
          <p style={{ marginBottom: '16px' }}>I agree not to make or circulate unverified allegations, confidential assessment information, misleading representations, or conclusions regarding the functioning or integrity of the platform through public social-media platforms or other public forums before the matter has been submitted through the prescribed review mechanism.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>9. Compliance with Institutional and Organisational Policies</h3>
          <p style={{ marginBottom: '8px' }}>I agree to comply with all applicable instructions, policies, codes of conduct, confidentiality requirements, information-security requirements, and social-media guidelines communicated by the organisation and/or the institution governing the selection process.</p>
          <p style={{ marginBottom: '16px' }}>Where the assessment is conducted in association with an educational institution, government body, research institution, or other partner organisation, I acknowledge that applicable institutional policies may also apply to my participation.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>10. Personal Data and Digital Information</h3>
          <p style={{ marginBottom: '8px' }}>I acknowledge that participation in the assessment may require the collection and processing of certain personal information and assessment-related data.</p>
          <p style={{ marginBottom: '8px' }}>Such information may include, where applicable:</p>
          <ul style={{ paddingLeft: '24px', marginBottom: '16px', listStyleType: 'disc' }}>
            <li>candidate identification details;</li>
            <li>contact information;</li>
            <li>assessment responses;</li>
            <li>interview recordings or transcripts;</li>
            <li>technical and platform interaction data;</li>
            <li>evaluation and review records; and</li>
            <li>information reasonably necessary for administering and verifying the selection process.</li>
          </ul>
          <p style={{ marginBottom: '16px' }}>I understand that such processing will be undertaken for specified and legitimate purposes in accordance with the applicable privacy notice, consent mechanism, organisational policies, and applicable Indian data-protection law.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>11. Assessment Integrity and Consequences of Non-Compliance</h3>
          <p style={{ marginBottom: '8px' }}>I understand that any material violation of the assessment rules, including unauthorised disclosure of confidential assessment content, deliberate manipulation of the assessment process, impersonation, fraudulent submissions, or other material misconduct may result in appropriate action under the applicable rules and policies of the organisation.</p>
          <p style={{ marginBottom: '16px' }}>Depending on the nature and severity of the violation, such action may include disqualification from the assessment or cancellation of candidature, subject to the applicable process and policies.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>12. Electronic Acceptance and Record</h3>
          <p style={{ marginBottom: '16px' }}>I acknowledge that my acceptance of this declaration through an electronic checkbox, digital confirmation, electronic signature, or other authorised electronic mechanism may be recorded as evidence of my acknowledgement and acceptance of the applicable terms.</p>

          <h3 style={{ fontSize: '15px', fontWeight: 600, color: '#111827', marginTop: '24px', marginBottom: '8px' }}>13. Candidate Acknowledgement</h3>
          <p style={{ marginBottom: '16px' }}>I have read and understood this declaration, including the provisions relating to AI-assisted evaluation, contextual interpretation, re-evaluation, confidentiality, responsible communication, data processing, and assessment integrity. I understand that I may raise any concern, query, or request for clarification through the designated official mechanism, and I agree to comply with the applicable terms and procedures governing the assessment process.</p>
          
        </div>

        <div style={{ padding: '24px 32px', backgroundColor: '#fff', borderTop: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <label style={{ display: 'flex', alignItems: 'flex-start', cursor: 'pointer', gap: '12px', padding: '16px', backgroundColor: agreed ? '#f0fdf4' : '#f9fafb', border: agreed ? '1px solid #bbf7d0' : '1px solid #e5e7eb', borderRadius: '8px', transition: 'all 0.2s' }}>
            <input 
              type="checkbox" 
              checked={agreed} 
              onChange={(e) => setAgreed(e.target.checked)} 
              style={{ marginTop: '4px', width: '20px', height: '20px', accentColor: '#22c55e', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '15px', color: '#1f2937', lineHeight: '1.5' }}>
              <strong>I agree to the terms and conditions</strong> outlined in the Candidate Declaration and Consent. I confirm that all information provided is accurate and I will comply with the assessment process.
            </span>
          </label>

          <button 
            onClick={handleSubmit} 
            disabled={!agreed || loading}
            style={{ 
              alignSelf: 'flex-end',
              padding: '12px 32px', 
              backgroundColor: agreed && !loading ? '#22c55e' : '#d1d5db',
              color: '#fff', 
              border: 'none', 
              borderRadius: '8px', 
              fontSize: '16px', 
              fontWeight: 600, 
              cursor: agreed && !loading ? 'pointer' : 'not-allowed',
              transition: 'background-color 0.2s',
              boxShadow: agreed && !loading ? '0 4px 6px -1px rgba(34, 197, 94, 0.2)' : 'none'
            }}
          >
            {loading ? 'Submitting...' : 'Accept & Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface JoiningDetails {
  user: {
    name: string;
    email: string;
    phone: string;
  };
  joining: {
    location: string;
    startDate: string;
    reportingTime: string;
  };
  documents: {
    name: string;
    description: string;
    icon: string;
  }[];
}

export default function JoiningPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [joiningDetails, setJoiningDetails] = useState<JoiningDetails | null>(null);
  const router = useRouter();

  useEffect(() => {
    const currentPhase = localStorage.getItem('interviewPhase');
    if (!currentPhase || parseInt(currentPhase) < 6) {
      router.push('/dashboard');
    } else {
      // Mark joining details as visited/completed
      localStorage.setItem('joiningDetailsVisited', 'true');
      
      // Set mock data for joining details
      setJoiningDetails({
        user: {
          name: 'Rajesh Kumar',
          email: 'rajesh.kumar@email.com',
          phone: '+91 98765 43210',
        },
        joining: {
          location: 'Remote / Work From Home',
          startDate: 'January 15, 2025',
          reportingTime: '9:30 AM IST',
        },
        documents: [
          {
            name: 'Aadhaar Card',
            description: 'Valid government-issued identity proof',
            icon: '🪪',
          },
          {
            name: 'Educational Certificates',
            description: 'All degree certificates from SSC onwards',
            icon: '🎓',
          },
          {
            name: 'Experience Letters',
            description: 'Relieving letters from all previous employers',
            icon: '📋',
          },
          {
            name: 'Passport Size Photographs',
            description: '3 recent passport size photos with white background',
            icon: '📷',
          },
          {
            name: 'Bank Account Details',
            description: 'Cancelled cheque or bank statement for salary',
            icon: '🏦',
          },
        ],
      });
      setIsLoading(false);
    }
  }, [router]);

  const handleDownload = async () => {
    if (!joiningDetails) return;

    try {
      const response = await fetch('/api/joining-details', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(joiningDetails),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `joining-details-${joiningDetails.user.name.replace(/\s+/g, '-').toLowerCase()}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      const message = error instanceof Error ? error.message : 'Unknown error';
      alert(`Failed to download joining details: ${message}`);
    }
  };

  const handleGoToDashboard = () => {
    router.push('/dashboard');
  };

  if (isLoading) {
    return (
      <main className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </main>
    );
  }

  if (!joiningDetails) {
    return (
      <main className={styles.container}>
        <div className={styles.error}>Unable to load joining details.</div>
      </main>
    );
  }

  return (
    <main className={styles.container}>
      <div className={styles.content}>
        <div className={styles.icon}>📋</div>
        <h1 className={styles.title}>Joining Details</h1>
        <p className={styles.subtitle}>
          Your joining information and documents checklist
        </p>

        <div className={styles.joiningCard}>
          {/* User Details Table */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Candidate Information</h2>
            <table className={styles.detailsTable}>
              <tbody>
                <tr>
                  <td className={styles.label}>Name</td>
                  <td className={styles.value}>{joiningDetails.user.name}</td>
                </tr>
                <tr>
                  <td className={styles.label}>Email</td>
                  <td className={styles.value}>{joiningDetails.user.email}</td>
                </tr>
                <tr>
                  <td className={styles.label}>Phone</td>
                  <td className={styles.value}>{joiningDetails.user.phone}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Joining Location & Schedule */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Joining Schedule</h2>
            <table className={styles.detailsTable}>
              <tbody>
                <tr>
                  <td className={styles.label}>Location</td>
                  <td className={styles.value}>{joiningDetails.joining.location}</td>
                </tr>
                <tr>
                  <td className={styles.label}>Start Date</td>
                  <td className={styles.value}>{joiningDetails.joining.startDate}</td>
                </tr>
                <tr>
                  <td className={styles.label}>Reporting Time</td>
                  <td className={styles.value}>{joiningDetails.joining.reportingTime}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Documents Checklist */}
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Documents to Carry</h2>
            <p className={styles.sectionSubtitle}>
              Please bring the originals and one set of photocopies
            </p>
            <div className={styles.documentsList}>
              {joiningDetails.documents.map((doc, index) => (
                <div key={index} className={styles.documentItem}>
                  <span className={styles.documentIcon}>{doc.icon}</span>
                  <div className={styles.documentInfo}>
                    <span className={styles.documentName}>{doc.name}</span>
                    <span className={styles.documentDescription}>{doc.description}</span>
                  </div>
                  <span className={styles.documentCheck}>☐</span>
                </div>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className={styles.actions}>
            <button onClick={handleDownload} className={styles.downloadButton}>
              📥 Download Joining Details
            </button>
            <button onClick={handleGoToDashboard} className={styles.dashboardButton}>
              Back to Dashboard
            </button>
          </div>
        </div>

        <div className={styles.note}>
          <p>
            <strong>Important Note:</strong> Please ensure all documents are ready before your joining date. 
            If you have any questions, please contact HR at hr@company.com.
          </p>
        </div>
      </div>
    </main>
  );
}
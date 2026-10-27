import React from 'react';
import { Bone, HeaderButtonsNavbarSkeleton, TextBone } from '@/components/CandidateSkeleton';
import pageStyles from './page.module.css';
import styles from './OnboardingSkeleton.module.css';

// Loading placeholder for the "Complete Your Profile" form. Uses the real page's
// classes and labels shown as shimmer bones, with field-sized blocks, so the
// form keeps its real size and spacing at every width.
type Field = { label: string; tall?: boolean; count?: string };

const SECTIONS: { title: string; fields: Field[] }[] = [
  {
    title: 'Personal Information',
    fields: [
      { label: 'Full Name *', count: '0/30' },
      { label: 'Phone Number (India) *', count: '0/10 digits' },
    ],
  },
  {
    title: 'Location',
    fields: [
      { label: 'State *' },
      { label: 'District *' },
      { label: 'Pincode *' },
      { label: 'Address *', tall: true, count: '0/150' },
    ],
  },
  {
    title: 'Professional Background',
    fields: [{ label: 'Current Role *' }],
  },
];

export default function OnboardingSkeleton() {
  return (
    <main className={pageStyles.container} aria-busy="true" aria-label="Loading profile form">
      <HeaderButtonsNavbarSkeleton pageStyles={pageStyles} />

      {/* The real form box fades in on mount; keep the placeholder still */}
      <div className={pageStyles.formBox} style={{ animation: 'none' }}>
        <h1 className={pageStyles.title}>
          <TextBone>Complete Your Profile</TextBone>
        </h1>
        <p className={pageStyles.subtitle}>
          <TextBone>Tell us about yourself for your AI interview preparation</TextBone>
        </p>

        <div className={pageStyles.form}>
          {SECTIONS.map((section) => (
            <section key={section.title} className={pageStyles.section}>
              <h2 className={pageStyles.sectionTitle}>
                <TextBone>{section.title}</TextBone>
              </h2>
              {section.fields.map((field) => (
                <div key={field.label} className={pageStyles.field}>
                  <span className={pageStyles.label}>
                    <TextBone>{field.label}</TextBone>
                  </span>
                  <Bone className={field.tall ? styles.textarea : styles.input} />
                  {field.count && (
                    <span className={pageStyles.charCount}>
                      <TextBone>{field.count}</TextBone>
                    </span>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

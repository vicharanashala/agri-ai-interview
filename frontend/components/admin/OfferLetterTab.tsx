'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './OfferLetterTab.module.css';

interface OfferLetterConfig {
  companyName: string;
  companyTagline: string;
  companyWebsite: string;
  position: string;
  department: string;
  duration: string;
  stipend: string;
  location: string;
  startDateNote: string;
  responsibilities: string[];
  terms: string[];
  acceptByDays: number;
  footerText: string;
  signatureLabel: string;
  template: string;
}

interface Props {
  adminToken: string | null;
}

const PLACEHOLDER_HINTS = [
  { token: '{{candidate_name}}', desc: 'Candidate full name' },
  { token: '{{email}}', desc: 'Candidate email' },
  { token: '{{phone}}', desc: 'Candidate phone number' },
  { token: '{{date}}', desc: 'Letter generation date' },
  { token: '{{position}}', desc: 'Internship position title' },
  { token: '{{companyName}}', desc: 'Company name' },
  { token: '{{department}}', desc: 'Department name' },
  { token: '{{duration}}', desc: 'Internship duration' },
  { token: '{{stipend}}', desc: 'Stipend amount' },
  { token: '{{location}}', desc: 'Work location' },
  { token: '{{startDateNote}}', desc: 'Start date note' },
  { token: '{{responsibilities}}', desc: 'Bullet list of responsibilities' },
  { token: '{{terms}}', desc: 'Numbered list of terms' },
  { token: '{{footerText}}', desc: 'Footer text' },
  { token: '{{signatureLabel}}', desc: 'Signature line label' },
];

export default function OfferLetterTab({ adminToken }: Props) {
  const [config, setConfig] = useState<OfferLetterConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Local form state (mirrors config but editable)
  const [form, setForm] = useState<Partial<OfferLetterConfig>>({});
  const [respList, setRespList] = useState<string[]>([]);
  const [termsList, setTermsList] = useState<string[]>([]);
  const [newResp, setNewResp] = useState('');
  const [newTerm, setNewTerm] = useState('');

  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/offer-letter-config', {
        headers: { ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
      });
      if (res.ok) {
        const data = await res.json();
        const cfg = data.config as OfferLetterConfig;
        setConfig(cfg);
        setForm(cfg);
        setRespList(cfg.responsibilities ?? []);
        setTermsList(cfg.terms ?? []);
      }
    } catch (err) {
      console.error('Failed to load offer letter config:', err);
    } finally {
      setLoading(false);
    }
  }, [adminToken]);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ── Field helpers ────────────────────────────────────────────────────────

  const setField = <K extends keyof OfferLetterConfig>(key: K, value: OfferLetterConfig[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const addResp = () => {
    const trimmed = newResp.trim();
    if (!trimmed) return;
    setRespList(prev => [...prev, trimmed]);
    setForm(prev => ({ ...prev, responsibilities: [...(prev.responsibilities ?? []), trimmed] }));
    setNewResp('');
  };

  const removeResp = (idx: number) => {
    const updated = respList.filter((_, i) => i !== idx);
    setRespList(updated);
    setForm(prev => ({ ...prev, responsibilities: updated }));
  };

  const addTerm = () => {
    const trimmed = newTerm.trim();
    if (!trimmed) return;
    const updated = [...termsList, trimmed];
    setTermsList(updated);
    setForm(prev => ({ ...prev, terms: updated }));
    setNewTerm('');
  };

  const removeTerm = (idx: number) => {
    const updated = termsList.filter((_, i) => i !== idx);
    setTermsList(updated);
    setForm(prev => ({ ...prev, terms: updated }));
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg(null);
    try {
      const payload = {
        ...form,
        responsibilities: respList,
        terms: termsList,
      };
      const res = await fetch('/api/admin/offer-letter-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMsg({ type: 'success', text: 'Offer letter configuration saved.' });
        setConfig(data.config);
        setForm(data.config);
        setRespList(data.config.responsibilities ?? []);
        setTermsList(data.config.terms ?? []);
      } else {
        setSaveMsg({ type: 'error', text: data.detail ?? 'Failed to save.' });
      }
    } catch {
      setSaveMsg({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  // ── Preview ──────────────────────────────────────────────────────────────

  const handlePreview = async () => {
    setPreviewing(true);
    try {
      const res = await fetch('/api/admin/offer-letter-preview', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
        },
        body: JSON.stringify({ name: 'Test Candidate', email: 'test@example.com', phone: '+91 9876543210' }),
      });
      if (res.ok) {
        const data = await res.json();
        const win = window.open('', '_blank');
        if (win) {
          win.document.write(`<iframe src="${data.pdf}" style="width:100%;height:100%;border:none;"></iframe>`);
        }
      } else {
        alert('Failed to generate preview.');
      }
    } catch {
      alert('Network error during preview.');
    } finally {
      setPreviewing(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return <div className={styles.loading}>Loading offer letter config…</div>;
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Offer Letter Configuration</h2>
          <p className={styles.subtitle}>
            Customize the offer letter content. Changes apply immediately to new PDFs.
          </p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.previewBtn}
            onClick={handlePreview}
            disabled={previewing}
          >
            {previewing ? 'Generating…' : 'Preview PDF'}
          </button>
          <button
            className={styles.saveBtn}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>

      {saveMsg && (
        <div className={saveMsg.type === 'success' ? styles.successBanner : styles.errorBanner}>
          {saveMsg.text}
        </div>
      )}

      <div className={styles.grid}>
        {/* ── Section 1: Company Info ─────────────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Company Information</h3>
          <div className={styles.fieldGrid}>
            <label className={styles.label}>
              Company Name
              <input
                className={styles.input}
                value={form.companyName ?? ''}
                onChange={e => setField('companyName', e.target.value)}
                placeholder="e.g. ANNAM AGRITECH"
              />
            </label>
            <label className={styles.label}>
              Tagline
              <input
                className={styles.input}
                value={form.companyTagline ?? ''}
                onChange={e => setField('companyTagline', e.target.value)}
                placeholder="e.g. Empowering Agriculture Through Technology"
              />
            </label>
            <label className={styles.label}>
              Website
              <input
                className={styles.input}
                value={form.companyWebsite ?? ''}
                onChange={e => setField('companyWebsite', e.target.value)}
                placeholder="e.g. www.annamagritech.com"
              />
            </label>
          </div>
        </section>

        {/* ── Section 2: Position Details ────────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Position Details</h3>
          <div className={styles.fieldGrid}>
            <label className={styles.label}>
              Position Title
              <input
                className={styles.input}
                value={form.position ?? ''}
                onChange={e => setField('position', e.target.value)}
                placeholder="e.g. Agri Expert Intern"
              />
            </label>
            <label className={styles.label}>
              Department
              <input
                className={styles.input}
                value={form.department ?? ''}
                onChange={e => setField('department', e.target.value)}
                placeholder="e.g. Agricultural Advisory Services"
              />
            </label>
            <label className={styles.label}>
              Duration
              <input
                className={styles.input}
                value={form.duration ?? ''}
                onChange={e => setField('duration', e.target.value)}
                placeholder="e.g. 6 months (extendable based on performance)"
              />
            </label>
            <label className={styles.label}>
              Stipend
              <input
                className={styles.input}
                value={form.stipend ?? ''}
                onChange={e => setField('stipend', e.target.value)}
                placeholder="e.g. ₹15,000/month"
              />
            </label>
            <label className={styles.label}>
              Location
              <input
                className={styles.input}
                value={form.location ?? ''}
                onChange={e => setField('location', e.target.value)}
                placeholder="e.g. Hybrid (Remote + On-site training)"
              />
            </label>
            <label className={styles.label}>
              Start Date Note
              <input
                className={styles.input}
                value={form.startDateNote ?? ''}
                onChange={e => setField('startDateNote', e.target.value)}
                placeholder="e.g. To be confirmed upon acceptance"
              />
            </label>
            <label className={styles.label}>
              Accept By (days)
              <input
                className={styles.input}
                type="number"
                min={1}
                value={form.acceptByDays ?? 7}
                onChange={e => setField('acceptByDays', parseInt(e.target.value) || 7)}
              />
            </label>
          </div>
        </section>

        {/* ── Section 3: Responsibilities ────────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Key Responsibilities</h3>
          <p className={styles.sectionHint}>These appear as bullet points in the PDF.</p>
          <ul className={styles.list}>
            {respList.map((r, i) => (
              <li key={i} className={styles.listItem}>
                <span>{r}</span>
                <button className={styles.removeBtn} onClick={() => removeResp(i)} title="Remove">×</button>
              </li>
            ))}
          </ul>
          <div className={styles.addRow}>
            <input
              className={styles.input}
              value={newResp}
              onChange={e => setNewResp(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addResp())}
              placeholder="Add a responsibility…"
            />
            <button className={styles.addBtn} onClick={addResp}>Add</button>
          </div>
        </section>

        {/* ── Section 4: Terms & Conditions ──────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Terms & Conditions</h3>
          <p className={styles.sectionHint}>These appear as numbered clauses in the PDF.</p>
          <ul className={styles.list}>
            {termsList.map((t, i) => (
              <li key={i} className={styles.listItem}>
                <span>{t}</span>
                <button className={styles.removeBtn} onClick={() => removeTerm(i)} title="Remove">×</button>
              </li>
            ))}
          </ul>
          <div className={styles.addRow}>
            <input
              className={styles.input}
              value={newTerm}
              onChange={e => setNewTerm(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTerm())}
              placeholder="Add a term or condition…"
            />
            <button className={styles.addBtn} onClick={addTerm}>Add</button>
          </div>
        </section>

        {/* ── Section 5: Footer & Signature ──────────────────────────────── */}
        <section className={styles.section}>
          <h3 className={styles.sectionTitle}>Footer & Signature</h3>
          <div className={styles.fieldGrid}>
            <label className={styles.label} style={{ gridColumn: '1 / -1' }}>
              Footer Text
              <input
                className={styles.input}
                value={form.footerText ?? ''}
                onChange={e => setField('footerText', e.target.value)}
                placeholder="e.g. Annam AgriTech | Agricultural Innovation Hub | www.annamagritech.com"
              />
            </label>
            <label className={styles.label}>
              Signature Line Label
              <input
                className={styles.input}
                value={form.signatureLabel ?? ''}
                onChange={e => setField('signatureLabel', e.target.value)}
                placeholder="e.g. Candidate Signature"
              />
            </label>
          </div>
        </section>

        {/* ── Section 6: Full Template ───────────────────────────────────── */}
        <section className={styles.section} style={{ gridColumn: '1 / -1' }}>
          <h3 className={styles.sectionTitle}>Full Letter Template</h3>
          <p className={styles.sectionHint}>
            The full letter body. Use <code className={styles.code}>{'{{placeholder}}'}</code> tokens
            for dynamic values. Available tokens:
          </p>
          <div className={styles.placeholderGrid}>
            {PLACEHOLDER_HINTS.map(h => (
              <div key={h.token} className={styles.placeholderChip}>
                <code>{h.token}</code>
                <span>{h.desc}</span>
              </div>
            ))}
          </div>
          <textarea
            className={styles.templateArea}
            value={form.template ?? ''}
            onChange={e => setField('template', e.target.value)}
            rows={20}
            spellCheck={false}
          />
        </section>
      </div>

      <div className={styles.footer}>
        <button
          className={styles.saveBtn}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}
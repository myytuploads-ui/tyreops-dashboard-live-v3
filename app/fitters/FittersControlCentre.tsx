'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';

export type FitterView = {
  id: string;
  fullName: string;
  whatsappPhone: string;
  active: boolean;
  preferred: boolean;
  coverageAreas: string[];
  priority: number;
  reliabilityScore: number | null;
  completedJobs: number | null;
};

type FormState = { fullName: string; whatsappPhone: string; active: boolean; preferred: boolean; coverageTokens: string[]; coversEverywhere: boolean; priority: string; coverageDraft: string };
const emptyForm: FormState = { fullName: '', whatsappPhone: '', active: true, preferred: false, coverageTokens: [], coversEverywhere: false, priority: '100', coverageDraft: '' };

function formFor(fitter: FitterView): FormState {
  const coversEverywhere = fitter.coverageAreas.includes('ALL');
  return { fullName: fitter.fullName, whatsappPhone: fitter.whatsappPhone, active: fitter.active, preferred: fitter.preferred, coverageTokens: coversEverywhere ? [] : [...fitter.coverageAreas], coversEverywhere, priority: String(fitter.priority), coverageDraft: '' };
}

function pushCoverageToken(form: FormState, raw: string): FormState {
  const token = raw.trim().replace(/\s+/g, ' ');
  if (!token) return { ...form, coverageDraft: '' };
  const key = token.toLowerCase();
  if (form.coverageTokens.some((t) => t.toLowerCase() === key)) return { ...form, coverageDraft: '' };
  return { ...form, coverageTokens: [...form.coverageTokens, token], coverageDraft: '' };
}

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase() || 'FT';
}


export default function FittersControlCentre({ fitters, loadError }: { fitters: FitterView[]; loadError: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState<FitterView | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const active = fitters.filter((fitter) => fitter.active).length;
  const preferred = fitters.filter((fitter) => fitter.active && fitter.preferred).length;

  function openAdd() { setAdding(true); setEditing(null); setForm(emptyForm); setFeedback(null); }
  function openEdit(fitter: FitterView) { setEditing(fitter); setAdding(false); setForm(formFor(fitter)); setFeedback(null); }
  function closeEditor() { if (!busyId) { setEditing(null); setAdding(false); } }

  async function request(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>) {
    const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null;
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'The fitter change could not be saved.');
  }

  async function saveEditor() {
    const key = editing?.id || 'new';
    setBusyId(key); setFeedback(null);
    const coverageAreas = form.coversEverywhere ? ['ALL'] : form.coverageTokens;
    const body = { full_name: form.fullName, whatsapp_phone: form.whatsappPhone, active: form.active, preferred: form.preferred, coverage_areas: coverageAreas, priority_level: Number(form.priority) };
    try {
      await request(editing ? `/api/fitters/${editing.id}` : '/api/fitters', editing ? 'PATCH' : 'POST', body);
      setEditing(null); setAdding(false);
      setFeedback({ type: 'success', text: editing ? 'Fitter details updated.' : 'Fitter added.' });
      router.refresh();
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'The fitter change could not be saved.' });
    } finally { setBusyId(null); }
  }

  async function quickUpdate(fitter: FitterView, changes: { active?: boolean; preferred?: boolean }) {
    if (changes.active === false && !window.confirm('Deactivate this fitter? TyreOps will block the change if they have pending offers or an assigned/in-progress job.')) return;
    setBusyId(fitter.id); setFeedback(null);
    try {
      await request(`/api/fitters/${fitter.id}`, 'PATCH', changes);
      setFeedback({ type: 'success', text: changes.active === false ? 'Fitter deactivated.' : changes.active === true ? 'Fitter activated.' : 'Fitter category updated.' });
      router.refresh();
    } catch (error) {
      setFeedback({ type: 'error', text: error instanceof Error ? error.message : 'The fitter change could not be saved.' });
    } finally { setBusyId(null); }
  }

  return <>
    <PageHeader title="Your people." subtitle="A trusted fitter, one tap away." right={<button className="btn primary" type="button" onClick={openAdd}>Add fitter</button>} />
    <div className="opsStrip fitterOpsStrip">
      <div className="opsChip"><span>Total network</span><strong>{fitters.length}</strong></div>
      <div className="opsChip"><span>Active now</span><strong className="good">{active}</strong></div>
      <div className="opsChip"><span>Preferred active</span><strong>{preferred}</strong></div>
      <div className="opsChip"><span>Inactive</span><strong>{fitters.length - active}</strong></div>
    </div>
    {loadError ? <div className="error">{loadError}</div> : null}
    {feedback ? <div className={feedback.type === 'error' ? 'error fitterFeedback' : 'fitterFeedback success'} role="status">{feedback.text}</div> : null}
    {!fitters.length && !loadError ? <div className="emptyState"><strong>No fitters found</strong><span>Add the first fitter when their operational details are ready.</span></div> : <div className="fitterControlGrid">
      {fitters.map((fitter) => <article className={`fitterControlCard ${fitter.active ? 'active' : 'inactive'}`} key={fitter.id}>
        <div className="fitterControlTop"><div className="fitterIdentity"><div className="fitterAvatar">{initials(fitter.fullName)}</div><div><strong>{fitter.fullName}</strong><span>{fitter.whatsappPhone || 'No WhatsApp number'}</span></div></div><div className="fitterBadges"><span className={`fitterState ${fitter.active ? 'active' : 'inactive'}`}>{fitter.active ? 'Active' : 'Inactive'}</span><span className={`fitterTier ${fitter.preferred ? 'preferred' : ''}`}>{fitter.preferred ? 'Preferred' : 'General'}</span></div></div>
        <div className="atelierContactActions">{fitter.whatsappPhone && <><a className="atelierButton" href={`tel:${fitter.whatsappPhone.replace(/[^+0-9]/g,'')}`}>Call</a><a className="atelierButton" href={`https://wa.me/${fitter.whatsappPhone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer">WhatsApp ↗</a></>}</div>
        <div className="fitterCoverage"><span>Coverage</span>{fitter.coverageAreas.includes('ALL') ? <strong>All service areas</strong> : fitter.coverageAreas.length ? <div className="coverageChips">{fitter.coverageAreas.map((area) => <span className="coverageChip" key={area}>{area}</span>)}</div> : <strong>No coverage recorded</strong>}</div>
        <div className="fitterActions"><button type="button" onClick={() => openEdit(fitter)} disabled={busyId !== null}>Edit details</button><button type="button" onClick={() => void quickUpdate(fitter, { preferred: !fitter.preferred })} disabled={busyId !== null}>{fitter.preferred ? 'Make general' : 'Make preferred'}</button><button className={fitter.active ? 'danger' : 'activate'} type="button" onClick={() => void quickUpdate(fitter, { active: !fitter.active })} disabled={busyId !== null}>{busyId === fitter.id ? 'Checking…' : fitter.active ? 'Deactivate' : 'Activate'}</button></div>
      </article>)}
    </div>}

    {adding || editing ? <div className="fitterModalBackdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) closeEditor(); }}><section className="fitterEditor" role="dialog" aria-modal="true" aria-labelledby="fitter-editor-title">
      <div className="fitterEditorHead"><div><h2 id="fitter-editor-title">{editing ? 'Edit fitter' : 'Add fitter'}</h2><p>Only operational dispatch details are editable.</p></div><button type="button" onClick={closeEditor} aria-label="Close">×</button></div>
      <div className="fitterFormGrid">
        <label><span>Full name</span><input value={form.fullName} maxLength={120} onChange={(event) => setForm({ ...form, fullName: event.target.value })} /></label>
        <label><span>WhatsApp number</span><input inputMode="tel" value={form.whatsappPhone} placeholder="447700900000" onChange={(event) => setForm({ ...form, whatsappPhone: event.target.value })} /><small>International digits including country code.</small></label>
        <label><span>Priority</span><input type="number" min="1" max="999" value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} /><small>Lower numbers are contacted first.</small></label>
        <div className="fitterChoiceGroup"><span>Availability</span><button className={form.active ? 'selected' : ''} type="button" onClick={() => setForm({ ...form, active: true })}>Active</button><button className={!form.active ? 'selected' : ''} type="button" onClick={() => setForm({ ...form, active: false })}>Inactive</button></div>
        <div className="fitterChoiceGroup"><span>Fitter type</span><button className={form.preferred ? 'selected' : ''} type="button" onClick={() => setForm({ ...form, preferred: true })}>Preferred</button><button className={!form.preferred ? 'selected' : ''} type="button" onClick={() => setForm({ ...form, preferred: false })}>General</button></div>
        <div className="fitterCoverageEditor"><label className="coversEverywhere"><input type="checkbox" checked={form.coversEverywhere} onChange={(event) => setForm({ ...form, coversEverywhere: event.target.checked, coverageTokens: event.target.checked ? [] : form.coverageTokens })} /><span>Covers every service area</span></label>{!form.coversEverywhere ? <div className="coverageChipEditor"><span>Coverage areas</span><div className="coverageChips">{form.coverageTokens.map((token) => <span className="coverageChip" key={token}>{token}<button type="button" aria-label={`Remove ${token}`} onClick={() => setForm({ ...form, coverageTokens: form.coverageTokens.filter((t) => t !== token) })}>x</button></span>)}</div><div className="coverageChipInputRow"><input value={form.coverageDraft} placeholder="UB5, Birmingham, M..." onChange={(event) => setForm({ ...form, coverageDraft: event.target.value })} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); setForm((prev) => pushCoverageToken(prev, prev.coverageDraft.replace(/,/g, ''))); } }} /><button type="button" className="btn" onClick={() => setForm((prev) => pushCoverageToken(prev, prev.coverageDraft))}>Add</button></div><small>Postcode prefixes or city names. Tap x to remove.</small></div> : null}</div>
      </div>
      {feedback?.type === 'error' ? <div className="error">{feedback.text}</div> : null}
      <div className="fitterEditorActions"><button className="btn" type="button" onClick={closeEditor} disabled={busyId !== null}>Cancel</button><button className="btn primary" type="button" onClick={() => void saveEditor()} disabled={busyId !== null}>{busyId ? 'Saving...' : editing ? 'Save changes' : 'Add fitter'}</button></div>
    </section></div> : null}
  </>;
}

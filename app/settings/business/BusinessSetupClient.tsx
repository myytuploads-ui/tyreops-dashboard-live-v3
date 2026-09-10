'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { onboardingStages, readinessKeys, ruleCatalog, setupSections } from '@/lib/business-setup/catalog';

type Row = Record<string, any>;
type Field = { key: string; label: string; type?: 'text' | 'textarea' | 'number' | 'select'; options?: Array<[string, string]>; hint?: string };

const setupStatuses: Array<[string, string]> = [['pending', 'Pending'], ['in_progress', 'In progress'], ['confirmed', 'Confirmed'], ['blocked', 'Blocked'], ['not_applicable', 'Not applicable']];
const responsibleOptions: Array<[string, string]> = [['owner', 'Owner'], ['tyreops', 'TyreOps'], ['both', 'Both'], ['external_provider', 'External provider']];
const priorityOptions: Array<[string, string]> = [['required_before_pilot', 'Required before pilot'], ['required_before_handover', 'Required before handover'], ['recommended', 'Recommended'], ['optional', 'Optional']];
const connectionStatuses: Array<[string, string]> = [['unknown', 'Unknown'], ['not_started', 'Not started'], ['in_progress', 'In progress'], ['confirmed', 'Confirmed'], ['blocked', 'Blocked'], ['not_applicable', 'Not applicable']];

const profileFields: Record<string, Field[]> = {
  business: [
    { key: 'business_name', label: 'Business name' }, { key: 'owner_name', label: 'Owner name' },
    { key: 'customer_description', label: 'Customer-facing business description', type: 'textarea' },
    { key: 'coverage_notes', label: 'Coverage notes', type: 'textarea' }, { key: 'operating_hours_notes', label: 'Operating hours notes', type: 'textarea' },
    { key: 'general_notes', label: 'General notes', type: 'textarea' },
  ],
  whatsapp: [
    { key: 'customer_whatsapp_number', label: 'Primary business WhatsApp number', hint: 'Number only; never enter an access token.' },
    { key: 'whatsapp_type', label: 'Current WhatsApp type', type: 'select', options: [['unknown', 'Unknown'], ['whatsapp_business_app', 'WhatsApp Business App'], ['cloud_api', 'Cloud API'], ['coexistence', 'Coexistence'], ['other', 'Other']] },
    { key: 'whatsapp_setup_status', label: 'WhatsApp setup status', type: 'select', options: connectionStatuses },
  ],
  meta: [{ key: 'meta_setup_status', label: 'Meta setup status', type: 'select', options: connectionStatuses }],
  telegram: [{ key: 'telegram_setup_status', label: 'Telegram setup status', type: 'select', options: connectionStatuses }],
  pricing: [
    { key: 'pricing_mode', label: 'Pricing mode', type: 'select', options: [['unknown', 'Unknown'], ['manual_owner_pricing', 'Manual owner pricing'], ['price_list', 'Price list'], ['supplier_lookup', 'Supplier lookup'], ['rules_based', 'Rules-based'], ['hybrid', 'Hybrid']] },
    { key: 'pricing_source', label: 'Pricing source/provider' }, { key: 'pricing_notes', label: 'Pricing notes', type: 'textarea' },
  ],
  fitters_dispatch: [
    { key: 'preferred_dispatch_mode', label: 'Preferred dispatch model', type: 'select', options: [['undecided', 'Undecided'], ['group_first', 'Group first'], ['registered_fitters_first', 'Registered fitters first'], ['hybrid', 'Hybrid']] },
    { key: 'group_dispatch_wait_minutes', label: 'Group wait/reminder time (minutes)', type: 'number' },
    { key: 'owner_first_refusal_minutes', label: 'Owner-first-refusal duration (minutes)', type: 'number' },
  ],
};

function captured(value: unknown): Row { return value && typeof value === 'object' ? value as Row : {}; }
function answerOf(value: unknown) { return typeof captured(value).answer === 'string' ? captured(value).answer : ''; }
function captureOf(item: Row, key: string, fallback = '') { const value = captured(item.captured_value)[key]; return typeof value === 'string' ? value : fallback; }
function boolCapture(item: Row, key: string) { return captured(item.captured_value)[key] === true; }
function patchCaptured(item: Row, key: string, value: string | boolean) { return { ...captured(item.captured_value), [key]: value }; }
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function anchor(stage: string) { return `stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }

export default function BusinessSetupClient() {
  const [profile, setProfile] = useState<Row | null>(null);
  const [onboarding, setOnboarding] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<Record<string, string>>({});
  const [meetingMode, setMeetingMode] = useState(false);
  const [meetingIndex, setMeetingIndex] = useState(0);
  const [meetingAnswer, setMeetingAnswer] = useState('');
  const [meetingNotes, setMeetingNotes] = useState('');
  const [meetingError, setMeetingError] = useState('');
  const [meetingMoreOpen, setMeetingMoreOpen] = useState(false);
  const applyData = useCallback((result: Row) => { setProfile(result.profile); setOnboarding(result.onboarding || []); setRules(result.rules || []); }, []);
  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/business-setup', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Onboarding could not be loaded.');
      applyData(result); setLoadError('');
    } catch (error) { setLoadError(error instanceof Error ? error.message : 'Onboarding could not be loaded.'); }
    finally { setLoading(false); }
  }, [applyData]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const saved = Number(window.localStorage.getItem('tyreops_meeting_index') || '0');
    if (Number.isFinite(saved) && saved >= 0) setMeetingIndex(Math.floor(saved));
  }, []);
  useEffect(() => {
    window.localStorage.setItem('tyreops_meeting_index', String(meetingIndex));
  }, [meetingIndex]);

  async function save(key: string, body: Row) {
    if (saveState[key] === 'saving') return;
    setSaveState((state) => ({ ...state, [key]: 'saving' }));
    try {
      const response = await fetch('/api/business-setup', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      applyData(result);
      setSaveState((state) => ({ ...state, [key]: 'saved' }));
      window.setTimeout(() => setSaveState((state) => ({ ...state, [key]: '' })), 2200);
    } catch (error) { setSaveState((state) => ({ ...state, [key]: error instanceof Error ? error.message : 'Save failed.' })); }
  }
  function patchItem(itemKey: string, values: Row) { setOnboarding((rows) => rows.map((row) => row.item_key === itemKey ? { ...row, ...values } : row)); }
  function patchRule(ruleKey: string, values: Row) { setRules((rows) => rows.map((row) => row.rule_key === ruleKey ? { ...row, ...values } : row)); }

  const completed = onboarding.filter((item) => item.status === 'confirmed' || item.status === 'not_applicable').length;
  const progress = onboarding.length ? Math.round((completed / onboarding.length) * 100) : 0;
  const itemMap = useMemo(() => new Map(onboarding.map((item) => [item.item_key, item])), [onboarding]);
  const readinessMissing = readinessKeys.filter((key) => !['confirmed', 'not_applicable'].includes(itemMap.get(key)?.status));
  const readinessBlocked = readinessMissing.some((key) => itemMap.get(key)?.status === 'blocked');
  const realJobComplete = itemMap.get('controlled_real_job_completed')?.status === 'confirmed';
  const pilotState = readinessMissing.length === 0 && realJobComplete ? 'Live' : readinessMissing.length === 0 ? 'Ready for controlled pilot' : readinessBlocked ? 'Ready with blockers' : 'Onboarding';
  const needsOwnerAll = onboarding.filter((item) => ['pending', 'in_progress'].includes(item.status) && ['owner', 'both', 'external_provider'].includes(captureOf(item, 'responsible', 'owner')));
  const needsOwner = needsOwnerAll.slice(0, 8);
  const needsTyreOps = onboarding.filter((item) => ['pending', 'in_progress'].includes(item.status) && ['tyreops', 'both'].includes(captureOf(item, 'responsible', 'owner'))).slice(0, 8);
  const blockedItemsAll = onboarding.filter((item) => item.status === 'blocked');
  const blockedItems = blockedItemsAll.slice(0, 8);
  const pilotBlockersAll = onboarding.filter((item) => !['confirmed', 'not_applicable'].includes(item.status) && captureOf(item, 'priority') === 'required_before_pilot');
  const pilotBlockers = pilotBlockersAll.slice(0, 8);
  const integrations = onboarding.filter((item) => item.item_key?.startsWith('integration_'));
  const meetingItems = [...pilotBlockersAll, ...needsOwnerAll, ...blockedItemsAll].filter((item, index, rows) => rows.findIndex((row) => row.item_key === item.item_key) === index);
  const meetingCount = meetingItems.length;
  const clampedMeetingIndex = meetingCount === 0 ? 0 : Math.min(Math.max(0, meetingIndex), meetingCount);
  const currentMeetingItem = clampedMeetingIndex < meetingCount ? meetingItems[clampedMeetingIndex] : null;
  const confirmedItems = onboarding.filter((item) => item.status === 'confirmed' || item.status === 'not_applicable');
  const ownerStillNeeded = onboarding.filter((item) => !['confirmed', 'not_applicable'].includes(item.status) && ['owner', 'both', 'external_provider'].includes(captureOf(item, 'responsible', 'owner')));

  useEffect(() => {
    if (meetingCount === 0) {
      if (meetingIndex !== 0) setMeetingIndex(0);
      return;
    }
    if (meetingIndex < 0) setMeetingIndex(0);
    else if (meetingIndex > meetingCount) setMeetingIndex(meetingCount);
  }, [meetingCount, meetingIndex]);

  useEffect(() => {
    if (!currentMeetingItem) {
      setMeetingAnswer('');
      setMeetingNotes('');
      setMeetingError('');
      setMeetingMoreOpen(false);
      return;
    }
    setMeetingAnswer(answerOf(currentMeetingItem.captured_value));
    setMeetingNotes('');
    setMeetingError('');
    setMeetingMoreOpen(false);
  }, [currentMeetingItem?.item_key]);

  function advanceMeeting() {
    setMeetingIndex((index) => Math.min(index + 1, meetingCount));
  }

  async function meetingAction(status: string, options?: { requireAnswer?: boolean }) {
    if (!currentMeetingItem) return;
    const answer = meetingAnswer.trim();
    if (options?.requireAnswer && !answer) {
      setMeetingError('Capture a real answer before Save & Continue.');
      return;
    }
    setMeetingError('');
    const nextCaptured = { ...captured(currentMeetingItem.captured_value), ...(answer ? { answer } : {}) };
    await save(`item:${currentMeetingItem.item_key}`, {
      entity: 'onboarding',
      item_key: currentMeetingItem.item_key,
      status,
      captured_value: nextCaptured,
      notes: [currentMeetingItem.notes, meetingNotes.trim()].filter(Boolean).join('\n'),
    });
    setMeetingNotes('');
    setMeetingMoreOpen(false);
    advanceMeeting();
  }

  function sectionState(section: string) {
    const rows = onboarding.filter((item) => item.section === section);
    if (!rows.length) return ['needs', 'Needs info'];
    if (rows.every((item) => item.status === 'not_applicable')) return ['na', 'Not applicable'];
    if (rows.some((item) => item.status === 'blocked')) return ['blocked', 'Blocked'];
    if (rows.every((item) => ['confirmed', 'not_applicable'].includes(item.status))) return ['confirmed', 'Confirmed'];
    if (rows.some((item) => ['confirmed', 'in_progress'].includes(item.status))) return ['progress', 'In progress'];
    return ['needs', 'Needs info'];
  }

  if (loading) return <div className="businessSetupLoading">Loading onboarding...</div>;
  if (loadError || !profile) return <div className="error">{loadError || 'Onboarding is unavailable.'}</div>;

  return <div className="businessSetup">
    <header className="businessSetupHero">
      <div><span>Owner onboarding & handover</span><h1>Onboarding & Handover Control Centre</h1><p>Setup, account ownership, integrations, training and pilot readiness. Unknown information stays unknown until the owner confirms it.</p></div>
      <div className="setupProgress"><strong>TyreOps Setup - {progress}%</strong><div><i style={{ width: `${progress}%` }} /></div><span>{completed} of {onboarding.length} checklist items complete</span></div>
    </header>
    <section className={`pilotReadiness ${readinessBlocked ? 'blocked' : ''}`}><div><span>Pilot readiness</span><h2>{pilotState}</h2><p>{readinessMissing.length ? `${readinessMissing.length} core item${readinessMissing.length === 1 ? '' : 's'} still need attention.` : realJobComplete ? 'Core setup and controlled live-job validation are complete.' : 'Core setup is ready. A controlled real job remains the next live milestone.'}</p></div><div className="readinessBlockers">{readinessMissing.slice(0, 6).map((key) => <span key={key}>{itemMap.get(key)?.label || pretty(key)}</span>)}</div></section>
    <section className="meetingModeCard">
      <div><span>Meeting mode</span><strong>{currentMeetingItem ? currentMeetingItem.label : 'No owner questions waiting'}</strong><p>{currentMeetingItem ? captureOf(currentMeetingItem, 'explanation') : 'Pilot-critical and owner-responsible items are clear.'}</p></div>
      <button className="btn primary" type="button" onClick={() => setMeetingMode((value) => !value)}>{meetingMode ? 'Show Full Setup' : 'Start Meeting Mode'}</button>
    </section>
    {meetingMode ? <section className="meetingModeFocus">{currentMeetingItem ? <>
      <div className="meetingQuestion"><span>{clampedMeetingIndex + 1} of {meetingCount}</span><h2>{currentMeetingItem.label}</h2><p>{captureOf(currentMeetingItem, 'explanation') || 'Capture the owner answer or mark what should happen next.'}</p></div>
      <div className="meetingSimpleForm">
        <label className="meetingAnswer"><span>Answer</span><input value={meetingAnswer} onChange={(event) => { setMeetingAnswer(event.target.value); if (meetingError) setMeetingError(''); }} placeholder="Owner answer - required to save" /></label>
        <label className="meetingNotes"><span>Short notes</span><textarea rows={2} value={meetingNotes} onChange={(event) => setMeetingNotes(event.target.value)} placeholder="Optional non-secret notes" /></label>
        {meetingError ? <p className="meetingError">{meetingError}</p> : null}
        <SaveState state={saveState[`item:${currentMeetingItem.item_key}`]} />
      </div>
      <div className="meetingActions">
        <button className="btn primary meetingPrimary" type="button" disabled={saveState[`item:${currentMeetingItem.item_key}`] === 'saving'} onClick={() => void meetingAction('confirmed', { requireAnswer: true })}>Save & Continue</button>
        <div className={`meetingOverflow${meetingMoreOpen ? ' open' : ''}`}>
          <button className="btn meetingSecondary" type="button" aria-expanded={meetingMoreOpen} onClick={() => setMeetingMoreOpen((open) => !open)}>More</button>
          {meetingMoreOpen ? <div className="meetingOverflowMenu" role="menu">
            <button className="btn" type="button" role="menuitem" onClick={() => { setMeetingMoreOpen(false); advanceMeeting(); }}>Skip for Later</button>
            <button className="btn" type="button" role="menuitem" onClick={() => void meetingAction('blocked')}>Blocked</button>
            <button className="btn" type="button" role="menuitem" onClick={() => void meetingAction('not_applicable')}>Not Applicable</button>
          </div> : null}
        </div>
        <div className="meetingTertiary">
          <button className="btn meetingQuiet" type="button" disabled={clampedMeetingIndex === 0} onClick={() => setMeetingIndex((index) => Math.max(0, index - 1))}>Back</button>
          <button className="btn meetingQuiet" type="button" onClick={() => setMeetingMode(false)}>Exit</button>
        </div>
      </div>
    </> : <div className="meetingSummary"><h2>Onboarding Summary</h2><div className="handoverQueues"><div className="handoverQueue"><h2>Confirmed</h2><p>{confirmedItems.length} items</p></div><div className="handoverQueue"><h2>Still Need From Owner</h2><p>{ownerStillNeeded.length} items</p></div><div className="handoverQueue"><h2>Needs TyreOps</h2><p>{needsTyreOps.length} items</p></div><div className="handoverQueue"><h2>Blocked</h2><p>{blockedItemsAll.length} items</p></div></div><strong>Ready for Pilot: {readinessMissing.length === 0 ? 'YES' : 'NO'}</strong><button className="btn meetingQuiet" type="button" onClick={() => { setMeetingIndex(0); setMeetingMode(false); }}>Exit Meeting Mode</button></div>}</section> : null}
    <section className="handoverQueues">{[['Needs Owner', needsOwner], ['Needs TyreOps', needsTyreOps], ['Blocked', blockedItems], ['Pilot blockers', pilotBlockers]].map(([title, rows]) => <div className="handoverQueue" key={title as string}><h2>{title as string}</h2>{(rows as Row[]).length ? (rows as Row[]).map((item) => <a href={`#setup-${item.section}`} key={item.item_key}><strong>{item.label}</strong><span>{pretty(captureOf(item, 'priority') || 'required_before_pilot')}</span></a>) : <p>Clear</p>}</div>)}</section>
    <section className="stageProgressGrid">{onboardingStages.map((stage) => { const rows = onboarding.filter((item) => captureOf(item, 'stage') === stage); const done = rows.filter((item) => ['confirmed', 'not_applicable'].includes(item.status)).length; const pct = rows.length ? Math.round((done / rows.length) * 100) : 0; return <a href={`#${anchor(stage)}`} key={stage}><strong>{stage}</strong><span>{done}/{rows.length}</span><i><b style={{ width: `${pct}%` }} /></i></a>; })}</section>
    {integrations.length ? <section className="integrationInventory" id={anchor('APIs & Integrations')}><div className="setupSubhead"><div><h2>Integration Inventory</h2><p>Credential status only. Never enter passwords, API keys, access tokens or secrets.</p></div></div><div className="integrationGrid">{integrations.map((item) => <article className="integrationCard" key={item.item_key}><div><strong>{item.label}</strong><span>{captureOf(item, 'integration_purpose')}</span></div><dl><div><dt>Owner</dt><dd>{captureOf(item, 'integration_owner')}</dd></div><div><dt>Credential location</dt><dd>{captureOf(item, 'credential_location')}</dd></div><div><dt>Billing</dt><dd>{captureOf(item, 'billing_responsibility')}</dd></div><div><dt>Identifier</dt><dd>{captureOf(item, 'non_secret_identifier') || 'Not recorded'}</dd></div></dl><div className="integrationFlags"><span className={boolCapture(item, 'connected') ? 'confirmed' : 'needs'}>Connected</span><span className={boolCapture(item, 'production') ? 'confirmed' : 'needs'}>Production</span><span className={boolCapture(item, 'tested') ? 'confirmed' : 'needs'}>Tested</span></div></article>)}</div></section> : null}
    <nav className="setupSectionGrid" aria-label="Onboarding sections">{setupSections.map(([key, label]) => { const state = sectionState(key); return <a href={`#setup-${key}`} key={key}><strong>{label}</strong><span className={state[0]}>{state[1]}</span></a>; })}</nav>
    {!meetingMode ? <div className="setupSections">{setupSections.map(([sectionKey, sectionLabel], sectionIndex) => <SetupSection key={sectionKey} sectionKey={sectionKey} sectionLabel={sectionLabel} sectionIndex={sectionIndex} profile={profile} setProfile={setProfile} onboarding={onboarding} patchItem={patchItem} rules={rules} patchRule={patchRule} save={save} saveState={saveState} sectionState={sectionState} />)}</div> : null}
  </div>;
}

function SetupSection({ sectionKey, sectionLabel, sectionIndex, profile, setProfile, onboarding, patchItem, rules, patchRule, save, saveState, sectionState }: Row) {
  const sectionItems = onboarding.filter((item: Row) => item.section === sectionKey);
  const state = sectionState(sectionKey);
  const fields = profileFields[sectionKey] || [];
  return <details className="setupSection" id={`setup-${sectionKey}`} open={sectionIndex === 0}>
    <summary><div><span>{String(sectionIndex + 1).padStart(2, '0')}</span><strong>{sectionLabel}</strong></div><em className={state[0]}>{state[1]}</em></summary>
    <div className="setupSectionBody">
      {fields.length ? <section className="profileEditor"><div className="setupSubhead"><div><h3>{sectionLabel} details</h3><p>Blank fields remain unknown. Save partial information at any time.</p></div><SaveState state={saveState[`profile:${sectionKey}`]} /></div><div className="profileFieldGrid">{fields.map((field: Field) => <label className={field.type === 'textarea' ? 'wide' : ''} key={field.key}><span>{field.label}</span>{field.type === 'select' ? <select value={profile[field.key] ?? ''} onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select> : field.type === 'textarea' ? <textarea value={profile[field.key] ?? ''} onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })} rows={4} /> : <input type={field.type || 'text'} value={profile[field.key] ?? ''} onChange={(event) => setProfile({ ...profile, [field.key]: field.type === 'number' ? (event.target.value === '' ? '' : Number(event.target.value)) : event.target.value })} />}{field.hint ? <small>{field.hint}</small> : null}</label>)}</div><button className="btn primary saveSetup" type="button" onClick={() => void save(`profile:${sectionKey}`, { entity: 'profile', values: Object.fromEntries(fields.map((field: Field) => [field.key, profile[field.key] ?? ''])) })} disabled={saveState[`profile:${sectionKey}`] === 'saving'}>Save {sectionLabel} details</button></section> : null}
      {sectionKey === 'customer_ai' ? <RuleEditor rules={rules} patchRule={patchRule} save={save} saveState={saveState} /> : null}
      <section className="checklistEditor"><div className="setupSubhead"><div><h3>{sectionLabel} checklist</h3><p>Capture status, responsibility, owner answers and non-secret evidence.</p></div></div><div className="setupItemList">{sectionItems.map((item: Row) => <ChecklistItem key={item.item_key} item={item} patchItem={patchItem} save={save} saveState={saveState} />)}</div></section>
    </div>
  </details>;
}

function ChecklistItem({ item, patchItem, save, saveState }: { item: Row; patchItem: (key: string, values: Row) => void; save: (key: string, body: Row) => Promise<void>; saveState: Record<string, string> }) {
  return <article className={`setupItem status-${item.status}`} id={anchor(captureOf(item, 'stage') || 'Pilot / Live')}>
    <div className="setupItemTop"><div><strong>{item.label}</strong><p>{captureOf(item, 'explanation')}</p></div><SaveState state={saveState[`item:${item.item_key}`]} /></div>
    <div className="setupItemFields">
      <label><span>Status</span><select value={item.status} onChange={(event) => patchItem(item.item_key, { status: event.target.value })}>{setupStatuses.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Responsible</span><select value={captureOf(item, 'responsible', 'owner')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'responsible', event.target.value) })}>{responsibleOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Priority</span><select value={captureOf(item, 'priority', 'required_before_pilot')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'priority', event.target.value) })}>{priorityOptions.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label><span>Answer / value</span><input value={answerOf(item.captured_value)} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'answer', event.target.value) })} placeholder="Unknown until captured" /></label>
      <label><span>Evidence / reference</span><input value={captureOf(item, 'evidence_reference')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'evidence_reference', event.target.value) })} placeholder="Non-secret reference only" /></label>
      <label><span>Action required</span><input value={captureOf(item, 'action_required')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'action_required', event.target.value) })} placeholder="Next action" /></label>
      {item.item_key?.startsWith('integration_') ? <div className="integrationChecks"><label><input type="checkbox" checked={boolCapture(item, 'connected')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'connected', event.target.checked) })} /> Connected</label><label><input type="checkbox" checked={boolCapture(item, 'production')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'production', event.target.checked) })} /> Production</label><label><input type="checkbox" checked={boolCapture(item, 'tested')} onChange={(event) => patchItem(item.item_key, { captured_value: patchCaptured(item, 'tested', event.target.checked) })} /> Tested</label></div> : null}
      <label className="wide"><span>Notes</span><textarea rows={2} value={item.notes || ''} onChange={(event) => patchItem(item.item_key, { notes: event.target.value })} placeholder="Follow-up context. No secrets." /></label>
    </div>
    <div className="completionStamp">{item.confirmed_at ? `Completed ${new Date(item.confirmed_at).toLocaleString('en-GB')}` : 'Not completed yet'}</div>
    <button type="button" className="btn saveItem" disabled={saveState[`item:${item.item_key}`] === 'saving'} onClick={() => void save(`item:${item.item_key}`, { entity: 'onboarding', item_key: item.item_key, status: item.status, captured_value: captured(item.captured_value), notes: item.notes || null })}>Save item</button>
  </article>;
}

function SaveState({ state }: { state?: string }) { if (!state) return null; return <span className={`setupSaveState ${state === 'saved' ? 'saved' : state === 'saving' ? 'saving' : 'failed'}`}>{state === 'saving' ? 'Saving...' : state === 'saved' ? 'Saved' : state}</span>; }

function RuleEditor({ rules, patchRule, save, saveState }: { rules: Row[]; patchRule: (key: string, values: Row) => void; save: (key: string, body: Row) => Promise<void>; saveState: Record<string, string> }) {
  const definitions = new Map(ruleCatalog.map((rule) => [rule.rule_key, rule]));
  const grouped = new Map<string, Row[]>();
  for (const rule of rules) grouped.set(rule.category, [...(grouped.get(rule.category) || []), rule]);
  return <section className="ruleEditor"><div className="setupSubhead"><div><h3>Owner-confirmed customer AI rules</h3><p>AI can only use a known answer when owner confirmed and AI may use are both enabled.</p></div></div>{[...grouped.entries()].map(([category, categoryRules]) => <div className="ruleGroup" key={category}><h4>{category}</h4>{categoryRules.map((rule) => { const answer = answerOf(rule.structured_value) || 'unknown'; const label = definitions.get(rule.rule_key)?.label || pretty(rule.rule_key); return <article className="businessRule" key={rule.rule_key}><div className="setupItemTop"><strong>{label}</strong><SaveState state={saveState[`rule:${rule.rule_key}`]} /></div><div className="ruleAnswers">{['yes', 'no', 'depends', 'unknown'].map((value) => <button type="button" className={answer === value ? 'active' : ''} onClick={() => patchRule(rule.rule_key, { structured_value: { answer: value }, ...(value === 'unknown' ? { ai_may_use: false } : {}) })} key={value}>{pretty(value)}</button>)}</div><div className="ruleChecks"><label><input type="checkbox" checked={Boolean(rule.owner_confirmed)} onChange={(event) => patchRule(rule.rule_key, { owner_confirmed: event.target.checked, ...(!event.target.checked ? { ai_may_use: false } : {}) })} /> Owner confirmed</label><label className={!rule.owner_confirmed || answer === 'unknown' ? 'disabled' : ''}><input type="checkbox" checked={Boolean(rule.ai_may_use)} disabled={!rule.owner_confirmed || answer === 'unknown'} onChange={(event) => patchRule(rule.rule_key, { ai_may_use: event.target.checked })} /> AI may use</label></div><label className="ruleNotes"><span>Notes</span><textarea rows={2} value={rule.notes || ''} onChange={(event) => patchRule(rule.rule_key, { notes: event.target.value })} /></label><button type="button" className="btn saveItem" disabled={saveState[`rule:${rule.rule_key}`] === 'saving'} onClick={() => void save(`rule:${rule.rule_key}`, { entity: 'rule', rule_key: rule.rule_key, answer, owner_confirmed: Boolean(rule.owner_confirmed), ai_may_use: Boolean(rule.ai_may_use), notes: rule.notes || '' })}>Save rule</button></article>; })}</div>)}</section>;
}

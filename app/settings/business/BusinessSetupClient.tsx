'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { onboardingStages, readinessKeys, ruleCatalog, setupSections } from '@/lib/business-setup/catalog';

type Row = Record<string, any>;
type Field = { key: string; label: string; type?: 'text' | 'textarea' | 'number' | 'select'; options?: Array<[string, string]>; hint?: string };
type MeetingSource = 'profile' | 'launch';
type MeetingInputType = 'text' | 'tel' | 'number' | 'textarea' | 'select' | 'url';
type MeetingField = {
  id: string;
  source: MeetingSource;
  key: string;
  label: string;
  effect: string;
  type: MeetingInputType;
  options?: Array<[string, string]>;
  placeholder?: string;
  hint?: string;
  pilot: boolean;
  empty?: string[];
};

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

/** Operational Meeting Mode queue — only fields that write to live profile / system_config. */
const meetingConfigFields: MeetingField[] = [
  { id: 'business_name', source: 'profile', key: 'business_name', label: 'Business name', effect: 'Sets the Rescue Tyres identity used on the dashboard and customer-facing copy.', type: 'text', placeholder: 'e.g. Rescue Tyres', pilot: true },
  { id: 'owner_name', source: 'profile', key: 'owner_name', label: 'Owner name', effect: 'Names the owner for alerts, handover and operational ownership.', type: 'text', placeholder: 'Owner full name', pilot: true },
  { id: 'customer_whatsapp_number', source: 'profile', key: 'customer_whatsapp_number', label: 'Business WhatsApp number', effect: 'This is the production customer WhatsApp number TyreOps connects to for inbound/outbound jobs.', type: 'tel', placeholder: '+44…', hint: 'Digits only (optional +). Never paste tokens or secrets.', pilot: true },
  { id: 'whatsapp_type', source: 'profile', key: 'whatsapp_type', label: 'WhatsApp setup type', effect: 'Tells setup which WhatsApp path is live (Business App / Cloud API / coexistence).', type: 'select', options: [['unknown', 'Unknown'], ['whatsapp_business_app', 'WhatsApp Business App'], ['cloud_api', 'Cloud API'], ['coexistence', 'Coexistence'], ['other', 'Other']], empty: ['', 'unknown'], pilot: true },
  { id: 'coverage_notes', source: 'profile', key: 'coverage_notes', label: 'Service area / coverage', effect: 'Defines where jobs are accepted so AI and ops do not promise out-of-area work.', type: 'textarea', placeholder: 'Areas covered and areas not covered', pilot: true },
  { id: 'operating_hours_notes', source: 'profile', key: 'operating_hours_notes', label: 'Operating hours', effect: 'Drives hours / out-of-hours wording for customer replies and owner expectations.', type: 'textarea', placeholder: 'e.g. 24/7 roadside, or Mon–Sat 8–8…', pilot: true },
  { id: 'customer_description', source: 'profile', key: 'customer_description', label: 'What the AI should say this business does', effect: 'Customer AI uses this description when explaining Rescue Tyres to drivers.', type: 'textarea', placeholder: 'Short customer-facing description', pilot: true },
  { id: 'pricing_mode', source: 'profile', key: 'pricing_mode', label: 'How jobs are priced in pilot', effect: 'Sets the pricing path jobs follow (manual owner price vs list / rules / hybrid).', type: 'select', options: [['unknown', 'Unknown'], ['manual_owner_pricing', 'Manual owner pricing'], ['price_list', 'Price list'], ['supplier_lookup', 'Supplier lookup'], ['rules_based', 'Rules-based'], ['hybrid', 'Hybrid']], empty: ['', 'unknown'], pilot: true },
  { id: 'preferred_dispatch_mode', source: 'profile', key: 'preferred_dispatch_mode', label: 'Fitter dispatch style', effect: 'Chooses which dispatch path paid jobs take (group-first, registered fitters, or hybrid).', type: 'select', options: [['undecided', 'Undecided'], ['group_first', 'Group first'], ['registered_fitters_first', 'Registered fitters first'], ['hybrid', 'Hybrid']], empty: ['', 'undecided'], pilot: true },
  { id: 'group_dispatch_wait_minutes', source: 'profile', key: 'group_dispatch_wait_minutes', label: 'Group wait / reminder (minutes)', effect: 'How long group-first waits before reminder / fallback on a live job.', type: 'number', placeholder: 'e.g. 10', pilot: true },
  { id: 'owner_first_refusal_minutes', source: 'launch', key: 'owner_first_refusal_minutes', label: 'Owner first-refusal window (minutes)', effect: 'How long the owner gets first refusal before fitters are offered the job (system_config → live workflows).', type: 'number', placeholder: 'e.g. 5', hint: 'Daytime window. Night timing is configured separately if needed.', pilot: true },
  { id: 'preferred_fitter_window_minutes', source: 'launch', key: 'preferred_fitter_window_minutes', label: 'Preferred fitter window (minutes)', effect: 'How long preferred fitters get to accept before general fitters.', type: 'number', placeholder: 'e.g. 20', pilot: true },
  { id: 'general_fitter_window_minutes', source: 'launch', key: 'general_fitter_window_minutes', label: 'General fitter window (minutes)', effect: 'How long general fitters get to respond on an offered job.', type: 'number', placeholder: 'e.g. 30', pilot: true },
  { id: 'pricing_notes', source: 'profile', key: 'pricing_notes', label: 'Pricing / deposit notes for pilot', effect: 'Operational notes for markup, callout and deposit intent. Exact £ deposit pairs still live in Pricing & Rules.', type: 'textarea', placeholder: 'e.g. £20 deposit on typical jobs; balance on completion', pilot: false },
  { id: 'google_review_url', source: 'launch', key: 'google_review_url', label: 'Google review link', effect: 'Sent after job completion when configured. Leave blank until the real URL is ready.', type: 'url', placeholder: 'https://…', pilot: false },
  { id: 'trustpilot_review_url', source: 'launch', key: 'trustpilot_review_url', label: 'Trustpilot review link', effect: 'Stored for the completion flow. Leave blank until confirmed.', type: 'url', placeholder: 'https://…', pilot: false },
];

function captured(value: unknown): Row { return value && typeof value === 'object' ? value as Row : {}; }
function answerOf(value: unknown) { return typeof captured(value).answer === 'string' ? captured(value).answer : ''; }
function captureOf(item: Row, key: string, fallback = '') { const value = captured(item.captured_value)[key]; return typeof value === 'string' ? value : fallback; }
function boolCapture(item: Row, key: string) { return captured(item.captured_value)[key] === true; }
function patchCaptured(item: Row, key: string, value: string | boolean) { return { ...captured(item.captured_value), [key]: value }; }
function pretty(value: string) { return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function anchor(stage: string) { return `stage-${stage.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`; }

function readMeetingValue(field: MeetingField, profile: Row | null, launch: Row) {
  const raw = field.source === 'launch' ? launch[field.key] : profile?.[field.key];
  if (raw === null || raw === undefined) return '';
  return String(raw);
}

function isMeetingEmpty(field: MeetingField, value: string) {
  const trimmed = value.trim();
  if (!trimmed) return true;
  return (field.empty || []).includes(trimmed);
}

function validateMeetingValue(field: MeetingField, raw: string) {
  const value = raw.trim();
  if (field.pilot && isMeetingEmpty(field, value)) return 'Enter a real value before Save & Continue.';
  if (!value) return '';
  if (field.key === 'customer_whatsapp_number' && !/^\+?[0-9 ()-]{7,32}$/.test(value)) return 'WhatsApp number format is invalid.';
  if (field.type === 'number') {
    const num = Number(value);
    if (!Number.isInteger(num)) return 'Enter a whole number of minutes.';
    if (field.key === 'group_dispatch_wait_minutes' && (num < 1 || num > 1440)) return 'Group wait must be between 1 and 1440 minutes.';
    if (field.key === 'owner_first_refusal_minutes' && (num < 0 || num > 240)) return 'First-refusal must be between 0 and 240 minutes.';
    if (field.key === 'preferred_fitter_window_minutes' && (num < 1 || num > 240)) return 'Preferred window must be between 1 and 240 minutes.';
    if (field.key === 'general_fitter_window_minutes' && (num < 1 || num > 240)) return 'General window must be between 1 and 240 minutes.';
  }
  if (field.type === 'url' && value) {
    try {
      const url = new URL(value);
      if (!['https:', 'http:'].includes(url.protocol)) return 'URL must start with http:// or https://';
    } catch {
      return 'Enter a valid URL or leave blank.';
    }
  }
  if (field.type === 'select' && field.options && !field.options.some(([option]) => option === value)) return 'Choose a valid option.';
  return '';
}

export default function BusinessSetupClient() {
  const [profile, setProfile] = useState<Row | null>(null);
  const [launchConfig, setLaunchConfig] = useState<Row>({});
  const [onboarding, setOnboarding] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveState, setSaveState] = useState<Record<string, string>>({});
  const [meetingMode, setMeetingMode] = useState(false);
  const [meetingIndex, setMeetingIndex] = useState(0);
  const [meetingValue, setMeetingValue] = useState('');
  const [meetingError, setMeetingError] = useState('');
  const [meetingMoreOpen, setMeetingMoreOpen] = useState(false);
  const meetingInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>(null);

  const applyData = useCallback((result: Row) => { setProfile(result.profile); setOnboarding(result.onboarding || []); setRules(result.rules || []); }, []);
  const load = useCallback(async () => {
    try {
      const [setupResponse, configResponse] = await Promise.all([
        fetch('/api/business-setup', { cache: 'no-store' }),
        fetch('/api/owner-setup-config', { cache: 'no-store' }),
      ]);
      const result = await setupResponse.json();
      const config = await configResponse.json();
      if (!setupResponse.ok) throw new Error(result.error || 'Onboarding could not be loaded.');
      if (!configResponse.ok) throw new Error(config.error || 'Launch settings could not be loaded.');
      applyData(result);
      setLaunchConfig(config.config || {});
      setLoadError('');
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
  const confirmedItems = onboarding.filter((item) => item.status === 'confirmed' || item.status === 'not_applicable');
  const ownerStillNeeded = onboarding.filter((item) => !['confirmed', 'not_applicable'].includes(item.status) && ['owner', 'both', 'external_provider'].includes(captureOf(item, 'responsible', 'owner')));

  // Stable catalog order (pilot fields already first). Do not reshuffle on save or index skips.
  const meetingQueue = meetingConfigFields;

  const meetingCount = meetingQueue.length;
  const clampedMeetingIndex = meetingCount === 0 ? 0 : Math.min(Math.max(0, meetingIndex), meetingCount);
  const currentMeetingField = clampedMeetingIndex < meetingCount ? meetingQueue[clampedMeetingIndex] : null;
  const pilotMissingCount = meetingConfigFields.filter((field) => field.pilot && isMeetingEmpty(field, readMeetingValue(field, profile, launchConfig))).length;

  useEffect(() => {
    if (meetingCount === 0) {
      if (meetingIndex !== 0) setMeetingIndex(0);
      return;
    }
    if (meetingIndex < 0) setMeetingIndex(0);
    else if (meetingIndex > meetingCount) setMeetingIndex(meetingCount);
  }, [meetingCount, meetingIndex]);

  useEffect(() => {
    if (!currentMeetingField) {
      setMeetingValue('');
      setMeetingError('');
      setMeetingMoreOpen(false);
      return;
    }
    setMeetingValue(readMeetingValue(currentMeetingField, profile, launchConfig));
    setMeetingError('');
    setMeetingMoreOpen(false);
    window.setTimeout(() => meetingInputRef.current?.focus(), 40);
    // Only re-seed when the question changes — never while the owner is typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMeetingField?.id]);

  function advanceMeeting() {
    setMeetingIndex((index) => Math.min(index + 1, meetingCount));
  }

  async function saveMeetingValue(options?: { allowEmpty?: boolean }) {
    if (!currentMeetingField) return;
    const field = currentMeetingField;
    const raw = meetingValue;
    const validation = options?.allowEmpty ? (raw.trim() ? validateMeetingValue(field, raw) : '') : validateMeetingValue(field, raw);
    if (validation) {
      setMeetingError(validation);
      meetingInputRef.current?.focus();
      return;
    }
    setMeetingError('');
    const saveKey = `meeting:${field.id}`;
    if (saveState[saveKey] === 'saving') return;
    setSaveState((state) => ({ ...state, [saveKey]: 'saving' }));
    try {
      if (field.source === 'profile') {
        let payload: string | number | null = meetingValue.trim();
        if (field.type === 'number') payload = meetingValue.trim() === '' ? null : Number(meetingValue.trim());
        const response = await fetch('/api/business-setup', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity: 'profile', values: { [field.key]: payload } }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Save failed.');
        applyData(result);
      } else {
        const response = await fetch('/api/owner-setup-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ values: { [field.key]: meetingValue.trim() } }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Save failed.');
        setLaunchConfig(result.config || { ...launchConfig, [field.key]: meetingValue.trim() });
        // Keep profile mirror in sync when the launch first-refusal window changes.
        if (field.key === 'owner_first_refusal_minutes' && meetingValue.trim() !== '') {
          const minutes = Number(meetingValue.trim());
          if (Number.isInteger(minutes)) {
            const mirror = await fetch('/api/business-setup', {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ entity: 'profile', values: { owner_first_refusal_minutes: minutes } }),
            });
            const mirrored = await mirror.json();
            if (mirror.ok) applyData(mirrored);
          }
        }
      }
      setSaveState((state) => ({ ...state, [saveKey]: 'saved' }));
      window.setTimeout(() => setSaveState((state) => ({ ...state, [saveKey]: '' })), 1800);
      setMeetingMoreOpen(false);
      advanceMeeting();
    } catch (error) {
      setSaveState((state) => ({ ...state, [saveKey]: error instanceof Error ? error.message : 'Save failed.' }));
      setMeetingError(error instanceof Error ? error.message : 'Save failed.');
    }
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

  const meetingSaving = currentMeetingField ? saveState[`meeting:${currentMeetingField.id}`] === 'saving' : false;

  return <div className={`businessSetup${meetingMode ? ' meetingActive' : ''}`}>
    <header className="businessSetupHero">
      <div><span>Owner onboarding & handover</span><h1>Onboarding & Handover Control Centre</h1><p>Setup, account ownership, integrations, training and pilot readiness. Unknown information stays unknown until the owner confirms it.</p></div>
      <div className="setupProgress"><strong>TyreOps Setup - {progress}%</strong><div><i style={{ width: `${progress}%` }} /></div><span>{completed} of {onboarding.length} checklist items complete</span></div>
    </header>
    {!meetingMode ? <section className={`pilotReadiness ${readinessBlocked ? 'blocked' : ''}`}><div><span>Pilot readiness</span><h2>{pilotState}</h2><p>{readinessMissing.length ? `${readinessMissing.length} core item${readinessMissing.length === 1 ? '' : 's'} still need attention.` : realJobComplete ? 'Core setup and controlled live-job validation are complete.' : 'Core setup is ready. A controlled real job remains the next live milestone.'}</p></div><div className="readinessBlockers">{readinessMissing.slice(0, 6).map((key) => <span key={key}>{itemMap.get(key)?.label || pretty(key)}</span>)}</div></section> : null}
    <section className="meetingModeCard">
      <div>
        <span>Meeting mode</span>
        <strong>{meetingMode ? (currentMeetingField ? currentMeetingField.label : 'Pilot config complete') : 'Enter Rescue pilot config'}</strong>
        <p>{meetingMode
          ? (currentMeetingField ? currentMeetingField.effect : 'Required operational fields are saved. Exact deposit pairs stay in Pricing & Rules; fitters stay on Fitters.')
          : `One value at a time into live business profile / launch settings. ${pilotMissingCount} pilot field${pilotMissingCount === 1 ? '' : 's'} still blank.`}</p>
      </div>
      <button className="btn primary" type="button" onClick={() => {
        if (meetingMode) { setMeetingMode(false); return; }
        const firstBlank = meetingConfigFields.findIndex((field) => field.pilot && isMeetingEmpty(field, readMeetingValue(field, profile, launchConfig)));
        setMeetingIndex(firstBlank >= 0 ? firstBlank : 0);
        setMeetingMode(true);
      }}>{meetingMode ? 'Show Full Setup' : 'Start Meeting Mode'}</button>
    </section>
    {meetingMode ? <section className="meetingModeFocus">{currentMeetingField ? <>
      <div className="meetingQuestion">
        <span>{clampedMeetingIndex + 1} of {meetingCount} · {currentMeetingField.pilot ? 'Pilot required' : 'Optional'}</span>
        <h2>{currentMeetingField.label}</h2>
        <p className="meetingEffect"><strong>Makes this work:</strong> {currentMeetingField.effect}</p>
      </div>
      <div className="meetingSimpleForm">
        <label className="meetingAnswer">
          <span>Value</span>
          {currentMeetingField.type === 'textarea' ? (
            <textarea
              ref={(node) => { meetingInputRef.current = node; }}
              rows={4}
              value={meetingValue}
              onChange={(event) => { setMeetingValue(event.target.value); if (meetingError) setMeetingError(''); }}
              placeholder={currentMeetingField.placeholder || 'Enter value'}
              autoComplete="off"
              enterKeyHint="done"
            />
          ) : currentMeetingField.type === 'select' ? (
            <select
              ref={(node) => { meetingInputRef.current = node; }}
              value={meetingValue || (currentMeetingField.empty?.[0] || '')}
              onChange={(event) => { setMeetingValue(event.target.value); if (meetingError) setMeetingError(''); }}
            >
              {currentMeetingField.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
            </select>
          ) : (
            <input
              ref={(node) => { meetingInputRef.current = node; }}
              type={currentMeetingField.type === 'number' ? 'number' : currentMeetingField.type === 'tel' ? 'tel' : currentMeetingField.type === 'url' ? 'url' : 'text'}
              inputMode={currentMeetingField.type === 'number' ? 'numeric' : currentMeetingField.type === 'tel' ? 'tel' : currentMeetingField.type === 'url' ? 'url' : 'text'}
              value={meetingValue}
              onChange={(event) => { setMeetingValue(event.target.value); if (meetingError) setMeetingError(''); }}
              placeholder={currentMeetingField.placeholder || 'Enter value'}
              autoComplete="off"
              enterKeyHint="done"
              min={currentMeetingField.type === 'number' ? 0 : undefined}
              step={currentMeetingField.type === 'number' ? 1 : undefined}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void saveMeetingValue();
                }
              }}
            />
          )}
        </label>
        {currentMeetingField.hint ? <p className="meetingHint">{currentMeetingField.hint}</p> : null}
        {meetingError ? <p className="meetingError">{meetingError}</p> : null}
        <SaveState state={saveState[`meeting:${currentMeetingField.id}`]} />
      </div>
      <div className="meetingActions">
        <button className="btn primary meetingPrimary" type="button" disabled={meetingSaving} onClick={() => void saveMeetingValue()}>Save & Continue</button>
        <div className={`meetingOverflow${meetingMoreOpen ? ' open' : ''}`}>
          <button className="btn meetingSecondary" type="button" aria-expanded={meetingMoreOpen} onClick={() => setMeetingMoreOpen((open) => !open)}>More</button>
          {meetingMoreOpen ? <div className="meetingOverflowMenu" role="menu">
            <button className="btn" type="button" role="menuitem" onClick={() => { setMeetingMoreOpen(false); advanceMeeting(); }}>Skip for Later</button>
            {!currentMeetingField.pilot ? <button className="btn" type="button" role="menuitem" onClick={() => { setMeetingMoreOpen(false); void saveMeetingValue({ allowEmpty: true }); }}>Save blank / N/A</button> : null}
          </div> : null}
        </div>
        <div className="meetingTertiary">
          <button className="btn meetingQuiet" type="button" disabled={clampedMeetingIndex === 0} onClick={() => setMeetingIndex((index) => Math.max(0, index - 1))}>Back</button>
          <button className="btn meetingQuiet" type="button" onClick={() => setMeetingMode(false)}>Exit</button>
        </div>
      </div>
      <div className="meetingNextActions">
        <Link className="btn meetingQuiet" href="/fitters">Fitter pool → /fitters</Link>
        <Link className="btn meetingQuiet" href="/settings/pricing-rules">Deposit pairs → Pricing & Rules</Link>
      </div>
    </> : <div className="meetingSummary">
      <h2>Pilot config captured</h2>
      <p>Live profile and launch settings for Meeting Mode are filled. Exact deposit £ pairs and fitter records are separate operational screens — not survey checklist theatre.</p>
      <div className="handoverQueues">
        <div className="handoverQueue"><h2>Confirmed checklist</h2><p>{confirmedItems.length} items</p></div>
        <div className="handoverQueue"><h2>Still need from owner</h2><p>{ownerStillNeeded.length} items</p></div>
        <div className="handoverQueue"><h2>Needs TyreOps</h2><p>{needsTyreOps.length} items</p></div>
        <div className="handoverQueue"><h2>Blocked</h2><p>{blockedItemsAll.length} items</p></div>
      </div>
      <strong>Pilot config blanks: {pilotMissingCount === 0 ? 'NONE' : pilotMissingCount}</strong>
      <div className="meetingNextActions">
        <Link className="btn primary" href="/fitters">Add / check fitters</Link>
        <Link className="btn" href="/settings/pricing-rules">Set deposit pairs</Link>
        <button className="btn meetingQuiet" type="button" onClick={() => { setMeetingIndex(0); setMeetingMode(false); }}>Exit Meeting Mode</button>
      </div>
    </div>}</section> : null}
    {!meetingMode ? <>
      <section className="handoverQueues">{[['Needs Owner', needsOwner], ['Needs TyreOps', needsTyreOps], ['Blocked', blockedItems], ['Pilot blockers', pilotBlockers]].map(([title, rows]) => <div className="handoverQueue" key={title as string}><h2>{title as string}</h2>{(rows as Row[]).length ? (rows as Row[]).map((item) => <a href={`#setup-${item.section}`} key={item.item_key}><strong>{item.label}</strong><span>{pretty(captureOf(item, 'priority') || 'required_before_pilot')}</span></a>) : <p>Clear</p>}</div>)}</section>
      <section className="stageProgressGrid">{onboardingStages.map((stage) => { const rows = onboarding.filter((item) => captureOf(item, 'stage') === stage); const done = rows.filter((item) => ['confirmed', 'not_applicable'].includes(item.status)).length; const pct = rows.length ? Math.round((done / rows.length) * 100) : 0; return <a href={`#${anchor(stage)}`} key={stage}><strong>{stage}</strong><span>{done}/{rows.length}</span><i><b style={{ width: `${pct}%` }} /></i></a>; })}</section>
      {integrations.length ? <section className="integrationInventory" id={anchor('APIs & Integrations')}><div className="setupSubhead"><div><h2>Integration Inventory</h2><p>Credential status only. Never enter passwords, API keys, access tokens or secrets.</p></div></div><div className="integrationGrid">{integrations.map((item) => <article className="integrationCard" key={item.item_key}><div><strong>{item.label}</strong><span>{captureOf(item, 'integration_purpose')}</span></div><dl><div><dt>Owner</dt><dd>{captureOf(item, 'integration_owner')}</dd></div><div><dt>Credential location</dt><dd>{captureOf(item, 'credential_location')}</dd></div><div><dt>Billing</dt><dd>{captureOf(item, 'billing_responsibility')}</dd></div><div><dt>Identifier</dt><dd>{captureOf(item, 'non_secret_identifier') || 'Not recorded'}</dd></div></dl><div className="integrationFlags"><span className={boolCapture(item, 'connected') ? 'confirmed' : 'needs'}>Connected</span><span className={boolCapture(item, 'production') ? 'confirmed' : 'needs'}>Production</span><span className={boolCapture(item, 'tested') ? 'confirmed' : 'needs'}>Tested</span></div></article>)}</div></section> : null}
      <nav className="setupSectionGrid" aria-label="Onboarding sections">{setupSections.map(([key, label]) => { const state = sectionState(key); return <a href={`#setup-${key}`} key={key}><strong>{label}</strong><span className={state[0]}>{state[1]}</span></a>; })}</nav>
      <div className="setupSections">{setupSections.map(([sectionKey, sectionLabel], sectionIndex) => <SetupSection key={sectionKey} sectionKey={sectionKey} sectionLabel={sectionLabel} sectionIndex={sectionIndex} profile={profile} setProfile={setProfile} onboarding={onboarding} patchItem={patchItem} rules={rules} patchRule={patchRule} save={save} saveState={saveState} sectionState={sectionState} />)}</div>
    </> : null}
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

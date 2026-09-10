'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ruleCatalog } from '@/lib/business-setup/catalog';

type Row = Record<string, any>;

const steps = [
  { key: 'checklist', label: 'Go-live checklist', help: 'The whole launch path in one place.' },
  { key: 'fitters', label: '1. Real fitter', help: 'First live-job blocker. Add at least one active fitter.' },
  { key: 'launch', label: '2. Launch settings', help: 'Owner timings and review links.' },
  { key: 'basics', label: '3. Business basics', help: 'Name, WhatsApp, coverage and opening rules.' },
  { key: 'ai', label: '4. AI rules', help: 'One owner answer at a time. This is what makes the AI safer.' },
  { key: 'prices', label: '5. Prices & rules', help: 'Optional auto-pricing: base + location + emergency.' },
  { key: 'test', label: '6. Test & handover', help: 'System test, phone check and final owner confidence.' },
] as const;

const answerOptions = [
  ['yes', 'Yes'],
  ['no', 'No'],
  ['depends', 'Depends'],
  ['unknown', 'Unknown'],
] as const;

type ProfileField = {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'textarea' | 'select';
  options?: Array<[string, string]>;
  wide?: boolean;
  hint?: string;
};

const setupStatusOptions: Array<[string, string]> = [
  ['unknown', 'Unknown'],
  ['not_started', 'Not started'],
  ['in_progress', 'In progress'],
  ['confirmed', 'Confirmed'],
  ['blocked', 'Blocked'],
  ['not_applicable', 'Not applicable'],
];

const profileFields: ProfileField[] = [
  { key: 'business_name', label: 'Business name', type: 'text' },
  { key: 'owner_name', label: 'Owner name', type: 'text' },
  { key: 'customer_whatsapp_number', label: 'Business WhatsApp number', type: 'tel' },
  { key: 'whatsapp_type', label: 'Current WhatsApp setup', type: 'select', options: [['unknown', 'Unknown'], ['whatsapp_business_app', 'WhatsApp Business App'], ['cloud_api', 'Cloud API'], ['coexistence', 'Coexistence'], ['other', 'Other']] },
  { key: 'whatsapp_setup_status', label: 'WhatsApp production status', type: 'select', options: setupStatusOptions },
  { key: 'meta_setup_status', label: 'Facebook / Meta status', type: 'select', options: setupStatusOptions, hint: 'Record status only. Do not paste Meta tokens or app secrets.' },
  { key: 'telegram_setup_status', label: 'Telegram owner alerts status', type: 'select', options: setupStatusOptions },
  { key: 'pricing_mode', label: 'How he prices jobs today', type: 'select', options: [['unknown', 'Unknown'], ['manual_owner_pricing', 'Manual owner pricing'], ['price_list', 'Price list'], ['supplier_lookup', 'Supplier lookup'], ['rules_based', 'Rules-based'], ['hybrid', 'Hybrid']] },
  { key: 'preferred_dispatch_mode', label: 'Preferred fitter dispatch style', type: 'select', options: [['undecided', 'Undecided'], ['group_first', 'Group first'], ['registered_fitters_first', 'Registered fitters first'], ['hybrid', 'Hybrid']] },
  { key: 'customer_description', label: 'What should the AI say this business does?', type: 'textarea', wide: true },
  { key: 'coverage_notes', label: 'Coverage areas / areas not covered', type: 'textarea', wide: true },
  { key: 'operating_hours_notes', label: 'Opening hours / out-of-hours rules', type: 'textarea', wide: true },
];

const launchFields = [
  ['owner_first_refusal_minutes', 'Owner first-refusal minutes', '5', 'Normal daytime window confirmed by the owner. Night-time is configured separately at 7.5 minutes.'],
  ['preferred_fitter_window_minutes', 'Preferred fitter window minutes', '20', 'How long preferred fitters get before general fitters.'],
  ['general_fitter_window_minutes', 'General fitter window minutes', '30', 'How long general fitters get to respond.'],
  ['google_review_url', 'Google review link', 'https://...', 'Sent after completion when configured. Leave blank until ready.'],
  ['trustpilot_review_url', 'Trustpilot review link', 'https://...', 'Stored for the completion flow. Leave blank until the real business URL is confirmed.'],
] as const;

const goLiveChecklist = [
  { title: 'Add one real fitter', itemKey: 'first_real_fitter_added', required: true, why: 'Required before a real job can dispatch cleanly.', action: 'Open Fitters', href: '/fitters' },
  { title: 'Confirm timing and deposit rules', itemKey: 'owner_first_refusal_duration', required: true, why: 'Confirm owner timing here, then verify exact customer-price to deposit pairs in Pricing & Rules.', action: 'Open Launch Settings', step: 'launch' },
  { title: 'Set up WhatsApp Business API', itemKey: 'production_number_connected', required: true, why: 'Usually the longest item: dedicated number, Meta account, permanent token and n8n webhook.', action: 'Open Business Basics', step: 'basics' },
  { title: 'Activate Stripe live payments', itemKey: 'production_payment_ready', required: true, why: 'Live Stripe key must be in n8n and stripe_mode must be live before taking real money.', action: 'Open Full Setup', href: '/settings/business#setup-payments' },
  { title: 'Confirm Telegram owner alerts', itemKey: 'telegram_destination_confirmed', required: true, why: 'Owner alerts must go to the correct bot/chat before the pilot.', action: 'Open System Test', href: '/settings/system-test' },
  { title: 'Optional auto-pricing rules', itemKey: 'pricing_method_agreed', required: false, why: 'Manual pricing works for pilot. Add base tyre, location and emergency prices when ready.', action: 'Open Prices & Rules', step: 'prices' },
  { title: 'Optional AI business rules', itemKey: 'customer_ai_facts_reviewed', required: false, why: 'Owner-confirmed rules marked AI may use make customer replies safer and clearer.', action: 'Open AI Rules', step: 'ai' },
  { title: 'Send one end-to-end test message', itemKey: 'controlled_real_job_completed', required: true, why: 'Do this before launch: WhatsApp -> AI -> dashboard -> payment -> fitter -> completion.', action: 'Open System Test', href: '/settings/system-test' },
] as const;

function asObject(value: unknown): Row {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
}

function answerOf(row: Row) {
  const value = asObject(row.structured_value).answer;
  return typeof value === 'string' ? value : 'unknown';
}

function pretty(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function OwnerSetupStepper({ setupPercent, aiRuleCount }: { setupPercent: number; aiRuleCount: number }) {
  const [activeStep, setActiveStep] = useState<(typeof steps)[number]['key']>('checklist');
  const [profile, setProfile] = useState<Row>({});
  const [launchConfig, setLaunchConfig] = useState<Row>({});
  const [onboarding, setOnboarding] = useState<Row[]>([]);
  const [rules, setRules] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState('');
  const [ruleIndex, setRuleIndex] = useState(0);

  const load = useCallback(async () => {
    try {
      const [setupResponse, configResponse] = await Promise.all([
        fetch('/api/business-setup', { cache: 'no-store' }),
        fetch('/api/owner-setup-config', { cache: 'no-store' }),
      ]);
      const setup = await setupResponse.json();
      const config = await configResponse.json();
      if (!setupResponse.ok) throw new Error(setup.error || 'Owner setup could not be loaded.');
      if (!configResponse.ok) throw new Error(config.error || 'Launch settings could not be loaded.');
      setProfile(setup.profile || {});
      setOnboarding(setup.onboarding || []);
      setRules(setup.rules || []);
      setLaunchConfig(config.config || {});
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Owner setup could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const ruleDefinitions = useMemo(() => new Map(ruleCatalog.map((rule) => [rule.rule_key, rule])), []);
  const currentRule = rules[Math.min(ruleIndex, Math.max(0, rules.length - 1))];
  const confirmedRules = rules.filter((rule) => rule.owner_confirmed && rule.ai_may_use && answerOf(rule) !== 'unknown').length;
  const onboardingMap = useMemo(() => new Map(onboarding.map((item) => [item.item_key, item])), [onboarding]);
  const checklistDone = goLiveChecklist.filter((item) => ['confirmed', 'not_applicable'].includes(onboardingMap.get(item.itemKey)?.status)).length;
  const requiredDone = goLiveChecklist.filter((item) => item.required).every((item) => onboardingMap.get(item.itemKey)?.status === 'confirmed');

  async function saveProfile() {
    if (saving) return;
    setSaving('profile'); setNotice(''); setError('');
    const values = Object.fromEntries(profileFields.map((field) => [field.key, profile[field.key] || '']));
    try {
      const response = await fetch('/api/business-setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'profile', values }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      setProfile(result.profile || profile);
      setNotice('Business basics saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Business basics could not be saved.');
    } finally {
      setSaving('');
    }
  }

  async function saveLaunchConfig() {
    if (saving) return;
    setSaving('launch'); setNotice(''); setError('');
    try {
      const response = await fetch('/api/owner-setup-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ values: Object.fromEntries(launchFields.map(([key]) => [key, launchConfig[key] || ''])) }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      setLaunchConfig(result.config || launchConfig);
      setNotice('Launch settings saved.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Launch settings could not be saved.');
    } finally {
      setSaving('');
    }
  }

  async function saveChecklistItem(itemKey: string, status: 'pending' | 'confirmed' | 'blocked' | 'not_applicable') {
    if (saving) return;
    const item = onboarding.find((row) => row.item_key === itemKey);
    if (!item) {
      setError('This checklist item is not available yet.');
      return;
    }
    setSaving(`checklist:${itemKey}`); setNotice(''); setError('');
    try {
      const response = await fetch('/api/business-setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'onboarding',
          item_key: itemKey,
          status,
          captured_value: asObject(item.captured_value),
          notes: item.notes || null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Checklist item could not be saved.');
      setProfile(result.profile || profile);
      setOnboarding(result.onboarding || onboarding);
      setRules(result.rules || rules);
      setNotice(status === 'confirmed' ? 'Checklist item marked done.' : 'Checklist item updated.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Checklist item could not be saved.');
    } finally {
      setSaving('');
    }
  }

  function patchRule(values: Row) {
    if (!currentRule) return;
    setRules((rows) => rows.map((row) => row.rule_key === currentRule.rule_key ? { ...row, ...values } : row));
  }

  async function saveRule(goNext = true) {
    if (!currentRule || saving) return;
    setSaving(`rule:${currentRule.rule_key}`); setNotice(''); setError('');
    const answer = answerOf(currentRule);
    try {
      const response = await fetch('/api/business-setup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity: 'rule',
          rule_key: currentRule.rule_key,
          answer,
          owner_confirmed: Boolean(currentRule.owner_confirmed),
          ai_may_use: Boolean(currentRule.ai_may_use),
          notes: currentRule.notes || '',
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Save failed.');
      setRules(result.rules || rules);
      setNotice('AI rule saved.');
      if (goNext) setRuleIndex((index) => Math.min(index + 1, Math.max(0, rules.length - 1)));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'AI rule could not be saved.');
    } finally {
      setSaving('');
    }
  }

  return <section className="ownerSetupCentre">
    <div className="ownerSetupIntro">
      <div>
        <span>One place to onboard Customer #1</span>
        <h2>Setup the owner, fitter, rules and launch settings step by step.</h2>
        <p>Priority order matters: add at least one real active fitter, set pilot timings/deposit, then capture business answers, AI rules and optional automatic pricing. No secrets are entered here.</p>
      </div>
      <div className="ownerSetupProgress">
        <strong>{setupPercent}%</strong>
        <span>Checklist complete</span>
        <small>{confirmedRules || aiRuleCount} AI-safe rule{(confirmedRules || aiRuleCount) === 1 ? '' : 's'} confirmed</small>
      </div>
    </div>

    <div className="setupWizardTabs" role="tablist" aria-label="Owner setup steps">
      {steps.map((step) => <button key={step.key} type="button" className={activeStep === step.key ? 'active' : ''} onClick={() => setActiveStep(step.key)}>
        <strong>{step.label}</strong><span>{step.help}</span>
      </button>)}
    </div>

    {loading ? <div className="empty">Loading owner setup...</div> : null}
    {error ? <div className="error">{error}</div> : null}
    {notice ? <div className="success">{notice}</div> : null}

    {!loading && activeStep === 'checklist' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Customer #1 go-live checklist</h3><p>Start WhatsApp first. Everything else is designed to be completed from this dashboard in a day once WhatsApp/API access is ready.</p></div>
      <div className={`launchReadiness ${requiredDone ? 'ready' : ''}`}>
        <strong>{requiredDone ? 'Ready for controlled go-live checks' : 'Not ready yet'}</strong>
        <span>{checklistDone} of {goLiveChecklist.length} checklist items complete. Required items should only be marked done after they are genuinely configured and tested.</span>
      </div>
      <div className="goLiveChecklist">
        {goLiveChecklist.map((item) => {
          const row = onboardingMap.get(item.itemKey);
          const status = row?.status || 'pending';
          return <article className={`goLiveItem status-${status}`} key={item.itemKey}>
            <div>
              <span>{item.required ? 'Required' : 'Optional'}</span>
              <strong>{item.title}</strong>
              <p>{item.why}</p>
            </div>
            <div className="goLiveStatus">
              <b>{status === 'confirmed' ? 'Done' : status === 'blocked' ? 'Blocked' : status === 'not_applicable' ? 'Skipped' : 'Needs work'}</b>
              <div className="goLiveActions">
                {'href' in item ? <Link className="btn" href={item.href}>{item.action}</Link> : <button className="btn" type="button" onClick={() => setActiveStep(item.step)}>{item.action}</button>}
                <button className="btn primary" type="button" disabled={saving === `checklist:${item.itemKey}`} onClick={() => void saveChecklistItem(item.itemKey, 'confirmed')}>Mark done</button>
                <button className="btn" type="button" disabled={saving === `checklist:${item.itemKey}`} onClick={() => void saveChecklistItem(item.itemKey, 'blocked')}>Blocked</button>
                {!item.required ? <button className="btn" type="button" disabled={saving === `checklist:${item.itemKey}`} onClick={() => void saveChecklistItem(item.itemKey, 'not_applicable')}>Skip</button> : null}
              </div>
            </div>
          </article>;
        })}
      </div>
    </div> : null}

    {!loading && activeStep === 'fitters' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Step 1 - Add at least one real fitter</h3><p>This is the first live-job blocker. Without an active registered fitter, dispatch can fall into manual review. Add preferred fitters first; general fitters can come after.</p></div>
      <div className="launchChecklist">
        <div><strong>Required for first live job</strong><span>At least one real fitter with WhatsApp number, active=true, coverage and priority.</span></div>
        <div><strong>Recommended</strong><span>Mark the best first-choice fitter as preferred. Existing E2E/test fitters should stay inactive.</span></div>
      </div>
      <div className="handoverShortcutGrid">
        <Link className="btn primary" href="/fitters">Add or edit fitters</Link>
        <a className="btn" href="#pricing-rules-unified">Open dispatch rules</a>
      </div>
    </div> : null}

    {!loading && activeStep === 'launch' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Step 2 - Pilot launch settings</h3><p>These are the minimum settings from the onboarding sequence that should not require Supabase SQL.</p></div>
      <div className="simpleFormGrid">
        {launchFields.map(([key, label, placeholder, hint]) => <label className={key === 'google_review_url' ? 'wide' : ''} key={key}>
          <span>{label}</span>
          <input inputMode={key === 'google_review_url' ? 'url' : 'decimal'} value={launchConfig[key] || ''} placeholder={placeholder} onChange={(event) => setLaunchConfig({ ...launchConfig, [key]: event.target.value })} />
          <small>{hint}</small>
        </label>)}
      </div>
      <button className="btn primary" type="button" disabled={saving === 'launch'} onClick={() => void saveLaunchConfig()}>{saving === 'launch' ? 'Saving...' : 'Save launch settings'}</button>
    </div> : null}

    {!loading && activeStep === 'basics' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Business basics</h3><p>These are the answers you ask the owner first. Blank means unknown; it does not change live behaviour.</p></div>
      <div className="simpleFormGrid">
        {profileFields.map((field) => <label className={field.wide || field.type === 'textarea' ? 'wide' : ''} key={field.key}>
          <span>{field.label}</span>
          {field.type === 'textarea'
            ? <textarea rows={4} value={profile[field.key] || ''} onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })} />
            : field.type === 'select'
              ? <select value={profile[field.key] || 'unknown'} onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })}>{field.options?.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
              : <input type={field.type} value={profile[field.key] || ''} onChange={(event) => setProfile({ ...profile, [field.key]: event.target.value })} />}
          {field.hint ? <small>{field.hint}</small> : null}
        </label>)}
      </div>
      <button className="btn primary" type="button" disabled={saving === 'profile'} onClick={() => void saveProfile()}>{saving === 'profile' ? 'Saving...' : 'Save business basics'}</button>
    </div> : null}

    {!loading && activeStep === 'ai' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Customer AI rules</h3><p>Ask one question, save one answer. The AI only uses answers that are known, owner-confirmed and marked AI may use.</p></div>
      {currentRule ? <article className="aiQuestionCard">
        <div className="questionCounter">Question {ruleIndex + 1} of {rules.length}</div>
        <h3>{ruleDefinitions.get(currentRule.rule_key)?.label || pretty(currentRule.rule_key)}</h3>
        <p>{ruleDefinitions.get(currentRule.rule_key)?.category || 'Customer AI'}</p>
        <div className="answerButtons">
          {answerOptions.map(([value, label]) => <button key={value} type="button" className={answerOf(currentRule) === value ? 'active' : ''} onClick={() => patchRule({ structured_value: { answer: value }, ...(value === 'unknown' ? { ai_may_use: false } : {}) })}>{label}</button>)}
        </div>
        <div className="aiSafeChecks">
          <label><input type="checkbox" checked={Boolean(currentRule.owner_confirmed)} onChange={(event) => patchRule({ owner_confirmed: event.target.checked, ...(!event.target.checked ? { ai_may_use: false } : {}) })} /> Owner confirmed this answer</label>
          <label className={!currentRule.owner_confirmed || answerOf(currentRule) === 'unknown' ? 'disabled' : ''}><input type="checkbox" disabled={!currentRule.owner_confirmed || answerOf(currentRule) === 'unknown'} checked={Boolean(currentRule.ai_may_use)} onChange={(event) => patchRule({ ai_may_use: event.target.checked })} /> AI may use this answer</label>
        </div>
        <label className="ruleNoteBox"><span>Plain notes for handover</span><textarea rows={3} value={currentRule.notes || ''} onChange={(event) => patchRule({ notes: event.target.value })} placeholder="No passwords, tokens or secret values." /></label>
        <div className="wizardActions">
          <button className="btn" type="button" disabled={ruleIndex === 0} onClick={() => setRuleIndex((index) => Math.max(0, index - 1))}>Back</button>
          <button className="btn primary" type="button" disabled={Boolean(saving)} onClick={() => void saveRule(true)}>{saving ? 'Saving...' : 'Save & next'}</button>
          <button className="btn" type="button" disabled={Boolean(saving)} onClick={() => void saveRule(false)}>Save only</button>
        </div>
      </article> : <div className="empty">No AI rules are available.</div>}
    </div> : null}

    {!loading && activeStep === 'prices' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Prices, coverage and operating rules</h3><p>Add the live tyre prices, coverage, surcharges, time rules and quote tests below on this same page.</p></div>
      <a className="btn primary" href="#pricing-rules-unified">Go to pricing and rules</a>
    </div> : null}

    {!loading && activeStep === 'test' ? <div className="simpleSetupPanel">
      <div className="simplePanelHead"><h3>Final checks</h3><p>Use System Test for safe workflow checks and phone handover evidence. Do not mark unknown things as passed.</p></div>
      <div className="handoverShortcutGrid">
        <Link className="btn primary" href="/settings/system-test">Open System Test</Link>
        <Link className="btn" href="/">Open Home</Link>
      </div>
    </div> : null}
  </section>;
}

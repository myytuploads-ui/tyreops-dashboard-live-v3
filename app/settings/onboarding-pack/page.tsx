import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { createClient } from '@/lib/supabase/server';

type Row = Record<string, any>;

function truthy(value: unknown) {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

function configValue(config: Row[], key: string) {
  return config.find((row) => row.key === key)?.value;
}

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function StatusBadge({ state }: { state: 'ready' | 'needs' | 'off' | 'external' }) {
  const label = state === 'ready' ? 'Ready' : state === 'off' ? 'Off' : state === 'external' ? 'External setup' : 'Needs setup';
  return <span className={`readinessBadge ${state}`}>{label}</span>;
}

const ownerDemo = [
  ['Home', 'Show what needs attention right now.'],
  ['Jobs', 'Show customer, payment, fitter and status.'],
  ['Conversations', 'Take over, reply, send two messages, return to AI.'],
  ['Fitters', 'Add/edit active preferred fitters without Supabase.'],
  ['Owner Setup', 'Capture rules, prices, settings and checklist progress.'],
  ['System Test', 'Run safe checks and record phone acceptance.'],
];

export default async function OnboardingPackPage() {
  const supabase = await createClient();
  const [fittersRes, configRes, profileRes, rulesRes, pricingRes, depositRulesRes] = await Promise.all([
    supabase.from('fitters').select('id,active,preferred,is_guest').eq('active', true).eq('is_guest', false),
    supabase.from('system_config').select('key,value').in('key', [
      'owner_first_refusal_minutes',
      'preferred_fitter_window_minutes',
      'general_fitter_window_minutes',
      'google_review_url',
      'stripe_mode',
      'automatic_fitter_dispatch_enabled',
      'group_first_dispatch_enabled',
    ]),
    supabase.from('business_profile').select('business_name,customer_description,coverage_notes,operating_hours_notes,whatsapp_setup_status,meta_setup_status,telegram_setup_status').eq('business_key', 'customer-1').maybeSingle(),
    supabase.from('business_rules').select('id').eq('owner_confirmed', true).eq('ai_may_use', true),
    supabase.from('pricing_methods').select('automatic_customer_pricing_enabled,owner_confirmed,active_method').eq('business_key', 'customer-1').maybeSingle(),
    supabase.from('deposit_rules').select('id').eq('active', true).eq('owner_confirmed', true),
  ]);

  const config = configRes.data || [];
  const realActiveFitters = fittersRes.data || [];
  const preferredFitters = realActiveFitters.filter((fitter) => fitter.preferred === true);
  const profile = (profileRes.data || {}) as Row;
  const aiRuleCount = rulesRes.data?.length || 0;
  const ownerWindow = Number(configValue(config, 'owner_first_refusal_minutes'));
  const preferredWindow = Number(configValue(config, 'preferred_fitter_window_minutes'));
  const generalWindow = Number(configValue(config, 'general_fitter_window_minutes'));
  const depositRuleCount = depositRulesRes.data?.length || 0;
  const launchSettingsReady = ownerWindow >= 5 && preferredWindow >= 5 && generalWindow >= 15 && depositRuleCount > 0;
  const stripeLive = String(configValue(config, 'stripe_mode') || '').toLowerCase() === 'live';
  const autoPricing = pricingRes.data?.automatic_customer_pricing_enabled === true;
  const autoDispatch = truthy(configValue(config, 'automatic_fitter_dispatch_enabled'));
  const groupFirst = truthy(configValue(config, 'group_first_dispatch_enabled'));
  const profileReady = hasText(profile.business_name) && hasText(profile.customer_description) && hasText(profile.coverage_notes) && hasText(profile.operating_hours_notes);
  // An in-progress integration is useful tracking, but it is not production-ready.
  // Keep the launch verdict fail-closed until the owner explicitly confirms it.
  const whatsappTracked = String(profile.whatsapp_setup_status || '') === 'confirmed';
  const metaTracked = String(profile.meta_setup_status || '') === 'confirmed';
  const telegramTracked = String(profile.telegram_setup_status || '') === 'confirmed';

  const blocks = [
    {
      title: '1. WhatsApp / Meta',
      state: whatsappTracked && metaTracked ? 'ready' : 'external',
      summary: 'The longest setup item. Dedicated number, Meta app, WABA, permanent token and n8n webhook.',
      facts: [`WhatsApp status: ${profile.whatsapp_setup_status || 'unknown'}`, `Meta status: ${profile.meta_setup_status || 'unknown'}`],
      action: 'Open Owner Setup',
      href: '/settings/handover',
      note: 'The dashboard tracks status. Tokens and credentials stay in Meta/n8n/Vercel, never in the dashboard.',
    },
    {
      title: '2. Real fitters',
      state: realActiveFitters.length ? 'ready' : 'needs',
      summary: 'At least one real active fitter is required before clean dispatch.',
      facts: [`Active real fitters: ${realActiveFitters.length}`, `Preferred active fitters: ${preferredFitters.length}`],
      action: 'Open Fitters',
      href: '/fitters',
      note: 'Existing E2E/test fitters should remain inactive.',
    },
    {
      title: '3. Launch settings',
      state: launchSettingsReady ? 'ready' : 'needs',
      summary: 'Owner window, fitter windows, exact deposit rules and review link.',
      facts: [`Owner window: ${Number.isFinite(ownerWindow) ? `${ownerWindow} min` : 'not set'}`, `Preferred/general windows: ${Number.isFinite(preferredWindow) ? preferredWindow : '-'} / ${Number.isFinite(generalWindow) ? generalWindow : '-'} min`, `Confirmed exact deposit rules: ${depositRuleCount}`, `Review link: ${hasText(configValue(config, 'google_review_url')) ? 'set' : 'not set'}`],
      action: 'Open Launch Settings',
      href: '/settings/handover',
      note: 'Rescue Tyres confirmed owner first refusal at 5 minutes normally. Unmatched prices must return to the owner for a deposit decision.',
    },
    {
      title: '4. Stripe live payments',
      state: stripeLive ? 'ready' : 'external',
      summary: 'Required before taking real deposits.',
      facts: [`Stripe mode: ${configValue(config, 'stripe_mode') || 'unknown'}`],
      action: 'Open System Test',
      href: '/settings/system-test',
      note: 'Live Stripe keys are configured in n8n credentials, not in dashboard text fields.',
    },
    {
      title: '5. Telegram owner alerts',
      state: telegramTracked ? 'ready' : 'external',
      summary: 'Owner should receive alerts only when human action is needed.',
      facts: [`Telegram status: ${profile.telegram_setup_status || 'unknown'}`],
      action: 'Open System Test',
      href: '/settings/system-test',
      note: 'Confirm the right bot and owner chat before launch.',
    },
    {
      title: '6. Business rules for the AI',
      state: aiRuleCount > 0 && profileReady ? 'ready' : 'needs',
      summary: 'The safe facts the AI is allowed to use.',
      facts: [`AI-safe rules: ${aiRuleCount}`, `Business basics: ${profileReady ? 'ready' : 'needs key answers'}`],
      action: 'Open AI Rules',
      href: '/settings/handover',
      note: 'Only owner-confirmed rules marked AI may use should affect customer replies.',
    },
    {
      title: '7. Pricing rules',
      state: autoPricing ? 'ready' : 'off',
      summary: 'Manual pricing is safest for first pilot. Auto-pricing is optional.',
      facts: [`Automatic pricing: ${autoPricing ? 'on' : 'off'}`, `Pricing method: ${pricingRes.data?.active_method || 'unknown'}`, `Owner confirmed: ${pricingRes.data?.owner_confirmed ? 'yes' : 'no'}`],
      action: 'Open Pricing',
      href: '/settings/handover#pricing-rules-unified',
      note: 'Formula: base tyre price + location rule + emergency/overnight extra.',
    },
    {
      title: '8. Automation switches',
      state: !autoDispatch && !groupFirst ? 'ready' : 'needs',
      summary: 'These should remain off until explicitly approved by the owner.',
      facts: [`Automatic fitter dispatch: ${autoDispatch ? 'on' : 'off'}`, `Group-first dispatch: ${groupFirst ? 'on' : 'off'}`],
      action: 'Open Owner Setup',
      href: '/settings/handover',
      note: 'Off is the correct safe pilot state unless the owner deliberately enables it.',
    },
  ] as const;

  const requiredReady = realActiveFitters.length > 0 && launchSettingsReady && stripeLive && telegramTracked && whatsappTracked && metaTracked;

  return <>
    <PageHeader title="Customer #1 Onboarding Pack" subtitle="Live readiness, boxed checklist and owner demo path." />

    <section className="onboardingCommandHero">
      <div>
        <span>Launch room</span>
        <h2>{requiredReady ? 'Customer #1 is ready for a controlled live test.' : 'Make the missing boxes green before launch.'}</h2>
        <p>This page reads live TyreOps data where possible. External accounts still need real setup in Meta, Stripe, Telegram and n8n, but their owner-facing status is tracked here.</p>
      </div>
      <div className="commandStack">
        <Link className="btn primary" href="/settings/handover">Open Owner Setup</Link>
        <Link className="btn" href="/fitters">Add Fitters</Link>
        <Link className="btn" href="/settings/system-test">System Test</Link>
      </div>
    </section>

    <section className="launchMinimum">
      <div><strong>Minimum before first live job</strong><span>WhatsApp API working, Telegram alerts confirmed, one real active fitter, launch timings/deposit set, Stripe live ready if taking real money, one end-to-end test completed.</span></div>
      <div><strong>Current verdict</strong><span>{requiredReady ? 'Ready for one controlled pilot rehearsal. Still verify with a real test message.' : 'Not launch-ready yet. Complete every required red/external box first.'}</span></div>
    </section>

    <section className="onboardingBlockGrid">
      {blocks.map((block) => <article className={`onboardingBlock ${block.state}`} key={block.title}>
        <div className="blockTop">
          <div><strong>{block.title}</strong><p>{block.summary}</p></div>
          <StatusBadge state={block.state} />
        </div>
        <ul>{block.facts.map((item) => <li key={item}>{item}</li>)}</ul>
        <em>{block.note}</em>
        <Link className="btn" href={block.href}>{block.action}</Link>
      </article>)}
    </section>

    <section className="panel">
      <div className="panelHead">
        <h2>Owner demo script</h2>
        <p>Use this order when showing him the dashboard. Show control first, machinery second.</p>
      </div>
      <div className="ownerDemoGrid">
        {ownerDemo.map(([title, text], index) => <div key={title}>
          <span>{index + 1}</span>
          <strong>{title}</strong>
          <p>{text}</p>
        </div>)}
      </div>
    </section>

    <section className="panel">
      <div className="panelHead">
        <h2>How saved info improves the AI</h2>
        <p>No magic memory. Just verified business facts used safely.</p>
      </div>
      <div className="handoverTruths">
        <div><strong>Owner-confirmed AI rules</strong><span>The AI can rely on rules only when the owner has confirmed them and marked AI may use.</span></div>
        <div><strong>Business basics</strong><span>Description, coverage and opening hours give the AI safer context for customer replies.</span></div>
        <div><strong>Pricing rules</strong><span>Confirmed prices feed the quote engine; missing prices fall back to owner pricing.</span></div>
        <div><strong>External accounts</strong><span>Meta, Stripe and Telegram credentials are configured outside the dashboard and tracked here as status only.</span></div>
      </div>
    </section>
  </>;
}

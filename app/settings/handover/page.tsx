import Link from 'next/link';
import PageHeader from '@/components/PageHeader';
import { createAdminClient } from '@/lib/supabase/admin';
import OwnerSetupStepper from './OwnerSetupStepper';
import PricingRulesClient from '../pricing-rules/PricingRulesClient';

type Row = Record<string, any>;

function valueOf(rows: Row[], key: string) {
  return rows.find((row) => row.key === key)?.value;
}

function boolValue(rows: Row[], key: string) {
  return String(valueOf(rows, key) || '').toLowerCase() === 'true';
}

function statusLabel(ok: boolean, good = 'Ready', bad = 'Needs setup') {
  return <span className={`handoverStatus ${ok ? 'ready' : 'needs'}`}>{ok ? good : bad}</span>;
}

export default async function HandoverPage() {
  const admin = createAdminClient();
  const [configRes, pricingRes, ruleRes, onboardingRes] = admin ? await Promise.all([
    admin.from('system_config').select('key,value').in('key', [
      'automatic_fitter_dispatch_enabled',
      'group_first_dispatch_enabled',
      'owner_acceptance_mobile_checklist',
    ]),
    admin.from('pricing_methods').select('active_method,automatic_customer_pricing_enabled,owner_confirmed').eq('business_key', 'customer-1').maybeSingle(),
    admin.from('business_rules').select('id', { count: 'exact', head: true }).eq('owner_confirmed', true).eq('ai_may_use', true),
    admin.from('business_onboarding').select('status'),
  ]) : [null, null, null, null] as any[];

  const configRows = configRes?.data || [];
  const config = Object.fromEntries(configRows.map((row: Row) => [row.key, row.value]));
  const onboarding = onboardingRes?.data || [];
  const done = onboarding.filter((row: Row) => ['confirmed', 'not_applicable'].includes(row.status)).length;
  const setupPercent = onboarding.length ? Math.round((done / onboarding.length) * 100) : 0;
  const autoPricing = pricingRes?.data?.automatic_customer_pricing_enabled === true;
  const autoDispatch = boolValue(configRows, 'automatic_fitter_dispatch_enabled');
  const groupFirst = boolValue(configRows, 'group_first_dispatch_enabled');
  const mobileCheck = (() => {
    try { return JSON.parse(valueOf(configRows, 'owner_acceptance_mobile_checklist') || 'null'); }
    catch { return null; }
  })();
  const aiRuleCount = ruleRes?.count || 0;

  return <>
    <PageHeader title="Owner Setup Centre" subtitle="One simple place to onboard Customer #1, add rules, prices and preferred fitters." />

    <OwnerSetupStepper setupPercent={setupPercent} aiRuleCount={aiRuleCount} />

    <section className="panel handoverOnePlace">
      <div className="panelHead">
        <h2>What this page controls</h2>
        <p>Use this as the live handover checklist. It keeps the owner out of Supabase and n8n for routine setup.</p>
      </div>
      <div className="handoverTruths">
        <div><strong>Business answers</strong><span>Plain owner answers and Meta/WhatsApp setup status. Do not paste secrets here.</span></div>
        <div><strong>AI rules</strong><span>Only answers marked owner-confirmed and AI may use can improve customer AI behaviour.</span></div>
        <div><strong>Prices</strong><span>Only active, owner-confirmed pricing, coverage and surcharge rules are used for deterministic quote tests.</span></div>
        <div><strong>Fitters</strong><span>Preferred/general fitters live in Fitters. Dispatch switches remain separate and owner-confirmed.</span></div>
      </div>
    </section>

    <section className="panel">
      <div className="panelHead">
        <h2>Safe production switches</h2>
        <p>These must stay OFF until the owner deliberately enables automation later.</p>
      </div>
      <div className="testGrid">
        <article><strong>Automatic Customer Pricing</strong><span className="testBadge disabled">{autoPricing ? 'ON' : 'DISABLED BY OWNER'}</span></article>
        <article><strong>Automatic Fitter Dispatch</strong><span className="testBadge disabled">{autoDispatch ? 'ON' : 'DISABLED BY OWNER'}</span></article>
        <article><strong>Group First</strong><span className="testBadge disabled">{groupFirst ? 'ON' : 'DISABLED BY OWNER'}</span></article>
      </div>
    </section>

    <section id="pricing-rules-unified" className="unifiedRulesWrap">
      <div className="unifiedRulesHead">
        <div>
          <span>Same page</span>
          <h2>Prices, coverage and rules</h2>
          <p>Add tyre prices, coverage areas, surcharges, quote tests and dispatch rules here without leaving Owner Setup.</p>
        </div>
        <Link className="btn" href="/settings/pricing-rules">Open as full page</Link>
      </div>
      <PricingRulesClient config={config} />
    </section>

    <section className="panel">
      <div className="panelHead">
        <h2>Readiness shortcuts</h2>
        <p>Keep the main journey simple, but leave the full tools available.</p>
      </div>
      <div className="handoverSteps compact">
        <article><div><b>1</b><strong>Full detailed setup</strong><p>For deeper checklist work, account inventory, and all handover notes.</p></div><Link className="btn" href="/settings/business">Open Full Setup</Link></article>
        <article><div><b>2</b><strong>Fitters</strong><p>Add preferred/general fitters, WhatsApp numbers, coverage prefixes and priorities.</p></div><Link className="btn" href="/fitters">Open Fitters</Link></article>
        <article><div><b>3</b><strong>System Test</strong><p>Run safe owner acceptance checks and record mobile handover evidence.</p></div>{statusLabel(Boolean(mobileCheck?.complete), 'Mobile checked')}<Link className="btn" href="/settings/system-test">Open System Test</Link></article>
      </div>
    </section>
  </>;
}

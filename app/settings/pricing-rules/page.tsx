import PageHeader from '@/components/PageHeader';
import { createClient } from '@/lib/supabase/server';
import PricingRulesClient from './PricingRulesClient';

const configKeys = [
  'group_first_dispatch_enabled',
  'owner_first_refusal_enabled',
  'owner_first_refusal_minutes',
  'preferred_fitter_window_minutes',
  'general_fitter_window_minutes',
];

export default async function PricingRulesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from('system_config').select('key,value').in('key', configKeys);
  const config = Object.fromEntries((data || []).map((row: any) => [row.key, row.value]));
  return <>
    <PageHeader title="Pricing & Rules" subtitle="Business operating rules, quote testing and dispatch controls." />
    <PricingRulesClient config={config} />
  </>;
}

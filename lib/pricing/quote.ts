import { normalizeTyreSize, postcodeArea } from './normalize';

type Client = any;
type QuoteInput = {
  tyre_size: string;
  quantity: number;
  tier: string;
  postcode?: string;
  requested_time?: string;
  vehicle_category?: string;
  motorway?: boolean;
  locking_wheel_nut?: boolean;
};

function minutesFromTime(value?: string) {
  const match = String(value || '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function timeWindowApplies(requested: number, startValue?: string, endValue?: string) {
  const start = minutesFromTime(startValue);
  const end = minutesFromTime(endValue);
  if (start === null || end === null) return false;
  if (start === end) return false;
  return start < end ? requested >= start && requested < end : requested >= start || requested < end;
}

export async function calculateQuote(admin: Client, input: QuoteInput) {
  const size = normalizeTyreSize(input.tyre_size);
  if (!size) return { quote_status: 'manual_review', reason: 'Invalid tyre size' };
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 8) {
    return { quote_status: 'manual_review', reason: 'Invalid tyre quantity' };
  }
  if (!['budget', 'mid_range', 'premium'].includes(input.tier)) {
    return { quote_status: 'manual_review', reason: 'Invalid tyre tier' };
  }

  const { data: method } = await admin.from('pricing_methods').select('*').eq('business_key', 'customer-1').single();
  if (!method?.owner_confirmed || !['fixed_price', 'hybrid'].includes(method.active_method)) {
    return { quote_status: 'manual_review', reason: 'No owner-confirmed automatic pricing method configured' };
  }

  const { data: priceRows, error: priceError } = await admin
    .from('tyre_price_catalogue')
    .select('*')
    .eq('business_key', 'customer-1')
    .eq('tyre_size', size.tyre_size)
    .eq('tier', input.tier)
    .eq('active', true)
    .eq('owner_confirmed', true)
    .order('effective_from', { ascending: false, nullsFirst: false })
    .limit(1);
  if (priceError || !priceRows?.[0]?.customer_base_price) {
    return { quote_status: 'manual_review', reason: 'No confirmed price configured' };
  }

  const area = postcodeArea(input.postcode || '');
  let locationAdjustment: { label: string; amount: number; id?: string } | null = null;
  if (area) {
    const { data: coverageRows } = await admin
      .from('coverage_rules')
      .select('*')
      .eq('business_key', 'customer-1')
      .eq('active', true)
      .eq('owner_confirmed', true);
    const coverage = (coverageRows || []).find((row: any) => area.startsWith(String(row.area_key || '').toUpperCase()));
    if (!coverage) return { quote_status: 'manual_review', reason: 'No confirmed coverage rule for this area' };
    if (coverage.coverage_status === 'unavailable') return { quote_status: 'manual_review', reason: 'Area marked unavailable' };
    if (coverage.coverage_status === 'manual_quote') return { quote_status: 'manual_review', reason: 'Area requires manual quote' };
    if (coverage.coverage_status === 'surcharge' && Number(coverage.amount)) {
      locationAdjustment = { label: `${coverage.area_key} location`, amount: Number(coverage.amount), id: coverage.id };
    }
  }

  const base = Number(priceRows[0].customer_base_price) * input.quantity;
  const adjustments: Array<{ label: string; amount: number }> = [];
  if (locationAdjustment && Number.isFinite(locationAdjustment.amount)) {
    adjustments.push({ label: locationAdjustment.label, amount: Math.round(locationAdjustment.amount * 100) / 100 });
  }

  const requestedMinutes = minutesFromTime(input.requested_time);
  if (requestedMinutes !== null) {
    const { data: timeRules } = await admin
      .from('pricing_time_rules')
      .select('*')
      .eq('business_key', 'customer-1')
      .eq('active', true)
      .eq('owner_confirmed', true);
    for (const rule of timeRules || []) {
      if (!timeWindowApplies(requestedMinutes, rule.start_time, rule.end_time)) continue;
      const amount = Number(rule.amount);
      if (Number.isFinite(amount) && amount !== 0) adjustments.push({ label: rule.name || 'Out of hours', amount: Math.round(amount * 100) / 100 });
    }
  }

  const { data: surcharges } = await admin
    .from('pricing_surcharge_rules')
    .select('*')
    .eq('business_key', 'customer-1')
    .eq('active', true)
    .eq('owner_confirmed', true)
    .order('priority');

  for (const rule of surcharges || []) {
    const applies =
      (rule.surcharge_type === 'motorway' && input.motorway) ||
      (rule.surcharge_type === 'locking_wheel_nut' && input.locking_wheel_nut) ||
      rule.surcharge_type === 'custom' ||
      rule.surcharge_type === 'callout';
    if (!applies) continue;
    const amount = rule.calculation_type === 'percentage' ? base * (Number(rule.amount) / 100) : Number(rule.amount);
    if (Number.isFinite(amount) && amount !== 0) adjustments.push({ label: rule.name, amount: Math.round(amount * 100) / 100 });
  }

  const customer_price = Math.round((base + adjustments.reduce((sum, row) => sum + row.amount, 0)) * 100) / 100;
  const { data: depositRule } = await admin
    .from('deposit_rules')
    .select('id,deposit_fixed_gbp')
    .eq('deposit_type', 'fixed_gbp')
    .eq('min_job_value_gbp', customer_price)
    .eq('max_job_value_gbp', customer_price)
    .eq('active', true)
    .eq('owner_confirmed', true)
    .eq('ai_may_use', true)
    .limit(1)
    .maybeSingle();
  const depositAmount = Number(depositRule?.deposit_fixed_gbp);
  const hasConfirmedDeposit = Number.isFinite(depositAmount) && depositAmount >= 0 && depositAmount <= customer_price;
  return {
    quote_status: 'priced',
    base_price: base,
    adjustments,
    customer_price,
    currency: 'GBP',
    requires_owner_review: false,
    deposit_status: hasConfirmedDeposit ? 'confirmed' : 'requires_owner',
    deposit_amount: hasConfirmedDeposit ? depositAmount : null,
    rule_sources: [
      { table: 'tyre_price_catalogue', id: priceRows[0].id },
      ...(locationAdjustment?.id ? [{ table: 'coverage_rules', id: locationAdjustment.id }] : []),
      ...(depositRule?.id ? [{ table: 'deposit_rules', id: depositRule.id }] : []),
    ],
  };
}

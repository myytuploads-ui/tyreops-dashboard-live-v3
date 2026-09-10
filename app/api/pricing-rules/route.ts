import { NextResponse } from 'next/server';
import { isAllowedUserId } from '@/lib/auth/allowed-users';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { normalizeTyreSize } from '@/lib/pricing/normalize';
import { calculateQuote } from '@/lib/pricing/quote';

const TABLES = new Set(['tyre_price_catalogue', 'pricing_surcharge_rules', 'coverage_rules', 'pricing_methods', 'dispatch_settings', 'group_message_templates', 'pricing_time_rules', 'pricing_quantity_rules', 'deposit_rules']);
const TYRE_TIERS = new Set(['budget', 'mid_range', 'premium']);
const PRICE_METHODS = new Set(['manual_quote', 'fixed_price', 'supplier_cost_plus_markup', 'supplier_cost_plus_margin', 'hybrid']);
const DISPATCH = new Set(['manual', 'registered_fitters', 'group_first', 'hybrid']);

function error(message: string, status: number) { return NextResponse.json({ ok: false, error: message }, { status }); }
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
async function auth() {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { admin: null, error: error('Authentication required.', 401) };
  if (!isAllowedUserId(user.id)) return { admin: null, error: error('Access not authorised.', 403) };
  const admin = createAdminClient();
  if (!admin) return { admin: null, error: error('Pricing rules are not configured.', 503) };
  return { admin, error: null };
}
function text(value: unknown, max = 1000) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : undefined;
}
function bool(value: unknown) { return typeof value === 'boolean' ? value : undefined; }
function num(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET() {
  const session = await auth();
  if (session.error || !session.admin) return session.error;
  const admin = session.admin;
  const [methods, prices, surcharges, coverage, dispatch, templates, systemDispatch, timeRules, quantityRules, depositRules] = await Promise.all([
    admin.from('pricing_methods').select('*').eq('business_key', 'customer-1').single(),
    admin.from('tyre_price_catalogue').select('*').eq('business_key', 'customer-1').order('updated_at', { ascending: false }).limit(500),
    admin.from('pricing_surcharge_rules').select('*').eq('business_key', 'customer-1').order('priority').limit(500),
    admin.from('coverage_rules').select('*').eq('business_key', 'customer-1').order('area_key').limit(500),
    admin.from('dispatch_settings').select('*').eq('business_key', 'customer-1').single(),
    admin.from('group_message_templates').select('*').eq('business_key', 'customer-1').order('template_name').limit(20),
    admin.from('system_config').select('value').eq('key', 'automatic_fitter_dispatch_enabled').maybeSingle(),
    admin.from('pricing_time_rules').select('*').eq('business_key', 'customer-1').order('updated_at', { ascending: false }).limit(200),
    admin.from('pricing_quantity_rules').select('*').eq('business_key', 'customer-1').order('updated_at', { ascending: false }).limit(200),
    admin.from('deposit_rules').select('*').order('min_job_value_gbp').limit(200),
  ]);
  const rawDispatch = systemDispatch.data?.value;
  // Missing configuration must never appear as enabled. The production-safe
  // default is manual dispatch until the owner explicitly turns it on.
  const automaticDispatch = String(rawDispatch ?? '').toLowerCase() === 'true';
  return NextResponse.json({
    ok: true,
    pricing_method: methods.data,
    prices: prices.data || [],
    surcharges: surcharges.data || [],
    coverage: coverage.data || [],
    dispatch_settings: dispatch.data ? { ...dispatch.data, automatic_fitter_dispatch_enabled: automaticDispatch } : null,
    dispatch_source_of_truth: { key: 'system_config.automatic_fitter_dispatch_enabled', automatic_fitter_dispatch_enabled: automaticDispatch, raw_value: rawDispatch ?? null },
    templates: templates.data || [],
    time_rules: timeRules.data || [],
    quantity_rules: quantityRules.data || [],
    deposit_rules: depositRules.data || [],
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const session = await auth();
  if (session.error || !session.admin) return session.error;
  let body: unknown;
  try { body = await request.json(); } catch { return error('A valid JSON body is required.', 400); }
  if (!isObject(body) || typeof body.action !== 'string') return error('Invalid pricing request.', 400);
  const admin = session.admin;

  if (body.action === 'quote') {
    if (!isObject(body.input)) return error('Quote input is required.', 400);
    return NextResponse.json({ ok: true, quote: await calculateQuote(admin, body.input as any) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (body.action === 'save' || body.action === 'deactivate') {
    if (typeof body.table !== 'string' || !TABLES.has(body.table) || !isObject(body.values)) return error('Unsupported pricing save.', 400);
    const table = body.table;
    const values = body.values;
    if (body.action === 'deactivate') {
      if (typeof body.id !== 'string') return error('A rule ID is required.', 400);
      const active = bool(values.active);
      if (active === undefined) return error('Active state is required.', 400);
      let query = admin.from(table).update({ active }).eq('id', body.id);
      if (table !== 'deposit_rules') query = query.eq('business_key', 'customer-1');
      const result = await query.select('*').single();
      if (result.error) return error('Rule active state could not be saved.', 500);
      return NextResponse.json({ ok: true, row: result.data }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const payload: Record<string, unknown> = table === 'deposit_rules' ? {} : { business_key: 'customer-1' };
    if (table === 'tyre_price_catalogue') {
      const normalized = normalizeTyreSize(String(values.tyre_size || ''));
      if (!normalized) return error('Tyre size is invalid.', 400);
      if (typeof values.tier !== 'string' || !TYRE_TIERS.has(values.tier)) return error('Tyre tier is invalid.', 400);
      Object.assign(payload, normalized, {
        tier: values.tier,
        brand: text(values.brand),
        model: text(values.model),
        vehicle_category: text(values.vehicle_category),
        supplier_cost: num(values.supplier_cost),
        customer_base_price: num(values.customer_base_price),
        fitting_included: bool(values.fitting_included),
        disposal_included: bool(values.disposal_included),
        source: text(values.source),
        active: bool(values.active) ?? true,
        owner_confirmed: bool(values.owner_confirmed) ?? false,
        notes: text(values.notes, 3000),
      });
    } else if (table === 'pricing_methods') {
      if (typeof values.active_method !== 'string' || !PRICE_METHODS.has(values.active_method)) return error('Pricing method is invalid.', 400);
      if (typeof values.fallback_method !== 'string' || !PRICE_METHODS.has(values.fallback_method)) return error('Fallback method is invalid.', 400);
      Object.assign(payload, {
        active_method: values.active_method,
        fallback_method: values.fallback_method,
        automatic_customer_pricing_enabled: bool(values.automatic_customer_pricing_enabled) ?? false,
        owner_confirmed: bool(values.owner_confirmed) ?? false,
        notes: text(values.notes, 3000),
      });
    } else if (table === 'dispatch_settings') {
      if (typeof values.dispatch_strategy !== 'string' || !DISPATCH.has(values.dispatch_strategy)) return error('Dispatch strategy is invalid.', 400);
      Object.assign(payload, {
        automatic_fitter_dispatch_enabled: bool(values.automatic_fitter_dispatch_enabled) ?? false,
        dispatch_strategy: values.dispatch_strategy,
        group_wait_minutes: num(values.group_wait_minutes),
        owner_first_refusal_enabled: bool(values.owner_first_refusal_enabled) ?? false,
        owner_first_refusal_timeout_minutes: num(values.owner_first_refusal_timeout_minutes),
        owner_confirmed: bool(values.owner_confirmed) ?? false,
        notes: text(values.notes, 3000),
      });
      const autoValue = payload.automatic_fitter_dispatch_enabled === true ? 'true' : 'false';
      const { error: configError } = await admin.from('system_config').upsert({ key: 'automatic_fitter_dispatch_enabled', value: autoValue });
      if (configError) return error('Automatic dispatch switch could not be saved.', 500);
    } else if (table === 'group_message_templates') {
      const template = text(values.template_body, 1000);
      if (!template) return error('Template body is required.', 400);
      const invalid = [...template.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).filter((key) => !['area', 'tyre_size', 'quantity', 'urgency', 'requested_time', 'offer_link'].includes(key));
      if (invalid.length) return error('Template contains unsupported placeholders.', 400);
      Object.assign(payload, { template_name: text(values.template_name, 80) || 'Recommended', template_body: template, active: bool(values.active) ?? true, owner_confirmed: bool(values.owner_confirmed) ?? false, notes: text(values.notes, 3000) });
    } else if (table === 'coverage_rules') {
      if (!['included', 'surcharge', 'manual_quote', 'unavailable'].includes(String(values.coverage_status))) return error('Coverage status is invalid.', 400);
      Object.assign(payload, { area_key: String(values.area_key || '').trim().toUpperCase(), named_area: text(values.named_area), coverage_status: values.coverage_status, amount: num(values.amount), active: bool(values.active) ?? false, owner_confirmed: bool(values.owner_confirmed) ?? false, notes: text(values.notes, 3000) });
      if (!payload.area_key) return error('Coverage area is required.', 400);
    } else if (table === 'pricing_surcharge_rules') {
      if (!['fixed', 'percentage'].includes(String(values.calculation_type))) return error('Surcharge calculation type is invalid.', 400);
      if (!['night', 'out_of_hours', 'motorway', 'roadside', 'area', 'distance', 'callout', 'locking_wheel_nut', 'quantity', 'custom'].includes(String(values.surcharge_type))) return error('Surcharge type is invalid.', 400);
      Object.assign(payload, { name: text(values.name, 120), surcharge_type: values.surcharge_type, calculation_type: values.calculation_type, amount: num(values.amount) ?? 0, priority: num(values.priority) ?? 100, stackable: bool(values.stackable) ?? true, active: bool(values.active) ?? false, owner_confirmed: bool(values.owner_confirmed) ?? false, customer_description: text(values.customer_description, 500), internal_notes: text(values.internal_notes, 3000) });
      if (!payload.name) return error('Surcharge name is required.', 400);
    } else if (table === 'pricing_time_rules') {
      Object.assign(payload, {
        name: text(values.name, 120),
        rule_type: text(values.rule_type, 80) || 'custom',
        start_time: text(values.start_time, 16),
        end_time: text(values.end_time, 16),
        surcharge_type: text(values.surcharge_type, 80),
        amount: num(values.amount),
        active: bool(values.active) ?? false,
        owner_confirmed: bool(values.owner_confirmed) ?? false,
        notes: text(values.notes, 3000),
      });
      if (!payload.name || !payload.start_time || !payload.end_time) return error('Time rule name and window are required.', 400);
    } else if (table === 'pricing_quantity_rules') {
      Object.assign(payload, {
        name: text(values.name, 120),
        min_quantity: num(values.min_quantity),
        max_quantity: num(values.max_quantity),
        adjustment_type: text(values.adjustment_type, 80) || 'manual_quote',
        amount: num(values.amount),
        active: bool(values.active) ?? false,
        owner_confirmed: bool(values.owner_confirmed) ?? false,
        notes: text(values.notes, 3000),
      });
      if (!payload.name || !payload.min_quantity || !payload.max_quantity) return error('Quantity rule name and range are required.', 400);
    } else if (table === 'deposit_rules') {
      const customerPrice = num(values.min_job_value_gbp);
      const maxPrice = num(values.max_job_value_gbp);
      const deposit = num(values.deposit_fixed_gbp);
      if (customerPrice === undefined || customerPrice === null || customerPrice <= 0) return error('Customer price is required.', 400);
      if (maxPrice !== customerPrice) return error('Deposit rules must match one exact customer price.', 400);
      if (deposit === undefined || deposit === null || deposit < 0 || deposit > customerPrice) return error('Deposit must be between £0 and the customer price.', 400);
      Object.assign(payload, {
        deposit_type: 'fixed_gbp',
        min_job_value_gbp: customerPrice,
        max_job_value_gbp: customerPrice,
        deposit_percentage: null,
        deposit_fixed_gbp: deposit,
        deposit_minimum_gbp: deposit,
        description: text(values.description, 500) || `Owner-confirmed exact deposit for £${customerPrice}`,
        active: bool(values.active) ?? true,
        owner_confirmed: bool(values.owner_confirmed) ?? false,
        ai_may_use: bool(values.ai_may_use) ?? false,
      });
    }
    let result;
    if (typeof body.id === 'string') result = await admin.from(table).update(payload).eq('id', body.id).select('*').single();
    else result = await admin.from(table).insert(payload).select('*').single();
    if (result.error) return error('Pricing rule could not be saved.', 500);
    return NextResponse.json({ ok: true, row: result.data }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return error('Unsupported pricing action.', 400);
}

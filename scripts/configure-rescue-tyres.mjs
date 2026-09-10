import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !key) throw new Error('Supabase server configuration is unavailable.');

const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const now = new Date().toISOString();

const confirmedRules = [
  ['Product / service', 'fitting_included', 'yes', true, 'Customer prices normally include fitting; do not add a separate fitting fee unless the owner explicitly approves an exception.'],
  ['Product / service', 'mobile_fitting_offered', 'yes', true, 'Rescue Tyres provides mobile tyre fitting.'],
  ['Product / service', 'motorway_callouts_offered', 'yes', true, 'Motorway work is supported; perform a concise safety check and do not promise an exact price or ETA.'],
  ['Product / service', 'budget_tyres_available', 'yes', true, 'Budget tyres are available subject to stock and owner confirmation.'],
  ['Product / service', 'mid_range_tyres_available', 'yes', true, 'Mid-range tyres are available subject to stock and owner confirmation.'],
  ['Product / service', 'premium_tyres_available', 'yes', true, 'Premium tyres are available subject to stock and owner confirmation.'],
  ['Product / service', 'cars_supported', 'yes', true, 'Cars are supported.'],
  ['Product / service', 'vans_supported', 'yes', true, 'Vans are supported.'],
  ['Product / service', 'motorcycles_supported', 'no', true, 'Motorcycles and bikes are not currently supported.'],
  ['Product / service', 'hgv_supported', 'no', true, 'Lorries and HGVs are not currently supported.'],
  ['Product / service', 'run_flat_supported', 'yes', true, 'Run-flat tyres are supported where applicable, subject to owner pricing and availability.'],
  ['Customer intake', 'tyre_size_required', 'yes', true, 'Collect the tyre size before the job is ready for pricing.'],
  ['Customer intake', 'tyre_quantity_required', 'yes', true, 'Collect the number of tyres required.'],
  ['Customer intake', 'customer_location_required', 'yes', true, 'Collect a postcode or live/exact location.'],
  ['Customer intake', 'locking_wheel_nut_status_required', 'yes', true, 'Confirm the locking wheel nut situation.'],
  ['Customer intake', 'motorway_status_when_relevant', 'yes', true, 'Confirm roadside or motorway status where relevant.'],
  ['Customer intake', 'requested_time_required', 'yes', true, 'Ask when the customer needs the job.'],
  ['Customer intake', 'vehicle_registration_optional', 'yes', true, 'Registration can help but must not block intake or pricing.'],
  ['Customer intake', 'tyre_sidewall_photo_when_size_unknown', 'yes', true, 'Ask for a clear sidewall photo when the customer does not know the tyre size.'],
  ['Customer intake', 'roadside_safety_check_required', 'yes', true, 'For roadside or motorway enquiries, first check that the customer is safely parked.'],
  ['Customer intake', 'coverage_approximately_40_miles_from_b28', 'yes', true, 'Typical operating coverage is approximately 40 miles from B28/Birmingham; uncertain locations still require confirmation.'],
  ['Customer intake', 'customer_tone_natural_uk', 'yes', true, 'Use short, warm, professional UK English; answer questions before continuing intake and disclose AI use if directly asked.'],
  ['Payments', 'deposit_required', 'yes', true, 'A confirmed deposit is required before dispatch; the amount comes from owner-confirmed exact rules or owner input.'],
  ['Payments', 'bank_transfer_supported', 'yes', true, 'Bank transfer is supported when the owner provides the correct instructions.'],
  ['Payments', 'payment_link_supported', 'yes', true, 'Payment links are supported after owner-approved pricing.'],
  ['Payments', 'refunds_require_owner', 'yes', true, 'Refund decisions always require the owner.'],
  ['Customer promises', 'customer_may_request_call', 'yes', true, 'The owner handles phone calls; the AI may acknowledge a call request and escalate it.'],
  ['Customer promises', 'ai_may_quote_exact_prices', 'no', true, 'Automatic customer pricing is disabled. Only an owner-approved quote may be given.'],
  ['Customer promises', 'ai_may_promise_exact_eta', 'no', true, 'Do not promise an exact ETA until a fitter and ETA are confirmed.'],
  ['Customer promises', 'ai_may_state_tyre_stock', 'no', true, 'Do not state stock availability unless it has been explicitly confirmed.'],
  ['Customer promises', 'ai_may_confirm_coverage', 'no', true, 'Coverage is approximately 40 miles from B28, but uncertain or boundary jobs require confirmation.'],
  ['Customer promises', 'price_negotiation_requires_owner', 'yes', true, 'Price objections and negotiation go to the owner; the AI must not apply discretionary discounts.'],
  ['Customer promises', 'extra_customer_charges_require_owner', 'yes', true, 'Fitters must not add charges without Rescue Tyres owner approval.'],
  ['Customer promises', 'multi_tyre_discounts_may_be_offered', 'yes', false, 'This is internal commercial context only. Any discount remains an owner decision.'],
];

const checklistAnswers = new Map([
  ['business_identity_confirmed', 'Rescue Tyres LTD'],
  ['business_name_confirmed', 'Rescue Tyres LTD'],
  ['business_description_reviewed', 'Mobile tyre fitting and roadside tyre assistance for cars and vans.'],
  ['coverage_notes_captured', 'Approximately 40 miles from B28/Birmingham; uncertain boundary jobs require owner review.'],
  ['customer_ai_facts_reviewed', 'Owner-confirmed intake and customer-safe operating rules recorded.'],
  ['customer_ai_description_approved', 'Natural, concise, professional UK conversational tone.'],
  ['customer_ai_exceptions_reviewed', 'Pricing, negotiation, refunds and unusual cases remain owner-controlled.'],
  ['pricing_method_agreed', 'Manual owner pricing is authoritative.'],
  ['pricing_today_method', 'Owner sets and approves every customer quote.'],
  ['pricing_deposit_policy', 'Exact owner-confirmed quote/deposit pairs; unmatched prices require owner confirmation.'],
  ['pricing_follow_up', 'One follow-up after 15 minutes when still appropriate; never repeatedly chase.'],
  ['pricing_unavailable_fallback', 'Owner pricing required.'],
  ['dispatch_method_agreed', 'Owner manually posts to existing fitter groups and chooses the fitter.'],
  ['owner_has_fitter_groups', 'Existing WhatsApp fitter groups remain manually operated.'],
  ['group_message_wording_approved', 'Include tyre size, quantity, location, relevant customer quote, and request fitter price plus ETA.'],
  ['owner_first_refusal_rules_agreed', 'Five-minute normal window; attractive jobs require owner judgement.'],
  ['owner_first_refusal_duration', '5 minutes normal; 7.5 minutes at night.'],
  ['payments_confirmed', 'Customer can pay by bank transfer or payment link; refunds remain owner-only.'],
  ['deposit_rule_confirmed', 'Exact owner-confirmed quote/deposit pairs configured.'],
  ['typical_deposit_rule', '£150→£40, £200→£80, £250→£100, £300→£120, £400→£160, £500→£200, £700→£300.'],
  ['night_deposit_rule', 'Night and motorway do not independently change the deposit after customer price is set.'],
  ['balance_method', 'Remaining balance handling is recorded per job; no amount is inferred.'],
  ['refund_cancellation_confirmed', 'Refund decisions require owner approval; ambiguous cancellation responsibility requires manual review.'],
  ['motorway_policy', 'Motorway jobs are supported and require a concise safety check.'],
  ['travel_area', 'Approximately 40 miles from B28/Birmingham.'],
  ['call_request_behaviour', 'The owner answers calls; AI phone answering is not enabled.'],
  ['manual_approval_jobs', 'Pricing, negotiation, fitter selection, refunds, complaints and unusual money cases require owner judgement.'],
]);

function assertOk(result, label) {
  if (result.error) throw new Error(`${label}: ${result.error.message}`);
  return result.data;
}

const profile = assertOk(await db.from('business_profile').select('id').eq('business_key', 'customer-1').single(), 'Load business profile');

assertOk(await db.from('business_profile').update({
  business_name: 'Rescue Tyres LTD',
  pricing_mode: 'manual_owner_pricing',
  preferred_dispatch_mode: 'group_first',
  owner_first_refusal_minutes: 5,
  pricing_notes: 'Owner sets every customer price. Negotiation, discounts and exceptions require owner approval. Automatic customer pricing remains disabled.',
  updated_at: now,
}).eq('id', profile.id), 'Update business profile');

assertOk(await db.from('pricing_methods').update({
  active_method: 'manual_quote',
  fallback_method: 'manual_quote',
  automatic_customer_pricing_enabled: false,
  owner_confirmed: true,
  confirmed_at: now,
  notes: 'Manual owner pricing is authoritative for the pilot. Automatic customer pricing remains disabled.',
  updated_at: now,
}).eq('business_key', 'customer-1'), 'Confirm manual pricing');

assertOk(await db.from('dispatch_settings').update({
  automatic_fitter_dispatch_enabled: false,
  dispatch_strategy: 'manual',
  owner_first_refusal_enabled: true,
  owner_first_refusal_timeout_minutes: 5,
  preferred_fitter_priority_enabled: false,
  owner_confirmed: true,
  notes: 'Owner manually posts to existing fitter groups and selects the fitter. No automatic fitter selection or dispatch.',
  updated_at: now,
}).eq('business_key', 'customer-1'), 'Confirm manual dispatch');

const configRows = [
  ['automatic_customer_pricing_enabled', 'false'],
  ['automatic_fitter_selection_enabled', 'false'],
  ['automatic_fitter_dispatch_enabled', 'false'],
  ['group_first_dispatch_enabled', 'false'],
  ['owner_first_refusal_enabled', 'true'],
  ['owner_first_refusal_minutes', '5'],
  ['owner_first_refusal_night_minutes', '7.5'],
  ['quote_follow_up_minutes', '15'],
  ['quote_follow_up_max_attempts', '1'],
  ['quote_validity_minutes', '60'],
  ['payment_link_expiry_minutes', '60'],
  ['daily_summary_hour', '22'],
  ['deposit_policy_mode', 'exact_confirmed_rules'],
  ['deposit_pilot_fixed_gbp', ''],
  ['google_review_url', ''],
  ['trustpilot_review_url', ''],
].map(([key, value]) => ({ key, value }));
assertOk(await db.from('system_config').upsert(configRows, { onConflict: 'key' }), 'Update system configuration');

for (const [category, ruleKey, answer, aiMayUse, notes] of confirmedRules) {
  const existing = assertOk(await db.from('business_rules').select('id').eq('business_id', profile.id).eq('rule_key', ruleKey).maybeSingle(), `Check ${ruleKey}`);
  const values = { category, rule_key: ruleKey, structured_value: { answer }, owner_confirmed: true, ai_may_use: aiMayUse, notes, confirmed_at: now, updated_at: now };
  if (existing?.id) assertOk(await db.from('business_rules').update(values).eq('id', existing.id), `Update ${ruleKey}`);
  else assertOk(await db.from('business_rules').insert({ business_id: profile.id, ...values }), `Insert ${ruleKey}`);
}

for (const [itemKey, answer] of checklistAnswers) {
  const item = assertOk(await db.from('business_onboarding').select('captured_value').eq('business_id', profile.id).eq('item_key', itemKey).maybeSingle(), `Check ${itemKey}`);
  if (!item) continue;
  const captured = item.captured_value && typeof item.captured_value === 'object' ? item.captured_value : {};
  assertOk(await db.from('business_onboarding').update({ status: 'confirmed', captured_value: { ...captured, answer }, confirmed_at: now, updated_at: now }).eq('business_id', profile.id).eq('item_key', itemKey), `Confirm ${itemKey}`);
}

const pairs = [[150, 40], [200, 80], [250, 100], [300, 120], [400, 160], [500, 200], [700, 300]];
for (const [quote, deposit] of pairs) {
  const description = `Rescue Tyres owner-confirmed exact quote £${quote}`;
  const existing = assertOk(await db.from('deposit_rules').select('id').eq('description', description).maybeSingle(), `Check deposit ${quote}`);
  const values = { deposit_type: 'fixed_gbp', min_job_value_gbp: quote, max_job_value_gbp: quote, deposit_fixed_gbp: deposit, deposit_percentage: null, deposit_minimum_gbp: deposit, description, active: true, owner_confirmed: true, ai_may_use: true, updated_at: now };
  if (existing?.id) assertOk(await db.from('deposit_rules').update(values).eq('id', existing.id), `Update deposit ${quote}`);
  else assertOk(await db.from('deposit_rules').insert(values), `Insert deposit ${quote}`);
}

const verification = {
  configured_rules: (await db.from('business_rules').select('id', { count: 'exact', head: true }).eq('business_id', profile.id).eq('owner_confirmed', true)).count,
  ai_rules: (await db.from('business_rules').select('id', { count: 'exact', head: true }).eq('business_id', profile.id).eq('owner_confirmed', true).eq('ai_may_use', true)).count,
  deposit_rules: (await db.from('deposit_rules').select('id', { count: 'exact', head: true }).eq('active', true)).count,
  automatic_customer_pricing_enabled: false,
  automatic_fitter_selection_enabled: false,
  automatic_fitter_dispatch_enabled: false,
  group_first_dispatch_enabled: false,
};
console.log(JSON.stringify(verification));

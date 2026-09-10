import { NextResponse } from 'next/server';
import { isAllowedUserId } from '@/lib/auth/allowed-users';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { onboardingCatalog, ruleCatalog } from '@/lib/business-setup/catalog';
import { loadBusinessSetup } from '@/lib/business-setup/server';

const PROFILE_FIELDS = new Set([
  'business_name', 'owner_name', 'customer_description', 'customer_whatsapp_number', 'whatsapp_type',
  'whatsapp_setup_status', 'meta_setup_status', 'telegram_setup_status', 'pricing_mode', 'pricing_source',
  'pricing_notes', 'preferred_dispatch_mode', 'group_dispatch_wait_minutes', 'owner_first_refusal_minutes',
  'coverage_notes', 'operating_hours_notes', 'general_notes', 'onboarding_status',
]);
const PROFILE_LIMITS: Record<string, number> = {
  business_name: 160, owner_name: 160, customer_description: 3000, customer_whatsapp_number: 32,
  pricing_source: 1000, pricing_notes: 5000, coverage_notes: 5000, operating_hours_notes: 5000, general_notes: 5000,
};
const ENUMS: Record<string, Set<string>> = {
  whatsapp_type: new Set(['unknown', 'whatsapp_business_app', 'cloud_api', 'coexistence', 'other']),
  whatsapp_setup_status: new Set(['unknown', 'not_started', 'in_progress', 'confirmed', 'blocked', 'not_applicable']),
  meta_setup_status: new Set(['unknown', 'not_started', 'in_progress', 'confirmed', 'blocked', 'not_applicable']),
  telegram_setup_status: new Set(['unknown', 'not_started', 'in_progress', 'confirmed', 'blocked', 'not_applicable']),
  pricing_mode: new Set(['unknown', 'manual_owner_pricing', 'price_list', 'supplier_lookup', 'rules_based', 'hybrid']),
  preferred_dispatch_mode: new Set(['undecided', 'group_first', 'registered_fitters_first', 'hybrid']),
  onboarding_status: new Set(['discovery', 'configuration', 'testing', 'ready_with_blockers', 'ready_for_controlled_pilot', 'live']),
};
const ITEM_STATUSES = new Set(['pending', 'in_progress', 'confirmed', 'blocked', 'not_applicable']);
const RULE_ANSWERS = new Set(['yes', 'no', 'depends', 'unknown']);
const RESPONSIBLE = new Set(['owner', 'tyreops', 'both', 'external_provider']);
const PRIORITIES = new Set(['required_before_pilot', 'required_before_handover', 'recommended', 'optional']);
const CAPTURED_VALUE_FIELDS = new Set([
  'answer', 'stage', 'explanation', 'responsible', 'priority', 'evidence_reference', 'action_required',
  'integration_purpose', 'integration_owner', 'credential_location', 'billing_responsibility',
  'connected', 'production', 'tested', 'non_secret_identifier', 'last_verified', 'issue_action_required',
]);

const PROFILE_CHECKLIST_MAP: Record<string, string> = {
  business_name: 'business_name_confirmed',
  owner_name: 'owner_name_confirmed',
  customer_description: 'business_description_reviewed',
  coverage_notes: 'coverage_notes_captured',
  operating_hours_notes: 'operating_hours_captured',
  general_notes: 'general_notes_reviewed',
  customer_whatsapp_number: 'whatsapp_number_confirmed',
  whatsapp_type: 'whatsapp_type_identified',
  whatsapp_setup_status: 'production_number_connected',
  meta_setup_status: 'meta_account_access_confirmed',
  telegram_setup_status: 'telegram_destination_confirmed',
};

function responseError(message: string, status: number) { return NextResponse.json({ ok: false, error: message }, { status }); }
function isObject(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function exactKeys(value: Record<string, unknown>, allowed: string[]) { return Object.keys(value).every((key) => allowed.includes(key)); }
function containsSecretLikeText(value: unknown) {
  const text = typeof value === 'string' ? value.toLowerCase() : '';
  return /(password|token|secret|bearer|api[_ -]?key|sk_live|sk_test|eyj)/i.test(text);
}
function sanitizeCapturedValue(value: unknown, existing: unknown) {
  const current = isObject(existing) ? existing : {};
  const incoming = typeof value === 'string' || value === null ? { answer: value || '' } : isObject(value) ? value : null;
  if (!incoming) return null;
  if (!Object.keys(incoming).every((key) => CAPTURED_VALUE_FIELDS.has(key))) return null;
  const next: Record<string, unknown> = { ...current };
  for (const [key, raw] of Object.entries(incoming)) {
    if (['connected', 'production', 'tested'].includes(key)) {
      if (typeof raw !== 'boolean') return null;
      next[key] = raw;
      continue;
    }
    if (raw !== null && typeof raw !== 'string') return null;
    const text = String(raw || '').trim();
    if (containsSecretLikeText(text)) return null;
    if (key === 'responsible' && text && !RESPONSIBLE.has(text)) return null;
    if (key === 'priority' && text && !PRIORITIES.has(text)) return null;
    if (text.length > (key === 'answer' || key === 'action_required' ? 3000 : 1000)) return null;
    next[key] = text;
  }
  return next;
}

async function authorised() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: responseError('Authentication required.', 401), admin: null };
  if (!isAllowedUserId(user.id)) return { error: responseError('Access not authorised.', 403), admin: null };
  const admin = createAdminClient();
  if (!admin) return { error: responseError('Business setup is not configured.', 503), admin: null };
  return { error: null, admin };
}

export async function GET() {
  const auth = await authorised();
  if (auth.error || !auth.admin) return auth.error;
  try { return NextResponse.json({ ok: true, ...(await loadBusinessSetup(auth.admin)) }, { headers: { 'Cache-Control': 'no-store' } }); }
  catch { return responseError('Business setup could not be loaded.', 500); }
}

export async function PATCH(request: Request) {
  const auth = await authorised();
  if (auth.error || !auth.admin) return auth.error;
  let body: unknown;
  try { body = await request.json(); } catch { return responseError('A valid JSON body is required.', 400); }
  if (!isObject(body) || typeof body.entity !== 'string') return responseError('Invalid business setup request.', 400);

  const { data: profile } = await auth.admin.from('business_profile').select('id').eq('business_key', 'customer-1').single();
  if (!profile) return responseError('Business profile was not found.', 404);
  const now = new Date().toISOString();

  if (body.entity === 'profile') {
    if (!exactKeys(body, ['entity', 'values']) || !isObject(body.values)) return responseError('Invalid profile update.', 400);
    const fields = Object.keys(body.values);
    if (!fields.length || fields.some((field) => !PROFILE_FIELDS.has(field))) return responseError('Profile contains an unsupported field.', 400);
    const values: Record<string, unknown> = {};
    for (const [field, value] of Object.entries(body.values)) {
      if (field === 'group_dispatch_wait_minutes' || field === 'owner_first_refusal_minutes') {
        if (value === '' || value === null) { values[field] = null; continue; }
        if (!Number.isInteger(value) || Number(value) < (field === 'group_dispatch_wait_minutes' ? 1 : 0) || Number(value) > 1440) return responseError(`${field.replaceAll('_', ' ')} is invalid.`, 400);
        values[field] = value; continue;
      }
      if (typeof value !== 'string') return responseError(`${field.replaceAll('_', ' ')} must be text.`, 400);
      const trimmed = value.trim();
      if (ENUMS[field] && !ENUMS[field].has(trimmed)) return responseError(`${field.replaceAll('_', ' ')} is invalid.`, 400);
      if (PROFILE_LIMITS[field] && trimmed.length > PROFILE_LIMITS[field]) return responseError(`${field.replaceAll('_', ' ')} is too long.`, 400);
      if (field === 'customer_whatsapp_number' && trimmed && !/^\+?[0-9 ()-]{7,32}$/.test(trimmed)) return responseError('WhatsApp number format is invalid.', 400);
      values[field] = trimmed || null;
    }
    const { error } = await auth.admin.from('business_profile').update({ ...values, updated_at: now }).eq('id', profile.id);
    if (error) return responseError('Profile changes could not be saved.', 500);
    // Keep the guided checklist honest: only mark a matching item complete when
    // the owner actually provided a non-empty value (and never mark an item
    // complete merely because its field was displayed).
    await Promise.all(Object.entries(values).map(async ([field, value]) => {
      const itemKey = PROFILE_CHECKLIST_MAP[field];
      if (!itemKey) return;
      const hasValue = typeof value === 'string' ? value.trim().length > 0 : value !== null && value !== undefined;
      await auth.admin.from('business_onboarding').update({
        status: hasValue ? 'confirmed' : 'pending',
        confirmed_at: hasValue ? now : null,
        updated_at: now,
      }).eq('business_id', profile.id).eq('item_key', itemKey);
    }));
  } else if (body.entity === 'onboarding') {
    if (!exactKeys(body, ['entity', 'item_key', 'status', 'captured_value', 'notes'])) return responseError('Invalid checklist update.', 400);
    if (typeof body.item_key !== 'string' || !onboardingCatalog.some((item) => item.item_key === body.item_key)) return responseError('Unknown onboarding item.', 400);
    if (typeof body.status !== 'string' || !ITEM_STATUSES.has(body.status)) return responseError('Invalid onboarding status.', 400);
    if (body.notes !== null && typeof body.notes !== 'string') return responseError('Notes must be text.', 400);
    const { data: existing } = await auth.admin.from('business_onboarding').select('captured_value').eq('business_id', profile.id).eq('item_key', body.item_key).single();
    const capturedValue = sanitizeCapturedValue(body.captured_value, existing?.captured_value);
    if (!capturedValue) return responseError('Captured values must be non-secret onboarding text.', 400);
    if (String(body.notes || '').length > 5000 || containsSecretLikeText(body.notes)) return responseError('Notes must be non-secret and under 5000 characters.', 400);
    const { error } = await auth.admin.from('business_onboarding').update({
      status: body.status, captured_value: capturedValue,
      notes: body.notes || null, confirmed_at: body.status === 'confirmed' ? now : null, updated_at: now,
    }).eq('business_id', profile.id).eq('item_key', body.item_key);
    if (error) return responseError('Checklist item could not be saved.', 500);
  } else if (body.entity === 'rule') {
    if (!exactKeys(body, ['entity', 'rule_key', 'answer', 'owner_confirmed', 'ai_may_use', 'notes'])) return responseError('Invalid business rule update.', 400);
    if (typeof body.rule_key !== 'string' || !ruleCatalog.some((rule) => rule.rule_key === body.rule_key)) return responseError('Unknown business rule.', 400);
    if (typeof body.answer !== 'string' || !RULE_ANSWERS.has(body.answer)) return responseError('Invalid business rule value.', 400);
    if (typeof body.owner_confirmed !== 'boolean' || typeof body.ai_may_use !== 'boolean') return responseError('Invalid business rule confirmation.', 400);
    if (typeof body.notes !== 'string' || body.notes.length > 5000) return responseError('Business rule notes are invalid or too long.', 400);
    if (body.ai_may_use && (!body.owner_confirmed || body.answer === 'unknown')) return responseError('AI use requires an owner-confirmed, known answer.', 400);
    const { error } = await auth.admin.from('business_rules').update({
      structured_value: { answer: body.answer }, owner_confirmed: body.owner_confirmed, ai_may_use: body.ai_may_use,
      notes: body.notes || null, confirmed_at: body.owner_confirmed ? now : null, updated_at: now,
    }).eq('business_id', profile.id).eq('rule_key', body.rule_key);
    if (error) return responseError('Business rule could not be saved.', 500);
  } else return responseError('Unsupported business setup entity.', 400);

  try { return NextResponse.json({ ok: true, ...(await loadBusinessSetup(auth.admin)) }); }
  catch { return responseError('Changes were saved, but refreshed setup data is unavailable.', 500); }
}

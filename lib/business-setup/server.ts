import 'server-only';
import { onboardingCatalog, ruleCatalog } from './catalog';

function catalogValue(item: any, existingValue?: any) {
  const current = existingValue && typeof existingValue === 'object' && !Array.isArray(existingValue) ? existingValue : {};
  return {
    ...current,
    ...(current.answer ? {} : item.established ? { answer: 'Technically verified' } : {}),
    stage: current.stage || item.stage,
    explanation: current.explanation || item.explanation,
    responsible: current.responsible || item.responsible,
    priority: current.priority || item.priority,
    evidence_reference: current.evidence_reference || '',
    action_required: current.action_required || '',
    ...(item.integration ? {
      integration_purpose: current.integration_purpose || item.integration.purpose,
      integration_owner: current.integration_owner || item.integration.owner,
      credential_location: current.credential_location || item.integration.credentialLocation,
      billing_responsibility: current.billing_responsibility || item.integration.billingResponsibility,
      connected: current.connected ?? false,
      production: current.production ?? false,
      tested: current.tested ?? false,
      non_secret_identifier: current.non_secret_identifier || '',
      last_verified: current.last_verified || '',
      issue_action_required: current.issue_action_required || '',
    } : {}),
  };
}

export async function ensureBusinessSetupSeed(admin: any) {
  const { data: profile, error: profileError } = await admin.from('business_profile').select('*').eq('business_key', 'customer-1').single();
  if (profileError || !profile) throw new Error('Business profile is unavailable.');

  const [{ data: existingItems, error: itemError }, { data: existingRules, error: ruleError }] = await Promise.all([
    admin.from('business_onboarding').select('item_key,captured_value,label,section,sort_order').eq('business_id', profile.id),
    admin.from('business_rules').select('rule_key').eq('business_id', profile.id),
  ]);
  if (itemError || ruleError) throw new Error('Business setup catalog could not be checked.');

  const itemKeys = new Set((existingItems || []).map((row: any) => row.item_key));
  const now = new Date().toISOString();
  const missingItems = onboardingCatalog.filter((item) => !itemKeys.has(item.item_key)).map((item, index) => ({
    business_id: profile.id,
    section: item.section,
    item_key: item.item_key,
    label: item.label,
    status: item.established ? 'confirmed' : 'pending',
    captured_value: catalogValue(item),
    notes: item.established ? 'Technically verified before Customer #1 onboarding. Business policy is not inferred.' : null,
    confirmed_at: item.established ? now : null,
    sort_order: index,
  }));
  if (missingItems.length) {
    const { error } = await admin.from('business_onboarding').insert(missingItems);
    if (error) throw new Error('Business onboarding checklist could not be seeded.');
  }

  const existingMap = new Map<string, any>((existingItems || []).map((row: any) => [row.item_key, row]));
  await Promise.all(onboardingCatalog.map(async (item, index) => {
    const existing = existingMap.get(item.item_key);
    if (!existing) return;
    const nextValue = catalogValue(item, existing.captured_value);
    const shouldUpdate =
      existing.label !== item.label ||
      existing.section !== item.section ||
      existing.sort_order !== index ||
      JSON.stringify(existing.captured_value || {}) !== JSON.stringify(nextValue);
    if (!shouldUpdate) return;
    await admin.from('business_onboarding').update({
      label: item.label,
      section: item.section,
      sort_order: index,
      captured_value: nextValue,
      updated_at: now,
    }).eq('business_id', profile.id).eq('item_key', item.item_key);
  }));

  const ruleKeys = new Set((existingRules || []).map((row: any) => row.rule_key));
  const missingRules = ruleCatalog.filter((rule) => !ruleKeys.has(rule.rule_key)).map((rule) => ({
    business_id: profile.id,
    category: rule.category,
    rule_key: rule.rule_key,
    structured_value: { answer: 'unknown' },
    owner_confirmed: false,
    ai_may_use: false,
    notes: null,
  }));
  if (missingRules.length) {
    const { error } = await admin.from('business_rules').insert(missingRules);
    if (error) throw new Error('Customer AI rules could not be seeded.');
  }
  return profile;
}

export async function loadBusinessSetup(admin: any) {
  const profile = await ensureBusinessSetupSeed(admin);
  const [{ data: onboarding, error: onboardingError }, { data: rules, error: rulesError }] = await Promise.all([
    admin.from('business_onboarding').select('*').eq('business_id', profile.id).order('sort_order'),
    admin.from('business_rules').select('*').eq('business_id', profile.id).order('category').order('rule_key'),
  ]);
  if (onboardingError || rulesError) throw new Error('Business setup could not be loaded.');
  return { profile, onboarding: onboarding || [], rules: rules || [] };
}

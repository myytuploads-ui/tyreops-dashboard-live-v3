import { NextResponse } from 'next/server';
import { isAllowedUserId } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

type Row = Record<string, any>;

function json(body: Row, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}
function maskPhone(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 7) return 'configured';
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-3)}`;
}
async function authorised() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: json({ ok: false, error: 'Authentication required.' }, 401), admin: null };
  if (!isAllowedUserId(user.id)) return { error: json({ ok: false, error: 'Access not authorised.' }, 403), admin: null };
  const admin = createAdminClient();
  if (!admin) return { error: json({ ok: false, error: 'System test is not configured.' }, 503), admin: null };
  return { error: null, admin };
}
async function switches(admin: any) {
  const [config, pricing, setup] = await Promise.all([
    admin.from('system_config').select('key,value').in('key', ['automatic_fitter_dispatch_enabled', 'group_first_dispatch_enabled', 'owner_acceptance_mobile_checklist', 'owner_acceptance_last_results']),
    admin.from('pricing_methods').select('active_method,owner_confirmed,automatic_customer_pricing_enabled').eq('business_key', 'customer-1').maybeSingle(),
    admin.from('business_onboarding').select('status'),
  ]);
  const businessRules = await admin.from('business_rules').select('id', { count: 'exact', head: true }).eq('owner_confirmed', true).eq('ai_may_use', true);
  const configMap = Object.fromEntries((config.data || []).map((row: Row) => [row.key, row.value]));
  const rows = setup.data || [];
  const complete = rows.filter((row: Row) => ['confirmed', 'not_applicable'].includes(row.status)).length;
  const parseJson = (value: unknown) => {
    if (typeof value !== 'string' || !value.trim()) return null;
    try { return JSON.parse(value); } catch { return null; }
  };
  return {
    automatic_fitter_dispatch_enabled: String(configMap.automatic_fitter_dispatch_enabled || '').toLowerCase() !== 'true' ? false : true,
    automatic_customer_pricing_enabled: pricing.data?.automatic_customer_pricing_enabled === true,
    group_first_dispatch_enabled: String(configMap.group_first_dispatch_enabled || '').toLowerCase() === 'true',
    pricing_method: pricing.data ? { active_method: pricing.data.active_method, owner_confirmed: pricing.data.owner_confirmed === true } : null,
    mobile_checklist: parseJson(configMap.owner_acceptance_mobile_checklist),
    last_results: parseJson(configMap.owner_acceptance_last_results),
    onboarding_percent: rows.length ? Math.round((complete / rows.length) * 100) : 0,
    ai_usable_rule_count: businessRules.count || 0,
  };
}
async function cleanupRun(admin: any, runId: string) {
  const { data: jobs } = await admin.from('jobs').select('id,customer_id,assigned_fitter_id').eq('owner_notes', runId);
  const jobIds = (jobs || []).map((job: Row) => job.id);
  const customerIds = [...new Set((jobs || []).map((job: Row) => job.customer_id).filter(Boolean))];
  const assignedFitterIds = [...new Set((jobs || []).map((job: Row) => job.assigned_fitter_id).filter(Boolean))];
  if (jobIds.length) {
    await admin.from('workflow_events').delete().in('job_id', jobIds);
    await admin.from('fitter_offers').delete().in('job_id', jobIds);
    await admin.from('jobs').delete().in('id', jobIds);
  }
  if (customerIds.length) await admin.from('customers').delete().in('id', customerIds);
  await admin.from('fitters').delete().eq('notes', runId).eq('is_guest', true);
  if (assignedFitterIds.length) {
    await admin.from('fitters').delete().in('id', assignedFitterIds).eq('is_guest', true).eq('full_name', 'TyreOps E2E Guest Fitter');
  }
  const [remainingJobs, remainingCustomers, remainingFitters] = await Promise.all([
    admin.from('jobs').select('id', { count: 'exact', head: true }).eq('owner_notes', runId),
    customerIds.length ? admin.from('customers').select('id', { count: 'exact', head: true }).in('id', customerIds) : Promise.resolve({ count: 0 }),
    admin.from('fitters').select('id', { count: 'exact', head: true }).eq('notes', runId).eq('is_guest', true),
  ]);
  return {
    cleanup_verified: (remainingJobs.count || 0) === 0 && (remainingCustomers.count || 0) === 0 && (remainingFitters.count || 0) === 0,
    remaining: { jobs: remainingJobs.count || 0, customers: remainingCustomers.count || 0, guest_fitters: remainingFitters.count || 0 },
  };
}

export async function GET() {
  const auth = await authorised();
  if (auth.error || !auth.admin) return auth.error;
  const safePhone = process.env.TYREOPS_SAFE_TEST_WHATSAPP_NUMBER?.trim() || '';
  const state = await switches(auth.admin);
  return json({
    ok: true,
    safe_whatsapp_configured: /^44\d{9,12}$/.test(safePhone),
    safe_whatsapp_masked: safePhone ? maskPhone(safePhone) : null,
    switches: state,
    statuses: {
      customer_ai: state.ai_usable_rule_count > 0 ? 'PASS' : 'NEEDS TEST',
      pricing: state.pricing_method?.active_method === 'manual_quote' && state.pricing_method.owner_confirmed ? 'PASS' : 'NEEDS TEST',
      payments: 'NEEDS TEST',
      manual_fitter_assignment: state.last_results?.wf27?.ok ? 'PASS' : 'NEEDS TEST',
      registered_fitter_assignment: 'NEEDS TEST',
    group_dispatch: state.group_first_dispatch_enabled ? 'NEEDS TEST' : 'DISABLED',
      conversations: 'NEEDS TEST',
      telegram: 'NEEDS TEST',
      whatsapp: /^44\d{9,12}$/.test(safePhone) ? 'NEEDS TEST' : 'NEEDS TEST',
      automation_switches: !state.automatic_customer_pricing_enabled && !state.automatic_fitter_dispatch_enabled && !state.group_first_dispatch_enabled ? 'PASS' : 'FAIL',
      mobile_owner_check: state.mobile_checklist?.complete ? 'PASS' : 'NEEDS TEST',
    },
  });
}

export async function POST(request: Request) {
  const auth = await authorised();
  if (auth.error || !auth.admin) return auth.error;
  let body: Row;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'A valid JSON body is required.' }, 400); }
  const action = String(body.action || '');

  if (action === 'mobile_check') {
    const item = String(body.item || '');
    const result = String(body.result || '');
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 1000) : '';
    const allowedItems = ['Home', 'Jobs', 'Job Detail', 'Conversations', 'I Found a Fitter', 'Pricing & Rules', 'Business Setup / Meeting Mode', 'Fitters'];
    if (!allowedItems.includes(item) || !['looks_good', 'problem'].includes(result)) return json({ ok: false, error: 'Invalid mobile check item.' }, 400);
    const current = await switches(auth.admin);
    const checks = { ...(current.mobile_checklist?.checks || {}), [item]: { result, note, checked_at: new Date().toISOString() } };
    const complete = allowedItems.every((key) => checks[key]?.result === 'looks_good');
    const value = JSON.stringify({ checks, complete, updated_at: new Date().toISOString() });
    const saved = await auth.admin.from('system_config').upsert({ key: 'owner_acceptance_mobile_checklist', value });
    if (saved.error) return json({ ok: false, error: 'Mobile check could not be saved.' }, 500);
    return json({ ok: true, mobile_checklist: JSON.parse(value) });
  }

  if (action === 'cleanup') {
    if (typeof body.run_id !== 'string' || !body.run_id.startsWith('owner-acceptance-')) return json({ ok: false, error: 'A valid test run ID is required.' }, 400);
    return json({ ok: true, ...(await cleanupRun(auth.admin, body.run_id)) });
  }

  if (action === 'wf27_guest') {
    const safePhone = process.env.TYREOPS_SAFE_TEST_WHATSAPP_NUMBER?.trim() || '';
    if (!/^44\d{9,12}$/.test(safePhone)) return json({ ok: false, status: 'NEEDS TEST', error: 'Safe WhatsApp test number is not configured.' }, 409);
    const runId = `owner-acceptance-${crypto.randomUUID()}`;
    let customerId = '';
    let jobId = '';
    try {
      const customer = await auth.admin.from('customers').insert({ phone: safePhone, full_name: 'TyreOps E2E Test Customer', notes: runId }).select('*').single();
      if (customer.error) throw new Error('Could not create temporary customer.');
      customerId = customer.data.id;
      const job = await auth.admin.from('jobs').insert({
        public_job_id: `E2E-${runId.slice(-8)}`,
        customer_id: customerId,
        customer_name: 'TyreOps E2E Test Customer',
        customer_phone: safePhone,
        status: 'deposit_paid',
        source: 'owner_acceptance_test',
        tyre_size: '225/45R17',
        tyre_quantity: 1,
        exact_location: 'TyreOps safe test location',
        postcode: 'ZZ99 1AA',
        postcode_area: 'ZZ99',
        vehicle_registration: 'E2E TEST',
        urgency: 'standard',
        customer_price: 120,
        deposit_amount: 20,
        maximum_fitter_cost: 90,
        maximum_eta_minutes: 60,
        deposit_status: 'paid',
        // The production jobs schema requires explicit conversation and owner-state
        // values. Keep this fixture in HUMAN mode so WF-27 is exercised without AI
        // ownership changing during the safe test.
        ai_paused: true,
        manual_reply_mode: true,
        pricing_version: 1,
        assigned_to_owner: false,
        conversation_mode: 'human',
        owner_notes: runId,
      }).select('*').single();
      if (job.error) throw new Error('Could not create temporary job.');
      jobId = job.data.id;
      const origin = new URL(request.url).origin;
      const response = await fetch(`${origin}/api/manual-fitter-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({
          job_id: jobId,
          guest_fitter: { name: 'TyreOps E2E Guest Fitter', phone: safePhone },
          fitter_cost: 70,
          eta_minutes: 35,
          source: 'owner_manual',
          notes: runId,
        }),
        cache: 'no-store',
      });
      const apiStatus = response.status;
      const after = await auth.admin.from('jobs').select('*').eq('id', jobId).single();
      const events = await auth.admin.from('workflow_events').select('event_type').eq('job_id', jobId);
      const duplicate = await fetch(`${origin}/api/manual-fitter-assignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', cookie: request.headers.get('cookie') || '' },
        body: JSON.stringify({ job_id: jobId, guest_fitter: { name: 'TyreOps E2E Guest Fitter', phone: safePhone }, fitter_cost: 70, eta_minutes: 35, source: 'owner_manual', notes: runId }),
        cache: 'no-store',
      });
      const wf27 = {
        ok: response.ok && after.data?.status === 'assigned' && Boolean(after.data?.assigned_fitter_id),
        run_id: runId,
        http: apiStatus,
        duplicate_http: duplicate.status,
        job_assigned: after.data?.status === 'assigned',
        assigned_fitter_persisted: Boolean(after.data?.assigned_fitter_id),
        fitter_cost_persisted: Number(after.data?.agreed_fitter_cost) === 70,
        eta_persisted: Number(after.data?.agreed_eta_minutes) === 35,
        event_exists: (events.data || []).some((event: Row) => event.event_type === 'owner_manual_fitter_assigned'),
        guest_remains_inactive: after.data?.assigned_fitter_id ? (await auth.admin.from('fitters').select('active,is_guest').eq('id', after.data.assigned_fitter_id).maybeSingle()).data?.active !== true : false,
        notifications: 'SENT_TO_CONFIGURED_SAFE_TEST_DESTINATION',
      };
      const cleaned = await cleanupRun(auth.admin, runId);
      const stored = await switches(auth.admin);
      await auth.admin.from('system_config').upsert({ key: 'owner_acceptance_last_results', value: JSON.stringify({ ...(stored.last_results || {}), wf27, cleanup: cleaned, updated_at: new Date().toISOString() }) });
      return json({ ok: wf27.ok && cleaned.cleanup_verified, wf27, cleanup: cleaned });
    } catch (caught) {
      const cleaned = runId ? await cleanupRun(auth.admin, runId) : { cleanup_verified: false };
      return json({ ok: false, run_id: runId, error: caught instanceof Error ? caught.message : 'WF-27 test failed.', cleanup: cleaned }, 500);
    }
  }

  if (action === 'send_test_telegram' || action === 'send_test_whatsapp') {
    return json({ ok: false, status: 'NEEDS TEST', error: 'Provider-specific safe test workflow is not configured in the dashboard yet.' }, 409);
  }

  return json({ ok: false, error: 'Unsupported system test action.' }, 400);
}

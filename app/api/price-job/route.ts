import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const PRICE_ENDPOINT = 'https://tyres.app.n8n.cloud/webhook/tyreops-price-job';

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}
function moneyValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);

  const token = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!token) return errorResponse('Pricing is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid pricing request.', 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['job_id', 'customer_price', 'deposit_amount', 'maximum_fitter_cost', 'maximum_eta_minutes', 'owner_notes'].includes(key))) {
    return errorResponse('Pricing request contains unsupported fields.', 400);
  }

  const jobId = input.job_id;
  const customerPrice = moneyValue(input.customer_price);
  const maximumFitterCost = moneyValue(input.maximum_fitter_cost);
  const maximumEtaMinutes = Number(input.maximum_eta_minutes);
  const ownerNotes = typeof input.owner_notes === 'string' ? input.owner_notes.trim() : '';

  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return errorResponse('A valid job ID is required.', 400);
  if (customerPrice === null || customerPrice <= 0 || customerPrice > 10000) return errorResponse('Customer price must be a positive amount.', 400);
  if (maximumFitterCost === null || maximumFitterCost < 0 || maximumFitterCost >= customerPrice) return errorResponse('Maximum fitter cost must be lower than the customer price.', 400);
  if (!Number.isInteger(maximumEtaMinutes) || maximumEtaMinutes < 1 || maximumEtaMinutes > 480) return errorResponse('Maximum ETA must be between 1 and 480 minutes.', 400);
  if (ownerNotes.length > 1000) return errorResponse('Owner note is too long.', 400);

  const admin = createAdminClient();
  if (!admin) return errorResponse('Pricing is not configured.', 503);

  const { data: depositRule, error: depositError } = await admin
    .from('deposit_rules')
    .select('id, deposit_fixed_gbp')
    .eq('deposit_type', 'fixed_gbp')
    .eq('min_job_value_gbp', customerPrice)
    .eq('max_job_value_gbp', customerPrice)
    .eq('active', true)
    .eq('owner_confirmed', true)
    .eq('ai_may_use', true)
    .maybeSingle();
  if (depositError) return errorResponse('Confirmed deposit rules could not be checked.', 503);

  const depositAmount = Number(depositRule?.deposit_fixed_gbp);
  if (!depositRule || !Number.isFinite(depositAmount) || depositAmount < 0 || depositAmount >= customerPrice) {
    return errorResponse('No exact owner-confirmed deposit rule matches this price. Choose a confirmed price/deposit pair or keep this job with the owner.', 409);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const backend = await fetch(PRICE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_id: jobId,
        customer_price: customerPrice,
        deposit_amount: depositAmount,
        maximum_fitter_cost: maximumFitterCost,
        maximum_eta_minutes: maximumEtaMinutes,
        owner_notes: ownerNotes,
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (backend.ok) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (backend.status === 400) return errorResponse('The quote was rejected. Check the price, deposit and ETA.', 400);
    if (backend.status === 404) return errorResponse('This job was not found.', 404);
    if (backend.status === 409) return errorResponse('This job has changed. Refresh before pricing it.', 409);
    if (backend.status === 401 || backend.status === 403) return errorResponse('Pricing is not authorised by the workflow.', 502);
    return errorResponse('Pricing is temporarily unavailable.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return errorResponse('Pricing timed out. Refresh before retrying.', 504);
    return errorResponse('Pricing could not be reached. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { fitterToSendAmount } from '@/lib/dashboard/settlement-display';
import { createClient } from '@/lib/supabase/server';

const CHASE_ENDPOINT = process.env.TYREOPS_CHASE_FITTER_BALANCE_URL?.trim();

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function fitterPhone(fitter: Record<string, unknown> | null) {
  if (!fitter) return '';
  const whatsapp = String(fitter.whatsapp_phone || '').trim();
  const phone = String(fitter.phone || '').trim();
  return whatsapp || phone;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);
  const token = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!token || !CHASE_ENDPOINT) return errorResponse('Fitter balance chase is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid chase request.', 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'job_id')) return errorResponse('Chase request contains unsupported fields.', 400);
  const jobId = input.job_id;
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return errorResponse('A valid job ID is required.', 400);

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('id,public_job_id,status,assigned_fitter_id,remaining_customer_balance')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) return errorResponse('Could not load this job.', 502);
  if (!job) return errorResponse('This job was not found.', 404);
  if (String(job.status || '').toLowerCase() !== 'completed') {
    return errorResponse('Chase is only available on completed jobs.', 409);
  }
  if (!job.assigned_fitter_id) return errorResponse('This job has no assigned fitter to chase.', 409);

  const [{ data: settlement }, { data: fitter }] = await Promise.all([
    supabase
      .from('job_settlements')
      .select('job_id,settlement_outstanding,rescue_tyres_entitlement,settlement_status')
      .eq('job_id', jobId)
      .maybeSingle(),
    supabase
      .from('fitters')
      .select('id,whatsapp_phone,phone')
      .eq('id', job.assigned_fitter_id)
      .maybeSingle(),
  ]);

  const amount = fitterToSendAmount(settlement, job);
  if (amount === null || !(amount > 0)) {
    return errorResponse('Nothing outstanding to chase on this job.', 409);
  }
  const phone = fitterPhone(fitter as Record<string, unknown> | null);
  if (!phone) return errorResponse('Assigned fitter has no phone number on file.', 409);

  const payload: Record<string, unknown> = {
    job_id: jobId,
    amount_gbp: amount,
    public_job_id: job.public_job_id || undefined,
    fitter_phone: phone,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const backend = await fetch(CHASE_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (backend.ok) {
      return NextResponse.json(
        { ok: true, amount_gbp: amount },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }
    if (backend.status === 400) return errorResponse('The chase request was rejected.', 400);
    if (backend.status === 404) return errorResponse('This job was not found.', 404);
    if (backend.status === 409) return errorResponse('This job has changed. Refresh before trying again.', 409);
    if (backend.status === 401 || backend.status === 403) return errorResponse('Fitter balance chase is not authorised by the workflow.', 502);
    return errorResponse('Fitter balance chase is temporarily unavailable.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse('Fitter balance chase timed out. Refresh before retrying.', 504);
    }
    return errorResponse('Fitter balance chase could not be reached. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timeout);
  }
}
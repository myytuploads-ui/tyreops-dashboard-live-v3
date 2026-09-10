import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { validMoney } from '@/lib/dashboard/operations';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);

  const admin = createAdminClient();
  if (!admin) return errorResponse('Settlement updates are not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid settlement request.', 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['job_id', 'sent'].includes(key))) {
    return errorResponse('Settlement request contains unsupported fields.', 400);
  }

  const jobId = input.job_id;
  const sent = input.sent;
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return errorResponse('A valid job ID is required.', 400);
  if (typeof sent !== 'boolean') return errorResponse('sent must be true or false.', 400);

  const { data: job, error: jobError } = await admin
    .from('jobs')
    .select('id,status')
    .eq('id', jobId)
    .maybeSingle();
  if (jobError) return errorResponse('Could not load this job.', 502);
  if (!job) return errorResponse('This job was not found.', 404);
  if (String(job.status || '').toLowerCase() !== 'completed') {
    return errorResponse('Remittance confirm is only available on completed jobs.', 409);
  }

  const { data: settlement, error: settlementError } = await admin
    .from('job_settlements')
    .select('job_id,settlement_outstanding,rescue_tyres_entitlement,settlement_status')
    .eq('job_id', jobId)
    .maybeSingle();
  if (settlementError) return errorResponse('Could not load settlement for this job.', 502);
  if (!settlement) return errorResponse('No settlement record yet.', 409);

  let patch: Record<string, unknown>;
  if (sent) {
    patch = {
      settlement_status: 'received',
      settlement_outstanding: 0,
      updated_at: new Date().toISOString(),
    };
  } else {
    patch = { settlement_status: 'outstanding' };
    const outstanding = validMoney(settlement.settlement_outstanding);
    if (!(outstanding !== null && outstanding > 0)) {
      const entitlement = validMoney(settlement.rescue_tyres_entitlement);
      if (entitlement !== null && entitlement > 0) {
        patch.settlement_outstanding = entitlement;
      }
    }
    patch.updated_at = new Date().toISOString();
  }

  let { error: updateError } = await admin
    .from('job_settlements')
    .update(patch)
    .eq('job_id', jobId);

  if (updateError && Object.prototype.hasOwnProperty.call(patch, 'updated_at')) {
    const { updated_at: _ignored, ...withoutUpdatedAt } = patch;
    const retry = await admin.from('job_settlements').update(withoutUpdatedAt).eq('job_id', jobId);
    updateError = retry.error;
  }

  if (updateError) return errorResponse('Could not update settlement remittance status.', 502);

  return NextResponse.json({ ok: true, sent }, { headers: { 'Cache-Control': 'no-store' } });
}

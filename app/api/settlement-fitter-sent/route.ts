import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { validMoney } from '@/lib/dashboard/operations';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

function supabaseMessage(error: { message?: string; code?: string; details?: string } | null | undefined) {
  if (!error) return 'Unknown database error.';
  const parts = [error.message, error.code ? `code ${error.code}` : '', error.details].filter(Boolean);
  return parts.join(' — ') || 'Unknown database error.';
}

function looksLikeUnknownColumn(error: { message?: string; code?: string; details?: string } | null | undefined) {
  const blob = `${error?.message || ''} ${error?.details || ''} ${error?.code || ''}`.toLowerCase();
  return blob.includes('column') || blob.includes('schema cache') || blob.includes('pgrst204') || blob.includes('does not exist');
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
  if (jobError) return errorResponse(`Could not load this job: ${supabaseMessage(jobError)}`, 502);
  if (!job) return errorResponse('This job was not found.', 404);
  if (String(job.status || '').toLowerCase() !== 'completed') {
    return errorResponse('Remittance confirm is only available on completed jobs.', 409);
  }

  const { data: settlement, error: settlementError } = await admin
    .from('job_settlements')
    .select('job_id,settlement_outstanding,rescue_tyres_entitlement,settlement_status,amount_fitter_owes,amount_fitter_settled')
    .eq('job_id', jobId)
    .maybeSingle();

  let settlementRow = settlement as Record<string, unknown> | null;
  if (settlementError && looksLikeUnknownColumn(settlementError)) {
    const retrySelect = await admin
      .from('job_settlements')
      .select('job_id,settlement_outstanding,rescue_tyres_entitlement,settlement_status')
      .eq('job_id', jobId)
      .maybeSingle();
    if (retrySelect.error) return errorResponse(`Could not load settlement for this job: ${supabaseMessage(retrySelect.error)}`, 502);
    settlementRow = retrySelect.data as Record<string, unknown> | null;
  } else if (settlementError) {
    return errorResponse(`Could not load settlement for this job: ${supabaseMessage(settlementError)}`, 502);
  }
  if (!settlementRow) return errorResponse('No settlement record yet.', 409);

  const nowIso = new Date().toISOString();
  let patch: Record<string, unknown>;

  if (sent) {
    const priorOutstanding = validMoney(settlementRow.settlement_outstanding);
    const entitlement = validMoney(settlementRow.rescue_tyres_entitlement);
    const owes = validMoney(settlementRow.amount_fitter_owes);
    const settledAmount =
      (priorOutstanding !== null && priorOutstanding > 0 ? priorOutstanding : null) ??
      (entitlement !== null && entitlement > 0 ? entitlement : null) ??
      (owes !== null && owes > 0 ? owes : null);

    patch = {
      settlement_status: 'settled',
      settlement_outstanding: 0,
      settled_at: nowIso,
      updated_at: nowIso,
    };
    if (settledAmount !== null) {
      patch.amount_fitter_settled = settledAmount;
    }
  } else {
    patch = {
      settlement_status: 'pending',
      settled_at: null,
      updated_at: nowIso,
    };
    const outstanding = validMoney(settlementRow.settlement_outstanding);
    if (!(outstanding !== null && outstanding > 0)) {
      const entitlement = validMoney(settlementRow.rescue_tyres_entitlement);
      const owes = validMoney(settlementRow.amount_fitter_owes);
      if (entitlement !== null && entitlement > 0) {
        patch.settlement_outstanding = entitlement;
      } else if (owes !== null && owes > 0) {
        patch.settlement_outstanding = owes;
      }
    }
  }

  const optionalColumns = ['updated_at', 'settled_at', 'amount_fitter_settled'];
  let workingPatch: Record<string, unknown> = { ...patch };
  let updateError: { message?: string; code?: string; details?: string } | null = null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const result = await admin.from('job_settlements').update(workingPatch).eq('job_id', jobId);
    updateError = result.error;
    if (!updateError) break;
    if (!looksLikeUnknownColumn(updateError)) break;

    const nextPatch = { ...workingPatch };
    let removed = false;
    for (const col of optionalColumns) {
      if (Object.prototype.hasOwnProperty.call(nextPatch, col)) {
        const hint = `${updateError.message || ''} ${updateError.details || ''}`.toLowerCase();
        if (hint.includes(col) || attempt === 0) {
          delete nextPatch[col];
          removed = true;
          if (hint.includes(col)) break;
        }
      }
    }
    if (!removed) break;
    workingPatch = nextPatch;
  }

  if (updateError) {
    return errorResponse(`Could not update settlement remittance status: ${supabaseMessage(updateError)}`, 502);
  }

  return NextResponse.json({ ok: true, sent, settlement_status: sent ? 'settled' : 'pending' }, { headers: { 'Cache-Control': 'no-store' } });
}

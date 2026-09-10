import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';

const ASSIGNMENT_ENDPOINT = process.env.TYREOPS_FITTER_ASSIGNMENT_URL?.trim();

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);
  const token = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!token || !ASSIGNMENT_ENDPOINT) return errorResponse('Fitter assignment is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid assignment request.', 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== 'job_id' && key !== 'offer_id')) return errorResponse('Assignment request contains unsupported fields.', 400);
  const jobId = input.job_id;
  const offerId = input.offer_id;
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return errorResponse('A valid job ID is required.', 400);
  if (typeof offerId !== 'string' || !isValidUuid(offerId)) return errorResponse('A valid offer ID is required.', 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const backend = await fetch(ASSIGNMENT_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, offer_id: offerId }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (backend.ok) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (backend.status === 400) return errorResponse('The fitter assignment was rejected.', 400);
    if (backend.status === 404) return errorResponse('This job or offer was not found.', 404);
    if (backend.status === 409) return errorResponse('This job or offer has changed. Refresh before assigning.', 409);
    if (backend.status === 401 || backend.status === 403) return errorResponse('Fitter assignment is not authorised by the workflow.', 502);
    return errorResponse('Fitter assignment is temporarily unavailable.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return errorResponse('Fitter assignment timed out. Refresh before retrying.', 504);
    return errorResponse('Fitter assignment could not be reached. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

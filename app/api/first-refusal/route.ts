import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';

const FIRST_REFUSAL_ENDPOINT = process.env.TYREOPS_FIRST_REFUSAL_URL?.trim();
const ACTIONS = new Set(['accept', 'decline', 'snooze']);
const SNOOZE_MINUTES = new Set([15, 30, 60, 1440]);

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);
  const token = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!token || !FIRST_REFUSAL_ENDPOINT) return errorResponse('First refusal is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid first-refusal request.', 400);
  const input = body as Record<string, unknown>;
  if (Object.keys(input).some((key) => !['job_id', 'action', 'snooze_minutes'].includes(key))) return errorResponse('First-refusal request contains unsupported fields.', 400);
  const action = input.action;
  const jobId = input.job_id;
  const snoozeMinutes = Number(input.snooze_minutes);
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return errorResponse('A valid job ID is required.', 400);
  if (typeof action !== 'string' || !ACTIONS.has(action)) return errorResponse('Invalid first-refusal action.', 400);
  if (action === 'snooze' && (!Number.isInteger(snoozeMinutes) || !SNOOZE_MINUTES.has(snoozeMinutes))) return errorResponse('Invalid snooze duration.', 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const backend = await fetch(FIRST_REFUSAL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, action, ...(action === 'snooze' ? { snooze_minutes: snoozeMinutes } : {}) }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (backend.ok) return NextResponse.json({ ok: true, action }, { headers: { 'Cache-Control': 'no-store' } });
    if (backend.status === 400) return errorResponse('The first-refusal request was rejected.', 400);
    if (backend.status === 404) return errorResponse('This job was not found.', 404);
    if (backend.status === 409) return errorResponse('This job has changed. Refresh before trying again.', 409);
    if (backend.status === 401 || backend.status === 403) return errorResponse('First refusal is not authorised by the workflow.', 502);
    return errorResponse('First refusal is temporarily unavailable.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return errorResponse('First refusal timed out. Refresh before retrying.', 504);
    return errorResponse('First refusal could not be reached. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';

const CONTROL_ENDPOINT = 'https://tyres.app.n8n.cloud/webhook/tyreops-human-takeover';
const ALLOWED_ACTIONS = new Set(['takeover', 'return_to_ai']);

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);

  const controlToken = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!controlToken) return errorResponse('Conversation control is not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('A valid JSON request body is required.', 400);
  }

  if (!body || typeof body !== 'object') return errorResponse('Invalid control request.', 400);
  const { action, job_id: jobId } = body as Record<string, unknown>;

  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) {
    return errorResponse('Action must be takeover or return_to_ai.', 400);
  }
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) {
    return errorResponse('A valid job ID is required.', 400);
  }

  const payload: Record<string, string> = {
    action,
    job_id: jobId,
    initiated_by: 'owner',
  };
  if (action === 'takeover') payload.reason = 'Dashboard takeover';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const backendResponse = await fetch(CONTROL_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${controlToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (backendResponse.ok) {
      return NextResponse.json({ ok: true, action, job_id: jobId });
    }

    if (backendResponse.status === 400) return errorResponse('The backend rejected this control request.', 400);
    if (backendResponse.status === 401 || backendResponse.status === 403) return errorResponse('The backend did not authorise conversation control.', 502);
    if (backendResponse.status === 404) return errorResponse('The job was not found by conversation control.', 404);
    return errorResponse('Conversation control is temporarily unavailable.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse('Conversation control timed out. Check the current mode before retrying.', 504);
    }
    return errorResponse('Conversation control could not be reached.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

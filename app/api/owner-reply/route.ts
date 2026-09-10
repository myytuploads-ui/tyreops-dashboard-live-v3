import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';

const OWNER_REPLY_ENDPOINT = 'https://tyres.app.n8n.cloud/webhook/tyreops-owner-reply';
const MAX_MESSAGE_LENGTH = 2000;

function errorResponse(error: string, status: number) {
  return NextResponse.json({ ok: false, error }, { status });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);

  const controlToken = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!controlToken) return errorResponse('Owner replies are not configured.', 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('A valid JSON request body is required.', 400);
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse('Invalid owner reply request.', 400);
  }

  const keys = Object.keys(body);
  if (keys.some((key) => key !== 'job_id' && key !== 'message')) {
    return errorResponse('Only job_id and message are accepted.', 400);
  }

  const { job_id: jobId, message } = body as Record<string, unknown>;
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return errorResponse('A valid job ID is required.', 400);
  if (typeof message !== 'string') return errorResponse('A message is required.', 400);

  const trimmedMessage = message.trim();
  if (!trimmedMessage) return errorResponse('A message is required.', 400);
  if (trimmedMessage.length > MAX_MESSAGE_LENGTH) return errorResponse(`Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`, 400);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);

  try {
    const backendResponse = await fetch(OWNER_REPLY_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${controlToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ job_id: jobId, message: trimmedMessage }),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });

    if (backendResponse.ok) {
      const result = await backendResponse.json().catch(() => null) as { ok?: boolean; idempotent?: boolean } | null;
      if (result?.ok !== true) return errorResponse('Owner reply returned an unexpected response.', 502);
      return NextResponse.json({ ok: true, idempotent: result.idempotent === true });
    }

    if (backendResponse.status === 400) return errorResponse('The message or linked job was rejected.', 400);
    if (backendResponse.status === 403) return errorResponse('The owner reply service did not authorise this request.', 502);
    if (backendResponse.status === 404) return errorResponse('The linked job was not found.', 404);
    if (backendResponse.status === 409) return errorResponse('This conversation is no longer in HUMAN mode.', 409);
    return errorResponse('Owner reply is temporarily unavailable.', 502);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return errorResponse('Reply status is uncertain because the service timed out. Refresh before retrying.', 504);
    }
    return errorResponse('Reply status is uncertain because the service could not be reached. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

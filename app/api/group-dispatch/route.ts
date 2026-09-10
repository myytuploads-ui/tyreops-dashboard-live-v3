import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';

const ALLOWED_ACTIONS = new Set(['get_group_status', 'assign_group_fitter', 'release_to_direct_dispatch']);
const ENDPOINT = process.env.TYREOPS_GROUP_DISPATCH_URL?.trim();

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function safeBackendMessage(status: number) {
  if (status === 400) return 'The group dispatch request was not valid.';
  if (status === 404) return 'This job was not found.';
  if (status === 409) return 'The job or offer has already changed. Refresh before trying again.';
  if (status === 401 || status === 403) return 'Group dispatch is not authorised by the backend.';
  return 'Group dispatch is temporarily unavailable.';
}

function record(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
function safeResult(value: unknown) {
  const root = record(value); const nested = record(root.data); const source = Object.keys(nested).length ? nested : root;
  const offerRows = Array.isArray(source.offers) ? source.offers : Array.isArray(source.pending_offers) ? source.pending_offers : [];
  const offers = offerRows.map((value) => {
    const offer = record(value); const fitter = record(offer.fitter);
    return {
      id: offer.id ?? offer.offer_id ?? null,
      fitter_name: offer.fitter_name ?? offer.name ?? fitter.full_name ?? null,
      quoted_cost: offer.quoted_cost ?? offer.cost ?? offer.fitter_cost ?? null,
      eta_minutes: offer.eta_minutes ?? offer.eta ?? null,
      masked_phone: offer.masked_phone ?? offer.phone_masked ?? offer.fitter_phone_masked ?? null,
      submitted_at: offer.submitted_at ?? offer.created_at ?? null,
    };
  });
  return {
    ok: root.ok === true,
    status: source.status ?? source.job_status ?? null,
    public_job_id: source.public_job_id ?? null,
    group_message: source.group_message ?? source.message_to_copy ?? source.prepared_message ?? null,
    intake_url: source.intake_url ?? null,
    waiting_since: source.waiting_since ?? source.started_at ?? source.created_at ?? null,
    offers,
  };
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return error('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return error('Access not authorised.', 403);
  if (!ENDPOINT) return error('Group dispatch is not configured.', 503);
  const token = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!token) return error('Group dispatch is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return error('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object') return error('Invalid group dispatch request.', 400);
  const input = body as Record<string, unknown>;
  const { action, job_id: jobId, offer_id: offerId } = input;
  if (typeof action !== 'string' || !ALLOWED_ACTIONS.has(action)) return error('Invalid group dispatch action.', 400);
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return error('A valid job ID is required.', 400);
  if (action === 'assign_group_fitter' && (typeof offerId !== 'string' || !isValidUuid(offerId))) return error('A valid offer ID is required.', 400);

  const payload: Record<string, string> = { action, job_id: jobId };
  if (action === 'assign_group_fitter') payload.group_offer_id = offerId as string;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), cache: 'no-store', redirect: 'error', signal: controller.signal,
    });
    if (!response.ok) {
      const publicStatus = response.status === 409 ? 409 : response.status === 400 || response.status === 404 ? response.status : 502;
      return error(safeBackendMessage(response.status), publicStatus);
    }
    let result: unknown;
    try { result = await response.json(); } catch { return error('Group dispatch returned an invalid response.', 502); }
    return NextResponse.json(safeResult(result), { headers: { 'Cache-Control': 'no-store' } });
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') return error('Group dispatch timed out. Refresh before retrying.', 504);
    return error('Group dispatch could not be reached.', 502);
  } finally { clearTimeout(timeout); }
}

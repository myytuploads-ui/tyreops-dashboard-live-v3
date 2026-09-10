import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { createClient } from '@/lib/supabase/server';

const ENDPOINT = 'https://tyres.app.n8n.cloud/webhook/tyreops-manual-fitter-assignment';
const SOURCES = new Set(['owner_manual', 'whatsapp_group', 'phone_call', 'known_contact']);

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}
function money(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function text(value: unknown, max: number) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : null;
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return error('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return error('Access not authorised.', 403);

  const token = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  if (!token) return error('Manual fitter assignment is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return error('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Invalid manual fitter assignment request.', 400);
  const input = body as Record<string, unknown>;
  const allowed = ['job_id', 'fitter_id', 'guest_fitter', 'fitter_cost', 'eta_minutes', 'source', 'notes'];
  if (Object.keys(input).some((key) => !allowed.includes(key))) return error('Assignment request contains unsupported fields.', 400);

  const jobId = input.job_id;
  if (typeof jobId !== 'string' || !isValidUuid(jobId)) return error('A valid job ID is required.', 400);
  const fitterCost = money(input.fitter_cost);
  if (fitterCost === null || fitterCost < 0 || fitterCost > 10000) return error('Enter a valid fitter cost.', 400);
  const eta = Number(input.eta_minutes);
  if (!Number.isInteger(eta) || eta < 1 || eta > 1440) return error('ETA must be between 1 and 1440 minutes.', 400);
  if (typeof input.source !== 'string' || !SOURCES.has(input.source)) return error('Choose where the fitter came from.', 400);
  const notes = text(input.notes, 1000);
  if (notes === null) return error('Notes are too long.', 400);

  const payload: Record<string, unknown> = { job_id: jobId, fitter_cost: fitterCost, eta_minutes: eta, source: input.source, notes };
  if (typeof input.fitter_id === 'string' && isValidUuid(input.fitter_id)) {
    payload.fitter_id = input.fitter_id;
  } else if (input.guest_fitter && typeof input.guest_fitter === 'object' && !Array.isArray(input.guest_fitter)) {
    const guest = input.guest_fitter as Record<string, unknown>;
    const name = text(guest.name, 120);
    const phone = text(guest.phone, 32);
    if (!name) return error('Guest fitter name is required.', 400);
    if (!phone || !/^44\d{9,12}$/.test(phone)) return error('Guest fitter phone must be a UK WhatsApp number like 447700900000.', 400);
    payload.guest_fitter = { name, phone };
  } else {
    return error('Choose an existing fitter or enter a guest fitter.', 400);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22000);
  try {
    const backend = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      redirect: 'error',
      signal: controller.signal,
    });
    if (backend.ok) return NextResponse.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
    if (backend.status === 400) return error('The fitter details were rejected. Check the phone, cost and ETA.', 400);
    if (backend.status === 404) return error('This job or fitter was not found. Refresh and try again.', 404);
    if (backend.status === 409) return error('This job has already moved on. Refresh to see the latest state.', 409);
    if (backend.status === 401 || backend.status === 403) return error('Manual fitter assignment is not authorised by the workflow.', 502);
    return error('Manual fitter assignment is temporarily unavailable.', 502);
  } catch (caught) {
    if (caught instanceof Error && caught.name === 'AbortError') return error('Manual fitter assignment timed out. Refresh before retrying.', 504);
    return error('Manual fitter assignment could not be reached. Refresh before retrying.', 502);
  } finally {
    clearTimeout(timeout);
  }
}

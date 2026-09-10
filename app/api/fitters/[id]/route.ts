import { NextResponse } from 'next/server';
import { isAllowedUserId, isValidUuid } from '@/lib/auth/allowed-users';
import { validateFitterFields } from '@/lib/fitters/validation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const LIVE_JOB_STATUSES = ['assigned', 'fitter_on_route', 'arrived', 'in_progress'];
const TERMINAL_OFFER_STATUSES = new Set(['accepted', 'rejected', 'declined', 'expired', 'cancelled', 'withdrawn']);

function errorResponse(error: string, status: number, code?: string) {
  return NextResponse.json({ ok: false, error, code }, { status });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidUuid(id)) return errorResponse('A valid fitter ID is required.', 400);

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return errorResponse('Authentication required.', 401);
  if (!isAllowedUserId(user.id)) return errorResponse('Access not authorised.', 403);
  const admin = createAdminClient();
  if (!admin) return errorResponse('Fitter management is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON request body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid fitter request.', 400);
  const validated = validateFitterFields(body as Record<string, unknown>, false);
  if (!validated.data) return errorResponse(validated.error || 'Invalid fitter details.', 400);
  const fitterData = validated.data;

  if (fitterData.active === false) {
    const [jobsResult, offersResult] = await Promise.all([
      admin.from('jobs').select('id,status').eq('assigned_fitter_id', id).in('status', LIVE_JOB_STATUSES).limit(1),
      admin.from('fitter_offers').select('id,offer_status').eq('fitter_id', id).limit(100),
    ]);
    if (jobsResult.error || offersResult.error) return errorResponse('TyreOps could not safely verify current fitter commitments. No change was made.', 503, 'SAFETY_CHECK_FAILED');
    if ((jobsResult.data || []).length) return errorResponse('This fitter has an assigned or in-progress job and cannot be deactivated.', 409, 'LIVE_JOB');
    const pendingOffers = (offersResult.data || []).filter((offer) => !TERMINAL_OFFER_STATUSES.has(String(offer.offer_status || '').toLowerCase()));
    if (pendingOffers.length) return errorResponse('This fitter has pending offers. Resolve or expire them before deactivating.', 409, 'PENDING_OFFERS');
  }

  const { data, error } = await admin.from('fitters').update(fitterData).eq('id', id).select('id').maybeSingle();
  if (error) return errorResponse('The fitter could not be updated.', 500);
  if (!data) return errorResponse('Fitter not found.', 404);
  return NextResponse.json({ ok: true });
}

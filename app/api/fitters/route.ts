import { NextResponse } from 'next/server';
import { isAllowedUserId } from '@/lib/auth/allowed-users';
import { validateFitterFields } from '@/lib/fitters/validation';
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
  if (!admin) return errorResponse('Fitter management is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return errorResponse('A valid JSON request body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return errorResponse('Invalid fitter request.', 400);
  const validated = validateFitterFields(body as Record<string, unknown>, true);
  if (!validated.data) return errorResponse(validated.error || 'Invalid fitter details.', 400);
  const fitterData = validated.data;

  const { data, error } = await admin.from('fitters').insert(fitterData).select('id').single();
  if (error) return errorResponse('The fitter could not be created.', 500);
  return NextResponse.json({ ok: true, id: data.id }, { status: 201 });
}

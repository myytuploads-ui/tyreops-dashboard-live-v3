import { NextResponse } from 'next/server';
import { calculateQuote } from '@/lib/pricing/quote';
import { createAdminClient } from '@/lib/supabase/admin';

function error(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

export async function POST(request: Request) {
  const expected = process.env.TYREOPS_CONTROL_TOKEN?.trim();
  const header = request.headers.get('authorization') || '';
  if (!expected || header !== `Bearer ${expected}`) return error('Unauthorised.', 401);

  const admin = createAdminClient();
  if (!admin) return error('Quote engine is not configured.', 503);

  let body: unknown;
  try { body = await request.json(); } catch { return error('A valid JSON body is required.', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return error('Invalid quote request.', 400);
  const input = body as Record<string, unknown>;
  const quantity = Number(input.quantity);
  const quote = await calculateQuote(admin, {
    tyre_size: String(input.tyre_size || ''),
    quantity,
    tier: String(input.tier || 'budget'),
    postcode: typeof input.postcode === 'string' ? input.postcode : undefined,
    requested_time: typeof input.requested_time === 'string' ? input.requested_time : undefined,
    vehicle_category: typeof input.vehicle_category === 'string' ? input.vehicle_category : undefined,
    motorway: input.motorway === true,
    locking_wheel_nut: input.locking_wheel_nut === true,
  });

  if (quote.quote_status !== 'priced') {
    return NextResponse.json({
      ok: true,
      deterministic: false,
      reason: String(quote.reason || 'manual_review').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const customerPrice = Number(quote.customer_price);
  const depositRule = await admin
    .from('deposit_rules')
    .select('deposit_fixed_gbp')
    .eq('deposit_type', 'fixed_gbp')
    .eq('min_job_value_gbp', customerPrice)
    .eq('max_job_value_gbp', customerPrice)
    .eq('active', true)
    .eq('owner_confirmed', true)
    .eq('ai_may_use', true)
    .limit(1)
    .maybeSingle();
  const configuredDeposit = Number(depositRule.data?.deposit_fixed_gbp);
  if (!Number.isFinite(configuredDeposit) || configuredDeposit < 0 || configuredDeposit > customerPrice) {
    return NextResponse.json({
      ok: true,
      deterministic: false,
      reason: 'deposit_requires_owner',
      customer_price_gbp: customerPrice,
    }, { headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({
    ok: true,
    deterministic: true,
    customer_price_gbp: customerPrice,
    deposit_gbp: configuredDeposit,
    quote_id: crypto.randomUUID(),
    requires_owner_review: false,
    base_price_gbp: quote.base_price,
    adjustments: quote.adjustments,
    currency: 'GBP',
  }, { headers: { 'Cache-Control': 'no-store' } });
}

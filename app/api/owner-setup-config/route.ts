import { NextResponse } from 'next/server';
import { isAllowedUserId } from '@/lib/auth/allowed-users';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const CONFIG_FIELDS = {
  owner_first_refusal_minutes: { type: 'int', min: 0, max: 240 },
  preferred_fitter_window_minutes: { type: 'int', min: 1, max: 240 },
  general_fitter_window_minutes: { type: 'int', min: 1, max: 240 },
  google_review_url: { type: 'url', max: 500 },
  trustpilot_review_url: { type: 'url', max: 500 },
} as const;

type ConfigKey = keyof typeof CONFIG_FIELDS;

function jsonError(message: string, status: number) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function authorised() {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { admin: null, error: jsonError('Authentication required.', 401) };
  if (!isAllowedUserId(user.id)) return { admin: null, error: jsonError('Access not authorised.', 403) };
  const admin = createAdminClient();
  if (!admin) return { admin: null, error: jsonError('Owner setup is not configured.', 503) };
  return { admin, error: null };
}

function validateValue(key: ConfigKey, raw: unknown) {
  const field = CONFIG_FIELDS[key];
  if (field.type === 'int') {
    const value = Number(raw);
    if (!Number.isInteger(value) || value < field.min || value > field.max) return null;
    return String(value);
  }
  const text = String(raw || '').trim();
  if (!text) return '';
  if (text.length > field.max) return null;
  try {
    const url = new URL(text);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await authorised();
  if (session.error || !session.admin) return session.error;
  const keys = Object.keys(CONFIG_FIELDS);
  const { data, error } = await session.admin.from('system_config').select('key,value').in('key', keys);
  if (error) return jsonError('Launch settings could not be loaded.', 500);
  return NextResponse.json({ ok: true, config: Object.fromEntries((data || []).map((row) => [row.key, row.value ?? ''])) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const session = await authorised();
  if (session.error || !session.admin) return session.error;
  let body: unknown;
  try { body = await request.json(); } catch { return jsonError('A valid JSON body is required.', 400); }
  if (!isObject(body) || !isObject(body.values)) return jsonError('Invalid launch settings request.', 400);

  const entries = Object.entries(body.values);
  if (!entries.length) return jsonError('No launch settings were provided.', 400);
  if (entries.some(([key]) => !(key in CONFIG_FIELDS))) return jsonError('Launch settings contain an unsupported field.', 400);

  const rows = [];
  for (const [key, raw] of entries) {
    const value = validateValue(key as ConfigKey, raw);
    if (value === null) return jsonError(`${key.replaceAll('_', ' ')} is invalid.`, 400);
    rows.push({ key, value });
  }

  const { error } = await session.admin.from('system_config').upsert(rows, { onConflict: 'key' });
  if (error) return jsonError('Launch settings could not be saved.', 500);

  const { data } = await session.admin.from('system_config').select('key,value').in('key', Object.keys(CONFIG_FIELDS));
  return NextResponse.json({ ok: true, config: Object.fromEntries((data || []).map((row) => [row.key, row.value ?? ''])) }, { headers: { 'Cache-Control': 'no-store' } });
}

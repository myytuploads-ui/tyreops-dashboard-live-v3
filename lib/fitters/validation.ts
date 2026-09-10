export type FitterWrite = {
  full_name?: string;
  whatsapp_phone?: string;
  active?: boolean;
  preferred?: boolean;
  coverage_areas?: string[];
  priority_level?: number;
};

export const FITTER_WRITE_FIELDS = new Set([
  'full_name',
  'whatsapp_phone',
  'active',
  'preferred',
  'coverage_areas',
  'priority_level',
]);

export function normalizeWhatsAppPhone(value: unknown) {
  if (typeof value !== 'string') return null;
  const compact = value.trim().replace(/[\s()+.-]/g, '');
  const normalized = compact.startsWith('00') ? compact.slice(2) : compact;
  return /^[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
}

export function normalizeCoverage(value: unknown) {
  if (!Array.isArray(value)) return null;
  const entries = value.map((entry) => String(entry).trim().toUpperCase().replace(/\s+/g, '')).filter(Boolean);
  if (!entries.length) return null;
  if (entries.includes('ALL')) return entries.length === 1 ? ['ALL'] : null;
  if (entries.some((entry) => !/^[A-Z]{1,2}(?:\d[A-Z\d]?)?$/.test(entry))) return null;
  const unique = [...new Set(entries)];
  return unique.length === entries.length ? unique : null;
}

export function validateFitterFields(body: Record<string, unknown>, creating: boolean) {
  if (Object.keys(body).some((key) => !FITTER_WRITE_FIELDS.has(key))) {
    return { error: 'Only permitted fitter fields are accepted.' } as const;
  }

  const result: FitterWrite = {};
  if (creating || 'full_name' in body) {
    if (typeof body.full_name !== 'string' || !body.full_name.trim() || body.full_name.trim().length > 120) return { error: 'Full name is required and must be 120 characters or fewer.' } as const;
    result.full_name = body.full_name.trim();
  }
  if (creating || 'whatsapp_phone' in body) {
    const phone = normalizeWhatsAppPhone(body.whatsapp_phone);
    if (!phone) return { error: 'WhatsApp number must use international digits including country code.' } as const;
    result.whatsapp_phone = phone;
  }
  for (const field of ['active', 'preferred'] as const) {
    if (creating || field in body) {
      if (typeof body[field] !== 'boolean') return { error: `${field} must be explicitly true or false.` } as const;
      result[field] = body[field];
    }
  }
  if (creating || 'coverage_areas' in body) {
    const coverage = normalizeCoverage(body.coverage_areas);
    if (!coverage) return { error: 'Enter unique postcode prefixes, or select covers everywhere.' } as const;
    result.coverage_areas = coverage;
  }
  if (creating || 'priority_level' in body) {
    const priority = Number(body.priority_level);
    if (!Number.isInteger(priority) || priority < 1 || priority > 999) return { error: 'Priority must be a whole number from 1 to 999.' } as const;
    result.priority_level = priority;
  }
  if (!creating && !Object.keys(result).length) return { error: 'No permitted fitter changes were supplied.' } as const;
  return { data: result } as const;
}

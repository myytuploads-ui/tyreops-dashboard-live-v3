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

/** UK postcode prefix (UB5, B40, M, SK) or ALL. */
const POSTCODE_PREFIX = /^[A-Z]{1,2}(?:\d[A-Z\d]?)?$/;

/** Human city/area name: letters with optional spaces, hyphens, apostrophes; at least 2 letters. */
const CITY_NAME = /^[A-Za-z][A-Za-z\s'-]{0,78}[A-Za-z]$|^[A-Za-z]{2}$/;

export function normalizeCoverage(value: unknown) {
  if (!Array.isArray(value)) return null;

  const raw = value
    .map((entry) => String(entry ?? '').trim().replace(/\s+/g, ' '))
    .filter(Boolean);
  if (!raw.length) return null;

  const asAll = raw.map((entry) => entry.toUpperCase().replace(/\s+/g, ''));
  if (asAll.includes('ALL')) {
    return raw.length === 1 ? ['ALL'] : null;
  }

  const out: string[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    const postcodeToken = entry.toUpperCase().replace(/\s+/g, '');
    let canonical: string;

    if (POSTCODE_PREFIX.test(postcodeToken)) {
      canonical = postcodeToken;
    } else if (entry.length >= 2 && CITY_NAME.test(entry)) {
      canonical = entry;
    } else {
      return null;
    }

    const key = canonical.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    out.push(canonical);
  }

  return out;
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
    if (!coverage) return { error: 'Enter unique postcode prefixes or city names, or select covers everywhere.' } as const;
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
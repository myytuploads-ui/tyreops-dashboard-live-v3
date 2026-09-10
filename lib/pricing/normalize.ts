export function normalizeTyreSize(value: string) {
  const compact = value.trim().toUpperCase().replace(/\s+/g, '').replace(/-/g, '/');
  const slash = compact.match(/^(\d{3})\/?(\d{2})R?(\d{2})$/);
  if (!slash) return null;
  const width = Number(slash[1]);
  const profile = Number(slash[2]);
  const rim = Number(slash[3]);
  if (width < 100 || width > 405 || profile < 20 || profile > 95 || rim < 10 || rim > 30) return null;
  return { tyre_size: `${width}/${profile}R${rim}`, width, profile, rim };
}

export function postcodeArea(value: string) {
  const raw = value.trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return '';
  const district = raw.match(/^([A-Z]{1,2}\d[A-Z\d]?)/)?.[1] || raw;
  return district;
}

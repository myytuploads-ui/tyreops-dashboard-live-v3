const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidUuid(value: string) {
  return UUID_PATTERN.test(value);
}

export function getAllowedUserIds() {
  const rawAllowlist = process.env.TYREOPS_ALLOWED_USER_IDS?.trim();
  if (!rawAllowlist) return null;

  const userIds = rawAllowlist.split(',').map((id) => id.trim().toLowerCase());
  if (userIds.some((id) => !id || !isValidUuid(id))) return null;

  return new Set(userIds);
}

export function isAllowedUserId(userId: string) {
  return getAllowedUserIds()?.has(userId.toLowerCase()) === true;
}

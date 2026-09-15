export function normalizeInviteCode(value: string) {
  return value.replace(/\s/g, '').toLowerCase();
}
export function isValidInviteCode(value: string) {
  return /^[a-f0-9]{12}$/.test(normalizeInviteCode(value));
}

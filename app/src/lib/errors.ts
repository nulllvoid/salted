export function friendlyError(error: unknown): string {
  const message =
    typeof error === 'object' && error && 'message' in error
      ? String(error.message)
      : '';
  if (/dietary preferences/i.test(message))
    return 'This dish no longer matches everyone’s preferences. Choose another dish.';
  if (/Servings exceed|Nobody is eating/i.test(message))
    return 'The headcount has changed. Check who’s eating and adjust the servings.';
  if (/locked|closed|Backup is only/i.test(message))
    return 'This menu has changed. Refresh to see the latest meal.';
  if (/fetch|network|connection|timeout/i.test(message))
    return 'We couldn’t connect. Check your connection and try again.';
  if (/invalid invite/i.test(message))
    return 'That invite code wasn’t found. Check it with your housemate and try again.';
  if (/row-level|permission|JWT|session/i.test(message))
    return 'This action is no longer available. Refresh the screen or sign in again.';
  return 'We couldn’t complete that. Please try again.';
}
export function checkResult<T extends { error: unknown }>(result: T): T {
  if (result.error) throw result.error;
  return result;
}

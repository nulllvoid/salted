// Logs a dispatch attempt and, only if it did not fail, marks the poll done.
//
// A 'failed' send leaves the poll 'closed' so the next tick retries it while
// still inside DISPATCH_GRACE_MINUTES; flipping it to 'dispatched' would make a
// failed send permanent and feed the 10-day no-repeat history with a meal the
// cook never received. Both writes are checked: a swallowed error here means
// either a lost log row or a poll that stays 'closed' and is sent again.
export async function recordDispatch(
  admin: { from: (table: string) => any },
  pollId: string,
  log: { status: 'mocked' | 'sent' | 'failed' } & Record<string, unknown>
): Promise<void> {
  const { error: logError } = await admin.from('dispatch_log').insert({ poll_id: pollId, ...log });
  if (logError) throw logError;
  if (log.status === 'failed') return;

  const { error } = await admin.from('daily_polls').update({ status: 'dispatched' }).eq('id', pollId);
  if (error) throw error;
}

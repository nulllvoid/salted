// Inserts a poll and everything that hangs off it as one unit.
//
// daily_polls is the idempotency key: createPollForMeal returns early once a
// row exists for (flat_id, poll_date, flat_meal_id). If the poll row landed but
// its suggestion rows did not, that probe would report "done" on every later
// tick and the meal would stay empty for the day. So a failed seed deletes the
// poll (options cascade) and the next tick starts clean.
export async function insertPollWithOptions(
  admin: { from: (table: string) => any },
  row: { flat_id: string; flat_meal_id: string; poll_date: string; status: 'open' },
  seed: (pollId: string) => Promise<void>
): Promise<string> {
  const { data: poll, error } = await admin.from('daily_polls').insert(row).select('id').single();
  if (error) throw error;

  try {
    await seed(poll.id);
  } catch (err) {
    await admin.from('daily_polls').delete().eq('id', poll.id);
    throw err;
  }
  return poll.id;
}

import { test, expect } from '@playwright/test';
import { insertPollWithOptions } from '../../../supabase/functions/create_poll/insert-poll.ts';
import { recordDispatch } from '../../../supabase/functions/dispatch_cook/record-dispatch.ts';

// A stand-in for the Supabase client that records every write and can be told
// to fail one table. Only the call shapes the helpers use are implemented.
function fakeAdmin(failing: { table: string; op: 'insert' | 'update' } | null = null) {
  const calls: string[] = [];
  const result = (table: string, op: 'insert' | 'update') =>
    failing && failing.table === table && failing.op === op
      ? { error: new Error(`${table} ${op} failed`) }
      : { error: null };
  return {
    calls,
    from: (table: string) => ({
      insert: (row: unknown) => {
        calls.push(`insert ${table}`);
        const done = result(table, 'insert');
        return Object.assign(Promise.resolve(done), {
          select: () => ({ single: async () => ({ data: { id: 'poll-1' }, error: done.error }) }),
        });
      },
      update: () => ({
        eq: async () => {
          calls.push(`update ${table}`);
          return result(table, 'update');
        },
      }),
      delete: () => ({
        eq: async (_col: string, id: string) => {
          calls.push(`delete ${table} ${id}`);
          return { error: null };
        },
      }),
    }),
  };
}

const POLL_ROW = { flat_id: 'f', flat_meal_id: 'm', poll_date: '2026-09-19', status: 'open' as const };

test('a poll whose suggestions fail to insert is deleted so the next tick can retry', async () => {
  const admin = fakeAdmin();
  await expect(
    insertPollWithOptions(admin, POLL_ROW, async () => {
      throw new Error('options insert failed');
    })
  ).rejects.toThrow('options insert failed');
  expect(admin.calls).toEqual(['insert daily_polls', 'delete daily_polls poll-1']);
});

test('a poll whose suggestions insert cleanly is kept and its id returned', async () => {
  const admin = fakeAdmin();
  let seeded: string | null = null;
  const id = await insertPollWithOptions(admin, POLL_ROW, async (pollId) => {
    seeded = pollId;
  });
  expect(id).toBe('poll-1');
  expect(seeded).toBe('poll-1');
  expect(admin.calls).toEqual(['insert daily_polls']);
});

test('nothing is seeded or deleted when the poll row itself fails to insert', async () => {
  const admin = fakeAdmin({ table: 'daily_polls', op: 'insert' });
  let seeded = false;
  await expect(
    insertPollWithOptions(admin, POLL_ROW, async () => {
      seeded = true;
    })
  ).rejects.toThrow('daily_polls insert failed');
  expect(seeded).toBe(false);
  expect(admin.calls).toEqual(['insert daily_polls']);
});

test('a successful dispatch is logged and the poll marked dispatched', async () => {
  const admin = fakeAdmin();
  await recordDispatch(admin, 'poll-1', { status: 'mocked', mode: 'mock' });
  expect(admin.calls).toEqual(['insert dispatch_log', 'update daily_polls']);
});

test('a failed send is logged but the poll stays closed so it is retried', async () => {
  const admin = fakeAdmin();
  await recordDispatch(admin, 'poll-1', { status: 'failed', mode: 'live' });
  expect(admin.calls).toEqual(['insert dispatch_log']);
});

test('a lost log row aborts before the poll is marked dispatched', async () => {
  const admin = fakeAdmin({ table: 'dispatch_log', op: 'insert' });
  await expect(recordDispatch(admin, 'poll-1', { status: 'mocked' })).rejects.toThrow(
    'dispatch_log insert failed'
  );
  expect(admin.calls).toEqual(['insert dispatch_log']);
});

test('a failed status update surfaces instead of being swallowed', async () => {
  const admin = fakeAdmin({ table: 'daily_polls', op: 'update' });
  await expect(recordDispatch(admin, 'poll-1', { status: 'mocked' })).rejects.toThrow(
    'daily_polls update failed'
  );
});

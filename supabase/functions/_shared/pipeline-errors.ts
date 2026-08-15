import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export type PipelineStage = 'create_poll' | 'close_poll' | 'dispatch_cook' | 'wa_webhook';

// Every stage failure is logged to pipeline_errors (docs/03-mvp-spec.md
// "Daily pipeline" step 4) and should additionally alert the founder via
// webhook — TODO: call the alert webhook URL from env once configured.
export async function logPipelineError(
  admin: SupabaseClient,
  stage: PipelineStage,
  detail: Record<string, unknown>,
  flatId?: string
) {
  await admin.from('pipeline_errors').insert({ stage, flat_id: flatId ?? null, detail });
}

// Supabase's PostgrestError is a plain object, NOT an Error instance — so the
// obvious `err instanceof Error ? err.message : String(err)` records the
// literal string "[object Object]" for exactly the failures worth debugging.
// That happened during part 1 and left a live create_poll outage with no
// diagnosable detail. Keep every field the client gives us.
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    return { message: err.message, name: err.name, stack: err.stack };
  }
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    return {
      message: typeof e.message === 'string' ? e.message : JSON.stringify(err),
      code: e.code,
      details: e.details,
      hint: e.hint,
    };
  }
  return { message: String(err) };
}

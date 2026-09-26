import { createAdminClient } from '../_shared/supabase-admin.ts';
import { createWebhookHandler } from './handler.ts';

Deno.serve(createWebhookHandler({
  verifyToken: Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN'),
  appSecret: Deno.env.get('META_APP_SECRET'),
  async save(event) {
    // Atomic conditional writes tolerate duplicate and out-of-order callbacks.
    const allowed = {
      sent: ['queued', 'mocked'],
      delivered: ['queued', 'mocked', 'sent', 'failed'],
      read: ['queued', 'mocked', 'sent', 'failed', 'delivered'],
      failed: ['queued', 'mocked', 'sent'],
    };
    const { error } = await createAdminClient().from('dispatch_log')
      .update({ status: event.status, error: event.error, updated_at: new Date().toISOString() })
      .eq('bsp_message_id', event.id)
      .in('status', allowed[event.status]);
    if (error) throw new Error('Delivery status update failed');
  },
}));

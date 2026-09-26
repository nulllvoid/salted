import { test, expect } from '@playwright/test';
import { createHmac } from 'node:crypto';
import { createWebhookHandler } from '../../../supabase/functions/wa_webhook/handler';

const secret = 'test-only-secret';
const url = 'https://example.test/webhook';
function request(body: string, signed = true) {
  return new Request(url, { method: 'POST', body, headers: signed ? {
    'x-hub-signature-256': `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`,
  } : {} });
}
function payload(statuses: unknown[]) {
  return JSON.stringify({ object: 'whatsapp_business_account', entry: [
    { changes: [{ field: 'messages', value: { statuses } }] },
  ] });
}

test('GET echoes challenge only for matching token and subscribe mode', async () => {
  const handler = createWebhookHandler({ verifyToken: 'verify-test', save: async () => {} });
  const response = await handler(new Request(`${url}?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=123`));
  expect(response.status).toBe(200);
  expect(await response.text()).toBe('123');
  expect((await handler(new Request(`${url}?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=123`))).status).toBe(403);
});

test('missing configuration and unsigned requests fail closed', async () => {
  const handler = createWebhookHandler({ save: async () => { throw new Error('must not write'); } });
  expect((await handler(new Request(url))).status).toBe(503);
  expect((await handler(request('{}'))).status).toBe(503);
  const configured = createWebhookHandler({ appSecret: secret, save: async () => { throw new Error('must not write'); } });
  expect((await configured(request('{}', false))).status).toBe(401);
  const tampered = request('{}');
  expect((await configured(new Request(url, { method: 'POST', body: '{"changed":true}', headers: tampered.headers }))).status).toBe(401);
});

test('processes batched Meta statuses and safely ignores unknown events', async () => {
  const saved: unknown[] = [];
  const handler = createWebhookHandler({ appSecret: secret, save: async (event) => { saved.push(event); } });
  const response = await handler(request(payload([
    { id: 'wamid.1', status: 'delivered' },
    { id: 'wamid.2', status: 'failed', errors: [{ code: 131026 }] },
    { id: 'wamid.3', status: 'unknown' },
  ])));
  expect(response.status).toBe(200);
  expect(saved).toEqual([
    { id: 'wamid.1', status: 'delivered', error: null },
    { id: 'wamid.2', status: 'failed', error: 'WhatsApp delivery failed (131026)' },
  ]);
});

test('invalid signed JSON is rejected and storage failures request retry', async () => {
  const handler = createWebhookHandler({ appSecret: secret, save: async () => { throw new Error('db'); } });
  expect((await handler(request('{'))).status).toBe(400);
  expect((await handler(request(payload([{ id: 'wamid.1', status: 'sent' }])))).status).toBe(500);
});

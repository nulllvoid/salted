import { test, expect } from '@playwright/test';
import { sendTemplate, WhatsAppSendError } from '../../../supabase/functions/_shared/whatsapp';

const config = { accessToken: 'test-token', phoneNumberId: '111222333' };

function respond(status: number, body: unknown) {
  return async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  });
}

test('posts a template message and returns Meta message id', async () => {
  let seen: { url: string; init: RequestInit } | null = null;
  const id = await sendTemplate({
    ...config,
    to: '+919999999999',
    template: 'cook_menu',
    language: 'hi',
    variables: ['Sunita', '5 × Roti', '—'],
    fetch: async (url, init) => {
      seen = { url: String(url), init: init! };
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.ABC' }] }), { status: 200 });
    },
  });

  expect(id).toBe('wamid.ABC');
  expect(seen!.url).toContain('/111222333/messages');
  expect(seen!.init.method).toBe('POST');
  expect((seen!.init.headers as Record<string, string>).Authorization).toBe('Bearer test-token');

  const body = JSON.parse(String(seen!.init.body));
  expect(body).toMatchObject({
    messaging_product: 'whatsapp',
    to: '+919999999999',
    type: 'template',
    template: {
      name: 'cook_menu',
      language: { code: 'hi' },
      components: [{
        type: 'body',
        parameters: [
          { type: 'text', text: 'Sunita' },
          { type: 'text', text: '5 × Roti' },
          { type: 'text', text: '—' },
        ],
      }],
    },
  });
});

test('a rejected template surfaces Meta\'s own error text', async () => {
  const failing = sendTemplate({
    ...config, to: '+919999999999', template: 'cook_menu', language: 'hi',
    variables: ['a', 'b', 'c'],
    fetch: respond(400, { error: { message: 'Template name does not exist', code: 132001 } }),
  });
  await expect(failing).rejects.toThrow(/Template name does not exist/);
  await expect(failing).rejects.toThrow(/132001/);
});

test('a server-side failure is reported as retryable, a client one is not', async () => {
  const serverSide = sendTemplate({
    ...config, to: '+91', template: 'cook_menu', language: 'hi', variables: ['a', 'b', 'c'],
    fetch: respond(503, { error: { message: 'Service unavailable' } }),
  }).catch((e: WhatsAppSendError) => e);
  expect(((await serverSide) as WhatsAppSendError).retryable).toBe(true);

  const clientSide = sendTemplate({
    ...config, to: '+91', template: 'cook_menu', language: 'hi', variables: ['a', 'b', 'c'],
    fetch: respond(400, { error: { message: 'Bad recipient' } }),
  }).catch((e: WhatsAppSendError) => e);
  expect(((await clientSide) as WhatsAppSendError).retryable).toBe(false);
});

test('a 200 that carries no message id is treated as a failure', async () => {
  await expect(sendTemplate({
    ...config, to: '+91', template: 'cook_menu', language: 'hi', variables: ['a', 'b', 'c'],
    fetch: respond(200, { messages: [] }),
  })).rejects.toThrow(/message id/i);
});

test('missing credentials fail closed before any request is made', async () => {
  let called = false;
  await expect(sendTemplate({
    accessToken: '', phoneNumberId: '111', to: '+91', template: 'cook_menu',
    language: 'hi', variables: ['a', 'b', 'c'],
    fetch: async () => { called = true; return new Response('{}'); },
  })).rejects.toThrow(/not configured/i);
  expect(called).toBe(false);
});

export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed';
export interface DeliveryEvent { id: string; status: DeliveryStatus; error: string | null }

export async function verifySignature(body: Uint8Array, signature: string | null, secret: string) {
  if (!signature || !/^sha256=[a-f0-9]{64}$/i.test(signature)) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const bytes = Uint8Array.from(signature.slice(7).match(/../g)!, (hex) => parseInt(hex, 16));
  return crypto.subtle.verify('HMAC', key, bytes, body);
}

export function createWebhookHandler(config: {
  verifyToken?: string;
  appSecret?: string;
  save: (event: DeliveryEvent) => Promise<void>;
}) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'GET') {
      if (!config.verifyToken) return new Response('Webhook not configured', { status: 503 });
      const params = new URL(req.url).searchParams;
      if (params.get('hub.mode') !== 'subscribe' ||
          params.get('hub.verify_token') !== config.verifyToken || !params.get('hub.challenge'))
        return new Response('Forbidden', { status: 403 });
      return new Response(params.get('hub.challenge'), { headers: { 'Content-Type': 'text/plain' } });
    }
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
    if (!config.appSecret) return new Response('Webhook not configured', { status: 503 });
    const raw = new Uint8Array(await req.arrayBuffer());
    if (!await verifySignature(raw, req.headers.get('x-hub-signature-256'), config.appSecret))
      return new Response('Invalid signature', { status: 401 });
    let payload;
    try { payload = JSON.parse(new TextDecoder().decode(raw)); }
    catch { return new Response('Invalid JSON', { status: 400 }); }
    if (payload?.object !== 'whatsapp_business_account' || !Array.isArray(payload.entry))
      return new Response('Invalid WhatsApp payload', { status: 400 });
    try {
      for (const entry of payload.entry) {
        if (!Array.isArray(entry?.changes)) continue;
        for (const change of entry.changes) {
          if (change?.field !== 'messages' || !Array.isArray(change.value?.statuses)) continue;
          for (const event of change.value.statuses) {
            if (typeof event?.id !== 'string' || !event.id ||
                !['sent', 'delivered', 'read', 'failed'].includes(event.status)) continue;
            const codes = Array.isArray(event.errors)
              ? event.errors.filter((e: { code?: unknown }) => typeof e?.code === 'number')
                .map((e: { code: number }) => e.code).join(', ') : '';
            await config.save({ id: event.id, status: event.status,
              error: event.status === 'failed' ? `WhatsApp delivery failed${codes ? ` (${codes})` : ''}` : null });
          }
        }
      }
    } catch {
      // Non-2xx lets Meta retry; do not log raw bodies or recipient details.
      return new Response('Unable to process event', { status: 500 });
    }
    return Response.json({ ok: true });
  };
}

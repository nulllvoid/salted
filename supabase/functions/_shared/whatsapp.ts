// Meta WhatsApp Cloud API send client.
//
// Direct rather than through a BSP (AiSensy/Interakt, as docs/06 originally
// specified): Flatmeal sends one utility message per flat per meal and needs
// none of an inbox, campaign builder or storefront integration, which is what
// a BSP's monthly fee buys. The Meta app, webhook and template-variable
// composition already exist, so what remained was one HTTP POST.
//
// Domain-agnostic on purpose — it knows nothing about carts, cooks or meals —
// so swapping in a BSP later means replacing this file alone.

const GRAPH_VERSION = 'v21.0';

export class WhatsAppSendError extends Error {
  // A 5xx or transport failure could succeed on a retry; a 4xx (unapproved
  // template, unregistered recipient) will not. Callers decide what to do
  // with that — dispatch_cook deliberately does not retry either way.
  readonly retryable: boolean;
  readonly code: number | null;

  constructor(message: string, options: { retryable: boolean; code?: number | null }) {
    super(message);
    this.name = 'WhatsAppSendError';
    this.retryable = options.retryable;
    this.code = options.code ?? null;
  }
}

export async function sendTemplate(params: {
  accessToken: string;
  phoneNumberId: string;
  to: string;
  template: string;
  language: string;
  variables: string[];
  fetch?: typeof globalThis.fetch;
}): Promise<string> {
  const { accessToken, phoneNumberId, to, template, language, variables } = params;
  // Fails closed, like wa_webhook: never attempt a send half-configured.
  if (!accessToken || !phoneNumberId) {
    throw new WhatsAppSendError('WhatsApp sending is not configured', { retryable: false });
  }

  const doFetch = params.fetch ?? globalThis.fetch;
  let response: Response;
  try {
    response = await doFetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: template,
            language: { code: language },
            components: [{
              type: 'body',
              parameters: variables.map((text) => ({ type: 'text', text })),
            }],
          },
        }),
      },
    );
  } catch (err) {
    throw new WhatsAppSendError(
      `WhatsApp request failed: ${err instanceof Error ? err.message : 'unknown error'}`,
      { retryable: true },
    );
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.error?.message ?? `HTTP ${response.status}`;
    const code = typeof body?.error?.code === 'number' ? body.error.code : null;
    throw new WhatsAppSendError(
      `WhatsApp send rejected: ${detail}${code === null ? '' : ` (${code})`}`,
      { retryable: response.status >= 500, code },
    );
  }

  // A 2xx without an id means nothing to correlate the delivery callback
  // against, so treat it as a failure rather than logging an unusable row.
  const messageId = body?.messages?.[0]?.id;
  if (typeof messageId !== 'string' || !messageId) {
    throw new WhatsAppSendError('WhatsApp send returned no message id', { retryable: false });
  }
  return messageId;
}

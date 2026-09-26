# WhatsApp webhook deployment

The endpoint is `https://<project-ref>.supabase.co/functions/v1/wa_webhook`.

Set these Supabase Edge Function secrets before enabling callbacks:

- `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: a random value shared with Meta's Verify token field.
- `META_APP_SECRET`: the Salted Meta app secret from App settings > Basic. This is not a WhatsApp access token.

Keep secrets out of Git, public Expo variables, screenshots, and chat. Use the Supabase dashboard secret editor or an ignored local environment file with `supabase secrets set --env-file <path>`.

From the repository root, after authenticating the Supabase CLI:

```sh
npx supabase functions deploy wa_webhook --project-ref YOUR_PROJECT_REF
```

The existing `verify_jwt = false` configuration allows Meta's verification request to reach this endpoint. POST requests instead require a valid HMAC-SHA256 signature using the Meta app secret; missing secrets fail closed.

In Meta > WhatsApp > Production setup > Configure Webhooks:

1. Enter the deployed callback URL and the same verification token.
2. Select Verify and save.
3. Subscribe to the `messages` field for message delivery callbacks and ensure the app is subscribed to the intended WhatsApp Business Account.
4. Run Meta's test delivery and verify the response. Unknown message IDs are acknowledged without creating dispatch records.

The handler verifies the raw POST body, parses Meta's batched `entry[].changes[].value.statuses[]` events, and updates matching `dispatch_log.bsp_message_id` records. Conditional updates prevent duplicate and late events from downgrading read/delivered status. Database errors return 500 so Meta can retry. Incoming messages are acknowledged but not processed; opt-out handling and sending integration remain separate work before production automation.

Meta's current dashboard states that production events require publishing the app. A successful verification challenge alone does not prove live delivery tracking works. The sending adapter must store Meta's message ID in `bsp_message_id` for correlation.

Validation: 53 unit tests passed, including challenge verification, unsigned/tampered request rejection, batch status processing, and retry-on-storage-failure checks. Live deployment and Meta verification remain pending until credentials are configured.

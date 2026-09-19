# WhatsApp integration (cook dispatch)

## Setup (start day 1 — longest lead time in the project)

**Decided (18 Sep 2026): Meta Cloud API direct, no BSP.** Flatmeal sends one
utility message per flat per meal — no marketing, no storefront, no inbox — so
a BSP's ₹999–2399/month buys nothing we use, and the Meta app, webhook and
template composition were already built. ~₹0.115/utility message direct
against a BSP markup of 10–30% plus subscription. The trade is that number
registration and business verification are self-service.

The send client is `supabase/functions/_shared/whatsapp.ts`, deliberately
domain-agnostic: swapping to a BSP later means replacing that one file.

1. Create Meta Business Manager, verify the business, register a WhatsApp
   Business number (fresh SIM/virtual number, NOT the founder's personal one).
2. Submit the `cook_menu` template below for **hi, kn, en** and wait for
   approval (hours–days, occasionally longer).
3. Set Edge Function secrets `WHATSAPP_ACCESS_TOKEN` and
   `WHATSAPP_PHONE_NUMBER_ID`.
4. Configure the webhook → `wa_webhook` for delivery statuses (see
   `docs/whatsapp-webhook-setup.md`; already done).

## Template (category: UTILITY)

Meta approves the template *shell* per language and renders it from the
`language.code` we send, so we translate nothing about it at send time.

**Name:** `cook_menu` · **Language:** hi

```
नमस्ते {{1}} 🙏
आज का खाना:
{{2}}

नोट: {{3}}
```

**Language:** kn

```
ನಮಸ್ಕಾರ {{1}} 🙏
ಇಂದಿನ ಅಡುಗೆ:
{{2}}

ಸೂಚನೆ: {{3}}
```

**Language:** en

```
Hello {{1}} 🙏
Today's meal:
{{2}}

Note: {{3}}
```

### Why ingredients and method are not in it

The earlier six-variable `daily_cook_instructions` draft carried ingredients
and cooking method. Measured against real `dispatch_log` rows, those payloads
run **580–3783 characters** — Meta's limit is 1024, applied to the *rendered*
message. Nothing short of truncating the instructions fit.

The cook already knows how to cook. They need what to make, how much of each,
and anything the flat specifically wants; ingredients are the flatmates'
concern (that is what the grocery screen is for). The three-variable message
renders at ~50–260 characters on real carts, with a pathological 2000-char
note still trimming to 643.

Knock-on effect: `recipe_translations`, live method translation and the
`reviewed_at = null` review workflow all leave the dispatch path. The ~80
translation quality gate below is no longer a pilot blocker — machine
translation of cooking verbs was the most likely embarrassment point in this
document, and it is now off the critical path.

Variables: 1 cook name · 2 dish list, each line `N × Dish` comma-joined (dish
names stay as-is, transliterate only if reviewed) · 3 flat note
(live-translated; default "—").

The count leads because recipe names carry their own brackets — "Akki Rotti
(Rice Flatbread) (for 2)" is ambiguous about which number is the serving
count. A bare number also reads correctly for both portions and item counts
(`5 × Roti` is five rotis, not five people's worth — see `recipes.is_item_counted`).

Template rules to respect: no variable at the very start or end floating alone, no promo language (must stay UTILITY category), sample values required at submission. **A variable may not contain a newline or a run of more than four spaces**, and the 1024 limit counts the rendered message — `compose-template.ts` enforces both rather than letting Meta refuse the send.

## Composition pipeline (in `dispatch_cook`)

1. Build the English payload from the cart + `flat_note` — this is the in-app
   preview and `wa.me` fallback text, not what the template carries.
2. Compose the three template variables (`compose-template.ts`).
3. Flat note: live Google Translate each time (short, dynamic); falls back to
   English when `GOOGLE_TRANSLATE_API_KEY` is unset.
4. `sendTemplate()` → Meta Cloud API → `bsp_message_id` → `dispatch_log`.
5. `DISPATCH_MODE=mock` skips step 4's network call and logs status `mocked`.

A send failure is logged with Meta's own error and **never retried**: the poll
flips to `dispatched` either way, and a cook message arriving hours late is
worse than none (the same reasoning as `DISPATCH_GRACE_MINUTES`). The fallback
below still works in that case.

## Fallback (ships regardless of Meta approval)

If template unapproved or send fails: app shows the composed translated message with a button →
`https://wa.me/<cook_phone>?text=<urlencoded message>` — a flatmate sends it from their own WhatsApp in one tap. This also serves as the demo path on day 1.

## Quality gate before pilot

Have one native Hindi and one native Kannada speaker (or a real cook) read all ~80 cached instruction translations; fix awkward renderings; set `reviewed_by/reviewed_at`. Machine translation of cooking verbs is the most likely embarrassment point ("beat the eggs" mistranslations etc.).

## Stretch: voice note

TTS the translated body (Sarvam AI Bulbul / Google TTS hi-IN, kn-IN) → upload media via the Cloud API → send as follow-up audio message. Only if weeks 1–3 land on time. Note this would be a *free-form* media message, which needs an open 24-hour customer service window — a cook who never messages first never opens one — so it likely needs its own template or a reply from the cook first.

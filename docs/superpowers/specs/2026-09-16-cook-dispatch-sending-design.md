# Cook dispatch: item counts + Meta Cloud API sending

Date: 16 Sep 2026

Closes the last clause of the MVP definition of done: the cook receives a
correctly translated WhatsApp message at dispatch time. Today `dispatch_cook`
composes and translates correctly but `mode='live'` is a hardcoded failure —
no send path exists.

Two parts. Part 1 unblocks Part 2: the message cannot say "5 rotis" until
something can record 5.

## Background: why the message shrank

The composed payload is 580–3783 characters against Meta's 1024-character
template limit (measured across existing `dispatch_log` rows). Recipe method
text accounts for most of it — roughly 1800 characters for a single dish of
LLM-generated prose.

No template-only approach fits that content. Rather than truncate the
instructions, the message drops them: **the cook already knows how to cook.**
They need what to make, how much, and anything specific the flat wants. The
grocery list is the flatmates' concern, not theirs, and a professional cook
making Paneer Kurma does not need the recipe.

Consequences, all favourable:

- The message fits the template with room to spare (~150 chars rendered).
- The `recipe_translations` cache, live method translation, and the
  `reviewed_at = null` human-review workflow all leave the dispatch path.
- The ~80-translation quality gate in `docs/06-whatsapp-integration.md` stops
  being a pilot blocker. Machine translation of cooking verbs was the most
  likely embarrassment point in that document; it is now off the critical path.

`payload_en` / `payload_translated` still store the full rich text, so the
in-app cook-message preview and the `wa.me` fallback are unchanged. Only the
*template* path is shortened.

## Part 1 — item-counted dishes

### Problem

`cart_items.quantity` means "number of people's worth" and
`validate_cart_dish` caps it at current headcount. That works for a curry:
2 people eat 2 portions of dal.

It fails for roti. Two people eating 2 and 3 rotis need **5 rotis**, a number
that exceeds headcount and counts items rather than portions. The database
rejects it today with "Servings exceed the number of people eating", and the
UI's `+` button disables at headcount.

The fix is not a serving-unit model with per-person defaults. The user knows
the real number and types it; the system forwards it.

### Schema

```sql
alter table public.recipes
  add column is_item_counted boolean not null default false;
```

`kind` cannot carry this signal: of 486 active recipes, 483 are `main` and 3
are `accompaniment`, and item-counting cuts across it — Roti is an
accompaniment, Set Dosa is a main.

Four active recipes are item-counted: Akki Rotti (Rice Flatbread), Dosa with
Coconut Chutney, Roti, Set Dosa. Seeded by name in the same migration.

### Trigger

`validate_cart_dish`'s final check splits. Portions keep the headcount cap,
which is a genuine typo guard — 20 portions of Paneer Kurma in a 2-person flat
is a mistake. Item dishes get a fixed ceiling instead, so a fat-fingered 500
still cannot reach the cook.

```sql
if new.quantity < 1 then
  raise exception 'Quantity must be at least 1';
elsif not v_recipe.is_item_counted and new.quantity > v_count then
  raise exception 'Servings exceed the number of people eating';
elsif v_recipe.is_item_counted and new.quantity > 99 then
  raise exception 'Quantity is too large';
end if;
```

### UI

`app/src/app/(tabs)/index.tsx`:

- The `+` button's `disabled={... || line.quantity >= headcount}` applies only
  to non-item dishes; item dishes cap at 99.
- The `{line.quantity} servings` label becomes `N ×`, which reads correctly for
  both cases and avoids asserting a wrong noun.
- The default quantity on add stays headcount for every dish. For roti that is
  a starting point the user edits upward, not a claim about appetite.

This needs `is_item_counted` on the recipe rows the cart screen already loads.

### Migration procedure

Per repo habit, every production migration passes a rollback-only run first:

```sh
node --env-file=app/.env scripts/migrate.mjs supabase/migrations/<file>.sql
node --env-file=app/.env scripts/migrate.mjs supabase/migrations/<file>.sql --apply
```

`docs/05-schema.sql` is the source of truth for the data model and is edited
before the migration is generated.

## Part 2 — Meta Cloud API adapter

### Why direct, not a BSP

`docs/06-whatsapp-integration.md` specifies picking AiSensy or Interakt. That
predates the Meta app existing. Flatmeal sends one utility message per flat per
meal with no marketing, no storefront, and no inbox — none of what a BSP's
₹999–2399/month buys. The webhook is already deployed and tested against the
Meta app, and `compose-payload.ts` already fills template variables, so the
remaining work is one HTTP POST. Per-message cost is ~₹0.115 direct against a
BSP markup of 10–30% plus subscription.

Trade-off accepted: number registration and business verification are
self-service. The adapter lives behind a domain-agnostic interface so a BSP can
be swapped in by replacing one file.

### Template

`cook_menu`, category UTILITY, submitted for `hi`, `kn`, `en`. Three variables.

```
नमस्ते {{1}} 🙏
आज का खाना:
{{2}}

नोट: {{3}}
```

1. cook name · 2. dish list · 3. flat note, `—` when empty

`{{2}}` is `5 × Roti, 2 × Paneer Kurma`: leading bare numbers, comma-joined.
Bare numbers work for both counting modes and carry no language. Leading
position matters because recipe names contain parentheses — "Akki Rotti (Rice
Flatbread) (for 2)" is ambiguous about which number is the count.

**Meta rejects newlines and runs of more than 4 spaces inside variables**, and
the 1024 limit applies to the rendered message after substitution. So `{{2}}`
must be built newline-free; it cannot reuse `composeEnglishPayload`, which
joins with `\n`. A length guard trims and logs rather than letting Meta reject
a send outright.

The old 6-variable template carrying ingredients and method is superseded.

### Language and translation

| Variable | Content | Treatment |
|---|---|---|
| shell | "नमस्ते … आज का खाना:" | Meta-side. Approved per language; we translate nothing. |
| {{1}} | cook name | As-is, proper noun. |
| {{2}} | dish list | **As-is, untranslated.** |
| {{3}} | flat note | Live Google Translate via existing `translateText()`. |

Language comes from `cooks.language` (`hi`/`kn`/`en`), already read in
`dispatch_cook/index.ts` and stored on `dispatch_log`. It maps directly to the
Cloud API's `language.code`.

Dish names stay in Latin script deliberately. They are already Indian dish
names — Paneer Kurma, Bhindi Curry, Karela Kofta — that a cook recognises, and
`docs/06` says keep them as-is, transliterate only if reviewed. Machine
translation risks "Karela Kofta" returning as a literal "bitter gourd ball".

`translateText()` returns null without `GOOGLE_TRANSLATE_API_KEY`, and the note
falls back to English rather than blocking dispatch.

### Components

- **`supabase/functions/_shared/whatsapp.ts`** — `sendTemplate({to, template,
  language, variables})`. One fetch to
  `graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages`; returns the Meta
  message id or throws a typed error. Knows nothing about Flatmeal domain
  objects, so a vendor swap touches this file alone.
- **`supabase/functions/dispatch_cook/compose-template.ts`** — pure function,
  cart + cook + note → three variable strings. Newline-stripped and
  length-guarded. Unit-testable with no mocking, like `compose-payload.ts`.
- **`supabase/functions/dispatch_cook/index.ts`** — replaces the hardcoded
  `status='failed'` block (currently lines 227–233) with the real call.

Secrets: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`.

### Data flow

```
cart + cook + meal
  → composeTemplateVariables()   pure, 3 strings, newline-free
  → sendTemplate()               HTTP, returns Meta message id
  → dispatch_log {status:'sent', bsp_message_id}
  → [later] wa_webhook flips to delivered / read / failed
```

The third arrow is the payoff: `bsp_message_id` is populated for the first
time, so the already-deployed `wa_webhook` finally has something to correlate
against. Until now it received callbacks and matched zero rows.

### Error handling

- Missing `WHATSAPP_ACCESS_TOKEN` or `WHATSAPP_PHONE_NUMBER_ID` →
  `status='failed'` with a clear error. Fails closed, matching `wa_webhook`.
- Meta 4xx (unapproved template, unregistered recipient) → `failed` with Meta's
  error code recorded.
- Meta 5xx or network failure → `failed`. **No retry.**

No-retry is deliberate and matches `DISPATCH_GRACE_MINUTES` (45 minutes, versus
24 hours for create/close): a cook message arriving hours late is worse than
none, because the cook may have already shopped or started. The poll flips to
`dispatched` regardless, so the next cron tick does not re-send.

The accepted cost: a Meta outage at dispatch time silently drops that meal's
message, and flatmates notice only in the app. Mitigation is the existing
`wa.me` fallback on the cook-message screen, which works regardless of send
status. Revisit if it bites during the pilot.

### Testing

TDD, following `app/e2e/unit/` (Playwright, no browser, imports the function
`.ts` modules directly — Deno is not installed in this environment).

- `compose-template.spec.ts` — variable building, newline stripping, note
  default when empty, mixed per-dish quantities, length guard.
- `whatsapp-send.spec.ts` — request shape, message-id extraction, error mapping
  for 4xx/5xx, missing-credential path. `fetch` is injected; no network.
- Trigger behaviour is covered by the migration's rollback-only run against
  `supabase/tests/`.

Then a live send to the Meta test number's pre-verified recipient.

## Out of scope

Deliberately not built:

- Recipe follow-up messages, quick-reply buttons, inbound message handling.
  A flatmate can send the full recipe from the existing cook-message screen if
  a cook ever asks.
- Send retries, queueing, per-dish notes.
- Per-person appetite defaults. The user types the real count.
- Transliteration of dish names.

`DISPATCH_MODE=mock` remains the default and is unchanged.

## Blocked on external state

Neither part is blocked, but **live sending is**:

- A real WhatsApp Business number must be registered. Only Meta's test number
  exists today, which reaches at most 5 pre-verified recipients.
- `cook_menu` must be submitted and approved for hi/kn/en. Approval takes hours
  to days.

Both proceed in parallel with implementation.

## Documentation to update

- `docs/06-whatsapp-integration.md` — BSP choice superseded by Cloud API
  direct; 6-variable template superseded by `cook_menu`; the ~80-translation
  quality gate is no longer a dispatch blocker.
- `docs/05-schema.sql` — `recipes.is_item_counted`.
- `CLAUDE.md` — the "capped by current headcount" convention now has an
  explicit exception for item-counted dishes.

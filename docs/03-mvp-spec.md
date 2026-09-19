# MVP Spec — screens, flows, edge cases

Four screens + onboarding. Push back on any screen sprawl beyond this.

## S0. Onboarding (one-time)
1. Phone number → OTP → session.
2. "Create a flat" or "Join with link".
   - Create: flat name → dietary profile form (diet type, Jain toggle, allergy multi-select) → cook details (name, phone, language) → poll timings (prefilled defaults) → invite link share sheet.
   - Join: deep link opens app → dietary profile form → done.
3. Request push-notification permission with a one-line why ("so you can build tonight's dinner in 5 seconds").

Edge cases: joining a flat that already has today's poll → user sees the live poll immediately; cook details editable later by any member (log who changed it in `audit_note` column).

## S1. Today (home) — the shared cart
- Header: date + "Dinner for <flat name>" + headcount pill ("3 eating tonight").
- "I'm out today" toggle at top. Toggling after cart lock but before dispatch still updates headcount + cook message; after dispatch, show "already sent to cook — tell the flat group" notice.
- Cart open: Suggestions section (up to 3 main dish cards + up to 3 accompaniment cards, name/cuisine tag/veg-non-veg dot, hero image optional/local asset), grouped by kind. Tap a suggestion = add to cart at quantity = current headcount (suggestion then drops out of the list). Cart section below shows every added dish with a quantity stepper (capped at headcount) and a remove action, plus "added/edited by X" (social proof, no separate vote tally since the cart is shared and live-edited by whoever touches it last).
- Cart locked (poll closed/dispatched): cart section becomes read-only ("Tonight's menu") — quantities shown as plain text, no steppers or remove — + buttons: [Grocery list] [Preview cook message] [Add note for cook] (note editable until dispatch).
- Yesterday's 👍/👎 feedback chip at top until answered.

States: no poll yet today (before open time) → show "options coming at 09:00"; all members marked out → poll auto-cancels, no dispatch, banner "no dinner today"; cart still empty at lock time → still transitions to closed (not cancelled), and dispatch skips sending with a logged pipeline error rather than sending an empty message.

## S2. Grocery list
- Header shows the dish summary across every cart line, e.g. "Dal (2), Bhindi (1), Aloo Jeera (1), Roti (2)" — no single flat-wide headcount, since each dish scales independently by its own cart quantity.
- Checklist grouped: Vegetables / Dairy / Staples check-line / Other (category stays the primary grouping for shopping-trip convenience). Items show buyable quantity ("2 medium onions", "200 g paneer") scaled by that dish's own cart quantity, plus a small secondary label naming which dish it's for (ingredients aren't summed across dishes sharing a name — each dish's ingredient rows stay separate and independently tickable).
- Tick = "we already have it" (persisted per poll per ingredient row, synced realtime so two flatmates don't double-buy).
- Footer: unticked count + [Copy list] [Share to WhatsApp].
- Share text format:
  ```
  🛒 Tonight: Dal (2), Bhindi (1), Aloo Jeera (1), Roti (2)
  To buy:
  - Palak (spinach) — 2 bunches (for Dal)
  - Paneer — 200 g (for Bhindi)
  - Curd — 1 small packet (200 g) (for Aloo Jeera)
  Check at home: turmeric, jeera, garam masala
  ```
- Stretch: item row → chevron opens Blinkit search URL for the item name.

## S3. Settings
- My dietary profile (edit).
- Flat: members list, invite link, cook card (name/phone/language — changing language takes effect next dispatch), poll timings, meal (locked to Dinner, shown greyed for expectation-setting).
- Danger: leave flat.
- Send feedback (free text → `feedback` table).

## S4. Cook message preview (modal from S1)
- Shows the exact translated message that will be / was sent, with English original toggle.
- Pre-dispatch: [Edit flat note] visible.
- Post-dispatch: delivery status (sent/delivered/read/failed). Failed → [Send it yourself] button → wa.me/<cookphone>?text=<urlencoded translated message>.

## Daily pipeline (server, IST)
1. `create_poll` (per-flat open time): pick up to 3 main-course suggestions (filters: diet ∪ allergies as hard excludes; exclude dishes served to this flat in last 10 days, derived from `cart_items` joined to dispatched `daily_polls`; variety heuristic: not all 3 same cuisine or same base ingredient), then up to 3 accompaniment suggestions sourced from the union of `recipe_accompaniments` for those mains → insert poll + `poll_options` + `poll_accompaniment_options` → push "Today's suggestions are up — add to the cart."
2. `close_poll` (per-flat close time): no winner to compute — just locks the cart (`status → 'closed'`, enforced via RLS so no further client writes land) → push "tonight's menu is locked" announcement.
3. `dispatch_cook` (per-meal dispatch time): load every `cart_items` line (mains + accompaniments), recompute headcount (out-toggles counted now, informational only), scale each dish's ingredients by its OWN cart quantity (not headcount) and compose per-dish English payload sections + flat note — that payload is the in-app preview and `wa.me` fallback text, **not** what the cook receives. Then render the 3-slot `cook_menu` template (cook name / `N × Dish, …` / note, the note live-translated), send via the Meta Cloud API (or mock), write `dispatch_log` with status and `bsp_message_id`; `wa_webhook` updates delivery status. Ingredients and method are deliberately absent from the template — see `docs/06-whatsapp-integration.md`. A send failure is logged and never retried. Empty cart at dispatch time → log a `pipeline_errors` row and skip sending, rather than dispatching nothing.
4. Failure at any stage → row in `pipeline_errors` + alert webhook to founder.

## Push notifications (Expo)
- Poll open, poll closed/winner, dispatch failed (to all members), morning feedback prompt. All deep-link to relevant screen. Respect per-user mute toggle (settings) except dispatch-failed.

# Architecture — v1

## Stack (decided; do not substitute without founder sign-off)

| Layer | Choice | Why |
|---|---|---|
| Mobile app | Expo (React Native) + TypeScript, Expo Router | One codebase → eventual Play Store/App Store; EAS Build APK links for storeless pilot distribution; EAS Update for OTA fixes mid-pilot; expo-notifications for push |
| Backend | Supabase | Postgres + Auth (phone OTP) + Realtime (live cart/checklist) + Edge Functions + pg_cron; no servers to run |
| Scheduling | pg_cron → Edge Functions (`create_poll`, `close_poll`, `dispatch_cook`) | Per-flat times: cron runs every 15 min, function selects flats whose local time matches |
| WhatsApp | Meta WhatsApp Business Cloud API **direct**, no BSP (decided 18 Sep 2026) | Utility templates; webhook → Edge Function for delivery status. `_shared/whatsapp.ts` is domain-agnostic, so a BSP can replace it as one file |
| Translation | Google Cloud Translate; per-recipe reviewed-translation cache in DB | Hindi + Kannada v1; Sarvam AI later for colloquial quality / TTS |
| Push | Expo Push Service | No direct FCM/APNs config needed |
| Analytics | PostHog (free tier) or plain event table in Postgres | Pilot metrics in 07 |

## Repo layout (target)

```
/app          Expo app (Expo Router screens per docs/03)
/supabase     migrations/ (from docs/05-schema.sql), functions/ (create_poll, close_poll, dispatch_cook, wa_webhook), seed/
/data         recipe + ingredient CSVs (source of truth for seeding)
/docs         this documentation
```

## Key decisions & notes

- **Auth:** Supabase phone OTP (MSG91/Twilio SMS provider). Fallback: email magic link if SMS cost is annoying for pilot.
- **RLS everywhere:** every table scoped by `flat_id`; policies: members read/write own flat only. Recipes/ingredients are global read-only to authenticated users; writes via service role only.
- **Dispatch is mockable:** `DISPATCH_MODE=mock|live` env on the Edge Function. Mock writes the fully composed + translated payload to `dispatch_log` with status `mocked`. The entire app must be demoable before Meta approval lands.
- **Translation caching:** recipe instruction translations are deterministic per (recipe, language) → cache in `recipe_translations`, human-reviewable (`reviewed_by`, `reviewed_at`). Dynamic parts (headcount, flat note) translated at dispatch; flat note goes through Translate live.
- **Timezone:** store timestamps in UTC; all flat-facing schedule columns are `time` + `Asia/Kolkata` assumed for v1 (column `tz` exists for later).
- **Suggestion-generation determinism:** selection seeded by (flat_id, date) so re-runs are idempotent; poll creation upserts on (flat_id, date). Accompaniment suggestions are also generated at create_poll time now (sourced from the day's suggested mains), not deferred to close_poll — there's no "winner" gate to wait on anymore.
- **No secrets in the app:** WhatsApp access token, Meta app secret and Translate keys live in Edge Function env only.

## External accounts to create (week 1, longest lead first)

1. Meta Business Manager + WhatsApp Business account, registered directly (no BSP); submit the `cook_menu` template (docs/06) for Hindi, Kannada, English.
2. Supabase project (ap-south-1 / Mumbai region).
3. Google Cloud project → Translate API key.
4. Expo/EAS account; Android keystore via EAS.
5. SMS OTP provider if using phone auth.

## Sequence: dispatch_cook (happy path)

```
pg_cron (16:00 slot) → dispatch_cook(flat)
  → load cart_items (every dish the flat added), recompute headcount from out-toggles (informational only)
  → scale each dish's ingredients by ITS OWN cart quantity (qty_per_person × cart quantity, round to buyable units)
  → compose per-dish English payload sections + flat note (in-app preview / wa.me text, NOT what the template carries)
  → translation: live-translate the flat note only
  → fill cook_menu vars (cook name / "N × Dish, …" / note) → Meta Cloud API
     ingredients and method are deliberately absent: the full payload is
     580–3783 chars against Meta's 1024 limit (docs/06)
  → insert dispatch_log(status='sent', payload, bsp_message_id)
Meta webhook → wa_webhook fn → update dispatch_log status (delivered/read/failed)
failed → push to members + enable wa.me self-send fallback in app
```

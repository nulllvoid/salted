# Roadmap (4 weeks) & pilot plan

## Week 1 — foundations + longest-lead items
- [ ] Meta business verification + WhatsApp Business number registration (direct, no BSP), submit the hi/kn/en `cook_menu` template (docs/06)
- [ ] Supabase project (Mumbai region), apply docs/05 schema, RLS policies, seed script reading /data CSVs
- [ ] Expo scaffold (TypeScript, Expo Router), Supabase auth (phone OTP), flat create/join flow
- [ ] Start recipe data entry (target 30 dishes by end of week) — founder task, spreadsheet per /data templates
- [ ] EAS configured; first internal APK installed on founder's phone

## Week 2 — the daily loop
- [ ] Edge Functions: create_poll (filters + 10-day exclusion + variety heuristic + idempotent), close_poll (winner + tie-break), pg_cron wiring
- [ ] S1 Today screen: poll cards, tap-to-vote, realtime counts, countdown, out-toggle
- [ ] Push notifications (poll open / winner)
- [ ] Recipe data → 60 dishes

## Week 3 — grocery + dispatch
- [ ] S2 Grocery checklist: scaling, category grouping, staples line, realtime ticks, copy/share text
- [ ] dispatch_cook function: composition, translation cache, template fill, DISPATCH_MODE mock, wa.me fallback in app
- [ ] S4 cook-message preview modal; S3 settings
- [ ] wa_webhook delivery statuses (if templates approved; else stays mocked)
- [ ] Recipe data → 80 dishes; request human review of hi/kn instruction translations

## Week 4 — polish + pilot launch
- [ ] Morning 👍/👎 feedback prompt; feedback form; pipeline_errors alerting (webhook → founder)
- [ ] Empty/error states, poll-cancelled state (all out), copy pass
- [ ] Stretch (only if green): per-item Blinkit search link; TTS voice note
- [ ] Distribute APK links to 5–10 recruited flats; onboard each personally (15-min call per flat)

## Pilot operations (weeks 5–8)
- Daily: check pipeline_errors + dispatch_log failures each morning (5 min).
- Weekly: 3-question survey per flat (Did the cook understand without a call? Any wrong quantities? What annoyed you most?).
- OTA-fix annoyances within 48h via EAS Update — responsiveness drives pilot goodwill.

## Metrics dashboard (simple SQL, run weekly)
- Cart participation: distinct members who added/edited a cart line ÷ (active members × polls), per flat per week — target ≥ 60% after week 1
- Grocery usage: polls where checklist opened + shared/copied ÷ dispatched polls — target ≥ 50%
- Dispatch health: delivered ÷ attempted ≥ 95%; failures triaged
- Cook comprehension (survey): ≥ 80% "understood without follow-up"
- Retention: flats with ≥ 4 polls in week 4 ≥ 5 → expand cohort; else run 5 exit interviews before writing more code

## Decision gates after pilot (in priority order, evidence-gated)
1. Participation weak but dispatch loved → lean harder into "cook comms" as the wedge (maybe cart-building becomes lighter-touch, e.g. auto-add the top suggestion)
2. Grocery list heavily used → invest in Q-comm partnerships / smarter lists
3. Meal repetition complaints → grow dataset + start simple preference weighting (meal_feedback data now exists)
4. Only after all above: expense ledger, breakfast/lunch, two-way cook bot, digital pantry

# UI/UX verification — 14 September 2026

The development app is running at `http://localhost:8081`. This follow-up implements the original design review and records the additional friction found during verification.

## Verified in the running web app

| Check | Result |
| --- | --- |
| Password sign-in at 320 × 640 | Title, fields, visibility control, recovery action, and Sign in fit; secondary account creation remains scrollable |
| Password visibility | Show/Hide updates the input between concealed and visible text |
| Recovery navigation | Opens the recovery form without submitting a recovery request |
| Back from password sign-in | Returns directly to sign-in choices, avoiding the intro/loading detour |
| Invite-code feedback | Partial code displays guidance and keeps Join disabled; grouped uppercase code enables Join without submission |
| Create-household form at 320 × 640 | Main action remains visible in a fixed footer; the form scrolls independently |
| No meals selected | Explicit instruction appears instead of an unexplained disabled action |
| Rendering errors | No error-level console entries in the final reviewed phone tab |

No passwords, recovery requests, new accounts, or household changes were submitted during these checks.

## Shared components verified with temporary sample content

The temporary preview rendered the actual components with local sample props. It was removed before production export; it did not replace authentication or access real household data.

- Four household choices, including a long name, scroll horizontally; the active name stays readable.
- Today/Tomorrow selection updates and has visible focus feedback.
- Settings segments navigate between pages at 320px and 360px.
- The selected page is retained when resizing between phone width and 1280px.
- Inactive pager pages are hidden from the accessibility tree and skipped by keyboard focus on web.
- Card and tab-strip edges align in the centered desktop column.
- Disabled actions, input boundaries, and icon rendering were visually inspected.

## Additional fixes from the UX review

| Problem | Change | Evidence level |
| --- | --- | --- |
| Explicit Today confused with automatic date selection | Optional automatic offset is distinct from zero; meal switches preserve the displayed date | Source + regression tests |
| Setup-meals link opened Profile | Settings supports an initial section; setup links target Meals or Household | Source + type/build checks; live signed-in check pending |
| Pantry-category purchases could disappear | Non-staple purchase items in the pantry category now have their own displayed group | Source; live grocery check pending |
| Search examples contradicted its selected category | Category-specific examples and explanation; cuisine names are readable | Source; live search check pending |
| Failed Add action was only visible behind the search modal | Parent action errors are displayed inside the modal; stale search errors clear on input changes | Source; failure-path check pending |
| Invite-code formatting prevented joining | Normalize whitespace/case, retain format validation, and explain incomplete input | Browser + regression tests |
| Create/Join actions fell below short-screen viewports | Fixed footer aligned to the form gutter | Browser |
| Preferences had unclear saving behavior | Autosave guidance, saving/saved status, and disabled chips during writes | Source; live save check pending |
| Feedback input looked like a single-line field | Four-line textarea with room to compose feedback | Source; live Settings check pending |
| Refresh copy described an unsupported gesture | Copy now names the available Refresh suggestions action | Source |

## Automated checks

- `npx tsc --noEmit` — passed.
- `npm run lint` — passed without warnings.
- `npm run test:unit` — 47 passed, including five new meal-selection and invite-code regression tests.
- `npx expo export --platform all --max-workers 2` — passed for web, Android, and iOS after the final changes. Nineteen static routes; no temporary review route included.
- `git diff --check` — passed.

## Remaining verification

### Signed-in follow-up

Reviewed the live Today screen, Profile/Meals/Home settings, populated grocery list, and prepared cook message after sign-in, including a 320 × 640 viewport. Grocery quantities and dish context wrap legibly; the shopping actions remain in the footer. The cook message scrolls to its sending/copy controls. No household data, preferences, checklist items, or messages were changed or submitted.

Two further fixes were verified in the running app:

- Meal choices now keep a useful minimum row width, moving the day switch below them on narrow screens instead of squeezing meals into a narrow column.
- The cook-language toggle is hidden when no distinct translation exists, avoiding an English-to-English action. Changing language also clears stale copy confirmation.

TypeScript, lint, and whitespace checks passed after these final changes. The all-platform export and 47 unit tests listed above preceded these two presentation fixes.

Native device rendering, dark appearance, enlarged system text, and native keyboard-open layouts are not visually signed off. Successful native exports establish compilation, not device-level usability. Search failure paths, preference writes, and pantry-category sample coverage remain unverified live; this pass avoided mutations to the signed-in household.

Automatic approval review blocked starting a separate Expo server configured for an isolated sample-data backend, with no more specific reason supplied. That attempt was abandoned and its temporary server file removed. The ordinary app remains available for the user to sign in; no workaround or production data mutation was used.

Design rules are in [mobile-design-system.md](mobile-design-system.md); the original findings are in [design-review-2026-09-13.md](design-review-2026-09-13.md).

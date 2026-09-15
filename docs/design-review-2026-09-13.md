# Salted / FlatMeal design review

Reviewed 13 September 2026. Scope: app implementation and the bundled Organic design reference. Findings below describe the original review baseline.

Implementation update: the user subsequently requested fixes. All 12 findings have been addressed in code through shared typography/spacing/layout roles, a compact password form, scrollable household choices, consistent icons and interaction states, and simplified utility headers. See [the mobile design system](mobile-design-system.md) for the resulting rules and verification boundaries. Native device and dark-appearance visual sign-off remain open; the checklist below is retained for that review.

The warm palette and Caprasimo/Figtree pairing give the app a recognizable identity. The main issue is an incomplete translation into reusable design rules: heading roles, spacing, control sizing, and interaction states are defined differently across components.

## Evidence and coverage

- **Visually checked:** running web intro, sign-in chooser, and password sign-in at 360 × 800; password sign-in also checked at 320 × 640. No credentials entered or forms submitted.
- **Source reviewed:** Today, Settings and its four pages, household/day selectors, grocery list, attendance, cook preview, onboarding routes, shared UI, fonts, colors, and Organic CSS/readme.
- **Not visually verified:** authenticated screens, native iOS/Android, dark appearance, keyboard-open layouts, or enlarged system text. Findings for these are explicitly source-based risks, not claims of observed clipping.
- Sizes below are React Native logical units; on the inspected web preview they correspond to CSS pixels. Priorities are review priorities: **P1** address first; **P2** consistency/polish; **P3** preventive cleanup.

## Findings

### 1. Font weights do not consistently match the loaded font faces — P1

**Source-confirmed; cross-platform appearance needs verification.** Only Figtree 400 and 700 are loaded. However, default and small text use `Figtree_400Regular` with weight 500. Several selected labels and emphasized rows request weight 700 while retaining that regular family. `smallBold` instead uses the actual 700 face.

This creates two different ways to ask for bold and an undefined medium-face strategy. Rendering may synthesize or resolve weights differently across platforms; it is not evidence that every device currently displays the wrong font.

**Recommendation:** choose explicit regular/medium/bold face mappings. Either use 400 for body copy or load a true medium face. Selected labels should use the same bold face as shared bold text.

**Evidence:** `app/src/components/themed-text.tsx:34`, `app/src/app/_layout.tsx:26`, `app/src/components/day-switch.tsx:64`, `app/src/components/household-tabs.tsx:86`, `app/src/app/(tabs)/index.tsx:345`.

**Acceptance:** body and selected-label weights are consistent in web, iOS, and Android captures, with no ad hoc 700-on-regular definitions.

### 2. Heading sizes and line spacing lack clear semantic roles — P1

**Source-confirmed; onboarding examples visually checked.** The same `title` concept appears as 34/41 in the intro, 48/56 for the sign-in brand, 44/48 on password and Settings, and 36/42 on Today. Card subtitles default to 30/34. Brand text also appears at 27 with the subtitle's inherited 34 line height.

| Current role | Size / line height | Review concern |
| --- | --- | --- |
| Intro headline | 34 / 41 | Reasonable hero treatment, but locally defined |
| Sign-in brand | 48 / 56 | Should be an explicit brand role |
| Default screen title | 44 / 48 | “Welcome back.” wraps to two lines at 360px |
| Today meal heading | 36 / 42 | Different screen-title scale |
| Card subtitle | 30 / 34 | Large relative to 14px descriptions and labels |
| Intro brand | 27 / 34 inherited | Font size overridden without its own line-height role |

Different hero and utility sizes can be intentional. The issue is that the differences are overrides, with no named hierarchy or compact-screen rule. On password sign-in, the heading consumes substantial space before the actual form.

**Recommendation:** define brand, hero, screen-title, card-title, body, label, and caption styles. Start review with screen titles at 32/38 and card titles at 24/30; retain larger type for deliberate hero/brand moments. These are proposals, not an approved replacement specification.

**Evidence:** `app/src/components/themed-text.tsx:52`, `app/src/components/feature-slides.tsx:179`, `app/src/components/feature-slides.tsx:301`, `app/src/app/onboarding/login.tsx:120`, `app/src/app/(tabs)/index.tsx:139`.

**Acceptance:** each heading uses a named role with an explicit size and line height; long titles are reviewed at 320px and enlarged text.

### 3. Password form gives supporting actions too much visual space — P1

**Visually confirmed.** Back, Show password, Forgot password, and Create an account are full-width outlined buttons. The primary action has stronger color, but the repeated large control shapes make the page feel like a list of equally substantial steps. At 320 × 640, the recovery and account-creation actions are below the initial viewport before a keyboard is open.

**Recommendation:** use a compact back affordance, place visibility control within the password field, and render recovery as a clearly tappable text action near the field. Keep Sign in as the dominant full-width action and account creation as a secondary route.

**Evidence:** `app/src/app/onboarding/password.tsx:192`, `:285`, `:323`, `:345`; shared button sizing in `app/src/components/ui.tsx:273`.

**Acceptance:** at 320 × 640, primary form and recovery are easy to discover; with keyboard open, the focused field and submission action remain reachable by scrolling.

### 4. Spacing tokens are largely bypassed — P1

**Source-confirmed.** Theme spacing is 2, 4, 9, 17, 26, 35, 64. Shared UI instead uses 8, 10, 12, 13, 14, 16, 18, 20, 36, and 40, among others. Only the collapsible component imports `Spacing`. Cards apply a universal gap of 14 while nested sections use 4, 6, 10, 12, and 16.

The issue is not that every value must be divisible by four. Related elements need predictable spacing, with smaller gaps within a group and larger gaps between groups. A universal card gap gives title-to-description and section-to-section spacing the same treatment.

**Recommendation:** define semantic spacing for label-to-input, title-to-description, field-to-field, card padding, and section separation. Decide whether to preserve Organic's density scale or formally adopt a mobile scale; do not keep both implicitly.

**Evidence:** `app/src/constants/theme.ts:83`, `app/src/components/ui.tsx:153`, `:253`, `:272`, `app/src/components/collapsible-section.tsx:61`, `app/src/app/(tabs)/index.tsx:137`.

**Acceptance:** repeated relationships use shared tokens; visually compare title/copy/fields/actions in two different cards before approval.

### 5. Screen and footer gutters do not share one alignment rule — P2

**Source-confirmed; intro-to-login difference visually checked.** Standard screens use 20 horizontal padding; shared footers use 16. Intro header/footer use 24 and slide content 28. Settings and Pager separately repeat 20 and max width 680. The theme exports an unused max width of 800.

This can produce CTA edges that differ from the content above and makes future width adjustments easy to apply incompletely. The centered intro can remain a deliberate exception, but its gutters should be specified.

**Recommendation:** choose one page gutter and content-width token shared by screen, footer, Settings header, and pager controls. Document the intro exception.

**Evidence:** `app/src/components/ui.tsx:253`, `app/src/components/feature-slides.tsx:280`, `app/src/app/(tabs)/settings.tsx:50`, `app/src/components/pager.tsx:130`, `app/src/constants/theme.ts:101`.

**Acceptance:** heading, card, and footer CTA outer edges align at phone and desktop widths unless the exception is intentional.

### 6. Corner radii drift between equivalent controls — P2

**Source-confirmed.** Theme radii are 8, 16, 28, and pill. Shared cards use 20; fields and notices 14; buttons 16; household tabs 10; chips pill. The exported Radius object is not consumed in app source.

Different shapes for tabs and chips make sense. The unexplained field/button/card differences weaken the shared system. The Organic readme also recommends pills while its CSS uses 16 for buttons/inputs, so the reference itself needs a decision.

**Recommendation:** approve a role-based radius map against actual component examples, then use it consistently. Do not blindly convert everything to pills.

**Evidence:** `app/src/constants/theme.ts:93`, `app/src/components/ui.tsx:272`, `app/src/components/household-tabs.tsx:67`; Organic `readme.md` and `styles.css:122` / `:147`.

### 7. Related selectors have inconsistent touch sizes — P1

**Source-confirmed; native ergonomics unverified.** Day segments have minimum height 36, versus 44 for chips and Settings segments. Household tabs also specify 36; their padding and border contribute to actual height, so 36 is not a measured final size. These selectors lack explicit hit-area expansion.

**Recommendation:** adopt an internal minimum target of 44 logical units for selectors, with a larger platform-specific target where appropriate. Preserve hierarchy through color and shape instead of smaller touch areas.

**Evidence:** `app/src/components/day-switch.tsx:53`, `app/src/components/household-tabs.tsx:62`, `app/src/components/settings/household-switcher.tsx:55`, `app/src/components/pager.tsx:188`, `app/src/components/ui.tsx:301`.

**Acceptance:** measure rendered targets and verify comfortable selection on a phone. This review does not claim an accessibility-standard violation solely from these source sizes.

### 8. Household selectors become increasingly cramped as groups increase — P2

**Source-based layout risk.** All household tabs share a single row equally, with one-line truncated names and horizontal padding of 10. There is no visible overflow strategy in either household selector. At 360px, the usual 320px content area gives four groups roughly 80px each before padding.

**Recommendation:** use a horizontally scrollable strip or a household picker when labels stop fitting. Preserve a visible full active-household name. Keep the short Settings tabs; those already address a separate crowding problem.

**Evidence:** `app/src/components/household-tabs.tsx:58`, `:82`, `app/src/components/settings/household-switcher.tsx:53`.

**Acceptance:** review one, two, and four groups with long names and enlarged text; users can identify and select each household without ambiguous ellipses.

### 9. Navigation icons use unrelated font glyphs — P2

**Source-confirmed.** Today uses `⌂` at 26 and Settings uses `⚙` at 23; disclosure uses `⌄`. Their silhouettes, stroke weight, and optical centers depend on font/platform. Organic specifies a common Lucide icon style.

**Recommendation:** use a single icon family and optical sizing rule for navigation, refresh, disclosure, and visibility controls. Retain accessible labels.

**Evidence:** `app/src/components/app-tabs.tsx:29`, `:38`, `app/src/components/collapsible-section.tsx:52`.

**Acceptance:** compare both tab icons together on iOS, Android, and web; they share a visual weight and baseline.

### 10. Interactive feedback is inconsistent across shared controls — P2

**Source-confirmed; full keyboard behavior unverified.** Button has pressed opacity, but Chip, day segments, household tabs, and Settings segments use static styles. Shared components do not define a common hover/focus treatment, although the bundled reference calls for themed states. Browser defaults may still provide focus indication; this is not a claim that all focus indicators are absent.

**Recommendation:** define pressed, hovered, focused, selected, disabled, and busy states centrally. Ensure pressed feedback is distinguishable from persistent selection.

**Evidence:** `app/src/components/ui.tsx:118`, `:227`, `app/src/components/day-switch.tsx:52`, `app/src/components/pager.tsx:182`, `app/src/global.css:1`.

**Acceptance:** keyboard traversal visibly identifies each interactive element, and mouse/touch feedback is coherent across all selector types.

### 11. Utility pages mix native headers with large editorial titles — P2

**Source-confirmed; rendered composition unverified.** Grocery list has a native “Grocery list” header and a 44px “A little prep.” title. Attendance repeats “Who's eating” in native header and page title. Cook preview combines “Cook message” with “A clear plan.” Native header typography is not explicitly aligned with the custom type roles.

**Recommendation:** decide whether these pages use a compact utility header or a large content title. If both remain, make the second line a useful subtitle instead of repeating navigation meaning.

**Evidence:** `app/src/app/_layout.tsx:56`, `app/src/app/grocery-list.tsx:69`, `app/src/app/who-is-eating.tsx:35`, `app/src/app/cook-message-preview.tsx:34`.

### 12. Letter spacing and reference typography are not reconciled — P3

**Source-confirmed reference drift.** Organic CSS gives headings tracking of -0.015em and uppercase card kickers 0.1em. App text defines no letter-spacing role. Uppercase eyebrow text instead reuses smallBold at 14px. This is a discrepancy from the reference, not proof that tighter headings will look better in every native renderer.

**Recommendation:** review heading tracking and eyebrow size/tracking as two deliberate typography roles. Capture actual font rendering before choosing final values. Also reconcile body weight (reference 400, app 500) and the spacing-token translation with the approved mobile design.

**Evidence:** Organic `styles.css:82`, `:85`, `:184`; `app/src/components/themed-text.tsx:34`; `app/src/app/(tabs)/settings.tsx:58`.

## Suggested review sequence

1. **Foundation review:** approve font-face mappings, type roles, semantic spacing, and gutter/radius rules using one sign-in form and one populated Today/Settings card.
2. **Flow review:** simplify password actions; verify long household names, touch sizes, and utility-header hierarchy.
3. **Polish review:** unify icons and interaction states, then tune letter spacing after actual-device comparison.

Preserve the cream/sand palette, warm accent colors, distinct heading/body fonts, strong primary action color, and quieter day/household controls. The intro's centered illustration is a reasonable deliberate exception to the mainly left-aligned app. Its small visible pagination dots already have 44 × 44 targets and should not be flagged as tiny touch targets.

## Design sign-off checklist

- [ ] Typography roles approved, including face, size, line height, and tracking.
- [ ] Screen/footer gutters and card/field spacing approved together.
- [ ] Password form reviewed at 320 × 640, 360 × 800, and with keyboard open.
- [ ] Today reviewed with empty/populated/locked meals and long dish names.
- [ ] Settings reviewed across all four tabs, long household names, and saving/error states.
- [ ] Native iOS and Android checked with enlarged text; web checked with keyboard navigation.
- [ ] Light and dark appearances checked for text, field boundaries, selection, and disabled states.
- [ ] Each finding marked accepted, deferred, or intentionally different, with an owner.

All source paths are relative to the repository root. Reference files are under `Faltmeal app UI redesign/_ds/organic-d46cffba-a501-4c35-bd71-277c912663df/`.

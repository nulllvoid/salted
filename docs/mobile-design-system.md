# Salted mobile design system

Implementation decisions from the 13 September 2026 design review. These rules adapt Organic's visual identity to mobile layouts; the exported website reference is retained as a historical reference.

## Typography

Use `ThemedText` roles, not inline font sizes or font weights. The regular and bold families map directly to the loaded Figtree 400 and 700 faces; Caprasimo is the display face. No synthetic medium weight is used.

| Role | Size / line height | Use |
| --- | --- | --- |
| brand | 48 / 56 | Large sign-in wordmark |
| brandSmall | 24 / 30 | Intro wordmark |
| hero | 34 / 42 | Illustrated intro headlines |
| title | 32 / 38 | Screen title |
| subtitle | 24 / 30 | Card heading |
| itemTitle | 18 / 24 | Dish heading |
| default / bodyBold | 16 / 24 | Body and emphasized body |
| small / smallBold | 14 / 20 | Supporting copy and control labels |
| caption / eyebrow | 12 / 18 | Captions and uppercase eyebrows |
| countdown | 40 / 48 | Tabular monospaced countdown |

Display tracking is -0.2 to -0.5 logical units by role; eyebrows use +1. Headings wrap naturally. Preserve body font scaling. `TextGroup` keeps a heading and its supporting copy together.

## Spacing and shape

`Spacing`: micro 4, label 8, inline 12, field 16, section 24, spacious 32. Apply these to relationships: 8 between label and field or heading and description; 16 between fields/within cards; 24 between screen sections. Illustration geometry is intentionally independent.

`Layout`: page gutter 20, maximum outer content width 680, minimum touch target 44, main controls 48, intro reading width 430. Screen, footer, Settings header, and pager share the same gutter and width. The intro keeps centered copy and art while sharing page edges.

`Radius`: small 8 for household choices and checkbox shapes, medium 16 for buttons/fields/notices, large 28 for cards, pill for meal/day/Settings selectors. The mobile rules resolve the reference readme/CSS disagreement over universal pill buttons.

## Controls

- `Button`: primary and secondary actions; `textOnly` for supporting navigation; optional named icon. Labels wrap and icon-only controls require a label.
- `Field`: regular body face, themed focus boundary, optional inline accessory. Password visibility uses a labeled `IconButton`.
- `InteractivePressable`: shared hover, press, disabled, and focus feedback. Inset rings remain visible in clipped controls and contrast against filled selections.
- `HouseholdChoices`: content-sized, horizontally scrollable buttons with wrapping names. The surrounding screen displays the full active household name.
- `Pager`: compact labels may wrap with enlarged text; inactive pages are hidden from assistive technology and inert on web. Selection survives width changes.
- `Icon`: Lucide icons at a common 2.75 stroke weight, 20 for controls and 24 for bottom navigation. Illustrations remain custom SVG artwork.

Utility routes use a single native header with Figtree bold text and descriptive supporting copy. Their content does not add a second large title or duplicate the top safe-area inset.

## Verification boundaries

Phone web checks cover password visibility/recovery, long household selection, day selection, Settings tabs, focus, and phone/desktop resizing. The component preview used isolated sample data and was removed after checking. Native iOS/Android rendering, enlarged system text, dark appearance, and keyboard-open native layouts still need device review; compilation is not visual sign-off.

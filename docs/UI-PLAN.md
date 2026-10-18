# UI and general-theme enhancement plan

Inspection date: 18 Oct 2026, evening. Method: every page and state screenshotted at 1920×1080 and 1366×768 with `node scripts/ui-shots.mjs` (18 states: welcome, empty editor, theme popover, add-text menu, symbol picker, add-slide menu, chapter inspector, settings, versions, ingest, help, auto-create wizard, tour, guide top and design chapter, show gate, show HUD, presenter), plus the content-rich screenshots from the earlier audits (editor with 87 slides, composed slide with layers, presenter with 87 slides), plus a token-by-token review of `src/styles/global.css` and `src/styles/guide.css`. Two CSS-only previews of the proposed direction were injected over the live app (`.audit/shots/light`, `.audit/shots/dark`) so the plan could be judged on real screens before any code changes.

Scope: the application chrome (editor, dialogs, wizard, guide, welcome, tour, show start gate and HUD, presenter). The eleven **show** themes (what the audience sees on the TV) are not the subject here; they keep their gold-and-ivory look and stay selectable per show, chapter and slide.

## 1. Diagnosis in one paragraph

The chrome borrows the show's palette: near-black blue-grey panels (`#141720`, `#1a1e29`), a warm gold accent (`#d4a84b`), cream text (`#efe9db`) and a classical serif (Frank Ruhl Libre) for every title, plus the heavy Suez One for numerals. Gold on dark grey reads as brown, cream on dark reads as sepia, and the serif reads as old. The three surface levels differ by only 3–4 % luminance, and the border token (`#262b38` on `#141720`, contrast 1.3:1) is practically invisible, so panels, cards and fields have no edges. Muted text (`#7f7b70`) fails the 4.5:1 contrast rule. The result is exactly what Ohad described: brownish, gloomy, not fresh, without clear borders. The information architecture underneath is good; the skin is wrong.

## 2. Inspection, page by page, element by element

Severity: **A** must fix (blocks clarity or breaks at common sizes) · **B** should fix (looks dated or unclear) · **C** polish.

### 2.1 Global tokens and typography
| Element | Finding | Sev |
|---|---|---|
| Surfaces `--bg/--panel/--panel-2/3/4` | Five dark greys within 4 % of each other; no visible elevation; the whole screen is one dark mass | A |
| Borders `--line/--line-2/--line-3` | 1.3:1 to 1.9:1 against panels; edges of panels, inputs, cards and chips disappear | A |
| Accent `--gold` family | Gold is the show's brand colour, but as the chrome accent it browns every button, chip, slider thumb and focus ring; "primary" buttons are gold with dark-brown text | A |
| Text `--fg-3 #a8a394`, `--muted #7f7b70` | Warm greys on cool-dark panels add the sepia cast; `--muted` is 3.6:1, below 4.5:1 | A |
| `--display` Frank Ruhl Libre (serif) | Used for the brand, chapter names, dialog titles, inspector title, welcome and guide headings, and even inside text inputs (`.field input.he`, `.field textarea` at 15 px); classical, not fresh | A |
| `--num` Suez One | Very heavy display numeral for the brand "80", stats and presenter clocks; shouts | B |
| `--ui` Heebo 14 px | Fine in itself, but mixed with the serif the system has three unrelated voices | B |
| Panel headers `.panel-h`, `.insp-section h4` | 11 px, `text-transform: uppercase` (meaningless in Hebrew) with `letter-spacing: .04–.06em`, which damages Hebrew letterforms | B |
| Shadows `--shadow*` | Pure-black 40–90 px shadows under everything; adds gloom | B |
| Focus ring | Gold ring on dark; low visibility | B |
| Scrollbars | Dark-on-dark custom scrollbars, hard to find | C |
| Radius 10 / 6 / 14 px | Fine; keep 8 / 6 / 12 for a slightly crisper look | C |

### 2.2 Editor: top bar
| Element | Finding | Sev |
|---|---|---|
| Brand "סבא יהודה 80" | Serif + Suez One; at 1366 px it wraps onto two lines and pushes everything | A |
| 13 controls in one row (save state, totals pill, undo, redo, save, theme, auto, chapter, library, versions, settings, guide, help, presenter, play) | No grouping, no hierarchy: three different "important" styles (gold auto-create, gold-ish theme button, primary play); at 1366 px the play button is clipped off the left edge | A |
| Save state (dot + text) | Good idea, low contrast text | B |
| Totals pill | Dense "סה״כ 0:08 · 1 שק׳ · 1 פרקים · 0 ברכות" in 12 px grey; the one number that matters (total length) is not emphasised | B |
| Theme button | Shows swatch + theme name; reads like a status, not a control | C |

### 2.3 Editor: library panel (right)
| Element | Finding | Sev |
|---|---|---|
| Filter chips | Five chips wrap to two rows ("לא בשימוש" alone); plus two selects, search and two more chips: five rows of tools (≈200 px) before the first photo | B |
| Empty state | Plain grey paragraph; no action button, no drop target, no illustration | A |
| Asset card badges | Year badge colour codes a fact (gold manual, orange folder/name, red file date) that is never explained in the UI; dup count "×3" and use count "2" use the same gold circle language | B |
| Footer | Three buttons + year input + a wrapping hint line in 11.5 px | B |
| Scrollbar / grid | 3–4 columns of 92 px thumbs; fine | C |

### 2.4 Editor: preview (centre)
| Element | Finding | Sev |
|---|---|---|
| Tool row | Status (type pill, time, transition, theme) and actions (text/symbol/shape/image, margins, replay, animation toggle, play) share one 12 px grey row; the four gold add buttons are the only strong colour on screen and they are brown | A |
| Stage surround | Dark radial gradient around a dark 16:9 stage: no separation between stage and chrome when the slide is dark | B |
| Focal hint, safe margins, snap guides | Functional; gold again | C |
| Overlay handles and label | Gold handles; the label is 10 px | C |

### 2.5 Editor: inspector (left)
| Element | Finding | Sev |
|---|---|---|
| Title row | Type badge gold-on-gold-dim; fine idea, low contrast | B |
| Inputs with the `he` class | Serif 15 px inside inputs while labels are sans 11.5 px | A |
| Segmented controls | "מעבר אל השקופית" has six options in 300 px; "דרך שחור" wraps to two lines; the Ken Burns grid has 7 buttons in a 4-column grid leaving an orphan | B |
| Sliders | Gold thumb on a 4 px dark track; value shown only in the label | B |
| Section headers | See 2.1 (uppercase + letterspacing) | B |
| Checks panel | Fixed 190 px box at the bottom of the inspector with large padding and a 3 px warn border per item; first check often wraps to three lines | B |
| At 1366 px | The inspector gets ~140 px: labels truncated, segments unreadable (grid is 320 / 1fr / 320 with no breakpoint) | A |

### 2.6 Editor: storyboard (bottom)
| Element | Finding | Sev |
|---|---|---|
| Chapter head card | 180 px dark card, serif title, 11 px metadata, music bar; good content, weak edges | B |
| Slide cards | 136×88 with 10 px type/duration badges and an index; "text" slides use a purple-tinted gradient that belongs to no palette | B |
| Add-slide button | Dashed 44 px strip, fine | C |
| Footer hint line | Keyboard hints with kbd caps plus totals in one line of 12 px grey | C |
| Empty show | One chapter, one slide, and a large empty dark area with no guidance | B |

### 2.7 Dialogs (settings, versions, ingest, help) and the auto-create wizard
| Element | Finding | Sev |
|---|---|---|
| Dialog frame | Dark panel on a blurred dark backdrop; title serif; "סגור" is a gold primary button although it is not the primary action | B |
| Settings | Theme grid (11 cards) is the best-looking component in the app; the timing/audio sliders below it are gold on dark with values in 12 px | C |
| Versions | Dense rows, good; the row actions (פרטים / תן שם / שחזר) are ghost buttons that vanish on dark | B |
| Ingest | Stat boxes with gold Suez numerals; log in a near-black monospace box; status pills; functional but gloomy | B |
| Help | Two kbd tables + a numbered list; fine | C |
| Wizard | Step pills good; empty folder tree is an empty box (needs an empty state "no photos yet, scan first"); gold "המשך" disabled looks like "enabled but dim" | B |

### 2.8 Welcome card and tour
| Element | Finding | Sev |
|---|---|---|
| Welcome | Dark card, serif title, three option cards; reads well; would read better on a light surface with a coloured icon per option | C |
| Tour card | Dark card with gold spotlight ring; spotlight dims the page to 72 % black which is fine; the card could carry the step icon | C |

### 2.9 Show start gate and HUD
| Element | Finding | Sev |
|---|---|---|
| Start gate | Letter-spaced serif title, giant Suez "80", gold pill button, key hints in tiny kbd caps; it follows the show theme (correct) but its layout is 2010-era centred text | B |
| HUD | 13 px light-grey text on a bottom gradient with eight small ghost buttons; acceptable, could use larger hit targets (28 px) and a clearer progress bar | C |

### 2.10 Presenter
| Element | Finding | Sev |
|---|---|---|
| KPI cards | Four cards with 34 px Suez numerals; the clock and remaining time are what the presenter needs; the others can be smaller | B |
| Theme row | 11 chips with swatches, fine | C |
| Slide list | One pill per slide (87 pills in the test show) with no scrolling container; unusable beyond ~40 slides | A |
| Stages | Current + next with labels; good | C |

### 2.11 Guide
Built on the same tokens; inherits every global issue above and nothing else. The light preview shows it already works well on a light surface.

### 2.12 Responsiveness
| Width | Finding | Sev |
|---|---|---|
| 1920×1080 | Everything fits | — |
| 1366×768 | Top bar clips, brand wraps, inspector collapses to ~140 px (see 2.2, 2.5) | A |
| < 1280 | Not supported at all; no breakpoints exist in `global.css` except for the guide | B |
| Phone / tablet | Not a target for the editor (desktop tool), but the presenter page would make a good remote; it needs a server-side command relay (BroadcastChannel is same-browser only) | later |

## 3. Design direction: "Studio"

A clean, bright, modern production tool. The show stays cinematic; the tool around it becomes quiet and crisp, so the slides are the only thing with colour and mood.

### 3.1 Two chrome themes, one system
- **Studio Light (default):** page `#F3F5F9`, panels `#FFFFFF`, inset surfaces `#F7F9FC` / `#EEF2F7`, separator lines `#E3E8EF` / `#D3DAE4` (decorative) and form-field outlines `#7D8799` (3.4:1 on white), text `#0F172A` / `#1F2937` / `#4B5563`, muted `#5F6878`. *Corrected during implementation: the draft said `#D3DAE4` reaches 3.1:1; it measures 1.4:1. See section 7.* Shadows cool and soft: `0 8px 24px rgba(15,23,42,.10)`.
- **Studio Dark (toggle, remembered on the server):** cool slate, no brown: page `#0B0F16`, panels `#121821` / `#171E29` / `#1E2633`, borders `#2F3C4F` (visible), text `#EEF2F7` / `#CBD5E1` / `#94A3B8`. For show night in a dark room.
- **Accent:** one vivid, cool accent used for primary actions, selection, focus and links: blue `#2563EB` fills with white text (5.2:1) in both chrome themes, `#1D4ED8` for accent text on light, `#8AB4FF` for accent text on dark. *Corrected during implementation: the draft's `#2F6BFF` and `#4F8CFF` measured 4.5:1 and 3.2:1 with white text.* Alternative if Ohad prefers warmer freshness: teal `#0E9F8E`. Gold disappears from the chrome entirely; it remains inside the show themes and in the theme swatches, where it belongs.
- **Semantic colours:** success `#15803D`, warning `#B45309`, danger `#DC2626`, info `#0369A1` (dark variants `#34D399 / #FBBF24 / #F87171 / #38BDF8`).
- A theme toggle (sun/moon) in the top bar; `prefers-color-scheme` as the initial default.

### 3.2 Typography
- **One family for the chrome: Rubik** (already embedded, weights 400/500/600/700; add 500 and 600). Modern geometric Hebrew and Latin from the same designer, excellent at 12–14 px, with tabular figures for times and counts. Headings Rubik 600 with `letter-spacing: -0.01em`; body 14 px / 1.5; small 12.5 px; micro labels 11.5 px, never uppercase, never letter-spaced.
- Frank Ruhl Libre and Suez One stay available for the **show** only (they are theme fonts there).
- Numbers (durations, counts, clocks) use Rubik with `font-variant-numeric: tabular-nums`.
- Alternative candidates checked and available offline via fontsource: Assistant 5.3.0 (lighter, airier), IBM Plex Sans Hebrew 5.3.0 (more technical). Rubik is recommended because it is already in the bundle and pairs with the lucide icons' rounded strokes.

### 3.3 Surfaces, borders, elevation
- Every panel, card, input, chip, dialog and menu has a 1 px visible border; elevation is expressed by background step + border + a soft shadow, not by darkness.
- Radius 8 px (cards, inputs, buttons), 6 px (chips, small buttons), 12 px (dialogs), 999 px (pills).
- Panel headers: 12.5 px, weight 600, normal case, with a 1 px bottom border and 10 px padding.
- Stage surround: a light neutral gradient so the 16:9 stage reads as "the screen" with a 1 px dark edge and a soft shadow.

### 3.4 Components (one consistent set)
| Component | Spec |
|---|---|
| Buttons | Heights 32 (default) / 28 (small); primary = accent fill + white text; secondary = white + border; ghost = no border; danger = red text on hover; icon-only buttons always have a tooltip; disabled = 45 % opacity, no colour change |
| Toolbar groups | Related buttons in a bordered group with 1 px dividers; groups separated by 12 px; overflow "…" menu when the bar is narrower than its content |
| Segmented control | Equal-width cells; if more than four options and less than 320 px, wrap into a 2-row grid with equal cells (never a single orphan); selected = accent-dim background + accent text + 1 px accent border |
| Chips | 28 px, border, selected = accent-dim + accent text; filter rows scroll horizontally instead of wrapping |
| Inputs | 36 px, white, border, 2 px accent focus ring; same family and size as labels; Hebrew inputs use Rubik 14 px, not the serif |
| Sliders | 6 px track, 16 px thumb in accent, filled track to the thumb, value in a label at the end |
| Cards (asset, slide, theme, option) | White, border, radius 8, hover = border darkens + 1 px lift, selected = 2 px accent ring |
| Badges on thumbnails | Dark glass (`rgba(15,23,42,.7)`) with white text; year source shown by a tiny icon (camera = EXIF, folder, pencil = manual, clock = file date) and a legend in the library footer |
| Dialogs | White, radius 12, header with title + close icon, body, footer where the primary action is the only accent button; "close" is a secondary button |
| Empty states | Icon, one-line title, one-line hint, a primary button (e.g. "סרוק את media/") and, for the library, a drop zone |
| Tooltips | 12 px, dark glass, 150 ms delay |
| Toasts | White with left accent bar (success/warn/error) |
| Focus | 2 px white gap + 2 px accent ring on every focusable element |

### 3.5 Motion and density
- 150 ms ease-out for hover and selection, 250 ms for dialogs and popovers; nothing bounces.
- Density: 8 px grid; panel padding 12; row gaps 8; the inspector uses collapsible sections with an icon and a one-line summary when collapsed, so the panel never needs its own scrollbar for a photo slide.

## 4. Page-by-page changes

### 4.1 Editor shell and top bar
1. Brand becomes a compact logo mark ("80" in a rounded accent square) + "סבא יהודה" in Rubik 600; never wraps.
2. Three groups: **left** (RTL start): brand, save state, total length as a single strong number with a small "1 פרקים · 0 ברכות" caption. **Centre:** `ספרייה` · `צור אוטומטית` (primary-soft) · `+ פרק`. **Right:** undo/redo/save group, `גרסאות`, settings, theme toggle, `מדריך`, `?`, then `מציג` and the single primary `נגן מצגת`.
3. Below 1500 px labels drop to icons with tooltips; below 1280 px the right group collapses into an overflow menu. Nothing ever clips.
4. Resizable library and inspector (drag handles, 240–420 px, remembered); at ≤1366 px defaults of 280 px; at ≤1180 px both become toggleable drawers.

### 4.2 Library
1. Tools compress to two rows: row 1 = search (full width) + folder/decade selects as a single "סינון" dropdown; row 2 = horizontally scrolling chips (הכל, תמונות, ברכות, מוזיקה, לא בשימוש, כפילויות, לפי איכות).
2. Empty state with icon, the three folder paths as copyable chips, a primary "סרוק את media/" button and a drop zone that accepts files (copies them into `media/` through a new upload route).
3. Thumbnails 100 px with 8 px gaps; badge glass; year-source icon; legend line in the footer; the footer actions become one row of three buttons with the year field in a popover.

### 4.3 Preview
1. Split the tool row: a slim **status strip** (type, duration, transition, theme, focal hint) above the stage in 12.5 px, and a **toolbar** under the stage with two bordered groups: add (טקסט · סמל · צורה · תמונה) and view (שוליים · נגן שוב · אנימציה · נגן מכאן, primary).
2. Stage surround light grey; stage with 1 px `#0F172A` edge and a soft shadow; handles and guides in accent; overlay label 11.5 px.

### 4.4 Inspector
1. Collapsible sections with icons: תוכן · תזמון ומעבר · מראה · מסגרת · כיתוב · שכבות · ערכת צבעים; a chapter shows מוזיקה · ערכה · ברירות מחדל · פעולות · יצירה אוטומטית.
2. Inputs in Rubik 14 px; segmented controls that never wrap; Ken Burns as a 3×3 directional pad with "ללא" in the centre; sliders with end values.
3. Checks move to a tab in the inspector header ("בדיקות · 3") with a red/amber count badge, and open as a full-height list; each item one line with an icon.

### 4.5 Storyboard
1. Chapter head: white card, Rubik 600 title, music line with a coloured progress bar, lock/auto badges; selected = accent ring.
2. Slide cards 144×90 with a 2 px accent selection ring, 11.5 px glass badges, a filled-colour tab per type (photo = neutral, video = blue, text slides = violet) so types are recognisable at a glance; a zoom slider (96–200 px) in the footer.
3. Empty-chapter row shows a dashed drop target with "גררו תמונות לכאן או לחצו + להוספת שקופית".

### 4.6 Dialogs and wizard
1. Shared dialog frame per 3.4; close in the header; footers with one accent action.
2. Ingest: stat tiles white with accent numerals; the log becomes a light code block; the two actions keep their order with "סרוק" as the accent.
3. Versions: row actions become visible secondary buttons; the labelled version gets a coloured tag.
4. Wizard: step indicator as a progress rail; empty tree shows an empty state with the "scan" action; disabled "המשך" clearly disabled; the step 3 preview strip uses the new stage frame.

### 4.7 Welcome and tour
White card, coloured icon tiles per option (accent, green, violet), Rubik headings; tour card white with the step icon and a thin accent progress line.

### 4.8 Show start gate and HUD (theme-aware)
1. Gate: keep theme colours but modernise the layout: title in the theme's display face without letter-spacing, "80" as a theme-coloured mark, a large rounded accent button, a compact two-column key legend, and the theme name as a chip.
2. HUD: 36 px buttons with 20 px icons, a 4 px progress bar, slide counter in tabular figures, and a clear "ממתין ללחיצה" chip.

### 4.9 Presenter
1. Layout: current slide (large) + next (small) on top; a clock and remaining time as the two big numbers; elapsed and slide index secondary.
2. Slide list becomes a horizontally scrolling strip of thumbnails grouped by chapter, auto-scrolled to the current one; chapter jump buttons above it.
3. Controls as a bordered group of 40 px buttons; theme chips unchanged.
4. Responsive to 1024 px so it can run in a half-screen window.

### 4.10 Guide
Inherits the tokens; the only page-specific change is a sticky mini-TOC inside long chapters.

## 5. Implementation plan

| Phase | Work | Verification |
|---|---|---|
| 1. Tokens and type (½ day) | New token set in `global.css` with `[data-chrome="light"\|"dark"]`; Rubik 500/600 added to `main.tsx`; remove serif from all chrome selectors; theme toggle in the top bar stored in kv `chrome-theme`; `prefers-color-scheme` default | `ui-shots.mjs` on both chrome themes; a new `scripts/audit-contrast.mjs` that computes contrast for every text/border token pair (≥ 4.5:1 text, ≥ 3:1 borders) |
| 2. Components (1 day) | Buttons, groups, segments, chips, inputs, sliders, cards, badges, dialogs, empty states, tooltips, toasts, focus; one `components.css` section replacing the ad-hoc rules | audit:ui, audit:editing, audit:theme (with `demo:media`) still 100 % |
| 3. Pages (1½ days) | Top bar regrouping + overflow; library tools and empty state + drop zone; preview strip/toolbar; inspector sections + checks tab; storyboard cards + zoom; dialogs and wizard; welcome and tour; gate and HUD; presenter strip | audit suites + new checks in `audit-ui.mjs` for the overflow menu, drawer toggles, checks tab, presenter strip |
| 4. Responsive (½ day) | Breakpoints 1500 / 1366 / 1280 / 1180; resizable panels; presenter to 1024 | `ui-shots.mjs` at 1920, 1600, 1366, 1280 for both chrome themes, reviewed |
| 5. Docs and guide (¼ day) | Guide chapter "המסך" updated with the new layout; README; AUDIT.md section 11 | audit:guide |

Total: about 3½ days of work, done in that order so every phase leaves the app shippable. Phase 1 alone already removes the brown cast, the serif and the invisible borders; the before/after previews in `.audit/shots/light` and `.audit/shots/dark` show roughly that stage.

## 6. Decisions needed from Ohad
1. Default chrome theme: **Studio Light** (recommended) or Studio Dark; the other stays one click away.
2. Accent: **blue `#2563EB`** (recommended, calm and clear) or teal `#0E9F8E` (warmer "fresh").
3. Chrome typeface: **Rubik** (recommended, already embedded) or Assistant (lighter).
4. Go-ahead on the whole plan or phase 1 first.

## 7. Implementation status (18 Oct 2026, night)

Ohad asked for the whole plan to be executed; the recommended choices were taken (Studio Light default, blue accent, Rubik). Sections 3 to 5 are implemented. Evidence is in docs/AUDIT.md section 11.

Deviations from the draft, found by measuring instead of assuming:

| Draft value | Measured | Shipped |
|---|---|---|
| Field borders `#D3DAE4`, said to be 3.1:1 | 1.41:1 on white | `--line-ctl`: `#7D8799` light (3.4:1 on white, 3.0:1 on the grey dialog footer), `#5A6B84` dark (3.3:1), for inputs, selects, text areas and segmented controls. `#E3E8EF` / `#D3DAE4` remain for decorative separators. |
| Accent `#2F6BFF` with white text | 4.50:1, fails by rounding | `#2563EB`, 5.2:1 |
| Dark accent `#4F8CFF` with white text | 3.22:1 | fills `#2563EB`, accent text `#8AB4FF` |
| Muted `#6B7280` | 4.43:1 on the page background | `#5F6878` |
| Warning, OK, error text `#B45309` / `#15803D` / `#DC2626` | about 4.4:1 on their tinted chips | `#92400E` / `#166534` / `#B91C1C` |

Added beyond the draft:
- an element-by-element contrast audit, `npm run audit:contrast`, covering every screen in both chrome themes;
- a responsive audit, `npm run audit:responsive`, covering six widths, the drawers, panel resizing and inspector overflow per slide type;
- sliders with a filled track, colour-coded slide-type tags, and an empty-storyboard hint;
- dragging files from the desktop into the library, through a new `PUT /api/upload` route;
- the light/dark interface choice in Settings and in the presenter.

Bugs found and fixed while implementing, several of them older than this work:
- text-slide cards collapsed to about 48 px wide;
- the "add slide" menu was clipped by the storyboard's scroll area;
- the guide checklist's "לשם" button inherited the chapter-navigation style and hid its label;
- the panel resize handles sat on the window edge in right-to-left layout;
- closed drawers widened the page;
- in two-column field rows a wide input pushed its neighbour out of the panel.

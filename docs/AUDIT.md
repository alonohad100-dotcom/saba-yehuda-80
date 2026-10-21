# Post-implementation audit — 18 Oct 2026

Scope: everything in docs/PLAN.md days 0–2 (scaffold, ingest pipeline, show engine, editor, presenter) plus the storage layer. Verified on this laptop (Windows 11, Node 24.14, Chrome) with generated sample media, since the real photos have not arrived yet.

## 1. What was built

| Area | Status | Evidence |
|---|---|---|
| Scaffold: Vite 8 + React 19 + TS, Fastify 5 server, scripts `dev` / `build` / `show` / `start` / `ingest` / `sample-media` | done | `npm run build` passes type-check and bundles (583 kB JS, 57 kB CSS, fonts self-hosted) |
| Storage: SQLite (`node:sqlite`, no native build) with `assets`, `files`, `show_versions`, `kv`; `data/show.json` mirror; `data/backups/` rolling 200 | done | `data/library.db` holds 47 assets; every PUT writes JSON atomically, a backup file and a DB version row |
| Ingest: scan → partial-content hash → EXIF/folder/mtime year → sharp WebP 2560/400/blur + attention focal point → ffmpeg H.264 1080p + loudnorm −16 LUFS + poster → AAC music + 512-bucket peaks | done | first run 47 files in 19.2 s; re-run 0.1 s (all cached); 20 warnings reported correctly (14 "year from folder", 6 "loudness corrected +8.5…+22.6 dB") |
| HEIC fallback (sharp → heic-convert → ffmpeg) | written, not exercised | no HEIC file available; test on the first iPhone photo |
| Server API: assets, patch asset, show GET/PUT with zod validation, versions list/restore/label, ingest start/status/SSE, static cache with HTTP ranges, SPA fallback | done | `curl` checks: health 200, assets 200 (23.6 kB), /edit 200, video range request → 206 |
| Show engine: 12 slide types, 4 transitions, GSAP timelines, Ken Burns with focal point, preloading, auto/manual advance, clicker keys, HUD, black screen, confetti | done | headless run through all 46 demo slides: every type rendered, 0 console errors, 0 failed requests |
| Audio bus: music per chapter with A/B crossfade, loop with crossfade when a track is shorter than its chapter, ducking under greeting videos, mute | done | engine code paths exercised in the headless run (audio muted by the harness); listen test pending on the real speakers |
| Video slides: real `<video>` playback, portrait with blurred backdrop, landscape, trim in/out, per-clip volume, lower-third | done | 6 greeting clips played in sequence; portrait 720×1280 and landscape 1280×720 both correct |
| Editor: virtualized library with filters, multi-select, drag-and-drop to storyboard (dnd-kit), sortable across chapters, bulk edit, type-specific inspector, focal-point picker, music waveform with start offset, settings, versions, ingest dialog, sanity checks, undo/redo, autosave, keyboard shortcuts | done | scripted session: add → caption typed → autosave reached the server in < 2 s → preview updated; undo ×2 / redo ×2 restored slide counts; focal click set 30 % · 40 % |
| Presenter: BroadcastChannel sync, current/next slide, clock, elapsed/remaining, notes, chapter list jump, remote buttons | done | presenter showed slide 1/20 while the show ran in another tab; its "next" button advanced the show to 2/20 |
| Kiosk launcher (`npm run show --open`) | written, not exercised headlessly | opens Chrome/Edge with `--kiosk --autoplay-policy=no-user-gesture-required` |

## 2. Inspection method
- Static: `tsc` for client and server; `vite build`.
- API: curl against the production server.
- Behaviour: three puppeteer-core scripts in `scripts/` drive real Chrome headlessly, take screenshots and collect console errors, page errors and failed requests. Screenshots were reviewed for every slide type and for the editor, dialogs, chapter inspector and presenter.
- Only issue recorded: an `ERR_ABORTED` on the SSE connection when the ingest dialog closes, which is the expected cancellation.

## 3. Fixes made during inspection
- Editor brand showed "80" twice; library grid was 2 columns at 320 px (now 3); Ken Burns picker left an orphan button (now 4 columns); library footer hint wrapped into a column; focal readout was bidi-scrambled.
- Timeline milestones overlapped the line (dots now sit exactly on the line, labels above/below alternate).
- Quote mark overlapped the first line (now anchored top-right of the block).
- Captions containing year ranges rendered reversed in RTL (`unicode-bidi: plaintext`).
- `checks.ts` vs `Checks.tsx` collided on the case-insensitive file system (renamed to `checkRules.ts`).

## 4. Known limitations and what still needs the real world
1. **Real media.** The sample library is generated art; the pipeline has not yet met a 3,000-photo library, real HEIC, or WhatsApp clips with rotation metadata. Day-3 task.
2. **Listening test.** Ducking, crossfades and loudnorm levels were verified in code and logs, not by ear. Rehearsal day.
3. **Video wall** shows posters, not live-playing tiles (kept deliberately cheap).
4. **One show file**, one author, one machine. No multi-user editing.
5. **Finale mosaic** uses the show's photos; with few photos it repeats them.
6. **Kiosk flags** assume Chrome or Edge in the default install path; otherwise the default browser opens without kiosk mode.

## 5. Auto-create (added 18 Oct 2026, evening)

Scope: docs/AUTO-SHOW-PLAN.md phases A–C in full, phase D as an optional loader.

| Area | Status | Evidence |
|---|---|---|
| Ingest analysis: dHash, sharpness, entropy, luma, colourfulness from the 400 px thumbnail; incremental (only photos without a hash) | done | 48 sample photos analysed in the ingest run; a re-run analyses 0 |
| Library-wide grouping: duplicate groups (Hamming ≤ 2 + exposure ±12 + aspect ±3 %), burst groups (≤ 10 + same folder + ≤ 90 s or consecutive scan numbers), quality score from percentile ranks | done, calibrated | planted re-exports (quality 70, resized, brightened) → distance 0; planted 5-frame burst → 0–1; distinct synthetic scenes collide at 3–6, so the threshold was tightened from the planned 6 to 2. Real photos are more distinctive than the generated art; re-check on the real library |
| SQLite migration (11 new columns via `ALTER TABLE` when missing) | done | old `library.db` upgraded in place on server start |
| API: `POST /api/analyze`, `GET /api/groups`, `GET/PUT /api/kv/:key` | done | wizard options persist across sessions |
| Generator (`shared/autoshow/`): pool → chapters → budget → stratified diverse selection → page grammar → collage layouts → videos → music → frame → locks → report | done | `npm test`: 5 tests, 0 failures (invariants, determinism, locks, fill, interleave) |
| Budget rescaling and adaptive pacing when photos run out | done | synthetic 240-photo library reaches 22 min within ±12 %; the 39-photo sample library stops at 6 min and reports why |
| Wizard (source tree + year histogram + live pool counts → shape with live estimate → preview with filmstrip, chapter table, dropped photos, warnings, regenerate → apply) | done | headless run: 4 steps, regenerate increments the seed, apply replaced the show (7 chapters, 35 slides, all tagged) |
| Apply modes: replace (keeps locked only, saves a labelled version first), append, fill chapter | done | fill kept the chapter's title and music; undo reverted the whole generation in one step (46 → 35 → 46 → 35 slides) |
| Locks on slides and chapters; regenerate around locks | done | a locked photo slide survived a regenerate with a new seed; its photo was not reused elsewhere |
| Replace with similar unused photo; shuffle collage; collage layout picker (8 layouts, disabled ones greyed) | done | after freeing one photo, "תמונה דומה" swapped the neighbour to a different unused photo; picker changed "ראשית משמאל" → "ראשית מימין" |
| Library: hide duplicates (default on) with ×N badge, low-quality badge, quality sort | done | folder הנכדים: 13 visible with badges ×8 and ×2, 21 when duplicates are shown; 1 low-quality badge |
| Checks: same photo twice, near-duplicate in a chapter, chapter > 6 min, adjacent videos | done | present in the checks panel after hand edits |
| Faces (phase D) | scaffolded, not exercised | `server/ingest/faces.ts` loads `onnxruntime-node` + `models/ultraface-rfb-320.onnx` if both exist; neither was downloaded in this session, so face-aware focal points and the names slide fall back gracefully (the names option reports "requires the face model") |

Invariants measured on the applied sample show: 39 photo uses, 39 unique photos, 39 unique duplicate groups, 0 adjacent collages, 0 adjacent videos outside the greetings chapter, 6 greetings each used once, 0 low-quality photos used, 0 console or network errors.

Known limitations: the synthetic sample library is small (39 usable photos), so generated shows are short and some layouts appear rarely; the "many" collage density may show the six-photo mosaic twice in one show when a library has many portrait bursts; chapter titles derived from folders depend on sensible folder names.

## 6. Full-application audit (18 Oct 2026, night)

Four automated audits now live in `scripts/` and were run against a fresh production build and a restarted server. Every check listed passes; the gaps they found were fixed in the same session and are listed below.

| Audit | Script | Result |
|---|---|---|
| Static cross-reference: every server route has a caller, every client API method is used, every store action is used by a component, every DB helper is referenced, every slide type is covered in the model labels, defaults, renderer, animator, inspector and creation menu, no TODO/FIXME, package scripts point at real files, dev tools and ffmpeg installed, fonts self-hosted, .gitignore correct | `node scripts/audit-static.mjs` | 142 / 142 |
| API: all 18 routes with success and error paths (400 on invalid show, 404 on unknown asset / version / derivative, 409 on analyze during ingest), derivative content types and cache headers, HTTP Range → 206, SSE stream, SPA fallback for every page route, built assets and fonts served, rolling backups on disk, show.json in sync with the API | `node scripts/audit-api.mjs` | 45 / 45 |
| UI in headless Chrome: editor panels, library filters/search/decade/multi-select, Enter to add, mouse drag from library to storyboard, mouse drag to reorder, all keyboard shortcuts, inspector for all 11 slide types present, caption/transition/advance/Ken Burns/focal persistence to the server, chapter rename/music/sort, checks panel navigation, preview tools, "+" menu for all 8 text slide types, storyboard resizer, settings/versions/ingest/help/auto dialogs including version details and labelling, re-analyze and scan buttons, undo/redo buttons, play-from-here and presenter windows, reload persistence; show start gate, all keys (→ PgDn PgUp P B M End Home), real video playback; presenter state sync, next/prev/pause/black/mute/goto/restart | `node scripts/audit-ui.mjs <dir>` | 97 / 97, 0 console or network errors |
| Show walk-through: every slide of the current show rendered in sequence with videos playing | `node scripts/inspect-show.mjs <dir>` | 45 slides, 0 errors |
| Auto-create end to end (wizard, apply, invariants on the saved show, undo, locks, replace-similar, layout picker, fill chapter, duplicate hiding) | `node scripts/inspect-auto.mjs <dir>` | all invariants hold, 0 errors |
| Generator unit tests | `npm test` | 5 / 5 |
| Type-check client + server, production build | `npm run typecheck`, `npm run build` | clean |
| Development mode: Vite on 5173 serving `/edit` and `/src/main.tsx`, proxying `/api` and `/media` to the server | manual curl | 200 / 200 / 200 |

Gaps found by these audits and fixed:
1. **POST without a body returned 400.** The client sent `Content-Type: application/json` on body-less POSTs (scan, analyze, restore), which Fastify rejects. This would have broken the "scan media" button in the real UI. Fixed on both sides: the client only sends the header with a body, and the server accepts empty JSON bodies.
2. **A presenter opened mid-show stayed blank** until the next slide change. Added a hello handshake: the presenter asks, the show answers with its current state.
3. **HUD showed "waiting for click" instead of "paused"** on a manual slide. Paused now takes precedence.
4. **Undo/redo buttons could stay disabled** because history length was read once per render instead of subscribed. Now reactive.
5. **Years for files without EXIF** (most WhatsApp exports) were taken from the folder or the file date. File names are now parsed too: `IMG-20190612-WA0003`, `VID_2021_…`, `2016-07-04 12.33.01`; camera counters such as `IMG_2010` or `DSC_1999` are deliberately not treated as years. A photo that falls back to the file date is flagged in red in the library.
6. **Unused API surface:** version labelling and version details had routes but no UI; health and groups had client methods but no caller. The versions dialog now has "פרטים" and "תן שם" per row; the library dialog shows server status, duplicate-group count, face-model status and a "re-analyze" button.
7. Storyboard cards now carry `data-id` / `data-type` attributes, which also makes the audit scripts deterministic.

Not covered by automation and still to be done by hand: the kiosk launcher (`npm run show` opening Chrome full-screen on the TV), audio levels by ear, and the real photo library.

## 7. Advanced editing tools (added 18 Oct 2026, late night)

Scope: docs/EDITOR-PLAN.md, all phases.

| Tool | Status | Evidence (`node scripts/audit-editing.mjs`) |
|---|---|---|
| Text overlays with 6 presets, 3 embedded fonts, size, weight, colour swatches + free colour, alignment, 4 backgrounds, shadow, gold accent | done | preset values saved; text edit persists and renders |
| Symbol overlays (80 lucide icons in 6 groups, colour, stroke, fill), emoji overlays (70), shapes (frame, line, rectangle, circle), image stickers (mask, border, fit) | done | each kind added through the toolbar, saved, rendered (symbols as inline SVG) |
| Direct manipulation: drag to move with centre and safe-margin snap guides, corner handle to resize, top handle to rotate with 0/90/180 snaps, numeric sliders as well | done | drag −15 %/+20 % persisted; resize −20 % persisted; rotation snapped to 45° |
| Element animation: 10 entrances including word-by-word and letter-by-letter, delay, duration, 4 loops, fade-out | done | in = pop, loop = pulse persisted; same GSAP timeline in preview and show |
| Layers panel, z-order, lock, hide, duplicate, delete; keyboard nudge (Shift = 5 %), Ctrl+D, Delete, Esc, Ctrl+] / Ctrl+[ | done | layers list matches overlays; Delete removes the layer and not the slide |
| Photo grading: 7 filters, brightness/contrast/saturation, vignette, 6 presets | done | preset "ארכיון" persisted; `--media-filter` present in the preview and show DOM |
| Framing: zoom around focal point, rotate 90/180/270, mirror, Ken Burns amount | done | rotate 90° persisted and applied to `.imgwrap` |
| Caption styling: 5 entrances, size, position, alignment, font, box | done | words + top persisted; `cap-top` class in the show |
| Transitions: wipe and blur added (6 total), selectable per slide, chapter and globally | done | wipe persisted; clip-path cleared after the transition in the show |
| Everything embedded: fonts via fontsource, icons via the bundled `lucide` data package, no network | done | static audit: no googleapis/gstatic in the build |

Known limits: emoji appearance depends on the system emoji font (Segoe UI Emoji on this laptop); rotated overlays show an axis-aligned selection box; there is no free-hand drawing.

## 8. Storage and database audit + final regression (18 Oct 2026, end of day)

`scripts/audit-db.ts` (run with `npm run audit:db`, server stopped; it starts and stops its own server instances) verifies the persistence layer end to end. 35 / 35 checks pass:

| Area | Verified |
|---|---|
| Schema | tables `assets`, `files`, `show_versions`, `kv`; all 33 asset columns including the 11 migrated analysis columns; indexes on `rel_path` and `dup_group`; WAL journal; `PRAGMA integrity_check` = ok; `openDb()` twice is idempotent |
| Data integrity | every ready asset has all derivative files on disk and none is empty; `files` rows map only to existing media; every asset is referenced by a `files` row; all photos analysed with a 16-hex dHash, quality in 0..1, luma and colourfulness; duplicate and burst groups point at existing assets; exactly one `is_best` per group and it is the group id; year sources valid and years plausible; focal points in range; videos carry duration, dimensions and loudness gain; music carries 512 peaks |
| Show storage | every `show_versions` row validates against the zod schema; unlabelled rows pruned to ≤ 300; labelled rows kept; `data/show.json` validates and equals the newest version; no leftover `.tmp`; ≤ 200 file backups and the newest equals `show.json`; the show references only existing assets; overlays, look, frame and caption style survive in the stored JSON; the kv store holds the wizard options |
| Live behaviour | 8 concurrent saves all succeed and leave a valid file; a marker, a labelled version and a kv value survive a server restart; restore from history creates a new version; asset count stable across restart |
| Resilience | a corrupt `show.json` makes the server serve a valid default show and move the bad file aside as `show.json.invalid-*`; the original is then restored |

Final regression after the editing tools, all on a fresh build:

| Suite | Result |
|---|---|
| `npm run typecheck`, `npm run build`, `npm test` | clean · clean · 5 / 5 |
| `npm run audit:db` | 35 / 35 |
| `npm run audit:static` | 142 / 142 |
| `npm run audit:api` | 45 / 45 |
| `npm run audit:ui` | 97 / 97, 0 errors |
| `npm run audit:editing` | 26 / 26, 0 errors |
| `node scripts/inspect-auto.mjs` | all invariants hold, 0 errors |
| `node scripts/inspect-show.mjs` | 33 slides, 0 errors |

Audit-script corrections made during this pass (not product defects): the versions route returns at most 100 rows, so two checks now compare version ids instead of row counts; the static checker now reads slide types from the Slide union only.

## 9. Colour themes (added 18 Oct 2026, night)

Scope: docs/THEMES-PLAN.md. `scripts/audit-theme.mjs` (`npm run audit:theme`), 25 checks, all passing with zero console or network errors.

| Capability | Verified |
|---|---|
| 11 themes injected as `[data-theme]` CSS from the single catalogue; default also on `:root` | CSS contains every theme |
| Editor: top-bar picker (11 cards with swatches and typeface sample), settings dialog grid | picker opens, choice persists `settings.theme`, preview stage re-colours and changes typeface |
| Chapter override and slide override, resolved slide → chapter → show | chapter "בורדו" persisted and applied to its slides; slide "מודרני" wins over the chapter |
| Auto-colour overlays follow the theme | text preset renders with `color-auto` and the theme's on-media colour |
| Show: start gate themed; `T` next theme, `Shift+T` previous, `0` back to the show's theme; HUD palette button and live-theme marker | all key paths verified; live override survives slide changes; reset restores the chapter/show theme |
| Presenter: one button per theme switches the show instantly over BroadcastChannel; its own stage mirrors the live theme; "back to the show's theme" | verified |
| Confetti reads the theme palette | `--t-confetti` resolves on the player |
| Smooth switching through the View Transitions API with feature detection, reduced-motion respect and a hidden-tab guard | no errors across 11 theme renders |
| All typefaces embedded (Rubik, Secular One, David Libre, Amatic SC, Bellefair, Miriam Libre join Frank Ruhl Libre, Suez One, Heebo) | 82 font files in `dist/assets`, no network |

Fix made while auditing: a skipped view transition (hidden tab) rejected its promises as unhandled errors; they are now caught and the theme applied directly. Also an editor-only clip on frame overlays so clicks inside a frame still set the photo's focal point.

## 10. Clean slate and the interactive guide (added 18 Oct 2026, evening)

**Test data removed.** All generated sample material (`media/sample-photos`, the three "(דוגמה)" tracks, the six sample greeting clips), the derived cache, the SQLite catalogue, the backups and the demo show were moved out of the project (reversibly; a fresh `data/show.json` with one intro slide is created on start). `npm run demo:media` / `demo:show` recreate the demo for the audits; `npm run demo:clean` removes it again (into `.trash/<timestamp>/`). The UI, editing and theme suites need the demo; the static, API, DB and guide suites do not.

**Guide.** `/guide` (`src/guide/`): 13 chapters in Hebrew (how it works · library and scanning · chapters and storyboard · the 12 slide types · editing a slide · design tools · colour themes · auto-create · music and audio · presenting and the presenter view · saving, versions and checks · all shortcuts · a day-by-day walkthrough). Demos are real slides built by `buildSlide` / `animateSlide` over generated SVG photographs (`RenderCtx.resolve` lets the renderer take media from somewhere other than the cache); the transition demo reuses the player's `runTransition`, now exported from the engine; the theme demo uses `applyThemeAttr` (View Transitions). Interactive controls: transition picker, overlay-animation playground (entrance / loop / exit / background / text), look sliders and presets, frame sliders, caption style, theme chips, search, chapter navigation with scroll-spy and hash, print stylesheet. A progress checklist reads the real show and library (11 items; "rehearsed" is set by the show when a run reaches the end). "Try it" buttons send commands to an open editor over a BroadcastChannel (`src/guide/bridge.ts`) with an acknowledgement; without an editor, one opens with `?do=`. The editor shows a welcome card once (kv `guide-seen`) offering the guide, a 15-step spotlight tour (`src/guide/Tour.tsx`; targets are `data-tour` attributes on the real controls) or straight to work; a **מדריך** button in the top bar opens the guide at any time.

**Audit.** `scripts/audit-guide.mjs` (`npm run audit:guide`), 29 checks, all passing on an empty library with zero console, page or network errors: 13 chapters and sections; 57 live demo slides; 12 slide types; no media requests (generated photos); transition, animation, look, layout and theme demos react to their controls; navigation and hash; search narrowing and clearing; progress list reads the server; welcome card on first run; a tour of 15 steps, each spotlighting a real control; welcome choice persisted; guide → editor bridge opens dialogs and starts the tour; the `?do=` path; a show run marks the rehearsal and the checklist shows it. Regression after the change: typecheck and build clean, static 151/151, generator tests 5/5. Fixes made while auditing: the guide's scroll-spy no longer fights a programmatic scroll (locked for 1.2 s), and GSAP's "target not found" warnings for legitimately absent slide parts are silenced.

## 11. "Studio" interface (added 18 Oct 2026, night)

Scope: docs/UI-PLAN.md, executed in full. The tool's chrome (editor, dialogs, wizard, guide, welcome, tour, presenter, show start gate and HUD) moved from the show's gold-on-dark palette to a cool, bright design system in `src/styles/chrome.css`; the show's own visuals stay in `global.css` and read only the `--t-*` theme tokens.

- **Tokens and type.** Two chrome themes on `<html data-chrome>`: Studio Light (default) and Studio Dark. The choice is remembered on the server (kv `chrome-theme`) and switched from the moon/sun button in the top bar, Settings → „מראה הממשק", or the presenter. The whole chrome uses one typeface, Rubik 400/500/600/700, embedded. Uppercase and letter-spaced Hebrew headers are gone. Form fields have a 3:1 outline token.
- **Components.** Buttons and button groups, segmented controls that wrap into an even grid with no empty cell, chips, inputs, sliders with a filled track, cards, glass badges, dialogs with header icons and a secondary close button, empty states, tooltips and toasts.
- **Editor.**
  - The top bar is grouped into three parts. Labels become icons below 1500 px, and secondary actions move to an overflow menu below 1280 px.
  - Library and inspector widths can be dragged (240–440 px) and are remembered. Below 1180 px both become drawers with a backdrop.
  - Library: filter chips that wrap, a year-source icon on each thumbnail with a legend, an empty state with the three folders, a scan button and a drop zone. Files dropped from the desktop are copied into `media/` through `PUT /api/upload` and scanned.
  - Preview: a status strip above the stage, and the toolbar below it in two groups (add, view).
  - Inspector: tabs „מאפיינים" and „בדיקות" (with a problem count), collapsible sections with summaries, and a 3×3 camera-move pad.
  - Storyboard: colour-coded type tags, a card-size zoom, a hint when the show is empty, and an "add slide" menu that can no longer be clipped.
- **Presenter.** Large clock and remaining time, a grouped control bar, and a scrolling thumbnail strip grouped by chapter that follows the current slide. This replaces the pill list, which was unusable beyond about 40 slides.
- **Show start gate and HUD.** Theme-aware, with a two-column key legend and 36 px HUD buttons.

**Audits.** Two new suites, and the existing ones were rerun on the final build with the demo library ingested.

| Suite | Result |
|---|---|
| `npm run audit:contrast`: every visible text element on 14 screens (editor and its menus, 5 dialogs, wizard, tour, guide, presenter, welcome), both chrome themes; text ≥ 4.5:1 (large ≥ 3:1), field outlines ≥ 3:1 | 28 / 28 |
| `npm run audit:responsive`: 1920, 1600, 1366, 1280, 1180 and 1024 px; top bar never overflows or clips, play button on screen, no sideways scroll on editor, presenter and guide, panels ≥ 240 px or working drawers, no inspector control spills out for 6 slide types and a chapter, panel resizing, card zoom, slider fill | 61 / 61 |
| `audit:ui` (adds the checks-tab check) | 98 / 98 |
| `audit:editing` | 26 / 26 |
| `audit:theme` | 25 / 25 |
| `audit:guide` | 29 / 29 |
| `audit:api` | 45 / 45 |
| `audit:static` | 156 / 156 |
| `npm test` | 5 / 5 |
| `npm run audit:db` (server stopped) | 36 / 36 |

The storage audit was made self-sufficient. Two of its checks used to read state left behind by earlier sessions: a styled slide in the show, and saved auto-create options. On a fresh database they failed for the wrong reason. The audit now writes a styled slide and a kv value through the API, stops the server, reads both back from `show.json` and SQLite, and at the end returns the user's show to exactly the state it found. It used to leave a marker note on the first slide.

Audit-script changes, not product defects: the UI, editing and theme suites now mark the welcome card as seen while they run, because the card covered the editor during mouse-driven checks; the presenter check uses the new slide strip; the frame preset is now called „מסגרת".

Defects found and fixed during this work are listed in docs/UI-PLAN.md section 7. The demo library used for these audits was removed again afterwards; the app is left empty.

## 12. Checklist for Ohad
- [ ] Drop the real photos, greetings and music into `media/` (or drag them onto the library) and run the library scan; review the warnings list.
- [ ] Build the real show in the editor.
- [ ] Rehearse on the TV with sound; set music level and duck level in Settings to taste.
- [ ] Record the backup MP4 (docs/RUNBOOK.md).

## 13. Real-input wiring audit (21 Oct 2026, first hands-on use)

Ohad's first session with the app found controls that did nothing: the add-text / symbol / shape / image buttons, no visible way to delete a slide, no way to make a collage. All earlier suites drive the UI with `element.click()`, which fires handlers on elements a mouse cannot reach, so a whole class of defects (covered, clipped or hidden controls) was invisible to them. `scripts/audit-wiring.mjs` (`npm run audit:wiring`) now drives everything with real mouse and keyboard input and applies two rules in every screen state: a visible enabled control must be hit-testable at its centre, and a visible disabled control must carry a reason (title or tooltip). It then exercises every feature end to end and restores the show it found. 262 checks, all passing on the final build, zero console or network errors.

Defects found and fixed:

| Defect | Cause | Fix |
|---|---|---|
| Add text / symbol / shape menu never appeared | the menu was a child of `.btn-group`, which clips its overflow | menu moved outside the group (`Preview.tsx`) |
| "No way to delete a slide" | the action row sat at the bottom of a scrolling inspector | sticky action row under the inspector title for slides and chapters; hover duplicate/delete buttons on every card; right-click menu on cards (play from here, duplicate, lock, delete) |
| "No way to make a collage" | collage / pair / add buttons were disabled with no explanation when nothing (or nothing suitable) was selected; the `+` menu offered text slides only | `+` menu gained תמונה / ברכה, זוג, קולאז׳ from the library selection with the reason shown on disabled items; library footer buttons explain themselves; every "from the library selection" button in the inspector explains what to select |
| **Show HUD, start gate and end card invisible in fullscreen** | the Start click put the `.player` element into fullscreen; a fullscreen element is painted alone in the top layer, and the HUD was its sibling. On the TV there would have been no HUD, no progress bar, no "paused" / "waiting for click" indicator | the page container (`.showpage`) is now the fullscreen element (`engine.ts` `fullscreenTarget()`, `ShowPage.tsx`) |
| **Undo / redo were never saved** | the autosave subscriber reacts to a `show` change while the state is `dirty`; the temporal store restores `show` first and `dirty` is set afterwards, so neither change triggered a save. Ctrl+Z looked right on screen and was lost on reload | `markDirty()` schedules the save itself (`store/show.ts`) |
| Wizard: a folder could not be unchecked while "all folders" was active | an empty folder list means "all"; removing one from an empty list left it empty | the list is spelled out before the first exclusion (`AutoShowDialog.tsx`) |
| Preview stage overflowed the tools after the window got narrower | the stage's fixed width kept `.stage-wrap` from shrinking, so the resize observer never fired | `min-width: 0; overflow: hidden` on the wrap |
| DVD `.vob` and other legacy video files silently ignored | not in the extension list | VOB, MPG/MPEG, WMV, FLV, TS, M2TS accepted (ffmpeg decodes them); any other unknown extension is reported in the scan warnings |
| Disabled controls with no reason (chapter move buttons, version label button, tour "previous", wizard chapter select, selection-dependent buttons) | — | titles added |
| Slide type label "פרק" was ambiguous next to the chapter inspector | — | type label is now "כותרת פרק" |

Verified not to be defects, after reproduction: double-click on cards and assets (works; the audit had used a synthetic double-click Chrome does not honour), Suez One's "8o"-looking zero (the typeface's own design, see below), the inspector drawer at 1100 px and the presenter's black-screen fade (both only failed while the page was a background tab, where Chrome produces no frames).

Open design note: Suez One draws the zero with an old-style, x-height-tall shape, so the hero "80" reads as "8o" in the eight themes that use it for numerals. It is deliberate typography, not a loading failure (verified with `document.fonts.check` and glyph widths). If it bothers the family, switch the numeral face of those themes in `shared/themes.ts` to Secular One or Rubik 700, which have lining zeros.

Regression on the final build: `npm run audit:wiring` 262/262 and all previous suites rerun; results in the table of section 11 still hold (see the suite log of this session).

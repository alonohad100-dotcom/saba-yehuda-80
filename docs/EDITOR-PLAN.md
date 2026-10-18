# Advanced editing tools — plan and status

**Goal:** the editor must let Ohad compose every slide like a designer, not only choose photos: add text anywhere, symbols and emoji, shapes and frames, photo stickers, animate each element, grade the photo, style the caption, and preview it all live, with everything running offline from this laptop.

**Status (18 Oct 2026, night):** implemented and audited. All four phases are done; `scripts/audit-editing.mjs` exercises every tool end to end (editor DOM → server → show DOM) and passes with zero console or network errors. See docs/AUDIT.md section 7.

## 1. What exists already
Photos, pairs, collages (8 layouts), chapter cards, intro, timeline, quote, names, greetings, video wall, finale, black; Ken Burns direction + focal point; four transitions; per-slide duration and advance; captions with year; presenter notes; music per chapter with waveform offset; locks; auto-create; versions; checks.

## 2. What is added

| Area | Tools | Where |
|---|---|---|
| **Overlays on any slide** | Free text, symbol (80 line icons, colourable, fillable), emoji (70 colour glyphs), shape (rectangle, circle, line, frame outline), image sticker (any library photo, rounded or circle mask, border). Move by dragging, resize by corner handle, rotate by handle, nudge with arrows (Shift = 5 %), duplicate (Ctrl+D), delete, z-order forward/back, lock, opacity, snap guides at the centre lines and safe margins | `shared/model.ts` Overlay schema · `src/show/slides.ts` renderer · `src/editor/Preview.tsx` handles · `src/editor/OverlayInspector.tsx` |
| **Element animation** | Entrance: fade, rise, drop, zoom, pop, slide in from right/left, typewriter, letter by letter. Delay and duration per element. Loop: pulse, float, spin, shimmer. Exit: fade. All driven by the same GSAP timeline as the slide, so the show and the preview are identical | `animateSlide` in `src/show/slides.ts` |
| **Text styling** | Three embedded typefaces (Frank Ruhl Libre display, Heebo UI, Suez One numerals), size, weight, colour presets + free colour, alignment, background (none, pill, bar, box), shadow, gold accent. Quick presets: big title, small caption, year badge, name tag | `OverlayInspector` + add-text menu |
| **Photo grading** | Look filters: none, black & white, sepia, warm, cool, faded, vivid. Brightness, contrast, saturation sliders. Vignette strength. One-click presets (archive, cinematic, clean). Applies to photo, pair, collage, chapter, video backdrop | `Look` schema · `cssFilter()` · inspector "מראה" section |
| **Photo framing** | Zoom (crop around the focal point), rotate 90/180/270 for scans that came in sideways, mirror, Ken Burns amount (none → strong) | `Frame` schema · renderer `.imgwrap` |
| **Caption styling** | Entrance (fade, rise, word by word, letter by letter, none), size, position (bottom, top, centre), alignment, font, box background | `CaptionStyle` schema |
| **Transitions** | Added wipe (RTL) and blur to fade, dip, push, zoom; available per slide, per chapter default and global default | `src/show/engine.ts` |
| **Layers panel** | The inspector lists the slide's overlays; click to select, eye to hide (opacity 0), lock, reorder | `Inspector.tsx` |
| **Keyboard** | With an overlay selected: arrows nudge, Shift+arrows nudge 5 %, Delete removes, Ctrl+D duplicates, Esc deselects, Ctrl+] / Ctrl+[ z-order | `EditorPage.tsx` |

## 3. Embedded and offline
- Fonts: `@fontsource` packages bundled by Vite (already in place).
- Icons: the `lucide` icon-data package (bundled; no network) renders symbols as inline SVG in both the editor and the show.
- Emoji: system colour font (Segoe UI Emoji on Windows), which the show laptop has.
- No CDN, no web fonts, no remote services. The show runs from `dist/` served by the local server.

## 4. Data model
Every slide's base gains `overlays`, `look`, `frame`, `captionStyle`, all optional, all validated by zod on save, all covered by undo and versions. Old shows load unchanged.

## 5. Rendering contract
`buildSlide` appends an `.ovl` layer after the slide's own content; `animateSlide` adds one tween group per overlay after the slide's own entrance so the composition reads in order: media → caption → elements. The preview in the editor uses the same code, so what is placed is what the family sees.

## 6. Audit additions
`scripts/audit-ui.mjs` gains: add text overlay → drag it → resize → set animation → verify the server has the new x/y/w/anim; add a symbol and an emoji; apply a look filter and a frame rotation → verify the show's DOM carries the filter; wipe and blur transitions play; layers panel selects; Delete removes the overlay, not the slide.

## 7. Phases
- [x] A · model + symbol catalogue
- [x] B · renderer: overlays, look, frame, caption style, new transitions (wipe, blur)
- [x] C · editor: add toolbar with presets, drag/resize/rotate handles with snap guides, overlay inspector, look/frame/caption sections, layers list, keyboard
- [x] D · audit script (`scripts/audit-editing.mjs`, 26 checks), screenshots, docs

## 8. Deliberately not included
Free-hand drawing, video trimming beyond in/out points, audio editing beyond start offset and levels, and 3D effects. They would not survive a rehearsal-day bug and the show is in five days.

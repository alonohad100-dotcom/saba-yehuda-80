# סבא יהודה 80 — Saba Yehuda 80

Editor and cinematic show for Yehuda's 80th birthday. Runs entirely on one laptop, offline. Hebrew, RTL.

## Quick start
```
npm install
npm run dev            # server on :4000 + Vite on :5173 → open http://127.0.0.1:5173/edit
```
The app starts empty (no sample material): put your files in `media/`, scan, and build. On the first open the editor offers the interactive guide and a 15-step tour of the screen.

## The guide
`/guide` (the **מדריך** button in the editor, or `http://127.0.0.1:4000/guide`) is an interactive manual in Hebrew: 13 chapters covering every feature and effect, with live demos rendered by the real show engine over generated demo photos (so it works with an empty library): all 12 slide types, the 6 transitions, 7 camera moves, overlay animation playground (entrance / loop / exit), look, frame and caption-style controls, the 8 collage layouts, live theme switching, symbols, an audio diagram, every keyboard shortcut, and a day-by-day walkthrough for building a complete 22-minute show. A progress checklist on the right reads your real show (media in the library, chapters, captions, music per chapter, greetings used, a named version, a rehearsal run to the end). "Try it" buttons drive the open editor window (open the scan dialog, the auto-create wizard, the versions dialog, start the tour, add a chapter); if no editor is open, one opens with the command. The in-editor **tour** spotlights 15 real controls with explanations and links back into the guide.
Production (show night):
```
npm run show           # builds, starts the server on :4000, opens Chrome in kiosk mode on /show
```

## Put your media here
```
media/photos/**                 any folder structure; a folder named "1966 חתונה" or "שנות ה-60" or "1970s" gives photos without EXIF a year
media/videos/greetings/*.mp4    file name = the greeter's name (e.g. נועה.mp4); WhatsApp/iPhone clips of any size and orientation
media/music/*.mp3|m4a|wav
```
Videos may also be MOV, AVI, MKV, WMV, MPG, camcorder MTS/M2TS or DVD VOB files: everything is re-encoded by ffmpeg at ingest. A file with an extension the pipeline does not know is listed in the scan warnings instead of being skipped silently.
Then Editor → **ספרייה** → **סרוק את media/** (or `npm run ingest`). Processing is incremental: files already processed are skipped on the next run.

## Auto-create a show
Editor → **✦ צור אוטומטית**. Pick folders and years, set the target length, preview, apply. The generator never repeats a photo: at ingest every photo gets a perceptual hash, a quality score and duplicate / burst grouping (SQLite columns), and the generator keeps one photo per group, samples across time, rotates eight collage layouts, places greeting videos and assigns music. Lock any slide or chapter to keep it through a regenerate; "תמונה דומה" swaps a photo for an unused one from the same era; a chapter's inspector has "מלא את הפרק אוטומטית". `npm run autoshow -- --minutes 20` prints a dry run from the command line; `npm test` runs the generator's invariant tests. Details: docs/AUTO-SHOW-PLAN.md and docs/AUDIT.md.

## Interface
The tool itself has a bright "Studio" look (Rubik, cool neutrals, one blue accent, visible field outlines) and a dark variant: moon/sun button in the top bar, or Settings → „מראה הממשק". The show keeps its own eleven colour themes. Drag the inner edges of the library and the inspector to resize them; below 1180 px they open as drawers. The inspector has two tabs, „מאפיינים" (collapsible sections) and „בדיקות" (everything still missing, with a count). Files dragged from the desktop onto the library are copied into `media/` and scanned. Plan and measurements: docs/UI-PLAN.md.

## Editing tools
Slides: the **+** at the end of a chapter row offers media slides built from the library selection (תמונה / ברכה, זוג, קולאז׳; a disabled item says what to select) and the text slide types. Every card has hover buttons for duplicate and delete and a right-click menu (play from here, duplicate, lock, delete); the inspector keeps שכפל · נעל · מחק · נגן מכאן pinned at its top. `Delete`, `Ctrl+D` and `Ctrl+Z` work on the selection, and undo/redo are saved to disk like any other change.

**Export** (top bar → „ייצוא”) writes a self-contained offline package of the show to the exports/ folder, a USB drive or any folder: the built player, the show, and every photo, video and song it uses, plus START-SHOW.bat (a PowerShell static server, nothing to install) and a Mac launcher; optionally also one .zip.

Every built-in text block (intro name/number/subtitle, chapter title lines, timeline/names/wall titles, quote and attribution, greeting name/relation, finale, black-screen caption) can be dragged anywhere on the preview stage and given a size, bold, underline, alignment and wrapping width in the inspector's „מיקום וגודל הטקסטים” section.

Years are not printed on photos unless Settings → תמונה → „שנה על התמונות” is on (they are still used for sorting). A caption can be dragged anywhere on the preview stage (or positioned with the sliders in „סגנון הכיתוב”), sized from ×0.3 to ×6, and given a wrapping width.

Every slide text (captions, titles, intro, chapter, quote, finale, overlays) is multi-line: Enter in the inspector starts a new line and the show renders it as one.

Music is fully controllable: any slide can start its own song (crossfaded from whatever was playing, with a start point and volume, continuing into the following slides); each chapter picks a track, continues the previous chapter's, or is silent („שקט”); Settings → שמע → „מוזיקה בזמן סרטון” decides what music does while a video plays (pause and resume by default, or stop, lower, continue); and every slide's „מוזיקה בשקופית” section can make the music continue, lower, pause, stop or restart when that slide starts. The fade length is a setting too.

Photos are never cropped by default: every photo, pair tile, collage tile, chapter hero and greeting video is shown whole over a blurred copy of itself, and the camera move runs on that backdrop. Settings → תמונה → „התאמת תמונות למסך” switches the whole show to full-bleed (cropped); the inspector's „מסגרת וחיתוך” section overrides it per slide.

Below the preview: **טקסט** (six presets), **סמל** (80 icons, 70 emoji), **צורה** (frame, line, rectangle, circle), **תמונה** (sticker from the library selection). Drag to move (snap guides), corner to resize, top handle to rotate. Each layer has entrance/loop/exit animation, colour, font, background, opacity and z-order. Per slide: look filters and adjustments, zoom/rotate/mirror framing, caption style, six transitions. Keyboard: arrows nudge, Shift+arrows 5 %, Ctrl+D duplicate, Delete, Esc. Details: docs/EDITOR-PLAN.md.

## Colour themes
Eleven themes (nine dark, two light), each with its own grounds, text, metallic accent, Hebrew typefaces, grain and optional photo tint: לילה וזהב, כחול ורוד־זהב, שנהב קלאסי, קולנועי, וינטג׳, ירוק ונחושת, בורדו, ים, מודרני, פסטל, שחור־לבן. Pick one in the top bar (whole show), per chapter or per slide in the inspector. During the show press **T** (next), **Shift+T** (previous) or **0** (back to the show's theme), use the HUD palette button, or click a theme in the presenter window. Details and research: docs/THEMES-PLAN.md.

## Pages
- `/edit` the editor (library · preview · inspector · storyboard)
- `/show` the full-screen show (keyboard or clicker; see docs/RUNBOOK.md)
- `/presenter` current/next slide, timers, notes, remote control for the show window

## Where things live
| Path | What |
|---|---|
| `data/show.json` | the authored show (chapters, slides, settings) |
| `data/library.db` | SQLite: asset catalog + show version history |
| `data/backups/` | one JSON per save (last 200) |
| `.cache/` | derived media: WebP 2560/400/blur, H.264 1080p with normalized loudness, posters, AAC music |
| `server/` | Fastify API + ingest pipeline (sharp, exifr, ffmpeg) |
| `src/show/` | slide renderer + GSAP playback engine + Web Audio bus |
| `src/editor/` | React editor |
| `docs/PLAN.md` | the plan · `docs/AUDIT.md` the post-implementation audit · `docs/RUNBOOK.md` show night |

## Scripts
| Script | Purpose |
|---|---|
| `npm run dev` | development, both servers with hot reload |
| `npm run build` | type-check + production bundle |
| `npm run show` | build + production server + kiosk Chrome |
| `npm run start` | production server only |
| `npm run ingest` | process `media/` from the command line |
| `npm run demo:media` | generate stand-in photos/videos/music into `media/` and ingest them (for trying the app or running the audits; **not** for the real show) |
| `npm run demo:show` | build a complete demo show from the library (server must be running) |
| `npm run demo:clean` | remove the demo material and the derived data (moved to `.trash/<timestamp>/`, reversible); `--all-media` also clears your own media and show |
| `node scripts/seed-demo-show.mjs` | build a complete demo show from the library (server must be running) |
| `node scripts/inspect.mjs <dir>` / `inspect-show.mjs` / `shot-slides.mjs` / `inspect-auto.mjs` | headless screenshots and checks (needs Chrome or Edge installed) |
| `npm run audit:static` · `audit:api` · `audit:ui` · `audit:editing` · `audit:theme` (server on :4000, demo media ingested) · `audit:db` (server stopped) | the audit suites described in docs/AUDIT.md |
| `npm run audit:guide` (server on :4000, works with an empty library) | the guide, tour, welcome card and guide→editor bridge |
| `npm run audit:contrast` · `audit:responsive` (server on :4000) | text and field-outline contrast on every screen in both interface themes; layout at six widths, drawers, panel resizing |
| `npm run audit:wiring` (server on :4000, demo media ingested) | **real-input** audit: every control is driven with the mouse and keyboard, never with `element.click()`. In every screen state it checks that each visible control is actually hit-testable (nothing covers or clips it) and that each disabled control says why; then it exercises every feature end to end: add tools and menus, card actions, context menu, keyboard, library, drag, inspector controls of every slide type, dialogs, wizard, drawers, welcome and tour, show HUD in fullscreen, presenter remote, guide. Restores the show it found |
| `node scripts/ui-shots.mjs <dir> "" <w> <h> <light\|dark>` | screenshots of every page and dialog |

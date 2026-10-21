# סבא יהודה 80 — Saba Yehuda 80

Editor and cinematic show for Yehuda's 80th birthday. Runs entirely on one laptop, offline. Hebrew, RTL.

## Quick start
Double-click **`start-editor.cmd`** in the project folder. It builds if needed, starts the server in that window and opens http://127.0.0.1:4000/edit. Keep the window open while you work; closing it stops the app. If the server is already running it just opens the editor.

For development:
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

## Adding media
In the editor, **ספרייה → הוסף**: pick files, pick a whole folder (sub-folders kept), or open `media/` in Explorer. You can also drag files and folders from Explorer onto anywhere in the editor window. Everything is copied into `media/` (photos keep their folder structure, so a folder named "1966 חתונה" still dates its photos), a file copied twice is kept once, non-media files are skipped, a progress card shows the copy, and the scan starts by itself. `npm run audit:upload` tests all of this on a throwaway copy (`SY80_HOME`).

## Put your media here (manual route)
```
media/photos/**                 any folder structure; a folder named "1966 חתונה" or "שנות ה-60" or "1970s" gives photos without EXIF a year
media/videos/greetings/*.mp4    file name = the greeter's name (e.g. נועה.mp4); WhatsApp/iPhone clips of any size and orientation
media/music/*.mp3|m4a|wav
```
Then Editor → **ספרייה** → **סרוק את media/** (or `npm run ingest`). Processing is incremental: files already processed are skipped on the next run.

## Auto-create a show
Editor → **✦ צור אוטומטית**. Pick folders and years, set the target length, preview, apply. The generator never repeats a photo: at ingest every photo gets a perceptual hash, a quality score and duplicate / burst grouping (SQLite columns), and the generator keeps one photo per group, samples across time, rotates eight collage layouts, places greeting videos and assigns music. Lock any slide or chapter to keep it through a regenerate; "תמונה דומה" swaps a photo for an unused one from the same era; a chapter's inspector has "מלא את הפרק אוטומטית". `npm run autoshow -- --minutes 20` prints a dry run from the command line; `npm test` runs the generator's invariant tests. Details: docs/AUTO-SHOW-PLAN.md and docs/AUDIT.md.

## Interface
The tool itself has a bright "Studio" look (Rubik, cool neutrals, one blue accent, visible field outlines) and a dark variant: moon/sun button in the top bar, or Settings → „מראה הממשק". The show keeps its own eleven colour themes. Drag the inner edges of the library and the inspector to resize them; below 1180 px they open as drawers. The inspector has two tabs, „מאפיינים" (collapsible sections) and „בדיקות" (everything still missing, with a count). Files dragged from the desktop onto the library are copied into `media/` and scanned. Plan and measurements: docs/UI-PLAN.md.

## Editing tools
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
| `npm run audit:upload` (self-contained: starts its own server on :4100 over a temp copy) | the upload route, file/folder pickers, drop anywhere, folder drag, progress card, queued rescan |
| `npm run audit:contrast` · `audit:responsive` (server on :4000) | text and field-outline contrast on every screen in both interface themes; layout at six widths, drawers, panel resizing |
| `node scripts/ui-shots.mjs <dir> "" <w> <h> <light\|dark>` | screenshots of every page and dialog |

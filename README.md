# סבא יהודה 80 — Saba Yehuda 80

Editor and cinematic show for Yehuda's 80th birthday. Runs entirely on one laptop, offline. Hebrew, RTL.

## Quick start
```
npm install
npm run sample-media   # optional: generates stand-in photos/videos/music so you can try everything before the real files arrive
npm run dev            # server on :4000 + Vite on :5173 → open http://127.0.0.1:5173/edit
```
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
Then Editor → **ספרייה** → **סרוק את media/** (or `npm run ingest`). Processing is incremental: files already processed are skipped on the next run.

## Auto-create a show
Editor → **✦ צור אוטומטית**. Pick folders and years, set the target length, preview, apply. The generator never repeats a photo: at ingest every photo gets a perceptual hash, a quality score and duplicate / burst grouping (SQLite columns), and the generator keeps one photo per group, samples across time, rotates eight collage layouts, places greeting videos and assigns music. Lock any slide or chapter to keep it through a regenerate; "תמונה דומה" swaps a photo for an unused one from the same era; a chapter's inspector has "מלא את הפרק אוטומטית". `npm run autoshow -- --minutes 20` prints a dry run from the command line; `npm test` runs the generator's invariant tests. Details: docs/AUTO-SHOW-PLAN.md and docs/AUDIT.md.

## Editing tools
Above the preview: **טקסט** (six presets), **סמל** (80 icons, 70 emoji), **צורה** (frame, line, rectangle, circle), **תמונה** (sticker from the library selection). Drag to move (snap guides), corner to resize, top handle to rotate. Each layer has entrance/loop/exit animation, colour, font, background, opacity and z-order. Per slide: look filters and adjustments, zoom/rotate/mirror framing, caption style, six transitions. Keyboard: arrows nudge, Shift+arrows 5 %, Ctrl+D duplicate, Delete, Esc. Details: docs/EDITOR-PLAN.md.

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
| `npm run sample-media` | generate stand-in media |
| `node scripts/seed-demo-show.mjs` | build a complete demo show from the library (server must be running) |
| `node scripts/inspect.mjs <dir>` / `inspect-show.mjs` / `shot-slides.mjs` / `inspect-auto.mjs` | headless screenshots and checks (needs Chrome or Edge installed) |
| `npm run audit:static` · `audit:api` · `audit:ui` · `audit:editing` (server on :4000) · `audit:db` (server stopped) | the audit suites described in docs/AUDIT.md |

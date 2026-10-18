# Saba Yehuda 80 — Research & Build Plan

**Event:** Yehuda's 80th birthday, family gathering, weekend of **Fri–Sat 23–24 Oct 2026**.
**Today:** Sun 18 Oct 2026 → **5 working days**.
**Deliverable:** a local, offline-capable app with two faces:

1. **Editor** — Ohad builds the show: picks photos from a huge library, orders them into chapters, writes Hebrew captions, places the grandchildren's/nephews' greeting videos, assigns music.
2. **Show** — a cinematic, full-screen playback of the finished show on a laptop connected to the family TV/projector, driven by keyboard or presentation clicker, with background music that automatically ducks under the greeting videos.

Everything the family sees (titles, captions, lower-thirds, UI text inside the show) is **Hebrew, RTL**. Code, docs and our conversation are English.

---

## 1. Hard constraints that shape every decision

| Constraint | Consequence |
|---|---|
| 5 days, one developer (Claude) + one content author (Ohad) | Zero exotic infrastructure. Everything must run end-to-end by day 2 so content work can start on day 3. |
| Must work at a family home with unknown Wi-Fi | **Fully offline.** No CDN fonts, no cloud APIs at show time. Fonts and libs are bundled. |
| Huge photo library incoming (likely thousands of files, iPhone HEIC, old scans, WhatsApp exports) | Ingest must be **incremental and cached** (content hash → derivatives), tolerant of HEIC, rotated EXIF, missing dates. |
| Greeting videos arrive via WhatsApp from many phones | Mixed codecs, portrait 9:16, wildly different volume levels. **Normalize everything with ffmpeg** at ingest (H.264 + AAC, loudness-normalized, poster frame). |
| Hebrew RTL text with mixed digits ("80", years) | `dir="rtl"` everywhere in the show, `unicode-bidi: isolate` on numeric spans, fonts with full Hebrew coverage, letter/word animation verified against RTL. |
| Will be played once, in front of everyone | **Reliability > features.** Rehearsal day is mandatory. A backup MP4 recording of the show lives on a USB stick. |

---

## 2. Research summary → decisions

### 2.1 Runtime: local web app, not Electron/Tauri
- A Vite + React app served by a small Node server on the same laptop, opened in Chrome/Edge full-screen (`--kiosk`). Nothing to package or sign; `npm run show` and it is live.
- Electron/Tauri would buy native file dialogs we do not need (the media folder is fixed) and would cost a day in packaging/debugging on Windows. Rejected for this timeline.
- Node server responsibilities: scan `media/`, run the ingest pipeline, serve derivatives with HTTP range requests (needed for `<video>` seeking), read/write `data/show.json` atomically with timestamped backups.

### 2.2 Animation: GSAP (free since Apr 2025) + Motion for editor UI
- Webflow made GSAP and all formerly paid plugins (SplitText, MorphSVG, Flip, etc.) free for commercial use (license effective 30 Apr 2025). GSAP 3.15.0 on npm includes them.
- GSAP timelines are the right primitive for a slide engine: deterministic, scrubbable, pausable, with precise sequencing of Ken Burns moves, caption reveals and crossfades.
- SplitText (rewritten in 3.13) is used for Hebrew word/letter reveals; **must be smoke-tested with RTL on day 1**, with a fallback to word-level `<span>` splitting we control.
- Motion 14 (formerly framer-motion) handles the editor UI micro-interactions only.

### 2.3 Rendering the final show to MP4: Remotion considered, rejected as primary
- Remotion's free tier covers an individual rendering locally, and the Player can preview the same composition. Attractive "one codebase, live + MP4".
- Rejected because: frame-by-frame rendering of a 20–30 minute show containing many embedded videos is slow and fragile on a laptop; the editor would also have to be built around Remotion's frame model, which costs time we do not have.
- **Backup plan instead:** on rehearsal day, record one full run with OBS (or Windows Game Bar) → `show-backup.mp4` on a USB stick. If anything fails on the night, play the MP4 in VLC.

### 2.4 Images: sharp, exifr, HEIC fallback
- sharp 0.35 for resize/encode; derivatives per photo: `display` (long edge 2560 px, WebP q85 — crisp on a 4K TV), `thumb` (400 px WebP) and a tiny blurred placeholder for instant paint.
- exifr for DateTimeOriginal, orientation, GPS. Files without EXIF fall back to folder name hints (e.g. `media/photos/1970s/`) then file mtime; everything stays overridable in the editor.
- sharp's prebuilt binaries cannot decode HEVC-encoded HEIC (patent reasons). Fallback chain for `.heic/.heif`: `heic-convert` (pure JS/WASM) → ffmpeg decode. Verified on day 0 as soon as the first iPhone photos arrive.
- Optional (day 3 if time): `smartcrop-sharp` to propose a focal point per photo so Ken Burns moves end on faces; always editable by click in the editor.

### 2.5 Video and audio: ffmpeg via `ffmpeg-static`
- No ffmpeg on this machine's PATH; `ffmpeg-static` 5.3 ships a Windows binary through npm.
- Per greeting video: transcode to H.264 High 1080p (portrait stays portrait), AAC 48 kHz, `loudnorm` to −16 LUFS so a shouted greeting and a whispered one play at the same level, `faststart`, poster frame at 1 s, duration + orientation metadata.
- Music: keep original files, read duration, compute a simple waveform peak array for the editor timeline.
- In the browser, all sound goes through one Web Audio graph: `music → GainNode(music)`, `video → GainNode(video)`, both → master. Ducking is a GSAP tween on the music gain (to ~10 % in 600 ms when a video slide starts, back in 1.2 s after it ends). Crossfade between tracks is two gain tweens.
- Chrome allows sound only after a user gesture on the page, so the show always starts from a "התחל" (Start) button click. That click also requests fullscreen and resumes the AudioContext.

### 2.6 Typography (self-hosted via `@fontsource/*`, no network)
| Role | Font | Why |
|---|---|---|
| Display titles, chapter names, captions | **Frank Ruhl Libre** (serif) | Classic Hebrew book face descended from Frank-Rühl 1908; reads "dignified, 80 years of life", not "startup". |
| Big numerals ("80", years) and lower-thirds | **Suez One** | Heavy, warm display face; makes the "80" reveal land. |
| Editor UI, body text, small labels | **Heebo** | Neutral, excellent Hebrew+Latin, many weights. |

Alternates in reserve: Assistant, Rubik, Secular One. Final pairing is chosen on day 1 on a real TV-sized preview.

### 2.7 Stack (versions verified from the npm registry on 18 Oct 2026)
- vite 8.3.4, react 19.3.1, typescript 7.0.2, tailwindcss 4.3.3 (+ `@tailwindcss/vite`)
- gsap 3.15.0, motion 14.3.0, zustand 5.0.15, @dnd-kit/core 6.3.1 + @dnd-kit/sortable 10.0.0, lucide-react, canvas-confetti 1.9.4
- Server: fastify 5.12 (static + range requests), tsx 4.23, chokidar 5 (watch `media/` for new drops), zod 4 (validate show.json)
- Media: sharp 0.35.5, exifr 7.1.3, heic-convert 2.1.0, ffmpeg-static 5.3.0, smartcrop-sharp 2.0.8 (optional)
- Fonts: @fontsource/frank-ruhl-libre, @fontsource/suez-one, @fontsource/heebo 5.3.0
- Node 24.14 / npm 11.11 already installed on this machine.

---

## 3. Architecture

```
saba-yehuda-80/
├─ media/                      # Ohad drops raw files here (git-ignored)
│  ├─ photos/**                # any structure; sub-folder names may hint at decades/events
│  ├─ videos/greetings/*.mp4   # file name = greeter's name in Hebrew, e.g. "נועה.mp4"
│  └─ music/*.mp3|m4a
├─ .cache/                     # generated derivatives, keyed by content hash (git-ignored)
│  ├─ img/<hash>.display.webp / .thumb.webp / .blur.webp
│  ├─ vid/<hash>.1080.mp4 / .poster.jpg
│  └─ index.json               # asset catalog: ids, dims, dates, durations, focal points
├─ data/
│  ├─ show.json                # THE show (committed; this is the editor's output)
│  └─ backups/show.<ts>.json   # automatic on every save
├─ server/                     # Fastify + ingest pipeline (tsx)
│  ├─ index.ts                 # API + static serving of /media-cache and the built client
│  ├─ ingest/                  # scan → hash → derive (images.ts, videos.ts, music.ts)
│  └─ show-store.ts            # atomic read/write of show.json with zod validation
├─ src/                        # Vite React client
│  ├─ show/                    # the playback engine (GSAP) — zero editor code imported
│  │  ├─ engine/               # Scheduler, AudioBus, Preloader, Transitions
│  │  └─ slides/               # one component per slide type (see §5)
│  ├─ editor/                  # Library, Storyboard, Inspector, Preview
│  ├─ presenter/               # optional second-screen view (BroadcastChannel)
│  ├─ model/                   # show.json types + zod schema (shared with server)
│  └─ store/                   # zustand stores
└─ docs/PLAN.md
```

Routes: `/edit` (editor), `/show` (playback, starts on Start button), `/presenter` (notes + next slide + clock, opened on the laptop screen while `/show` is on the TV).

Single `npm run dev` runs server + client via `concurrently`; `npm run show` builds the client and serves it from the same Node process so show-time has no dev server, no HMR, no surprises.

---

## 4. Media ingest pipeline

1. **Scan** `media/**` (chokidar watch in dev; one-shot `npm run ingest` as well).
2. **Hash** file content → stable asset id; renamed/moved files keep their derivatives and editor assignments.
3. **Images:** EXIF via exifr → auto-rotate → sharp derivatives (display 2560 / thumb 400 / blur 24 px) → optional smartcrop focal point.
   HEIC: try sharp; on failure, `heic-convert` → JPEG buffer → sharp. Last resort: ffmpeg.
4. **Videos:** ffprobe metadata → ffmpeg transcode (H.264, AAC, loudnorm, faststart) → poster → derive greeter name from filename.
5. **Music:** ffprobe duration → peaks (ffmpeg `astats` sampled) for the editor timeline.
6. Write `.cache/index.json`; the API exposes `/api/assets` with filters (type, year, unused, folder, name).
7. Progress is streamed to the editor over SSE so Ohad sees "412 / 2,300 photos processed" while dropping in files.

Ingest runs in a worker pool (`os.cpus() - 1`) and is idempotent; re-running on 2,000 photos after the first pass costs seconds.

---

## 5. Show engine and slide types

The engine is one master GSAP timeline per slide plus a scheduler that handles preloading (next 3 slides' media decoded ahead), transitions, auto/manual advance and audio.

**Controls:** `Space / → / PageDown` next · `← / PageUp` previous · `P` pause/resume auto-advance · `B` black screen · `M` mute music · `F` fullscreen · `Esc` exit. PageUp/PageDown are what standard presentation clickers send, so any clicker works unchanged.

**Advance modes:** per-slide `auto` (duration in seconds) or `manual` (wait for click); videos always auto-advance when they end unless flagged `hold`.

| Slide type | What it looks like | Key props |
|---|---|---|
| `intro` | Slow-breathing dark background, "יהודה" letters settle in, "80" grows in Suez One with a light sweep, subtitle (date / "חוגגים 80 לסבא"). | title, subtitle |
| `chapter` | Full-bleed hero photo with dark gradient, decade/era label ("שנות ה-60", "המשפחה גדלה"), one-line description, thin gold rule. | hero asset, label, blurb |
| `photo` | Single photo with Ken Burns (direction and focal point editable), optional caption + year badge. Grain/vignette overlay for old scans. | asset, caption, year, kenBurns, duration |
| `photo-pair` | Two photos side by side (then & now), slide-in from opposite edges, shared caption. | assets[2], caption |
| `collage` | 3–6 photos animated in on a masonry grid, slight parallax, one photo gently zooms as the "hero". | assets[3..6], caption |
| `timeline` | Horizontal line of years (1946 → 2026) drawing itself, milestone dots pop with tiny photo chips and labels. | milestones[] |
| `quote` | Large Hebrew quotation (a sentence from a child/grandchild), word-by-word reveal, attribution. | text, by |
| `video` | Greeting video; portrait videos get a blurred, darkened copy of themselves as background; lower-third with greeter's name; music ducks. | asset, name, trimIn/out, volume |
| `video-wall` | Grid of 4–9 greeting posters, each tile plays its first 2 s muted, then one expands to full `video`. Used as the opener for the greetings chapter. | assets[] |
| `names` | "המשפחה" — circles with portraits and names drift in gently (children, grandchildren). | people[] |
| `finale` | Every photo in the show flies in to form a mosaic that resolves into "80"; confetti; final line ("עד 120, אבא"). | text |
| `black` | Black with optional tiny caption; for applause/speech moments. | caption |

**Transitions** (per slide, default per chapter): crossfade, dip-to-black, push (RTL-aware: pushes right-to-left), zoom-through.

**Visual language:** deep charcoal/midnight background, warm gold accents, cream text; thin serif rules; film grain at 4 % opacity on archival photos; consistent 80 px safe margins for TV overscan; everything laid out for 16:9 at 1920×1080 and scaled with `vw`-based tokens so a 4K TV is just sharper.

**Preload & performance:** `display` images for the next 3 slides decoded via `createImageBitmap`; videos preloaded with `preload="auto"` one slide ahead; GPU-only animated properties (transform/opacity); `will-change` hints set/unset by the scheduler.

---

## 6. Editor

Three-pane layout, RTL, Hebrew UI labels, keyboard-first.

1. **Library (right pane, since RTL):** virtualized thumbnail grid of all assets; filters for type / year range / folder / "not used yet"; multi-select; drag to storyboard or press `A` to append as `photo` slides; press `C` with several selected to create a `collage`. Hover shows date, dimensions, filename. Badge shows how many times an asset is used.
2. **Storyboard (bottom):** horizontal strip of chapters, each a sortable row of slide cards (dnd-kit), with duration badges and a running total ("23:40"). Drag between chapters, duplicate, delete, insert chapter. Click = select; double-click = preview from here.
3. **Inspector (left):** form per slide type — Hebrew caption inputs (`dir="rtl"`), focal-point picker (click on the image), Ken Burns direction picker, duration, transition, advance mode; video trim with scrubbable range slider and the poster; chapter-level music assignment (track, start offset, fade), per-chapter default duration/transition.
4. **Preview (center):** the real show engine rendering the selected slide at 16:9; "▶ play from here" opens `/show?from=<slideId>`.
5. **Music panel:** list of tracks with duration and peaks; chapters bind to tracks; the editor shows where a track will run out relative to the chapter's total duration.
6. **Persistence:** every change is debounced 500 ms and saved via `PUT /api/show`; the server writes atomically and keeps a backup per save (pruned to the last 200). `Ctrl+Z/Ctrl+Y` undo via a zustand temporal middleware.
7. **Sanity checks panel:** warnings such as "slide 14 has no asset", "chapter 3 music is 2:10 shorter than its slides", "video נועה.mp4 is still transcoding".

---

## 7. Data model (`data/show.json`, validated with zod on both sides)

```ts
type Show = {
  version: 1
  meta: { title: string; subtitle?: string; date: string; language: 'he' }
  settings: {
    defaultSlideSeconds: number          // e.g. 6
    defaultTransition: TransitionId
    duckLevel: number                    // 0.1
    safeMarginPx: number                 // 80
    theme: 'midnight-gold'
  }
  music: Array<{ id: string; assetId: string; title: string; gainDb?: number }>
  chapters: Array<{
    id: string; title: string; subtitle?: string
    musicId?: string; musicStartSec?: number
    defaults?: { seconds?: number; transition?: TransitionId; kenBurns?: KenBurnsPreset }
    slides: Slide[]
  }>
}
type Slide =
  | { id; type: 'intro'; title; subtitle?; seconds }
  | { id; type: 'chapter'; heroAssetId; label; blurb?; seconds }
  | { id; type: 'photo'; assetId; caption?; year?; focal?: [x, y]; kenBurns?; seconds; advance: 'auto'|'manual'; transition? }
  | { id; type: 'photo-pair'; assetIds: [string, string]; caption?; seconds }
  | { id; type: 'collage'; assetIds: string[]; caption?; heroIndex?; seconds }
  | { id; type: 'timeline'; milestones: Array<{ year; label; assetId? }>; seconds }
  | { id; type: 'quote'; text; by?; seconds }
  | { id; type: 'video'; assetId; name; trimIn?; trimOut?; volume?; hold?: boolean }
  | { id; type: 'video-wall'; assetIds: string[]; seconds }
  | { id; type: 'names'; people: Array<{ name; assetId? }>; seconds }
  | { id; type: 'finale'; text; seconds }
  | { id; type: 'black'; caption?; advance: 'manual' }
```

Assets live in `.cache/index.json` (derived, regenerable); the show references them only by id. Deleting the cache never loses editing work.

---

## 8. Show-night operations (to be written up in `docs/RUNBOOK.md` on day 4)

- Laptop on mains power; Windows power plan "Best performance"; Focus Assist on; Windows Update paused; all other apps closed.
- `npm run show` → Chrome opens `http://localhost:4000/show` with `--kiosk --autoplay-policy=no-user-gesture-required`; the Start button still exists so the AudioContext is unlocked by a real click.
- Display: **extend**, not duplicate. TV = 1920×1080 or 3840×2160 at 100 % scaling, `/show` on the TV, `/presenter` on the laptop.
- Audio out via HDMI to TV/sound system; test one greeting video and one music track for level before guests sit down.
- Backup: `show-backup.mp4` (OBS recording of the rehearsal run) + VLC on the laptop and on a USB stick.
- Print a one-page cheat-sheet of the keyboard controls.

---

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| HEIC photos fail to decode | Fallback chain (§2.4); tested on the first real iPhone photo; worst case Ohad exports JPEG from iPhone Photos. |
| WhatsApp videos with odd codecs/rotation metadata | Everything re-encoded by ffmpeg at ingest; the show never plays an original file. |
| Thousands of photos make the editor sluggish | Virtualized grid, 400 px thumbs, server-side filtering, blur placeholders. |
| Hebrew letter animation breaks (SplitText RTL) | Day-1 spike; fallback to word-level reveal. |
| Music ends before a chapter does | Editor warning + automatic seamless loop with 2 s crossfade. |
| Laptop/TV surprise on the night | Rehearsal on the real hardware on day 4; backup MP4. |
| Scope creep from "it would be nice if…" | Days 0–2 are engine + editor only; visual extras are a day-3 list ranked by impact; anything not done by Wed evening is cut. |

---

## 10. Build schedule

| Day | Goal | Done when |
|---|---|---|
| **Sun 18 (today)** ✅ done | Scaffold repo (Vite + React + TS, plain CSS design system instead of Tailwind, Fastify server, SQLite via `node:sqlite`, scripts). Ingest pipeline for images + video + music with generated sample media. | `npm run dev` shows photos from `media/photos` with music in the browser. **Verified** (see docs/AUDIT.md). |
| **Mon 19** ✅ done early | Full engine: all 12 slide types, 4 transitions, video playback + ducking, keyboard/clicker control, preloader, `/show?from=`. Word-level Hebrew reveals (no SplitText dependency). | The demo `show.json` plays end to end with photos, greeting videos and music. **Verified headlessly, 46 slides, 0 errors.** |
| **Tue 20** ✅ done early | Editor: virtualized library, drag-and-drop storyboard, inspector, preview with focal point, music waveform, autosave + DB versions + backups, undo/redo, sanity checks, settings, presenter view. | Ohad can build the real show without touching JSON. **Verified.** Remaining for Tue: Ohad's hands-on pass and any UX fixes he asks for. |
| **Wed 21** | Visual polish pass on every slide type (typography, color, motion curves, grain, lower-thirds), finale + intro, presenter view, ingest the real library. Ohad authors content in parallel. | The show looks like the thing we promised. |
| **Thu 22** | Rehearsal on the actual laptop + TV, bug fixes, timing adjustments, OBS backup recording, runbook, USB stick. | Two clean full runs. |
| **Fri 23** | Buffer. No new features. | — |

---

## 11. What I need from Ohad

1. **Media drops** (any time from today): photos into `media/photos/` (sub-folders by decade or event help the automatic ordering), greeting videos into `media/videos/greetings/` named with the greeter's Hebrew name, music into `media/music/`.
2. **Skeleton of the story:** chapter list (e.g. ילדות · צבא · החתונה · הילדים · העבודה · הנכדים · היום), key years (birth 1946?, wedding, children's births), 3–5 family quotes.
3. **Hardware facts:** laptop model/GPU, TV or projector resolution, audio path (TV speakers / sound bar), whether there is a clicker.
4. **Length target:** default assumption is 20–30 minutes total, ~6 s per photo slide, greetings played in full.
5. **Tone decisions:** music style (Israeli classics vs. instrumental), whether the finale ends on a photo of Yehuda today or on a family group photo.

---

## 12. Assumptions in force until told otherwise

- Playback happens from this Windows laptop; no need to run on a Mac or a phone.
- Chrome or Edge (Chromium) is the browser; Firefox/Safari untested.
- Hebrew only inside the show; no English/Russian subtitles.
- One show file; no multi-user editing.
- No cloud, no accounts, no analytics.

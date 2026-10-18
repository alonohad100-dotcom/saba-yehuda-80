# Auto-create a show from a photo library — inspection and plan

**Feature:** pick a library (a folder, several folders, a year range), press one button, get a complete, varied, non-repeating show with greeting videos placed well, and then edit every part of it like any hand-built show.
**Status (18 Oct 2026, evening):** implemented and audited. Phases A, B and C are complete and verified headlessly (see docs/AUDIT.md, section "Auto-create"). Phase D (faces) is wired as an optional loader that activates when `models/ultraface-rfb-320.onnx` and `onnxruntime-node` are present; it was not exercised because no model file was downloaded. Deviations from the plan below: the duplicate threshold was tightened to Hamming ≤ 2 plus matching exposure and aspect ratio after calibration; "replace" keeps only locked items (hand-made unlocked slides are replaced, the previous version is saved first); the generator rescales its photo budget and slows pacing instead of repeating photos when the library is small.

---

## 1. What "smart" has to mean here

The request names four things. Each maps to a concrete mechanism, because "smart" that cannot be explained cannot be tuned when the real photos arrive.

| Requirement | Mechanism | Where it lives |
|---|---|---|
| Never show the same photo twice, including the same moment shot three times | Perceptual hash (dHash) on every photo at ingest; union-find clustering into **duplicate groups** (visually identical) and **burst groups** (same scene, seconds apart); the generator uses one photo per group | ingest + DB + generator |
| Pick good photos | Quality score from sharpness, exposure, entropy and resolution; blurry or black frames fall to the bottom; adaptive threshold so a small library is not emptied | ingest + generator |
| Cover the whole life, not just the decade with 900 iPhone photos | Stratified sampling: chapters sized by √(count), photos picked per time bin inside each chapter, folder coverage enforced | generator |
| Visual variety across pages | A page grammar (sequence patterns), 8 collage layouts chosen by the photos' orientations, rule "no two identical layouts in a row", Ken Burns direction rotation, transition rhythm | generator + renderer |
| Greeting videos embedded well | Two modes: one greetings chapter with a video-wall opener, or interleaved at chapter boundaries every N minutes; never two videos back to back; short clips found inside photo folders are treated as photos in the flow | generator |
| Fits the evening | Duration budget drives how many photos are chosen; music assigned so the track is at least as long as the chapter | generator |
| Fully editable afterwards | The output is ordinary chapters and slides. Added on top: lock a slide or chapter, regenerate around locks, "replace with a similar photo", "shuffle layout", single undo step | store + editor |
| Explainable | A report with every decision: what was dropped and why, what was grouped, per-chapter counts, warnings | wizard |

---

## 2. Inspection of the current code (what exists, what is missing)

| Area | Today | Gap for this feature |
|---|---|---|
| `server/ingest/images.ts` | width, height, EXIF date, attention focal point; derivatives 2560 / 400 / blur | No perceptual hash, no quality metrics, no colour profile, no faces. All can be computed from the existing 400 px thumbnail, so **old libraries can be upgraded without re-reading originals** |
| `server/db.ts` `assets` table | id, type, path, dims, duration, year, focal, peaks, loudness, status | Needs 10 new columns + a migration path (`PRAGMA table_info` → `ALTER TABLE ADD COLUMN`) and two new tables (`analysis_runs`, `autoshow_runs`) |
| `server/ingest/index.ts` | one pass: scan → hash → derive; videos sequential | Needs a second, incremental **analysis pass** (assets missing `dhash`) and a **grouping pass** (clusters over the whole library after every ingest) |
| `shared/model.ts` `Asset` | 20 fields | add `dhash`, `quality`, `sharpness`, `luma`, `colorfulness`, `faceCount`, `faceBox`, `dupGroup`, `burstGroup`, `isBest` |
| `shared/model.ts` `Slide` | 12 types; `collage` has only `heroIndex` | add `collage.layout` (8 templates), `locked?: boolean` on `Base`, `auto?: { run: string }` provenance on `Base`; `Chapter.locked?` |
| `src/show/slides.ts` + CSS `.grid.n2…n6` | one collage grid per count | 8 layout templates keyed by `layout`, chosen by orientation mix |
| `scripts/seed-demo-show.mjs` | naive generator used for the demo show (decade buckets, first 6 photos, fixed captions) | becomes the throw-away prototype; the real generator is `shared/autoshow/` (pure TypeScript, deterministic by seed, unit-tested) |
| `src/store/show.ts` | `addSlides`, `addChapter`, `replace`, zundo history | add `applyGeneration(plan, mode)` as **one** history entry; `setLocked`; `replaceAssetInSlide` |
| `src/editor/TopBar.tsx`, `Dialogs.tsx` | 4 dialogs | add the **Auto-create wizard** dialog (4 steps) and a "fill chapter" entry in the chapter inspector |
| `src/editor/Library.tsx` | filters: type, decade, folder, unused, search | add "hide duplicates" (default on) with a ×N badge on the kept photo, a blur badge, and a "quality" sort |
| `src/editor/checkRules.ts` | 12 rules | add: same photo used twice, near-duplicates used in the same chapter, chapter longer than 6 min, two videos adjacent |
| `scripts/sample-media.ts` | 38 distinct generated photos | add deliberate near-duplicates, a burst of 5, a blurry and a dark frame, two short clips inside a photo folder, so the feature is testable before the real library |

Nothing in the show engine (`src/show/engine.ts`) changes. Nothing in the API contract changes except two new routes.

---

## 3. Design

### 3.1 Asset analysis (server, incremental)
Runs after every ingest for assets lacking `dhash`, reading `.cache/img/<id>.thumb.webp` (400 px). Cost ≈ 8 ms per photo on this laptop, so 3,000 photos ≈ 25 s with the worker pool.

- **dHash 64-bit:** `sharp(thumb).greyscale().resize(9, 8, { fit: 'fill' }).raw()` → compare each pixel to its right neighbour → 64 bits, stored as 16 hex chars.
- **Quality:** `sharp.stats()` already returns `sharpness`, `entropy`, per-channel mean and stdev, `dominant`. Score = `0.45·norm(sharpness) + 0.25·norm(entropy) + 0.15·exposure(luma) + 0.15·norm(log(pixels))`, where `exposure` penalises mean luma < 35 or > 225. `isBest` is set per group (see below).
- **Colourfulness** (Hasler–Süsstrunk approximation from channel stats) distinguishes true black-and-white scans from colour photos; used only for grain and for the "era look" of collages.
- **Faces (phase D, optional):** `onnxruntime-node` 1.30 (prebuilt for win32, no compiler) with the UltraFace-RFB-320 model (1.2 MB, Apache-2, bundled in `models/`). Output: `faceCount`, largest face box → overrides the attention focal point when a face exists. If the runtime fails to load, the pass is skipped and everything else still works.
- **Grouping** (whole library, after analysis, < 1 s for 3,000 photos): union-find with Hamming distance on dHash. `dupGroup`: distance ≤ 6. `burstGroup`: distance ≤ 14 **and** same folder **and** `takenAt` within 90 s (falls back to file name sequence when EXIF is missing). The best-quality member of each dup group gets `isBest = true`.

New DB columns on `assets`: `dhash TEXT, quality REAL, sharpness REAL, luma REAL, colorfulness REAL, face_count INTEGER, face_box TEXT, dup_group TEXT, burst_group TEXT, is_best INTEGER`. Migration adds missing columns at `openDb()`; existing rows are analysed lazily by the next ingest.

New API: `POST /api/analyze` (runs analysis + grouping, streams progress on the existing SSE channel) and `GET /api/groups` (dup/burst groups with members, for the library badges and the wizard's report).

### 3.2 The generator (`shared/autoshow/`, pure TypeScript)

`generate(input: { assets, options, existing?: Show, seed }) → { show: Show, report: Report }`. No I/O, deterministic for a given seed, so "regenerate" with a new seed gives a different but equally valid show, and unit tests can assert invariants.

**Options** (the wizard's fields):

| Group | Option | Default |
|---|---|---|
| Source | folders (multi-select tree with counts), year range, include greetings, include short clips from photo folders (< 20 s), exclude low quality | all · all · yes · yes · yes |
| Shape | target duration 10–45 min, chapter mode (auto / by folder / by decade), pacing (calm 7 s · normal 6 s · dynamic 4.5 s), collage density (none / some / many), then-and-now pair, timeline slide, quote placeholders, names slide from face-rich photos | 22 min · auto · normal · some · yes · yes · no · no |
| Greetings | mode (one chapter + video-wall / interleave every N min), position of the greetings chapter (before finale / after intro) | one chapter · before finale |
| Music | assignment (round-robin / one track for all / none), prefer a track at least as long as its chapter | round-robin · yes |
| Story facts | birth year, wedding year, names of children (optional; feed the timeline and captions) | empty |

**Pipeline** (each stage writes to the report):

1. **Pool.** Filter by source. Drop `status ≠ ready`. Keep one photo per `dupGroup` (the `isBest`). Collapse bursts to the best 1, or best 2 if the burst has more than 6 photos and the chapter is short of material. Drop quality below an adaptive threshold: the 15th percentile of the pool, never dropping below 60 % of the pool.
2. **Chapters.** `auto` mode: an event folder (name contains a 4-digit year or ≥ 8 photos inside ± 3 days) becomes its own chapter titled from the folder ("חתונה · 1966"); everything else is bucketed by decade ("שנות ה־50"), with merging so every chapter has ≥ 6 photos and ≤ 40 candidates. Chapter order is chronological.
3. **Budget.** `photoSeconds = target − intro − timeline − finale − Σ video durations − chapters × 6`. Each chapter gets a share proportional to `√(candidates)` (large eras do not dominate), clamped to [4, 18] photo-equivalents, where a collage of n photos counts as 1.5 and a pair as 1.2.
4. **Selection inside a chapter.** Split the chapter's time span into k bins (k = its share); in each bin take the highest-scored photo that is at Hamming distance ≥ 10 from everything already chosen (diversity) and that keeps every source folder represented at least once. Faces add +0.1 to the score; portrait orientation is capped at 40 % of a chapter's singles (portraits go to pairs and collages instead).
5. **Page grammar.** Chapter slide, then a pattern drawn by the seed from: `P P C P Pr P C` · `P C P P C` · `P P P C P` where P = single photo, C = collage, Pr = pair. Constraints: no two collages adjacent; the chapter's first and last content slides are singles; a video never follows a video; Ken Burns direction cycles in → left → out → right → up; transition is `dip` into a chapter, `fade` elsewhere, `push` once per chapter at most.
6. **Collage composition.** Layout chosen from the orientation mix of the 3–6 photos drawn for it: `hero-right`, `hero-left`, `two-up`, `triptych`, `one-plus-three`, `four-grid`, `filmstrip` (portraits), `mosaic-6`. Rule: a layout is not reused until three other layouts have appeared. Hero = highest score with a face.
7. **Pairs.** "Then and now": the earliest and latest high-score photos with faces, once, in the last chapter. Optionally one pair per chapter from two photos of the same bin.
8. **Videos.** Greetings (folder `videos/greetings`) go to a chapter "ברכות" opened by a video-wall of their posters, or are interleaved at chapter boundaries every N minutes. Short clips inside photo folders flow as `video` slides with the photo's year, `hold: false`, volume 1, never adjacent to another video.
9. **Captions and notes.** Caption = chapter-level caption template (year only, or "folder · year"); presenter notes = original file name and folder so Ohad can replace the placeholder text quickly. Chapter blurbs are left for Ohad (a check reminds him).
10. **Music.** Tracks assigned round-robin; when a track is shorter than its chapter the generator prefers a longer one; otherwise the engine's crossfade loop covers it and the report says so.
11. **Frame.** Intro from `meta`, timeline from chapter starts plus the story facts, finale "עד 120" with the mosaic drawn from the chosen photos, closing black slide.
12. **Report.** Pool size, duplicates removed (with thumbnails), bursts collapsed, low-quality dropped, chosen vs unused per chapter, estimated duration vs target, warnings.

**Invariants the unit tests assert:** no asset id used twice; no two slides with the same dup group in one chapter; no two adjacent collages; no identical layout within 3; no adjacent videos; every greeting used exactly once; total duration within ±10 % of target when the pool allows; locked slides preserved verbatim on regenerate.

### 3.3 Applying and editing afterwards

- **Apply modes:** replace the whole show (a labelled version "לפני יצירה אוטומטית" is saved first); append the generated chapters after a chosen chapter; fill one existing chapter (keeps its title and music).
- **One undo step:** `applyGeneration` mutates once, so Ctrl+Z reverts the whole generation.
- **Locks:** a lock icon on slides and chapters. Regenerate reads `existing` and keeps locked items in place; unlocked auto-generated items are replaced; hand-made items (no `auto` tag) are always kept.
- **Replace with a similar photo** (photo inspector): picks the best unused photo from the same chapter span with Hamming distance ≥ 10, one click; also available as "shuffle" for collages (new photos or new layout).
- **Library:** duplicates hidden behind the kept photo with a ×N badge and a "show all" toggle; a blur badge; the wizard's report links to the library filtered to "dropped".
- **Checks:** new rules fire for duplicate usage, long chapters and adjacent videos, so a hand edit after generation is still guarded.

---

## 4. Change list by file

| File | Change |
|---|---|
| `shared/model.ts` | Asset fields; `Slide` base gets `locked?`, `auto?`; `collage.layout` enum; `Chapter.locked?`; `COLLAGE_LAYOUTS` constant |
| `shared/autoshow/pool.ts` | filtering, dedup, burst collapse, adaptive quality threshold |
| `shared/autoshow/chapters.ts` | chapter detection and merging, titles in Hebrew |
| `shared/autoshow/select.ts` | budget, stratified diverse selection |
| `shared/autoshow/sequence.ts` | page grammar, Ken Burns and transition rhythm, video placement |
| `shared/autoshow/collage.ts` | layout choice by orientation mix, hero choice |
| `shared/autoshow/generate.ts` | orchestration, locks, report |
| `shared/autoshow/prng.ts` | seeded PRNG (mulberry32) |
| `shared/autoshow/*.test.ts` | invariant tests (run with `node --test` through `tsx`) |
| `server/ingest/analyze.ts` | dHash, stats, colourfulness, optional faces; incremental pass over thumbs |
| `server/ingest/groups.ts` | union-find grouping, `is_best` |
| `server/ingest/index.ts` | call analysis + grouping after processing; progress phases `analyze`, `group` |
| `server/db.ts` | columns + migration; `listGroups()`; `kv` for wizard options |
| `server/index.ts` | `POST /api/analyze`, `GET /api/groups` |
| `src/show/slides.ts` | collage renderer reads `layout`; portraits get `object-position` from focal |
| `src/styles/global.css` | 8 `.grid.l-*` templates; lock badge; duplicate badge |
| `src/store/show.ts` | `applyGeneration`, `setLocked`, `replaceAssetInSlide`, `shuffleCollage` |
| `src/editor/AutoShowDialog.tsx` | 4-step wizard: source → shape → preview/report → apply |
| `src/editor/TopBar.tsx` | "✦ צור אוטומטית" button |
| `src/editor/Inspector.tsx` | lock toggle; "replace with similar"; collage layout picker; "fill chapter" in chapter inspector |
| `src/editor/Library.tsx` | hide-duplicates filter, ×N and blur badges, quality sort |
| `src/editor/checkRules.ts` | 4 new rules |
| `scripts/sample-media.ts` | near-duplicates, a burst, blurry and dark frames, two short clips in a photo folder |
| `scripts/autoshow-dryrun.mjs` | generate from the live library and print the report without applying |
| `package.json` | optional dependency `onnxruntime-node`; `models/ultraface-rfb-320.onnx` committed; `npm test` |
| `docs/PLAN.md`, `docs/AUDIT.md` | updated after implementation |

---

## 5. Wizard UI (the editable, high-quality part)

Step 1 **מקור** — folder tree with photo counts and thumbnails, year range slider with a histogram of photos per year, toggles for greetings and short clips, a live counter "412 photos → 318 after duplicates and quality".
Step 2 **צורה** — target duration slider with a live estimate of slides and chapters; chapter mode; pacing; collage density; pairs, timeline, names, quotes toggles; greetings mode; music mode; story facts.
Step 3 **תצוגה מקדימה** — chapter table (title, years, photos chosen / available, duration, music), a filmstrip of the first 12 pages rendered with the real slide renderer, the report with the dropped photos (thumbnails, reason), warnings. Buttons: "צור מחדש" (new seed), "חזרה".
Step 4 **החלה** — replace / append after chapter X / fill chapter X. Shows "a labelled version will be saved first". After apply: toast with the undo hint and the storyboard scrolled to the first generated chapter.

Options persist in the `kv` table, so a second run starts from the previous choices.

---

## 6. Performance and limits

| Item | Expected |
|---|---|
| Analysis of 3,000 photos from thumbnails | ≈ 25 s, incremental afterwards |
| Faces for 3,000 photos (phase D) | ≈ 2 min once |
| Grouping (3,000² Hamming comparisons) | < 1 s |
| Generation (client, pure) | < 200 ms; preview filmstrip renders lazily |
| Wizard with 3,000 thumbnails | virtualized like the library; folder tree shows counts only |

---

## 7. Risks

- **False duplicates** on dark or flat scans with dHash: threshold 6 is conservative; the library always shows the hidden members behind the kept one, and the user can un-hide. No photo is ever deleted or modified.
- **Faces runtime** (`onnxruntime-node`) ships a native binary; it is an optional dependency and the feature degrades to the attention focal point if it fails to load. The model file is committed so the laptop needs no internet.
- **Hebrew folder names as chapter titles** need sanitising (strip dates, underscores, "IMG", "WhatsApp").
- **Over-automation**: captions are deliberately minimal (years) so the generated show is a strong first draft, not a wrong story; the checks panel reminds Ohad which captions and chapter blurbs are still empty.

---

## 8. Phases, acceptance tests and time

| Phase | Work | Acceptance | Time |
|---|---|---|---|
| **A · analysis** | analyze.ts, groups.ts, DB migration, API, library badges and hide-duplicates filter, sample media with dups and bursts | after `npm run ingest`, the sample's 4 near-duplicates collapse to 1 kept photo with a ×4 badge; the blurry frame gets a blur badge; re-run costs seconds | 3–4 h |
| **B · generator + wizard** | shared/autoshow (pool, chapters, select, sequence, collage, generate) with tests; wizard steps 1–4; applyGeneration; dry-run script | tests pass; from the sample library the wizard produces a 20 min show with 5+ chapters, 3+ collage layouts, all 6 greetings once, zero repeated assets; Ctrl+Z reverts in one step | 5–6 h |
| **C · editing power** | locks, regenerate around locks, replace-with-similar, shuffle collage, collage layout picker, new checks | lock two slides, regenerate with a new seed → both stay; "replace with similar" never picks a used or duplicate photo | 2–3 h |
| **D · faces (optional)** | onnxruntime + UltraFace, face-aware focal and hero, names slide suggestion | focal point lands on the face on the sample photos that have a drawn face region; generation still works with the runtime removed | 2 h |

Total: about 1.5 working days. Recommended order given the event on 23–24 Oct: A and B on Monday 19, C on Tuesday 20 morning, D only if the real photos are in by then and time remains.

---

## 9. Decision needed from Ohad

1. Default greetings placement: one chapter before the finale (recommended) or interleaved?
2. Should chapters follow your folders when they look like events (recommended "auto"), or always decades?
3. Is phase D (faces) worth 2 hours before the event, or after?

Say "go" and I start with phase A.

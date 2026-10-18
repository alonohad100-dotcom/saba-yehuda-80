import { type Asset, type Chapter, type Show, type Slide, slideSeconds, slideAssetIds, uid } from '../model';
import type { GenInput, GenOutput, GenReport, ChapterReport } from './types';
import { PACING_SECONDS } from './types';
import { mulberry32 } from './prng';
import { buildPool, timeOf } from './pool';
import { planChapters, type ChapterPlan } from './chapters';
import { budget, selectPhotos, score } from './select';
import { sequenceChapter, type SeqCtx } from './sequence';

const HEB_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** Pure, deterministic for (assets, options, existing). Produces a complete show or one filled chapter plus a report. */
export function generate(input: GenInput): GenOutput {
  const { assets, options: o, settings, meta, existing } = input; const mode = input.mode ?? 'replace';
  const rng = mulberry32(o.seed); const runId = `auto-${(o.seed >>> 0).toString(36)}`; const auto = { run: runId };
  const byId = Object.fromEntries(assets.map(a => [a.id, a])); const warnings: string[] = [];

  // ---- what survives from the existing show ----
  const keptChapters: { index: number; chapter: Chapter }[] = []; const keptSlides: Slide[] = []; const excludeIds = new Set<string>(); let fillChapter: Chapter | undefined;
  if (existing) {
    if (mode === 'fill') {
      fillChapter = existing.chapters.find(c => c.id === input.fillChapterId);
      for (const c of existing.chapters) for (const s of c.slides) { if (c === fillChapter) { if (s.locked || !s.auto) keptSlides.push(s); else continue; } for (const id of slideAssetIds(s)) excludeIds.add(id); }
    } else existing.chapters.forEach((c, index) => { // replace: only what is explicitly locked survives (a labelled version is saved before applying)
      if (c.locked) { keptChapters.push({ index, chapter: c }); for (const s of c.slides) for (const id of slideAssetIds(s)) excludeIds.add(id); return; }
      for (const s of c.slides) if (s.locked) { keptSlides.push(s); for (const id of slideAssetIds(s)) excludeIds.add(id); }
    });
  }
  const pool = buildPool(assets, o, excludeIds);
  if (!pool.photos.length) warnings.push('לא נמצאו תמונות מתאימות במקור שנבחר');

  // ---- chapters and budget ----
  let plans: ChapterPlan[];
  if (mode === 'fill') { const ys = pool.photos.map(p => p.year ?? 2000); plans = pool.photos.length ? [{ id: 'fill', title: fillChapter?.title ?? 'פרק', subtitle: fillChapter?.subtitle ?? `${Math.min(...ys)}–${Math.max(...ys)}`, yearFrom: Math.min(...ys), yearTo: Math.max(...ys), photos: pool.photos, clips: pool.clips, event: false }] : []; }
  else plans = planChapters(pool.photos, pool.clips, o);
  const greetings = pool.greetings; const greetSecs = greetings.reduce((t, g) => t + (g.duration ?? 8), 0);
  const fixed = (mode === 'fill' ? 0 : 8 + (o.timeline ? 14 : 0) + 14) + greetSecs + (o.greetingsMode === 'chapter' && greetings.length >= 2 ? 8 : 0) + plans.length * 6 + pool.clips.reduce((t, v) => t + (v.duration ?? 5), 0) + (o.quotes ? plans.length * 9 : 0);
  let units = budget(plans, o, fixed);
  const maxUnits = (plan: ChapterPlan) => (plan.photos.length >= 6 ? plan.photos.length - 1 : plan.photos.length); // keep one photo spare for the chapter cover

  // ---- content chapters: build, measure, and rescale the photo budget until the length lands near the target ----
  let usedIds = new Set<string>(); let reports: ChapterReport[] = []; let content: Chapter[] = []; let ctx: SeqCtx = null as unknown as SeqCtx;
  const build = () => {
    usedIds = new Set(); reports = []; ctx = { rng, options: o, runId, layoutHistory: [], kb: 0, layoutsUsed: {}, pacing: PACING_SECONDS[o.pacing] };
    content = plans.map((plan, i) => {
      const photos = selectPhotos(plan, Math.min(units[i], maxUnits(plan)), rng);
      const slides = sequenceChapter(plan, photos.slice(), ctx);
      for (const s of slides) for (const id of slideAssetIds(s)) usedIds.add(id);
      const ch: Chapter = { id: uid('ch'), title: plan.title, subtitle: plan.subtitle, slides, auto };
      reports.push({ id: ch.id, title: plan.title, yearFrom: plan.yearFrom, yearTo: plan.yearTo, candidates: plan.photos.length, chosen: photos.length, collages: slides.filter(s => s.type === 'collage').length, seconds: 0, event: plan.event });
      return ch;
    });
    return content.reduce((t, ch) => t + ch.slides.reduce((u, s) => u + slideSeconds(s, ch, settings, byId), 0), 0);
  };
  const target = o.targetMinutes * 60;
  for (let pass = 0; pass < 4; pass++) {
    const est = build() + (fixed - plans.length * 6 - pool.clips.reduce((t, v) => t + (v.duration ?? 5), 0)); // chapter cards and clips are already inside the content
    const ratio = target / Math.max(1, est); if (Math.abs(1 - ratio) <= 0.06) break;
    const next = units.map((u, i) => Math.max(Math.min(4, plans[i].photos.length), Math.min(maxUnits(plans[i]), Math.round(u * ratio))));
    if (next.every((u, i) => u === units[i])) break; units = next;
  }
  for (const r of reports) if (r.chosen < 4) warnings.push(`הפרק „${r.title}” קיבל רק ${r.chosen} תמונות`);
  // photos ran out before the target length: slow the pacing a little rather than repeat a photo (photo ≤ 9.5 s, pair ≤ 11 s, collage ≤ 14 s)
  {
    const contentSecs = content.reduce((t, ch) => t + ch.slides.reduce((u, s) => u + slideSeconds(s, ch, settings, byId), 0), 0);
    const est = contentSecs + fixed - plans.length * 6 - pool.clips.reduce((t, v) => t + (v.duration ?? 5), 0);
    if (mode !== 'fill' && est < target * 0.92 && contentSecs > 0) {
      const factor = Math.min(1.6, (target - (est - contentSecs)) / contentSecs);
      for (const ch of content) for (const s of ch.slides) { if (s.type === 'photo') s.seconds = Math.min(9.5, Math.round((s.seconds ?? 6) * factor * 2) / 2); else if (s.type === 'photo-pair') s.seconds = Math.min(11, Math.round((s.seconds ?? 7) * factor * 2) / 2); else if (s.type === 'collage') s.seconds = Math.min(14, Math.round((s.seconds ?? 9) * factor * 2) / 2); }
    }
  }

  // ---- then & now, names ----
  if (o.pairs && content.length && pool.photos.length >= 6 && mode !== 'fill') {
    const unused = pool.photos.filter(p => !usedIds.has(p.id)); const faces = unused.filter(p => (p.faceCount ?? 0) > 0); const src = faces.length >= 2 ? faces : unused.length >= 2 ? unused : [];
    const a = src[0], b = src[src.length - 1];
    if (a && b && a.id !== b.id && (b.year ?? 0) - (a.year ?? 0) >= 20) { const last = content[content.length - 1]; last.slides.push({ id: uid(), type: 'photo-pair', assetIds: [a.id, b.id], caption: 'אז · והיום', seconds: 8, auto, notes: `${a.name} ↔ ${b.name}` }); usedIds.add(a.id).add(b.id); }
  }
  if (o.names && mode !== 'fill') {
    const facePhotos = pool.photos.filter(p => (p.faceCount ?? 0) > 0 && !usedIds.has(p.id)).sort((x, y) => score(y) - score(x)).slice(0, 8);
    if (facePhotos.length >= 3) { content[content.length - 1].slides.push({ id: uid(), type: 'names', title: 'המשפחה', people: facePhotos.map(p => ({ name: '', assetId: p.id })), seconds: 9, auto, notes: 'למלא שמות' }); facePhotos.forEach(p => usedIds.add(p.id)); }
    else warnings.push('שקופית שמות לא נוצרה: אין מספיק תמונות עם זיהוי פנים (דורש את מודל הפנים)');
  }

  // ---- greetings ----
  const videoSlide = (g: Asset): Slide => ({ id: uid(), type: 'video', assetId: g.id, name: g.name.replace(/\.[^.]+$/, ''), relation: '', hold: false, auto, notes: g.relPath });
  let greetChapter: Chapter | undefined;
  if (greetings.length && mode !== 'fill') {
    if (o.greetingsMode === 'chapter') {
      const slides: Slide[] = []; if (greetings.length >= 2) slides.push({ id: uid(), type: 'video-wall', title: 'ברכות', assetIds: greetings.slice(0, 9).map(g => g.id), seconds: 8, auto });
      slides.push(...greetings.map(videoSlide)); greetChapter = { id: uid('ch'), title: 'ברכות', slides, auto };
    } else {
      let since = 0; let gi = 0;
      for (const ch of content) { since += ch.slides.reduce((t, s) => t + slideSeconds(s, ch, settings, byId), 0); if (since >= o.greetingsEveryMin * 60 && gi < greetings.length && insertVideoSafely(ch, videoSlide(greetings[gi]))) { gi++; since = 0; } }
      let guard = 0; while (gi < greetings.length && content.length && guard++ < 200) { const ch = content[(content.length - 1 - (guard % content.length) + content.length) % content.length]; if (insertVideoSafely(ch, videoSlide(greetings[gi]))) gi++; }
      if (gi < greetings.length) warnings.push(`${greetings.length - gi} ברכות לא שולבו: אין מספיק תמונות ביניהן`);
    }
    greetings.forEach(g => usedIds.add(g.id));
  } else if (o.includeGreetings && mode !== 'fill' && !greetings.length) warnings.push('לא נמצאו סרטוני ברכה ב־media/videos/greetings');

  // ---- music ----
  const tracks = pool.music.slice().sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0)); const lastUse = new Map<string, number>(); let useCounter = 0;
  const assignMusic = (ch: Chapter) => {
    if (o.musicMode === 'none') return; if (o.musicMode === 'single') { ch.musicId = o.musicId ?? tracks[0]?.id; return; }
    if (!tracks.length) return; const secs = ch.slides.reduce((t, s) => t + slideSeconds(s, ch, settings, byId), 0);
    const long = o.preferLongTrack ? tracks.filter(t => (t.duration ?? 0) >= secs) : tracks; const cands = long.length ? long : tracks;
    const t = cands.slice().sort((a, b) => (lastUse.get(a.id) ?? -1) - (lastUse.get(b.id) ?? -1))[0]; ch.musicId = t.id; lastUse.set(t.id, useCounter++);
    if ((t.duration ?? 0) < secs) warnings.push(`בפרק „${ch.title}” המוזיקה קצרה מהפרק — תתבצע חזרה עם crossfade`);
  };
  if (mode === 'fill') { const ch = content[0]; if (ch && fillChapter) { ch.id = fillChapter.id; ch.title = fillChapter.title; ch.subtitle = fillChapter.subtitle; ch.musicId = fillChapter.musicId; ch.musicStartSec = fillChapter.musicStartSec; ch.musicLevel = fillChapter.musicLevel; ch.defaults = fillChapter.defaults; ch.slides = [...keptSlides, ...ch.slides]; } }
  if (!tracks.length && o.musicMode !== 'none') warnings.push('אין קטעי מוזיקה בספרייה');

  // ---- frame: opening and closing ----
  let chapters: Chapter[];
  if (mode === 'fill') chapters = content;
  else {
    const d = new Date(meta.date || Date.now()); const when = `${HEB_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
    const opening: Chapter = { id: uid('ch'), title: 'פתיחה', slides: [{ id: uid(), type: 'intro', title: o.personName || meta.title, subtitle: `חוגגים 80 · ${when}`, number: '80', seconds: 8, auto, notes: 'לחכות שכולם יושבים; המוזיקה מתחילה לבד' }], auto };
    if (o.timeline && content.length) {
      const ms: { year: number; label: string; assetId?: string }[] = [];
      if (o.birthYear) ms.push({ year: o.birthYear, label: 'נולד', assetId: pool.photos[0]?.id });
      if (o.weddingYear) ms.push({ year: o.weddingYear, label: 'חתונה', assetId: pool.photos.find(p => (p.year ?? 0) >= o.weddingYear!)?.id });
      for (const ch of content) { const hero = ch.slides.find(s => s.type === 'chapter'); const r = reports.find(x => x.id === ch.id)!; ms.push({ year: r.yearFrom, label: ch.title, assetId: hero && hero.type === 'chapter' ? hero.heroAssetId : undefined }); }
      ms.push({ year: (o.birthYear ?? 1946) + 80, label: '80', assetId: pool.photos[pool.photos.length - 1]?.id });
      const seen = new Set<number>(); let list = ms.filter(m => !seen.has(m.year) && seen.add(m.year)).sort((a, b) => a.year - b.year);
      while (list.length > 7) list = list.filter((_, i) => i === 0 || i === list.length - 1 || i % 2 === 0);
      opening.slides.push({ id: uid(), type: 'timeline', title: 'שמונים שנה בדקה', milestones: list, seconds: 14, auto });
    }
    const closing: Chapter = { id: uid('ch'), title: 'סיום', slides: [{ id: uid(), type: 'finale', text: 'עד 120, אבא', number: '80', seconds: 14, auto, notes: 'קונפטי — להזמין את כולם למחוא כפיים' }, { id: uid(), type: 'black', caption: '(מחיאות כפיים)', auto }], auto };
    chapters = [opening, ...(greetChapter && o.greetingsPosition === 'afterIntro' ? [greetChapter] : []), ...content, ...(greetChapter && o.greetingsPosition === 'beforeFinale' ? [greetChapter] : []), closing];
    // kept hand-made or locked slides go to the chapter whose years cover them
    for (const s of keptSlides) {
      const ids = slideAssetIds(s); const y = ids.map(id => byId[id]?.year).find(v => v != null);
      const target = (y != null && content.find(ch => { const r = reports.find(x => x.id === ch.id)!; return y >= r.yearFrom && y <= r.yearTo; })) || content[0] || opening;
      const at = target.slides.length && target.slides[target.slides.length - 1].type === 'video' ? target.slides.length - 1 : target.slides.length; target.slides.splice(at, 0, s);
    }
    for (const k of keptChapters.sort((a, b) => a.index - b.index)) chapters.splice(Math.min(chapters.length - 1, Math.max(1, k.index)), 0, k.chapter);
  }
  for (const ch of chapters) if (!ch.locked && ch.auto && !(mode === 'fill' && fillChapter?.musicId)) assignMusic(ch);
  for (const ch of chapters) { const r = reports.find(x => x.id === ch.id); if (r) { r.seconds = ch.slides.reduce((t, s) => t + slideSeconds(s, ch, settings, byId), 0); r.musicId = ch.musicId; } }

  const show: Show = mode === 'fill' && existing ? { ...existing, chapters: existing.chapters.map(c => (c.id === input.fillChapterId && content[0] ? content[0] : c)) } : { version: 1, meta: { ...meta }, settings: { ...settings }, chapters };
  const estimated = show.chapters.reduce((t, c) => t + c.slides.reduce((u, s) => u + slideSeconds(s, c, settings, byId), 0), 0);
  if (mode !== 'fill' && pool.photos.length && Math.abs(estimated - target) / target > 0.15) warnings.push(estimated < target ? `המצגת קצרה מהיעד (${Math.round(estimated / 60)} דק׳): אין מספיק תמונות מגוונות — הוסף תיקיות או הורד את היעד` : `המצגת ארוכה מהיעד (${Math.round(estimated / 60)} דק׳) בגלל אורך הברכות`);
  const report: GenReport = {
    runId, seed: o.seed,
    pool: { photosTotal: pool.photosTotal, photosAfter: pool.photos.length, clips: pool.clips.length, greetings: greetings.length, music: pool.music.length, dupRemoved: pool.dropped.filter(d => d.reason === 'dup').length, burstRemoved: pool.dropped.filter(d => d.reason === 'burst').length, lowQualityRemoved: pool.dropped.filter(d => d.reason === 'quality').length, lockedExcluded: pool.dropped.filter(d => d.reason === 'locked').length },
    dropped: pool.dropped, chapters: reports, usedPhotoIds: [...usedIds].filter(id => byId[id]?.type === 'photo'), unusedPhotoIds: pool.photos.filter(p => !usedIds.has(p.id)).map(p => p.id),
    estimatedSeconds: Math.round(estimated), targetSeconds: target, layoutsUsed: ctx.layoutsUsed, warnings,
  };
  return { show, report };
}

/** Insert a video where neither neighbour is a video; searches from the chapter's end backwards. */
function insertVideoSafely(ch: Chapter, slide: Slide): boolean {
  for (let at = ch.slides.length; at >= 1; at--) { if (ch.slides[at - 1]?.type !== 'video' && ch.slides[at]?.type !== 'video') { ch.slides.splice(at, 0, slide); return true; } }
  return false;
}

/** The best unused photo near a given one (same era, visually different), for "replace with similar". */
export function similarUnused(target: Asset, assets: Asset[], usedIds: Set<string>): Asset | undefined {
  const t = timeOf(target); const year = target.year ?? 2000;
  return assets.filter(a => a.type === 'photo' && a.status === 'ready' && a.id !== target.id && !usedIds.has(a.id) && (a.isBest ?? true) && a.dupGroup !== target.dupGroup && Math.abs((a.year ?? 2000) - year) <= 6)
    .sort((a, b) => (Math.abs(timeOf(a) - t) / 3.15e10) - (Math.abs(timeOf(b) - t) / 3.15e10) - (score(a) - score(b)))[0];
}

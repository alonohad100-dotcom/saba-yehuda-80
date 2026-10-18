import { type Asset, type Slide, type KenBurns, type CollageLayout, layoutsFor, uid } from '../model';
import type { AutoOptions } from './types';
import type { ChapterPlan } from './chapters';
import { timeOf } from './pool';
import { score } from './select';
import type { Rng } from './prng';
import { pick } from './prng';

export interface SeqCtx { rng: Rng; options: AutoOptions; runId: string; layoutHistory: CollageLayout[]; kb: number; layoutsUsed: Record<string, number>; pacing: number }
const KBS: KenBurns[] = ['in', 'left', 'out', 'right', 'up', 'down'];
const PATTERNS: Record<AutoOptions['collageDensity'], string[][]> = {
  none: [['P', 'P', 'P', 'Pr', 'P', 'P']],
  some: [['P', 'P', 'C', 'P', 'Pr', 'P', 'C'], ['P', 'C', 'P', 'P', 'C', 'P'], ['P', 'P', 'P', 'C', 'P', 'Pr']],
  many: [['P', 'C', 'P', 'C', 'P', 'Pr', 'C'], ['P', 'C', 'P', 'C', 'Pr', 'C', 'P'], ['P', 'C', 'Pr', 'C', 'P', 'C']],
};

/** Choose a layout for n photos given how many are portrait, avoiding the last three layouts used. */
export function chooseLayout(n: number, portraits: number, ctx: SeqCtx): CollageLayout {
  const all = layoutsFor(n); let fit = all;
  if (portraits >= n - 1 && n >= 3) fit = all.filter(l => l === 'filmstrip' || l === 'triptych' || l === 'mosaic-6');
  else fit = all.filter(l => l !== 'filmstrip' || portraits >= 2);
  const recent = ctx.layoutHistory.slice(-3);
  // 1. a fitting layout not used in the last three; 2. any layout for n not used recently; 3. the least recently used
  const freshFit = fit.filter(l => !recent.includes(l)); const freshAny = all.filter(l => !recent.includes(l));
  const l = freshFit.length ? pick(ctx.rng, freshFit) : freshAny.length ? pick(ctx.rng, freshAny) : all.slice().sort((a, b) => ctx.layoutHistory.lastIndexOf(a) - ctx.layoutHistory.lastIndexOf(b))[0];
  ctx.layoutHistory.push(l); ctx.layoutsUsed[l] = (ctx.layoutsUsed[l] ?? 0) + 1; return l;
}

export function sequenceChapter(c: ChapterPlan, photos: Asset[], ctx: SeqCtx): Slide[] {
  const o = ctx.options; const auto = { run: ctx.runId }; const slides: Slide[] = [];
  // hero: the best landscape photo of the chapter that is NOT one of the singles, so the cover never repeats a page
  const chosenIds = new Set(photos.map(p => p.id));
  const spare = c.photos.filter(a => !chosenIds.has(a.id)).sort((a, b) => score(b) - score(a));
  const hero = spare.find(a => !a.portrait) ?? spare[0]; // no spare photo → a typographic chapter card, never a repeated photo
  slides.push({ id: uid(), type: 'chapter', heroAssetId: hero?.id, label: c.title, blurb: '', eyebrow: c.subtitle, seconds: 6, transition: 'dip', auto, notes: `${c.photos.length} תמונות בפרק · ${c.subtitle}` });
  const pattern = pick(ctx.rng, PATTERNS[o.collageDensity]); let pi = 0; let i = 0; let pushUsed = false;
  const caption = c.event ? c.title.replace(/\s·\s\d{4}$/, '') : '';
  const photoSlide = (a: Asset): Slide => ({ id: uid(), type: 'photo', assetId: a.id, caption, year: a.year, kenBurns: KBS[ctx.kb++ % KBS.length], focal: a.focal, seconds: ctx.pacing, auto, notes: `${a.name} · ${a.folder}`, transition: (!pushUsed && ctx.rng() < 0.25) ? (pushUsed = true, 'push') : undefined });
  const remaining = () => photos.length - i;
  while (i < photos.length) {
    let tok = pattern[pi++ % pattern.length];
    if (i === 0 || remaining() <= 1) tok = 'P';                               // first and last content slides are singles
    if (tok === 'Pr' && (!o.pairs || remaining() < 3)) tok = 'P';
    if (tok === 'C' && remaining() < 4) tok = 'P';
    if (tok === 'P') { slides.push(photoSlide(photos[i++])); continue; }
    if (tok === 'Pr') { const a = photos[i], b = photos[i + 1]; i += 2; slides.push({ id: uid(), type: 'photo-pair', assetIds: [a.id, b.id], caption, seconds: ctx.pacing + 1, auto, notes: `${a.name} + ${b.name}` }); continue; }
    // collage: take 3–4 (some) or 4–6 (many) photos, preferring portraits from the next window, keeping time order
    let size = Math.min(remaining() - 1, o.collageDensity === 'many' ? 4 + Math.floor(ctx.rng() * 3) : 3 + Math.floor(ctx.rng() * 2));
    if (size === 6 && ctx.layoutHistory[ctx.layoutHistory.length - 1] === 'mosaic-6') size = 5; // six photos have only one layout; avoid showing it twice in a row
    const window = photos.slice(i, i + Math.min(remaining() - 1, size + 3));
    const portraitsFirst = window.filter(a => a.portrait).concat(window.filter(a => !a.portrait)).slice(0, size).sort((a, b) => timeOf(a) - timeOf(b));
    const ids = new Set(portraitsFirst.map(a => a.id));
    // pull the chosen ones out of the stream, leave the rest for later singles
    const rest = window.filter(a => !ids.has(a.id)); photos.splice(i, window.length, ...portraitsFirst, ...rest); i += portraitsFirst.length;
    const portraits = portraitsFirst.filter(a => a.portrait).length; const layout = chooseLayout(portraitsFirst.length, portraits, ctx);
    const heroIdx = layout.startsWith('hero') || layout === 'one-plus-three' ? Math.max(0, portraitsFirst.findIndex(a => !a.portrait && a === portraitsFirst.slice().sort((x, y) => score(y) - score(x)).find(z => !z.portrait))) : portraitsFirst.indexOf(portraitsFirst.slice().sort((x, y) => score(y) - score(x))[0]);
    slides.push({ id: uid(), type: 'collage', assetIds: portraitsFirst.map(a => a.id), caption, seconds: 8 + portraitsFirst.length * 0.6, heroIndex: Math.max(0, heroIdx), layout, auto, notes: portraitsFirst.map(a => a.name).join(' · ') });
  }
  // short clips flow by time; never next to another video
  for (const v of c.clips) {
    const t = timeOf(v); let at = slides.findIndex((s, idx) => idx > 0 && s.type === 'photo' && timeOf(photos.find(p => p.id === s.assetId)!) > t); if (at < 0) at = slides.length;
    while (at > 1 && (slides[at - 1]?.type === 'video' || slides[at]?.type === 'video')) at--; // walk back to a spot between two non-videos
    if (at <= 1 || slides[at - 1]?.type === 'video' || slides[at]?.type === 'video') continue;
    const clipName = v.name.replace(/\.[^.]+$/, '').replace(/[_\-.]+/g, ' ').replace(/(^|\s)(VID|MOV|IMG|WhatsApp|Video|PXL)(?=\s|$)/gi, ' ').replace(/\d{4,}/g, ' ').replace(/\s+/g, ' ').trim();
    slides.splice(at, 0, { id: uid(), type: 'video', assetId: v.id, name: clipName, relation: v.year ? String(v.year) : '', hold: false, volume: 1, auto, notes: `${v.name} · ${v.folder}` });
  }
  if (o.quotes) slides.splice(Math.max(1, Math.floor(slides.length / 2)), 0, { id: uid(), type: 'quote', text: 'משפט שהמשפחה אומרת עליו — לעריכה', by: '', seconds: 9, auto });
  return slides;
}

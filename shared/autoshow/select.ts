import { DHASH_DIVERSE, type Asset } from '../model';
import type { AutoOptions } from './types';
import { PACING_SECONDS } from './types';
import type { ChapterPlan } from './chapters';
import { dirOf } from './pool';
import type { Rng } from './prng';

export function hamming(a?: string, b?: string): number {
  if (!a || !b) return 64;
  const x1 = (parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0, x2 = (parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0;
  return pop(x1) + pop(x2);
}
const pop = (v: number) => { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; };

/** Photo-equivalent units per chapter: proportional to √candidates, clamped to [4, 18]. */
export function budget(chapters: ChapterPlan[], o: AutoOptions, fixedSeconds: number): number[] {
  const p = PACING_SECONDS[o.pacing];
  const units = Math.max(chapters.length * 4, (o.targetMinutes * 60 - fixedSeconds) / p);
  const w = chapters.map(c => Math.sqrt(Math.max(1, c.photos.length))); const W = w.reduce((a, b) => a + b, 0) || 1;
  return chapters.map((c, i) => Math.max(Math.min(4, c.photos.length), Math.min(40, c.photos.length, Math.round(units * w[i] / W))));
}

export const score = (a: Asset) => (a.quality ?? 0.5) + ((a.faceCount ?? 0) > 0 ? 0.1 : 0);

/** Stratified, diverse, folder-covering selection inside one chapter. Returns photos in time order. */
export function selectPhotos(c: ChapterPlan, units: number, rng: Rng): Asset[] {
  const cands = c.photos; const n = cands.length; const k = Math.min(units, n); if (!k) return [];
  const chosen: Asset[] = []; const used = new Set<string>(); let portraits = 0; const portraitCap = Math.max(1, Math.round(k * 0.4));
  const ok = (a: Asset) => !used.has(a.id) && chosen.every(ch => hamming(ch.dhash, a.dhash) >= DHASH_DIVERSE);
  for (let b = 0; b < k; b++) {
    const bin = cands.slice(Math.floor(b * n / k), Math.floor((b + 1) * n / k));
    const ranked = bin.map(a => ({ a, s: score(a) + rng() * 0.02 })).sort((x, y) => y.s - x.s);
    let pickA = ranked.find(r => ok(r.a) && !(r.a.portrait && portraits >= portraitCap))?.a ?? ranked.find(r => ok(r.a))?.a ?? ranked.find(r => !used.has(r.a.id))?.a;
    if (!pickA) continue;
    chosen.push(pickA); used.add(pickA.id); if (pickA.portrait) portraits++;
  }
  // every source folder represented at least once (when the chapter spans several)
  const dirs = new Set(cands.map(dirOf));
  if (dirs.size > 1) for (const d of dirs) {
    if (chosen.some(a => dirOf(a) === d)) continue;
    const best = cands.filter(a => dirOf(a) === d && !used.has(a.id)).sort((x, y) => score(y) - score(x))[0]; if (!best) continue;
    const victimIdx = chosen.map((a, i) => ({ a, i })).filter(({ a }) => chosen.filter(x => dirOf(x) === dirOf(a)).length > 1).sort((x, y) => score(x.a) - score(y.a))[0]?.i;
    if (victimIdx != null) { used.delete(chosen[victimIdx].id); chosen[victimIdx] = best; used.add(best.id); }
  }
  return chosen.sort((a, b) => cands.indexOf(a) - cands.indexOf(b));
}

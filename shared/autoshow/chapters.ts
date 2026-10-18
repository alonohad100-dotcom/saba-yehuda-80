import type { Asset } from '../model';
import type { AutoOptions } from './types';
import { dirOf, timeOf } from './pool';

export interface ChapterPlan { id: string; title: string; subtitle: string; yearFrom: number; yearTo: number; photos: Asset[]; clips: Asset[]; event: boolean; dir?: string }

const YEAR_RE = /(?:^|\D)((?:18|19|20)\d{2})(?![\ds])/; // a real year; "1970s" is a decade hint, not an event
const rangeTitle = (y0: number, y1: number) => (Math.floor(y0 / 10) === Math.floor(y1 / 10) ? decadeTitle(Math.floor(y0 / 10) * 10) : `${y0}–${y1}`);
export function sanitizeFolderName(name: string): string {
  return name.replace(/(?:18|19|20)\d{2}(?:\s*[-–]\s*(?:18|19|20)?\d{2,4})?/g, ' ').replace(/\b(IMG|DCIM|WhatsApp|Camera|Photos?|Pictures?|Scans?|New folder)\b/gi, ' ').replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
}
export function decadeTitle(d: number, now = new Date().getFullYear()): string {
  if (d < 2000) return `שנות ה־${String(d).slice(2)}`;
  if (d === 2000) return 'שנות האלפיים';
  return `${d}–${Math.min(d + 9, Math.max(now, d + 1))}`;
}
const yearOf = (a: Asset) => a.year ?? new Date(timeOf(a)).getFullYear();

/** Event folder: its name carries a year, or it holds ≥ 8 photos taken within 3 days. */
function isEventDir(dir: string, photos: Asset[]): boolean {
  const last = dir.split('/').pop() ?? '';
  if (YEAR_RE.test(last)) return true;
  if (photos.length < 8) return false;
  const ts = photos.map(timeOf); return Math.max(...ts) - Math.min(...ts) <= 3 * 86_400_000 && photos.every(p => p.takenAt);
}

export function planChapters(photos: Asset[], clips: Asset[], o: AutoOptions): ChapterPlan[] {
  const byDir = new Map<string, Asset[]>(); for (const p of photos) { const d = dirOf(p); (byDir.get(d) ?? byDir.set(d, []).get(d)!).push(p); }
  const plans: ChapterPlan[] = []; const rest: Asset[] = [];
  for (const [dir, ps] of byDir) {
    const event = o.chapterMode === 'decade' ? false : o.chapterMode === 'folder' ? true : isEventDir(dir, ps);
    if (!event) { rest.push(...ps); continue; }
    const years = ps.map(yearOf); const y0 = Math.min(...years), y1 = Math.max(...years);
    const base = sanitizeFolderName(dir.split('/').pop() ?? '') || decadeTitle(Math.floor(y0 / 10) * 10);
    plans.push({ id: `ch-${dir}`, title: y0 === y1 ? `${base} · ${y0}` : base, subtitle: y0 === y1 ? String(y0) : `${y0}–${y1}`, yearFrom: y0, yearTo: y1, photos: ps, clips: [], event: true, dir });
  }
  const byDecade = new Map<number, Asset[]>(); for (const p of rest) { const d = Math.floor(yearOf(p) / 10) * 10; (byDecade.get(d) ?? byDecade.set(d, []).get(d)!).push(p); }
  for (const [d, ps] of byDecade) { const years = ps.map(yearOf); plans.push({ id: `ch-${d}s`, title: decadeTitle(d), subtitle: `${Math.min(...years)}–${Math.max(...years)}`, yearFrom: Math.min(...years), yearTo: Math.max(...years), photos: ps, clips: [], event: false }); }
  plans.sort((a, b) => a.yearFrom - b.yearFrom || a.yearTo - b.yearTo);
  // merge thin chapters (< 6 photos) into the nearest neighbour in time; a chapter that absorbs foreign photos becomes a period chapter
  const MIN = 6;
  while (plans.length > 1) {
    const i = plans.findIndex(p => p.photos.length < MIN); if (i < 0) break;
    const c = plans[i]; const prev = plans[i - 1], next = plans[i + 1];
    const dist = (p?: ChapterPlan) => (p ? Math.min(Math.abs(p.yearFrom - c.yearTo), Math.abs(c.yearFrom - p.yearTo)) + (p.event ? 5 : 0) : Infinity); // prefer period chapters over events
    const into = dist(prev) <= dist(next) ? prev! : next!;
    into.photos.push(...c.photos); into.yearFrom = Math.min(into.yearFrom, c.yearFrom); into.yearTo = Math.max(into.yearTo, c.yearTo);
    if (into.event || c.event) { into.event = false; into.dir = undefined; into.id = `ch-${into.yearFrom}-${into.yearTo}`; }
    into.title = rangeTitle(into.yearFrom, into.yearTo); into.subtitle = `${into.yearFrom}–${into.yearTo}`;
    plans.splice(i, 1);
  }
  for (const c of plans) c.photos.sort((a, b) => timeOf(a) - timeOf(b));
  // clips go to the chapter covering their year, else the nearest
  for (const v of clips) { const y = yearOf(v); const c = plans.find(p => y >= p.yearFrom && y <= p.yearTo) ?? plans.reduce((best, p) => Math.abs(p.yearFrom - y) < Math.abs(best.yearFrom - y) ? p : best, plans[0]); if (c) c.clips.push(v); }
  return plans;
}

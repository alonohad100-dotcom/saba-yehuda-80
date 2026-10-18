import type { Asset } from '../model';
import type { AutoOptions, Dropped } from './types';

export interface Pool { photos: Asset[]; clips: Asset[]; greetings: Asset[]; music: Asset[]; dropped: Dropped[]; photosTotal: number }

export const dirOf = (a: Asset) => a.relPath.includes('/') ? a.relPath.slice(0, a.relPath.lastIndexOf('/')) : '';
export const isGreeting = (a: Asset) => a.type === 'video' && /^videos\/greetings\//.test(a.relPath);
export const timeOf = (a: Asset) => (a.takenAt ? Date.parse(a.takenAt) : a.year ? Date.UTC(a.year, 5, 15) : a.mtime);
const inFolders = (a: Asset, folders: string[]) => !folders.length || folders.some(f => a.relPath === f || a.relPath.startsWith(f.replace(/\/?$/, '/')));
const inYears = (a: Asset, o: AutoOptions) => (o.yearFrom == null || (a.year ?? 0) >= o.yearFrom) && (o.yearTo == null || (a.year ?? 9999) <= o.yearTo);
const q = (a: Asset) => a.quality ?? 0.5;
const better = (a: Asset, b: Asset) => q(a) !== q(b) ? q(a) - q(b) : (a.width ?? 0) * (a.height ?? 0) - (b.width ?? 0) * (b.height ?? 0);

/** Filter → dedup → collapse bursts → drop the worst quality (adaptively). Never touches files; only chooses. */
export function buildPool(assets: Asset[], o: AutoOptions, excludeIds: Set<string>): Pool {
  const ready = assets.filter(a => a.status === 'ready');
  const dropped: Dropped[] = [];
  const photosAll = ready.filter(a => a.type === 'photo' && inFolders(a, o.folders) && inYears(a, o));
  const photosTotal = photosAll.length;
  let photos = photosAll.filter(a => { if (excludeIds.has(a.id)) { dropped.push({ id: a.id, reason: 'locked' }); return false; } return true; });
  // 1. duplicates: keep the best per dup group
  photos = keepBestPer(photos, a => a.dupGroup ?? a.id, 1, dropped, 'dup');
  // 2. bursts: keep the best (2 if the burst is long)
  const burstSize = new Map<string, number>(); for (const a of photos) { const k = a.burstGroup ?? a.id; burstSize.set(k, (burstSize.get(k) ?? 0) + 1); }
  photos = keepBestPer(photos, a => a.burstGroup ?? a.id, 1, dropped, 'burst', k => (burstSize.get(k) ?? 0) > 6 ? 2 : 1);
  // 3. quality: drop below the 15th percentile, but never more than 40 % of the pool, and only when scores exist
  if (o.dropLowQuality && photos.length >= 10 && photos.some(a => a.quality != null)) {
    const sorted = photos.slice().sort(better); const cut = Math.min(Math.floor(sorted.length * 0.15), Math.floor(sorted.length * 0.4));
    const drop = new Set(sorted.slice(0, cut).filter(a => q(a) < 0.3).map(a => a.id));
    photos = photos.filter(a => { if (drop.has(a.id)) { dropped.push({ id: a.id, reason: 'quality' }); return false; } return true; });
  }
  photos.sort((a, b) => timeOf(a) - timeOf(b));
  const clips = o.includeClips ? ready.filter(a => a.type === 'video' && !isGreeting(a) && (a.duration ?? 99) < 20 && inFolders(a, o.folders) && inYears(a, o) && !excludeIds.has(a.id)) : [];
  const greetings = o.includeGreetings ? ready.filter(a => isGreeting(a) && !excludeIds.has(a.id)).sort((a, b) => a.name.localeCompare(b.name, 'he')) : [];
  const music = ready.filter(a => a.type === 'music');
  return { photos, clips, greetings, music, dropped, photosTotal };
}

function keepBestPer(list: Asset[], key: (a: Asset) => string, keep: number, dropped: Dropped[], reason: Dropped['reason'], keepFor?: (k: string) => number): Asset[] {
  const groups = new Map<string, Asset[]>(); for (const a of list) { const k = key(a); (groups.get(k) ?? groups.set(k, []).get(k)!).push(a); }
  const out: Asset[] = [];
  for (const [k, g] of groups) { g.sort((a, b) => better(b, a)); const n = keepFor ? keepFor(k) : keep; out.push(...g.slice(0, n)); for (const a of g.slice(n)) dropped.push({ id: a.id, reason }); }
  return out;
}

/** Directory tree with counts for the wizard's source step. */
export interface DirNode { path: string; name: string; photos: number; videos: number; children: DirNode[] }
export function dirTree(assets: Asset[]): DirNode {
  const root: DirNode = { path: '', name: 'media', photos: 0, videos: 0, children: [] };
  for (const a of assets) { if (a.type === 'music' || a.status !== 'ready') continue; const parts = dirOf(a).split('/').filter(Boolean); let node = root; node[a.type === 'photo' ? 'photos' : 'videos']++;
    let p = ''; for (const seg of parts) { p = p ? `${p}/${seg}` : seg; let c = node.children.find(x => x.path === p); if (!c) { c = { path: p, name: seg, photos: 0, videos: 0, children: [] }; node.children.push(c); } c[a.type === 'photo' ? 'photos' : 'videos']++; node = c; } }
  const sort = (n: DirNode) => { n.children.sort((a, b) => a.name.localeCompare(b.name, 'he')); n.children.forEach(sort); }; sort(root);
  return root;
}

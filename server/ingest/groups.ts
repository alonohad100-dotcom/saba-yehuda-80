/**
 * Library-wide grouping: duplicate groups (same picture), burst groups (same moment) and a library-relative quality score.
 * Runs after every ingest over all analysed photos. 3,000 photos ≈ 4.5 M Hamming comparisons, well under a second.
 */
import { listAssets, setGroups } from '../db.ts';
import { DHASH_DUP, DHASH_BURST, type Asset } from '../../shared/model.ts';

export function hamming(a: string, b: string): number {
  const x1 = (parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0, x2 = (parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0;
  return popcnt(x1) + popcnt(x2);
}
function popcnt(v: number) { v = v - ((v >>> 1) & 0x55555555); v = (v & 0x33333333) + ((v >>> 2) & 0x33333333); return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }

class UF { p: number[]; constructor(n: number) { this.p = Array.from({ length: n }, (_, i) => i); } find(i: number): number { while (this.p[i] !== i) { this.p[i] = this.p[this.p[i]]; i = this.p[i]; } return i; } union(a: number, b: number) { a = this.find(a); b = this.find(b); if (a !== b) this.p[b] = a; } }

function rank(values: (number | undefined)[]): number[] {
  const idx = values.map((v, i) => [v ?? -Infinity, i] as [number, number]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length).fill(0); const n = Math.max(1, values.length - 1);
  idx.forEach(([, i], r) => { out[i] = r / n; }); return out;
}
export function qualityScores(photos: Asset[]): number[] {
  const sh = rank(photos.map(p => p.sharpness)), en = rank(photos.map(p => p.entropy)), px = rank(photos.map(p => Math.log((p.width ?? 1) * (p.height ?? 1))));
  return photos.map((p, i) => { const l = p.luma ?? 120; const exposure = l < 35 ? l / 35 : l > 225 ? (255 - l) / 30 : 1; return Math.round((0.45 * sh[i] + 0.25 * en[i] + 0.15 * exposure + 0.15 * px[i]) * 1000) / 1000; });
}

export function regroup(): { photos: number; dupGroups: number; burstGroups: number } {
  const photos = listAssets().filter(a => a.type === 'photo' && a.status === 'ready' && a.dhash);
  const n = photos.length; const q = qualityScores(photos);
  const dup = new UF(n), burst = new UF(n);
  const aspect = (a: Asset) => (a.width && a.height ? a.width / a.height : 1);
  const seq = (a: Asset) => { const m = /(\d+)(?:\D*)$/.exec(a.name.replace(/\.[^.]+$/, '')); return m ? +m[1] : NaN; };
  const sameMoment = (a: Asset, b: Asset) => {
    if (a.folder !== b.folder) return false;
    if (a.takenAt && b.takenAt) return Math.abs(Date.parse(a.takenAt) - Date.parse(b.takenAt)) <= 90_000;
    if (!a.takenAt && !b.takenAt) { const x = seq(a), y = seq(b); return !isNaN(x) && !isNaN(y) && Math.abs(x - y) <= 2; } // scans: consecutive numbers
    return false;
  };
  const sameExposure = (a: Asset, b: Asset) => Math.abs((a.luma ?? 0) - (b.luma ?? 0)) <= 12 && Math.abs(aspect(a) - aspect(b)) / Math.max(aspect(a), aspect(b)) <= 0.03;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const d = hamming(photos[i].dhash!, photos[j].dhash!);
    if (d > DHASH_BURST) continue;
    if (d <= DHASH_DUP && sameExposure(photos[i], photos[j])) { dup.union(i, j); burst.union(i, j); }
    else if (sameMoment(photos[i], photos[j])) burst.union(i, j);
  }
  const best = (uf: UF) => { const b = new Map<number, number>(); for (let i = 0; i < n; i++) { const r = uf.find(i); const cur = b.get(r); if (cur == null || q[i] > q[cur] || (q[i] === q[cur] && (photos[i].width ?? 0) * (photos[i].height ?? 0) > (photos[cur].width ?? 0) * (photos[cur].height ?? 0))) b.set(r, i); } return b; };
  const bestDup = best(dup), bestBurst = best(burst);
  const rows = photos.map((p, i) => ({ id: p.id, quality: q[i], dupGroup: photos[bestDup.get(dup.find(i))!].id, burstGroup: photos[bestBurst.get(burst.find(i))!].id, isBest: bestDup.get(dup.find(i)) === i }));
  setGroups(rows);
  const dupGroups = new Set(rows.map(r => r.dupGroup)).size, burstGroups = new Set(rows.map(r => r.burstGroup)).size;
  return { photos: n, dupGroups: n - dupGroups, burstGroups: n - burstGroups };
}

/**
 * Export the show as a self-contained, offline package:
 *   <dest>/<title> <date>/
 *     START-SHOW.bat            double-click on Windows (PowerShell web server, nothing to install)
 *     START-SHOW-mac.command    the same on a Mac (python3)
 *     README.txt
 *     player/                   the built show (dist/), the show and asset list as static API files, every media file the show uses
 * Optionally also a single .zip of that folder next to it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { CACHE_DIR, DIST_DIR, ROOT } from './paths.ts';
import { loadShow } from './show-store.ts';
import { listAssets, kvGet } from './db.ts';
import { slideAssetIds, slideSeconds, fmtTime, type Asset, type Show } from '../shared/model.ts';

export const EXPORT_DIR = path.join(ROOT, 'exports');
const KIT_DIR = path.join(ROOT, 'server', 'export-kit');

export interface ExportProgress {
  running: boolean; phase: 'idle' | 'copy' | 'zip' | 'done' | 'error';
  done: number; total: number; bytes: number; totalBytes: number;
  dir?: string; zip?: string; error?: string; missing: string[]; startedAt?: number; finishedAt?: number;
}
export const exportProgress: ExportProgress = { running: false, phase: 'idle', done: 0, total: 0, bytes: 0, totalBytes: 0, missing: [] };

/** Every asset the show refers to: slide media, overlay images, slide and chapter songs. */
export function usedAssetIds(show: Show): Set<string> {
  const ids = new Set<string>();
  for (const c of show.chapters) {
    if (c.musicId) ids.add(c.musicId);
    for (const s of c.slides) {
      for (const id of slideAssetIds(s)) ids.add(id);
      if (s.musicId) ids.add(s.musicId);
      for (const o of s.overlays ?? []) if (o.kind === 'image') ids.add(o.assetId);
    }
  }
  return ids;
}

/** The converted files the show plays for an asset, relative to .cache/ (served under /media/). */
function filesFor(a: Asset): string[] {
  if (a.type === 'photo') return [`img/${a.id}.display.webp`, `img/${a.id}.thumb.webp`, `img/${a.id}.blur.webp`];
  if (a.type === 'video') return [`vid/${a.id}.1080.mp4`, `vid/${a.id}.poster.jpg`, `vid/${a.id}.thumb.webp`];
  return [`music/${a.id}.m4a`];
}

interface Plan { show: Show; assets: Asset[]; files: { rel: string; bytes: number }[]; missing: string[]; mediaBytes: number; distBytes: number; counts: { photos: number; videos: number; music: number }; seconds: number }

function dirBytes(d: string): number { let n = 0; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); n += e.isDirectory() ? dirBytes(p) : fs.statSync(p).size; } return n; }

export function planExport(): Plan {
  const show = loadShow(); const all = listAssets(); const byId = new Map(all.map(a => [a.id, a]));
  const ids = usedAssetIds(show); const assets: Asset[] = []; const missing: string[] = []; const files: { rel: string; bytes: number }[] = [];
  for (const id of ids) {
    const a = byId.get(id); if (!a) { missing.push(`קובץ שנמחק מהספרייה (${id})`); continue; }
    assets.push(a);
    for (const rel of filesFor(a)) { const abs = path.join(CACHE_DIR, rel); if (fs.existsSync(abs)) files.push({ rel, bytes: fs.statSync(abs).size }); else if (!rel.includes('.thumb.') && !rel.includes('.blur.')) missing.push(`${a.name}: ${rel}`); }
  }
  const counts = { photos: assets.filter(a => a.type === 'photo').length, videos: assets.filter(a => a.type === 'video').length, music: assets.filter(a => a.type === 'music').length };
  const seconds = show.chapters.reduce((t, c) => t + c.slides.reduce((u, s) => u + slideSeconds(s, c, show.settings, Object.fromEntries(byId)), 0), 0);
  return { show, assets, files, missing, mediaBytes: files.reduce((t, f) => t + f.bytes, 0), distBytes: fs.existsSync(DIST_DIR) ? dirBytes(DIST_DIR) : 0, counts, seconds };
}

/** Drives that exist on this Windows machine (USB sticks show up here), for the destination picker. */
export function listDrives(): { root: string; free?: number }[] {
  if (process.platform !== 'win32') return [];
  const out: { root: string; free?: number }[] = [];
  for (const l of 'DEFGHIJKLMNOPQRSTUVWXYZ') { const r = `${l}:\\`; try { if (fs.existsSync(r)) { let free: number | undefined; try { const s = fs.statfsSync(r); free = s.bavail * s.bsize; } catch { /* no media */ } out.push({ root: r, free }); } } catch { /* not ready */ } }
  return out;
}

export function exportEstimate() {
  const p = planExport();
  let free: number | undefined; try { fs.mkdirSync(EXPORT_DIR, { recursive: true }); const s = fs.statfsSync(EXPORT_DIR); free = s.bavail * s.bsize; } catch { /* unknown */ }
  return { ...p.counts, files: p.files.length, bytes: p.mediaBytes + p.distBytes, seconds: p.seconds, slides: p.show.chapters.reduce((t, c) => t + c.slides.length, 0), missing: p.missing, defaultDest: EXPORT_DIR, defaultFree: free, drives: listDrives(), dist: p.distBytes > 0 };
}

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'show';
const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
const fmtMB = (b: number) => `${Math.round(b / 1048576)} MB`;

function copyDir(src: string, dst: string) { fs.mkdirSync(dst, { recursive: true }); for (const e of fs.readdirSync(src, { withFileTypes: true })) { const a = path.join(src, e.name), b = path.join(dst, e.name); if (e.isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } }

function readme(show: Show, p: Plan, when: string): string {
  return `\ufeff${show.meta.title}
${'='.repeat(40)}
יוצא ב־${when} · ${p.show.chapters.reduce((t, c) => t + c.slides.length, 0)} שקופיות · ${fmtTime(p.seconds)}
${p.counts.photos} תמונות · ${p.counts.videos} סרטונים · ${p.counts.music} קטעי מוזיקה — כולם בתוך התיקייה הזו.

איך מפעילים (Windows 10/11, בלי להתקין כלום):
  1. לחיצה כפולה על START-SHOW.bat
  2. נפתח חלון שחור קטן (השרת של המצגת) ודפדפן עם המצגת. משאירים את החלון השחור פתוח.
  3. לוחצים "התחל את המצגת". F מסך מלא, רווח/חצים מעבר, P השהיה, M השתקה, B מסך שחור.
  4. חלון המציג (הערות וזמנים, למסך הלפטופ): http://127.0.0.1:47880/presenter/
  אם Windows מציג "Windows protected your PC": More info ← Run anyway.

ב־Mac: לחיצה כפולה על START-SHOW-mac.command (צריך python3, מגיע עם Xcode tools).

אפשר להעתיק את כל התיקייה לדיסק און קי או למחשב אחר; היא עובדת בלי אינטרנט.
שינויים שנעשים בעורך אחרי הייצוא לא נכנסים לכאן — צריך לייצא שוב.

------------------------------------------------------------
${show.meta.title} — exported ${when}. Windows: double-click START-SHOW.bat and keep the black window open.
Mac: double-click START-SHOW-mac.command. Everything (photos, videos, music) is inside this folder; no internet needed.
`;
}

/** Runs the export in the background; poll exportProgress. */
export async function runExport(opts: { dest?: string; zip?: boolean }): Promise<void> {
  if (exportProgress.running) throw new Error('ייצוא כבר רץ');
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) throw new Error('המצגת לא בנויה (npm run build)');
  const p = planExport();
  const destRoot = path.resolve(opts.dest?.trim() || EXPORT_DIR);
  fs.mkdirSync(destRoot, { recursive: true });
  const need = p.mediaBytes + p.distBytes;
  try { const s = fs.statfsSync(destRoot); const free = s.bavail * s.bsize; const want = need * (opts.zip ? 2 : 1) + 20 * 1048576; if (free < want) throw new Error(`אין מספיק מקום ב־${destRoot}: צריך ${fmtMB(want)}, פנוי ${fmtMB(free)}`); } catch (e) { if ((e as Error).message.startsWith('אין מספיק')) throw e; }
  const when = stamp(); const name = safeName(`${p.show.meta.title} ${when}`); const dir = path.join(destRoot, name); const player = path.join(dir, 'player');
  Object.assign(exportProgress, { running: true, phase: 'copy', done: 0, total: p.files.length + 1, bytes: 0, totalBytes: need, dir, zip: undefined, error: undefined, missing: p.missing, startedAt: Date.now(), finishedAt: undefined });
  try {
    // the built app; /show/ and /presenter/ are real folders so any static server (and the Mac python one) finds them
    copyDir(DIST_DIR, player); exportProgress.bytes += p.distBytes; exportProgress.done++;
    const indexHtml = fs.readFileSync(path.join(DIST_DIR, 'index.html'));
    for (const r of ['show', 'presenter']) { fs.mkdirSync(path.join(player, r), { recursive: true }); fs.writeFileSync(path.join(player, r, 'index.html'), indexHtml); }
    const summary = `${p.show.chapters.reduce((t, c) => t + c.slides.length, 0)} שקופיות · ${fmtTime(p.seconds)} · ${p.counts.photos} תמונות · ${p.counts.videos} סרטונים · ${p.counts.music} שירים`;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    fs.writeFileSync(path.join(player, 'index.html'), fs.readFileSync(path.join(KIT_DIR, 'landing.html'), 'utf8').replaceAll('{{TITLE}}', esc(p.show.meta.title)).replaceAll('{{SUMMARY}}', esc(summary)).replaceAll('{{DATE}}', when));
    // the two API answers the show page reads, as static files
    fs.mkdirSync(path.join(player, 'api'), { recursive: true });
    fs.writeFileSync(path.join(player, 'api', 'show'), JSON.stringify(p.show));
    fs.writeFileSync(path.join(player, 'api', 'assets'), JSON.stringify(p.assets));
    // saved preferences the pages read (editor look); anything else answers "not set"
    fs.mkdirSync(path.join(player, 'api', 'kv'), { recursive: true });
    for (const key of ['chrome-theme', 'rehearsed']) { const v = kvGet(key); fs.writeFileSync(path.join(player, 'api', 'kv', key), JSON.stringify({ key, value: v ?? null })); }
    fs.writeFileSync(path.join(player, 'api', 'health'), JSON.stringify({ ok: true, exported: true, assets: p.assets.length }));
    // media
    for (const f of p.files) {
      const out = path.join(player, 'media', f.rel); fs.mkdirSync(path.dirname(out), { recursive: true });
      await fs.promises.copyFile(path.join(CACHE_DIR, f.rel), out);
      exportProgress.done++; exportProgress.bytes += f.bytes;
    }
    // launchers
    fs.copyFileSync(path.join(KIT_DIR, 'serve.ps1'), path.join(player, 'serve.ps1'));
    fs.copyFileSync(path.join(KIT_DIR, 'START-SHOW.bat'), path.join(dir, 'START-SHOW.bat'));
    fs.copyFileSync(path.join(KIT_DIR, 'START-SHOW-mac.command'), path.join(dir, 'START-SHOW-mac.command')); try { fs.chmodSync(path.join(dir, 'START-SHOW-mac.command'), 0o755); } catch { /* windows */ }
    fs.writeFileSync(path.join(dir, 'README.txt'), readme(p.show, p, when));
    if (opts.zip) {
      exportProgress.phase = 'zip';
      // Windows tar cannot take the Hebrew folder name as an argument: run it inside the folder with only ASCII names (the entries) and an ASCII temp output, then rename
      const zip = `${dir}.zip`; const tmp = path.join(destRoot, `sy80-export-${Date.now()}.zip.part`); const entries = fs.readdirSync(dir);
      const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'zip';
      await new Promise<void>((res, rej) => {
        const args = process.platform === 'win32' ? ['--format', 'zip', '-c', '-f', tmp, ...entries] : ['-r', '-q', tmp, ...entries];
        const c = spawn(tar, args, { cwd: dir, windowsHide: true }); let err = '';
        c.stderr.on('data', d => { err += d; }); c.on('error', rej); c.on('close', code => code === 0 ? res() : rej(new Error('יצירת ה־ZIP נכשלה: ' + err.slice(-300))));
      });
      fs.renameSync(tmp, zip); exportProgress.zip = zip;
    }
    Object.assign(exportProgress, { running: false, phase: 'done', finishedAt: Date.now() });
  } catch (e) {
    Object.assign(exportProgress, { running: false, phase: 'error', error: (e as Error).message, finishedAt: Date.now() });
  }
}

/** Show the finished export in Explorer (only the folder this server just wrote). */
export function revealExport(): boolean {
  const target = exportProgress.zip && fs.existsSync(exportProgress.zip) ? exportProgress.zip : exportProgress.dir;
  if (!target || !fs.existsSync(target)) return false;
  if (process.platform === 'win32') spawn('explorer.exe', exportProgress.zip ? ['/select,', target] : [target], { detached: true, stdio: 'ignore' }).unref();
  else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [path.dirname(target)], { detached: true, stdio: 'ignore' }).unref();
  return true;
}

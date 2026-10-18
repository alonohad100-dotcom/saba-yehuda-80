import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { MEDIA_DIR, CACHE_DIR } from '../paths.ts';
import { fileRecord, setFileRecord, upsertAsset, getAsset, markAllUnseen, markSeen, pruneUnseenFiles, photosNeedingAnalysis, setAnalysis } from '../db.ts';
import { processImage, posterThumb } from './images.ts';
import { analyzePhoto } from './analyze.ts';
import { regroup } from './groups.ts';
import { facesAvailable } from './faces.ts';
import { probe, transcodeVideo, transcodeMusic, peaks } from './ffmpeg.ts';
import type { Asset, AssetType, YearSource } from '../../shared/model.ts';

const IMG = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff', '.heic', '.heif', '.avif', '.gif', '.bmp']);
const VID = new Set(['.mp4', '.mov', '.m4v', '.3gp', '.mkv', '.avi', '.webm', '.mts']);
const MUS = new Set(['.mp3', '.m4a', '.aac', '.wav', '.flac', '.ogg', '.opus', '.wma']);

export interface IngestProgress { running: boolean; phase: string; done: number; total: number; current?: string; photos: number; videos: number; music: number; warnings: { file: string; message: string }[]; errors: number; startedAt?: number; finishedAt?: number; log: string[]; analyzeDone?: number; analyzeTotal?: number }
export const progress: IngestProgress = { running: false, phase: 'idle', done: 0, total: 0, photos: 0, videos: 0, music: 0, warnings: [], errors: 0, log: [] };
export const events = new EventEmitter();
function emit(type: string, data?: unknown) { events.emit('event', { type, data: data ?? progress }); }
function log(line: string) { progress.log.push(line); if (progress.log.length > 400) progress.log.splice(0, 100); emit('log', line); }
function warn(file: string, message: string) { progress.warnings.push({ file, message }); log(`⚠ ${file}: ${message}`); }

type Found = { abs: string; rel: string; type: AssetType; bytes: number; mtime: number };

function scan(dir: string, out: Found[] = []): Found[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name.startsWith('~')) continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) { scan(abs, out); continue; }
    const ext = path.extname(e.name).toLowerCase();
    const type: AssetType | null = IMG.has(ext) ? 'photo' : VID.has(ext) ? 'video' : MUS.has(ext) ? 'music' : null;
    if (!type) continue;
    const st = fs.statSync(abs);
    out.push({ abs, rel: path.relative(MEDIA_DIR, abs).split(path.sep).join('/'), type, bytes: st.size, mtime: Math.round(st.mtimeMs) });
  }
  return out;
}

/** Stable id: sha1 over size + first 4 MB. Survives renames and moves; cheap on huge files. */
async function hashFile(abs: string, bytes: number): Promise<string> {
  const h = crypto.createHash('sha1'); h.update(String(bytes));
  const fh = await fsp.open(abs, 'r');
  try { const buf = Buffer.alloc(Math.min(bytes, 4 * 1024 * 1024)); const { bytesRead } = await fh.read(buf, 0, buf.length, 0); h.update(buf.subarray(0, bytesRead)); } finally { await fh.close(); }
  return h.digest('hex').slice(0, 20);
}

const HEB_DECADE = /שנות\s*ה[-־]?\s*(\d{2})/;
function yearFromFolder(rel: string): number | undefined {
  const parts = rel.split('/').slice(0, -1).reverse();
  for (const p of parts) {
    const full = /(?:^|\D)((?:18|19|20)\d{2})(?:\D|$)/.exec(p); if (full) return +full[1];
    const dec = /(?:^|\D)((?:19|20)\d)0s/i.exec(p); if (dec) return +dec[1] * 10 + 5;
    const heb = HEB_DECADE.exec(p); if (heb) { const d = +heb[1]; return (d >= 30 ? 1900 : 2000) + d + 5; }
  }
  return undefined;
}

/** Year from a file name: WhatsApp "IMG-20190612-WA0003", "VID_2021_חנוכה", "2016-07-04 12.33.01", "PXL_20230101_…". */
export function yearFromName(name: string): number | undefined {
  const m8 = /(?:^|\D)((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?:\D|$)/.exec(name); if (m8) return +m8[1];
  const m4 = /(?:^|\D)((?:19|20)\d{2})(?:\D|$)/.exec(name);
  if (m4) { const y = +m4[1]; const before = name.slice(0, m4.index + (m4[0].length - m4[1].length - (/\D$/.test(m4[0]) ? 1 : 0)));
    if (/(IMG|DSC\w*|PICT|SAM|MVI|DJI|GOPR|CIMG|SCAN|P)[_\- ]?$/i.test(before)) return undefined; // camera counters: IMG_2010, DSC_1999
    if (y >= 1900 && y <= new Date().getFullYear() + 1) return y; }
  return undefined;
}
function derivativesExist(type: AssetType, id: string): boolean {
  const c = (p: string) => fs.existsSync(path.join(CACHE_DIR, p));
  if (type === 'photo') return c(`img/${id}.display.webp`) && c(`img/${id}.thumb.webp`) && c(`img/${id}.blur.webp`);
  if (type === 'video') return c(`vid/${id}.1080.mp4`) && c(`vid/${id}.poster.jpg`) && c(`vid/${id}.thumb.webp`);
  return c(`music/${id}.m4a`);
}

async function processOne(f: Found, id: string): Promise<void> {
  const name = path.basename(f.rel); const folder = path.basename(path.dirname(f.rel)) || '';
  const base: Asset = { id, type: f.type, relPath: f.rel, name, folder, bytes: f.bytes, mtime: f.mtime, yearSource: 'mtime', status: 'processing' };
  const existing = getAsset(id);
  if (existing && existing.status === 'ready' && derivativesExist(f.type, id)) { upsertAsset({ ...existing, relPath: f.rel, name, folder, bytes: f.bytes, mtime: f.mtime }); markSeen(id); return; }
  upsertAsset(base);
  try {
    let year: number | undefined, yearSource: YearSource = 'mtime', takenAt: string | undefined;
    const folderYear = yearFromFolder(f.rel); const nameYear = yearFromName(name);
    const fallbackYear = (): [number, YearSource] => nameYear ? [nameYear, 'name'] : folderYear ? [folderYear, 'folder'] : [new Date(f.mtime).getFullYear(), 'mtime'];
    if (f.type === 'photo') {
      const r = await processImage(f.abs, id);
      takenAt = r.takenAt;
      if (takenAt) { year = new Date(takenAt).getFullYear(); yearSource = 'exif'; }
      else { [year, yearSource] = fallbackYear(); if (yearSource !== 'mtime') warn(f.rel, `אין תאריך EXIF — השנה נלקחה מ${yearSource === 'name' ? 'שם הקובץ' : 'שם התיקייה'} (${year})`); else warn(f.rel, `אין תאריך EXIF ולא שנה בשם — נלקח תאריך הקובץ (${year}); קבע שנה בספרייה`); }
      upsertAsset({ ...base, width: r.width, height: r.height, takenAt, year, yearSource, portrait: r.height > r.width, focal: r.focal, status: 'ready' });
      progress.photos++;
    } else if (f.type === 'video') {
      const info = await probe(f.abs);
      if (!info.hasVideo) throw new Error('no video stream');
      const out = path.join(CACHE_DIR, 'vid', `${id}.1080.mp4`), poster = path.join(CACHE_DIR, 'vid', `${id}.poster.jpg`);
      const t = await transcodeVideo(f.abs, out, poster);
      await posterThumb(poster, id);
      const info2 = await probe(out);
      if (t.loudnessGain != null && Math.abs(t.loudnessGain) > 8) warn(f.rel, `עוצמת הקול תוקנה ב־${t.loudnessGain > 0 ? '+' : ''}${t.loudnessGain} dB`);
      if (!info.hasAudio) warn(f.rel, 'לסרטון אין פס קול');
      [year, yearSource] = fallbackYear();
      upsertAsset({ ...base, width: info2.width, height: info2.height, duration: Math.round(info2.duration * 10) / 10, year, yearSource, portrait: (info2.height ?? 0) > (info2.width ?? 0), loudnessGain: t.loudnessGain, status: 'ready' });
      progress.videos++;
    } else {
      const out = path.join(CACHE_DIR, 'music', `${id}.m4a`);
      await transcodeMusic(f.abs, out);
      const info = await probe(out);
      const pk = await peaks(out);
      upsertAsset({ ...base, duration: Math.round(info.duration * 10) / 10, peaks: pk, year: new Date(f.mtime).getFullYear(), yearSource: 'mtime', status: 'ready' });
      progress.music++;
    }
    markSeen(id);
  } catch (e) {
    progress.errors++;
    const msg = (e as Error).message || String(e);
    upsertAsset({ ...base, status: 'error', error: msg }); markSeen(id);
    warn(f.rel, `נכשל: ${msg.slice(0, 140)}`);
  }
}

/** Phase 2: analyse photos lacking a dhash (incremental), then regroup the whole library. Safe to call on its own. */
export async function runAnalysis(): Promise<{ analysed: number; dupGroups: number; burstGroups: number; faces: boolean }> {
  const todo = photosNeedingAnalysis();
  progress.phase = 'analyze'; progress.analyzeTotal = todo.length; progress.analyzeDone = 0; emit('progress');
  if (todo.length) log(`ניתוח ${todo.length} תמונות (hash, חדות, חשיפה, צבעוניות${facesAvailable ? ', פנים' : ''})`);
  const conc = Math.max(1, Math.min(8, os.cpus().length - 1)); let i = 0;
  const worker = async () => { while (i < todo.length) { const a = todo[i++]; try { const r = await analyzePhoto(a.id); if (r) setAnalysis(a.id, r); } catch (e) { warn(a.relPath, `ניתוח נכשל: ${(e as Error).message.slice(0, 100)}`); } progress.analyzeDone!++; if (progress.analyzeDone! % 20 === 0) emit('progress'); } };
  await Promise.all(Array.from({ length: conc }, worker));
  progress.phase = 'group'; emit('progress');
  const g = regroup();
  log(`קיבוץ: ${g.photos} תמונות · ${g.dupGroups} כפילויות · ${g.burstGroups} צילומי רצף`);
  return { analysed: todo.length, dupGroups: g.dupGroups, burstGroups: g.burstGroups, faces: facesAvailable };
}

export async function runIngest(): Promise<IngestProgress> {
  if (progress.running) return progress;
  Object.assign(progress, { running: true, phase: 'scan', done: 0, total: 0, photos: 0, videos: 0, music: 0, warnings: [], errors: 0, startedAt: Date.now(), finishedAt: undefined, log: [] });
  emit('start');
  try {
    const found = scan(MEDIA_DIR);
    progress.total = found.length; log(`נמצאו ${found.length} קבצים ב־media/`);
    markAllUnseen();
    pruneUnseenFiles(new Set(found.map(f => f.rel)));
    progress.phase = 'hash';
    const ids = new Map<string, string>();
    for (const f of found) {
      const rec = fileRecord(f.rel);
      const id = rec && rec.bytes === f.bytes && rec.mtime === f.mtime ? rec.asset_id : await hashFile(f.abs, f.bytes);
      if (!rec || rec.asset_id !== id) setFileRecord(f.rel, f.bytes, f.mtime, id);
      ids.set(f.rel, id);
    }
    emit('progress');
    progress.phase = 'process';
    const photos = found.filter(f => f.type === 'photo'), videos = found.filter(f => f.type === 'video'), music = found.filter(f => f.type === 'music');
    const conc = Math.max(1, Math.min(8, os.cpus().length - 1));
    let i = 0;
    const worker = async () => { while (i < photos.length) { const f = photos[i++]; progress.current = f.rel; await processOne(f, ids.get(f.rel)!); progress.done++; if (progress.done % 5 === 0 || progress.done === progress.total) emit('progress'); } };
    await Promise.all(Array.from({ length: conc }, worker));
    for (const f of [...music, ...videos]) { progress.current = f.rel; emit('progress'); await processOne(f, ids.get(f.rel)!); progress.done++; emit('progress'); }
    await runAnalysis();
    progress.phase = 'done'; progress.current = undefined;
    log(`הסתיים: ${progress.photos} תמונות · ${progress.videos} סרטונים · ${progress.music} קטעי מוזיקה · ${progress.warnings.length} אזהרות · ${progress.errors} שגיאות`);
  } catch (e) {
    progress.phase = 'failed'; log('✖ ' + ((e as Error).message || String(e)));
  } finally {
    progress.running = false; progress.finishedAt = Date.now(); emit('done');
  }
  return progress;
}

import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import exifr from 'exifr';
import { CACHE_DIR } from '../paths.ts';

export interface ImageResult { width: number; height: number; takenAt?: string; focal?: [number, number] }

async function loadBuffer(file: string): Promise<Buffer> {
  const buf = await fs.readFile(file);
  const ext = path.extname(file).toLowerCase();
  if (ext === '.heic' || ext === '.heif') {
    try { await sharp(buf).metadata(); return buf; } // libvips with HEVC support (rare on prebuilt binaries)
    catch {
      const convert = (await import('heic-convert')).default as unknown as (o: { buffer: Buffer; format: 'JPEG'; quality: number }) => Promise<ArrayBuffer>;
      return Buffer.from(await convert({ buffer: buf, format: 'JPEG', quality: 0.95 }));
    }
  }
  return buf;
}

export async function processImage(file: string, id: string): Promise<ImageResult> {
  const original = await fs.readFile(file);
  let takenAt: string | undefined;
  try { const ex = await exifr.parse(original, { pick: ['DateTimeOriginal', 'CreateDate', 'ModifyDate'] }); const d: Date | undefined = ex?.DateTimeOriginal || ex?.CreateDate || ex?.ModifyDate; if (d instanceof Date && !isNaN(+d) && d.getFullYear() > 1900) takenAt = d.toISOString(); } catch { /* no exif */ }
  const buf = await loadBuffer(file);
  const base = sharp(buf, { failOn: 'none' }).rotate(); // honours EXIF orientation
  const meta = await base.metadata();
  const dir = path.join(CACHE_DIR, 'img');
  await Promise.all([
    base.clone().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).webp({ quality: 86, effort: 4 }).toFile(path.join(dir, `${id}.display.webp`)),
    base.clone().resize({ width: 400, height: 400, fit: 'inside' }).webp({ quality: 78 }).toFile(path.join(dir, `${id}.thumb.webp`)),
    base.clone().resize({ width: 24, height: 24, fit: 'inside' }).blur(1).webp({ quality: 50 }).toFile(path.join(dir, `${id}.blur.webp`)),
  ]);
  const w = meta.width ?? 0, h = meta.height ?? 0;
  const swap = (meta.orientation ?? 1) >= 5; // rotate() already applied; metadata() reports pre-rotation dims
  const width = swap ? h : w, height = swap ? w : h;
  const focal = await attentionFocal(base.clone(), width, height);
  return { width, height, takenAt, focal };
}

/** Cheap "smart crop": sharp's attention strategy tells us where the busiest region is. Used as a default focal point for Ken Burns. */
async function attentionFocal(img: Sharp, width: number, height: number): Promise<[number, number] | undefined> {
  try {
    const side = Math.round(Math.min(width, height) * 0.5);
    if (!side) return undefined;
    const { info } = await img.resize({ width: side, height: side, fit: 'cover', position: sharp.strategy.attention }).toBuffer({ resolveWithObject: true });
    const cropOffsetLeft = (info as any).cropOffsetLeft as number | undefined, cropOffsetTop = (info as any).cropOffsetTop as number | undefined;
    if (cropOffsetLeft == null || cropOffsetTop == null) return undefined;
    // sharp resizes to cover first; compute scale to map the crop centre back into the original
    const scale = Math.max(side / width, side / height);
    const cx = (cropOffsetLeft + side / 2) / scale, cy = (cropOffsetTop + side / 2) / scale;
    return [Math.round(Math.min(100, Math.max(0, cx / width * 100))), Math.round(Math.min(100, Math.max(0, cy / height * 100)))];
  } catch { return undefined; }
}

export async function posterThumb(poster: string, id: string): Promise<void> {
  await sharp(poster).resize({ width: 400, height: 400, fit: 'inside' }).webp({ quality: 78 }).toFile(path.join(CACHE_DIR, 'vid', `${id}.thumb.webp`));
}

/**
 * Photo analysis from the 400 px thumbnail: perceptual hash, sharpness/entropy/exposure, colourfulness, optional faces.
 * Cheap (≈ 8 ms per photo) and incremental: only photos without a dhash are analysed.
 */
import path from 'node:path';
import fs from 'node:fs';
import sharp from 'sharp';
import { CACHE_DIR } from '../paths.ts';
import { detectFaces } from './faces.ts';

export interface Analysis { dhash: string; sharpness: number; entropy: number; luma: number; colorfulness: number; faceCount?: number; faceBox?: [number, number, number, number]; focal?: [number, number] }

/** 64-bit difference hash as 16 hex chars. */
export async function dhash(input: string | Buffer): Promise<string> {
  const { data } = await sharp(input).greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  let hi = 0, lo = 0;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const bit = data[y * 9 + x] < data[y * 9 + x + 1] ? 1 : 0; const i = y * 8 + x; if (i < 32) hi = (hi << 1) | bit; else lo = (lo << 1) | bit; }
  return (hi >>> 0).toString(16).padStart(8, '0') + (lo >>> 0).toString(16).padStart(8, '0');
}

/** Hasler & Süsstrunk colourfulness from a 32×32 RGB sample. */
async function colorfulness(input: string | Buffer): Promise<number> {
  const { data } = await sharp(input).removeAlpha().resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const n = data.length / 3; let rgM = 0, ybM = 0, rgS = 0, ybS = 0; const rg: number[] = [], yb: number[] = [];
  for (let i = 0; i < data.length; i += 3) { const r = data[i], g = data[i + 1], b = data[i + 2]; const a = r - g, c = (r + g) / 2 - b; rg.push(a); yb.push(c); rgM += a; ybM += c; }
  rgM /= n; ybM /= n; for (let i = 0; i < n; i++) { rgS += (rg[i] - rgM) ** 2; ybS += (yb[i] - ybM) ** 2; }
  return Math.sqrt(rgS / n + ybS / n) + 0.3 * Math.sqrt(rgM ** 2 + ybM ** 2);
}

export async function analyzePhoto(id: string): Promise<Analysis | null> {
  const thumb = path.join(CACHE_DIR, 'img', `${id}.thumb.webp`);
  if (!fs.existsSync(thumb)) return null;
  const buf = await sharp(thumb).toBuffer();
  const [h, st, cf] = await Promise.all([dhash(buf), sharp(buf).stats(), colorfulness(buf)]);
  const luma = st.channels.length >= 3 ? 0.299 * st.channels[0].mean + 0.587 * st.channels[1].mean + 0.114 * st.channels[2].mean : st.channels[0].mean;
  const out: Analysis = { dhash: h, sharpness: round(st.sharpness, 4), entropy: round(st.entropy, 4), luma: round(luma, 1), colorfulness: round(cf, 2) };
  const faces = await detectFaces(buf).catch(() => null);
  if (faces) { out.faceCount = faces.length; if (faces.length) { const f = faces.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)); out.faceBox = [f.x, f.y, f.w, f.h]; out.focal = [Math.round(f.x + f.w / 2), Math.round(f.y + f.h * 0.42)]; } }
  return out;
}
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

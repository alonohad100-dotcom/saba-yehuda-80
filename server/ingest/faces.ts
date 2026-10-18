/**
 * Optional face detection (phase D). Loads onnxruntime-node and models/ultraface-rfb-320.onnx when both are present;
 * otherwise detectFaces() returns null and everything else keeps working. No network access is ever attempted.
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../paths.ts';

export interface Face { x: number; y: number; w: number; h: number; score: number } // percent of image
const MODEL = path.join(ROOT, 'models', 'ultraface-rfb-320.onnx');
let session: any = null; let tried = false; let ort: any = null;
export let facesAvailable = false;

async function load(): Promise<boolean> {
  if (tried) return !!session; tried = true;
  if (!fs.existsSync(MODEL)) return false;
  try { ort = await import('onnxruntime-node' as string); session = await ort.InferenceSession.create(MODEL, { executionProviders: ['cpu'] }); facesAvailable = true; return true; }
  catch (e) { console.warn('[faces] disabled:', (e as Error).message); return false; }
}

/** UltraFace-RFB-320: input 1×3×240×320 normalised ((x−127)/128), outputs scores [1,N,2] and boxes [1,N,4] (normalised x1,y1,x2,y2). */
export async function detectFaces(input: Buffer, threshold = 0.7): Promise<Face[] | null> {
  if (!(await load())) return null;
  const { data } = await sharp(input).removeAlpha().resize(320, 240, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  const plane = 320 * 240; const f = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) { f[i] = (data[i * 3] - 127) / 128; f[plane + i] = (data[i * 3 + 1] - 127) / 128; f[2 * plane + i] = (data[i * 3 + 2] - 127) / 128; }
  const feeds: Record<string, any> = {}; feeds[session.inputNames[0]] = new ort.Tensor('float32', f, [1, 3, 240, 320]);
  const res = await session.run(feeds);
  const scores = res[session.outputNames[0]].data as Float32Array, boxes = res[session.outputNames[1]].data as Float32Array;
  const n = scores.length / 2; const out: Face[] = [];
  for (let i = 0; i < n; i++) { const s = scores[i * 2 + 1]; if (s < threshold) continue; const x1 = boxes[i * 4], y1 = boxes[i * 4 + 1], x2 = boxes[i * 4 + 2], y2 = boxes[i * 4 + 3]; out.push({ x: x1 * 100, y: y1 * 100, w: (x2 - x1) * 100, h: (y2 - y1) * 100, score: s }); }
  // greedy NMS
  out.sort((a, b) => b.score - a.score); const keep: Face[] = [];
  for (const b of out) { if (keep.every(k => iou(k, b) < 0.3)) keep.push(b); }
  return keep.map(k => ({ ...k, x: r1(k.x), y: r1(k.y), w: r1(k.w), h: r1(k.h) }));
}
const r1 = (v: number) => Math.round(v * 10) / 10;
function iou(a: Face, b: Face) { const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y), x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h); const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1); return inter / (a.w * a.h + b.w * b.h - inter); }

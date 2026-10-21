/// <reference lib="dom" /> // the recorder code passed to page.evaluate() runs inside Chrome
/**
 * Export the show as one MP4 video (plays on any phone, TV or computer, offline).
 * The show page runs in render mode (/show/?render=1) inside a hidden Chrome; the tab's picture and sound are recorded in real time with
 * getDisplayMedia + MediaRecorder (local playback suppressed, so nothing comes out of the speakers), then ffmpeg turns the WebM recording
 * into H.264 + AAC at a constant 30 fps with faststart. Recording takes as long as the show; encoding a few minutes more.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { FFMPEG } from './ingest/ffmpeg.ts';
import { EXPORT_DIR } from './export.ts';
import { loadShow } from './show-store.ts';
import { listAssets } from './db.ts';
import { slideSeconds } from '../shared/model.ts';

export type VideoQuality = '720' | '1080';
export interface VideoProgress {
  running: boolean; phase: 'idle' | 'launch' | 'record' | 'encode' | 'done' | 'error' | 'cancelled'; quality?: VideoQuality;
  slide: number; slides: number; recorded: number; expected: number; encodePct: number;
  file?: string; bytes?: number; error?: string; startedAt?: number; finishedAt?: number;
}
export const videoProgress: VideoProgress = { running: false, phase: 'idle', slide: 0, slides: 0, recorded: 0, expected: 0, encodePct: 0 };

const QUALITY: Record<VideoQuality, { w: number; h: number; recBps: number; crf: number; maxrate: string; label: string }> = {
  '720': { w: 1280, h: 720, recBps: 6e6, crf: 24, maxrate: '3M', label: '720p' },
  '1080': { w: 1920, h: 1080, recBps: 10e6, crf: 21, maxrate: '6M', label: '1080p' },
};

export function findBrowser(): string | null {
  const env = process.env; const c = [
    `${env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`, `${env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`, `${env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`, `${env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium',
  ];
  return c.find(f => f && !f.includes('undefined') && fs.existsSync(f)) ?? null;
}

/** Expected length of the recording: every slide's time (a black screen holds 3 s in a recording) plus a little for loading and the ending. */
export function expectedSeconds(): { seconds: number; slides: number } {
  const show = loadShow(); const assets = Object.fromEntries(listAssets().map(a => [a.id, a]));
  let t = 0, n = 0; for (const c of show.chapters) for (const s of c.slides) { n++; t += s.type === 'black' ? (s.seconds ?? 3) : slideSeconds(s, c, show.settings, assets); t += s.type === 'video' ? 0.8 : show.settings.transitionSeconds * 0.5; }
  return { seconds: Math.round(t + 4), slides: n };
}

export function videoEstimate() {
  const { seconds, slides } = expectedSeconds();
  // H.264 sizes for photo slideshows with motion: about 2.2 Mb/s at 720p and 4.5 Mb/s at 1080p, plus 160 kb/s audio
  const size = (mbps: number) => Math.round(seconds * (mbps + 0.16) / 8 * 1048576);
  return { seconds, slides, browser: !!findBrowser(), sizes: { '720': size(2.2), '1080': size(4.5) }, encodeSeconds: { '720': Math.round(seconds * 0.35), '1080': Math.round(seconds * 0.7) } };
}

const safeName = (s: string) => s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\s+/g, ' ').trim() || 'show';
const stamp = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

let cancelled = false; let browserRef: { close: () => Promise<void> } | null = null; let ffmpegRef: ChildProcess | null = null;
export function cancelVideoExport(): boolean { if (!videoProgress.running) return false; cancelled = true; void browserRef?.close().catch(() => {}); ffmpegRef?.kill(); return true; }

export async function runVideoExport(opts: { dest?: string; quality: VideoQuality; base: string }): Promise<void> {
  if (videoProgress.running) throw new Error('ייצוא וידאו כבר רץ');
  const q = QUALITY[opts.quality] ?? QUALITY['720']; const exe = findBrowser();
  if (!exe) throw new Error('לא נמצא Chrome או Edge במחשב; הם נדרשים להקלטת הסרטון');
  const show = loadShow(); const { seconds: expected, slides } = expectedSeconds();
  const destRoot = path.resolve(opts.dest?.trim() || EXPORT_DIR); fs.mkdirSync(destRoot, { recursive: true });
  try { const s = fs.statfsSync(destRoot); const free = s.bavail * s.bsize; const want = expected * (q.recBps / 8) * 1.3 + expected * 0.8 * 1048576; if (free < want) throw new Error(`אין מספיק מקום ב־${destRoot}: צריך כ־${Math.round(want / 1048576)} MB`); } catch (e) { if ((e as Error).message.startsWith('אין מספיק')) throw e; }
  const final = path.join(destRoot, `${safeName(`${show.meta.title} ${stamp()}`)} ${q.label}.mp4`);
  const rec = path.join(destRoot, `sy80-rec-${Date.now()}.webm.part`), enc = path.join(destRoot, `sy80-enc-${Date.now()}.mp4.part`);
  cancelled = false;
  Object.assign(videoProgress, { running: true, phase: 'launch', quality: opts.quality, slide: 0, slides, recorded: 0, expected, encodePct: 0, file: undefined, bytes: undefined, error: undefined, startedAt: Date.now(), finishedAt: undefined });
  const cleanup = () => { for (const f of [rec, enc]) fs.rmSync(f, { force: true }); };
  try {
    // ---------- record ----------
    const puppeteer = (await import('puppeteer-core')).default;
    const browser = await puppeteer.launch({ executablePath: exe, headless: true, ignoreDefaultArgs: ['--mute-audio'], defaultViewport: { width: q.w, height: q.h },
      args: [`--window-size=${q.w},${q.h}`, '--autoplay-policy=no-user-gesture-required', '--auto-accept-this-tab-capture', '--hide-scrollbars', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
    browserRef = browser;
    const out = fs.createWriteStream(rec); let ended = 0;
    try {
      const page = await browser.newPage();
      page.on('pageerror', (e: unknown) => console.warn('[video] page error:', (e as Error).message));
      await page.exposeFunction('__sy80chunk', (b64: string) => { out.write(Buffer.from(b64, 'base64')); });
      await page.exposeFunction('__sy80state', (s: { idx: number; total: number; ended: boolean }) => { videoProgress.slide = Math.min(s.total, s.idx + 1); videoProgress.slides = s.total; if (s.ended && !ended) ended = Date.now(); });
      await page.goto(`${opts.base}/show/?render=1`, { waitUntil: 'networkidle0', timeout: 60000 });
      await page.waitForFunction(() => typeof (window as any).__sy80start === 'function', { timeout: 60000 });
      await page.evaluate((bps: number, w: number, h: number) => {
        const W = window as any; const btn = document.createElement('button'); btn.id = '__sy80rec'; btn.style.cssText = 'position:fixed;left:0;top:0;width:24px;height:24px;opacity:0;z-index:2147483647'; document.body.append(btn);
        W.__pending = 0;
        btn.onclick = async () => {
          try {
            const stream: MediaStream = await (navigator.mediaDevices as any).getDisplayMedia({ video: { frameRate: 30, width: w, height: h }, audio: { channelCount: 2, echoCancellation: false, noiseSuppression: false, autoGainControl: false, suppressLocalAudioPlayback: true }, preferCurrentTab: true, selfBrowserSurface: 'include' });
            btn.remove();
            const mime = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m))!;
            const mr = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bps, audioBitsPerSecond: 192000 });
            mr.ondataavailable = async (e) => { if (!e.data.size) return; W.__pending++; try { const u = new Uint8Array(await e.data.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000) as unknown as number[]); await W.__sy80chunk(btoa(s)); } finally { W.__pending--; } };
            mr.onstop = () => { W.__recStopped = true; };
            W.__mr = mr; mr.start(1000);
            W.__sy80start(); W.__recStarted = true;
          } catch (e) { W.__recErr = String(e); }
        };
      }, q.recBps, q.w, q.h);
      await page.click('#__sy80rec');
      await page.waitForFunction(() => (window as any).__recStarted || (window as any).__recErr, { timeout: 45000 });
      const err = await page.evaluate(() => (window as any).__recErr as string | undefined); if (err) throw new Error('הקלטת המסך לא התחילה: ' + err);
      videoProgress.phase = 'record'; const t0 = Date.now();
      const limit = expected * 1.6 + 120; // a stalled slide never blocks forever
      while (!cancelled) {
        await sleep(500); videoProgress.recorded = Math.round((Date.now() - t0) / 1000);
        if (ended && Date.now() - ended > 3500) break; // let the finale and the music fade out
        if (videoProgress.recorded > limit) { console.warn('[video] recording ran past its expected length; stopping'); break; }
      }
      if (cancelled) throw new Error('בוטל');
      await page.evaluate(() => (window as any).__mr?.stop());
      await page.waitForFunction(() => (window as any).__recStopped && (window as any).__pending === 0, { timeout: 30000 });
      await sleep(300);
    } finally {
      await new Promise<void>(r => out.end(() => r()));
      browserRef = null; await browser.close().catch(() => {});
    }
    if (cancelled) throw new Error('בוטל');
    if (!fs.existsSync(rec) || fs.statSync(rec).size < 100000) throw new Error('ההקלטה ריקה');
    // ---------- encode ----------
    videoProgress.phase = 'encode';
    const dur = videoProgress.recorded || expected;
    await new Promise<void>((res, rej) => {
      const args = ['-y', '-hide_banner', '-i', rec, '-fps_mode', 'cfr', '-r', '30', '-vf', `scale=${q.w}:${q.h}:flags=lanczos,format=yuv420p`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', String(q.crf), '-maxrate', q.maxrate, '-bufsize', q.maxrate.replace('M', '') + 'M', '-profile:v', 'high', '-level', '4.1',
        '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', '-f', 'mp4', enc];
      const c = spawn(FFMPEG, args, { windowsHide: true }); ffmpegRef = c; let tail = '';
      c.stderr.on('data', d => { const t = d.toString(); tail = (tail + t).slice(-2000); const m = /time=(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t); if (m) videoProgress.encodePct = Math.min(99, Math.round(((+m[1]) * 3600 + (+m[2]) * 60 + (+m[3])) / dur * 100)); });
      c.on('error', rej); c.on('close', code => { ffmpegRef = null; if (cancelled) rej(new Error('בוטל')); else if (code === 0) res(); else rej(new Error('המרת הסרטון נכשלה: ' + tail.split('\n').slice(-4).join(' | '))); });
    });
    fs.renameSync(enc, final); fs.rmSync(rec, { force: true });
    Object.assign(videoProgress, { running: false, phase: 'done', encodePct: 100, file: final, bytes: fs.statSync(final).size, finishedAt: Date.now() });
  } catch (e) {
    cleanup();
    Object.assign(videoProgress, { running: false, phase: cancelled ? 'cancelled' : 'error', error: cancelled ? undefined : (e as Error).message, finishedAt: Date.now() });
  } finally { browserRef = null; ffmpegRef = null; }
}

import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';

export const FFMPEG = (ffmpegPath as unknown as string) || 'ffmpeg';

export function run(args: string[], opts: { collectStdout?: boolean } = {}): Promise<{ code: number; stderr: string; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { windowsHide: true });
    const err: string[] = []; const out: Buffer[] = [];
    p.stderr.on('data', d => { err.push(d.toString()); if (err.length > 400) err.splice(0, 200); });
    if (opts.collectStdout) p.stdout.on('data', d => out.push(d)); else p.stdout.resume();
    p.on('error', reject);
    p.on('close', code => resolve({ code: code ?? -1, stderr: err.join(''), stdout: Buffer.concat(out) }));
  });
}

export interface MediaInfo { duration: number; width?: number; height?: number; rotation?: number; hasAudio: boolean; hasVideo: boolean }

/** ffmpeg-static ships no ffprobe; parse `ffmpeg -i` instead. */
export async function probe(file: string): Promise<MediaInfo> {
  const { stderr } = await run(['-hide_banner', '-i', file]);
  const dur = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr);
  const duration = dur ? (+dur[1]) * 3600 + (+dur[2]) * 60 + (+dur[3]) : 0;
  const vid = /Stream #\d+:\d+.*?Video:.*?(\d{2,5})x(\d{2,5})/.exec(stderr);
  const rot = /rotation of (-?\d+(?:\.\d+)?) degrees/.exec(stderr) || /rotate\s*:\s*(-?\d+)/.exec(stderr) || /displaymatrix:.*?rotation of (-?\d+(?:\.\d+)?)/.exec(stderr);
  let width = vid ? +vid[1] : undefined, height = vid ? +vid[2] : undefined;
  const rotation = rot ? Math.abs(Math.round(+rot[1])) % 360 : 0;
  if (width && height && (rotation === 90 || rotation === 270)) [width, height] = [height, width];
  return { duration, width, height, rotation, hasAudio: /Audio:/.test(stderr), hasVideo: !!vid };
}

export async function transcodeVideo(input: string, output: string, poster: string): Promise<{ loudnessGain?: number }> {
  // Scale so the long edge is at most 1920 (portrait stays portrait), even dimensions, H.264 + normalized AAC, faststart for seeking.
  const vf = "scale=w='if(gte(iw,ih),min(1920,iw),-2)':h='if(gte(iw,ih),-2,min(1920,ih))',format=yuv420p";
  const args = ['-y', '-hide_banner', '-i', input, '-vf', vf, '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-profile:v', 'high', '-level', '4.1',
    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=summary', '-c:a', 'aac', '-b:a', '160k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output];
  const r = await run(args);
  if (r.code !== 0) throw new Error('ffmpeg transcode failed: ' + r.stderr.split('\n').slice(-6).join(' | '));
  const gainIn = /Input Integrated:\s*(-?\d+(?:\.\d+)?)\s*LUFS/.exec(r.stderr);
  const loudnessGain = gainIn ? Math.round((-16 - (+gainIn[1])) * 10) / 10 : undefined;
  const p = await run(['-y', '-hide_banner', '-ss', '1', '-i', output, '-frames:v', '1', '-q:v', '3', poster]);
  if (p.code !== 0) { const p2 = await run(['-y', '-hide_banner', '-i', output, '-frames:v', '1', '-q:v', '3', poster]); if (p2.code !== 0) throw new Error('poster failed'); }
  return { loudnessGain };
}

export async function transcodeMusic(input: string, output: string): Promise<void> {
  const r = await run(['-y', '-hide_banner', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', output]);
  if (r.code !== 0) throw new Error('ffmpeg music failed: ' + r.stderr.split('\n').slice(-4).join(' | '));
}

/** 512 normalized peak buckets for the editor waveform. */
export async function peaks(input: string, buckets = 512): Promise<number[]> {
  const r = await run(['-hide_banner', '-i', input, '-vn', '-ac', '1', '-ar', '2000', '-f', 's16le', '-'], { collectStdout: true });
  if (r.code !== 0 || r.stdout.length < 4) return [];
  const samples = r.stdout.length / 2; const per = Math.max(1, Math.floor(samples / buckets)); const out: number[] = [];
  for (let b = 0; b < buckets; b++) { let m = 0; const s0 = b * per; for (let i = s0; i < Math.min(samples, s0 + per); i++) { const v = Math.abs(r.stdout.readInt16LE(i * 2)); if (v > m) m = v; } out.push(m / 32768); }
  const mx = Math.max(0.0001, ...out); return out.map(v => Math.round(v / mx * 1000) / 1000);
}

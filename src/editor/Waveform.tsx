import { useEffect, useRef } from 'react';
import { fmtTime } from '@shared/model';

/** Music waveform with the chapter's coverage drawn from the start offset; drag to set the offset. */
export function Waveform({ peaks, duration, start, cover, onStart }: { peaks: number[]; duration: number; start: number; cover: number; onStart: (sec: number) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { const c = ref.current; if (!c) return; const dpr = window.devicePixelRatio || 1; const W = c.clientWidth, H = c.clientHeight; c.width = W * dpr; c.height = H * dpr; const x = c.getContext('2d')!; x.scale(dpr, dpr); x.clearRect(0, 0, W, H);
    const n = peaks.length || 1; const bw = W / n; for (let i = 0; i < n; i++) { const v = peaks[i] ?? 0; const h = Math.max(1, v * (H - 6)); const t = (n - 1 - i) / n * duration; const inCover = t >= start && t <= start + cover; x.fillStyle = inCover ? 'rgba(212,168,75,.95)' : 'rgba(207,201,186,.28)'; x.fillRect(i * bw, (H - h) / 2, Math.max(1, bw - .6), h); } }, [peaks, duration, start, cover]);
  const pick = (e: React.PointerEvent) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const frac = 1 - (e.clientX - r.left) / r.width; onStart(Math.max(0, Math.min(duration - 5, Math.round(frac * duration)))); };
  const onDown = (e: React.PointerEvent) => { pick(e); const el = e.currentTarget as HTMLElement; const move = (ev: PointerEvent) => { const r = el.getBoundingClientRect(); const frac = 1 - (ev.clientX - r.left) / r.width; onStart(Math.max(0, Math.min(duration - 5, Math.round(frac * duration)))); }; const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  const startPct = duration ? start / duration * 100 : 0;
  return (
    <div className="wave" onPointerDown={onDown} title="לחץ או גרור לקביעת נקודת ההתחלה של המוזיקה" style={{ cursor: 'ew-resize' }}>
      <canvas ref={ref} />
      <div className="cursor" style={{ insetInlineStart: `${startPct}%` }} />
      <div className="lab">{fmtTime(start)} → {fmtTime(Math.min(duration, start + cover))} / {fmtTime(duration)}</div>
    </div>
  );
}

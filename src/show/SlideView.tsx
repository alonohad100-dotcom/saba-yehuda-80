import { useEffect, useRef } from 'react';
import type { Slide } from '@shared/model';
import { buildSlide, animateSlide, type RenderCtx } from './slides';

/** Mounts the shared imperative slide renderer inside React. `animate` loops the slide's own GSAP timeline (preview mode). */
export function SlideView({ slide, ctx, animate = true, className, onPick, replayKey }: { slide: Slide; ctx: RenderCtx; animate?: boolean; className?: string; onPick?: (x: number, y: number) => void; replayKey?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const sig = JSON.stringify(slide) + '|' + JSON.stringify(ctx.settings) + '|' + (ctx.chapter?.defaults ? JSON.stringify(ctx.chapter.defaults) : '') + '|' + Object.keys(ctx.assets).length;
  useEffect(() => {
    const host = ref.current; if (!host) return;
    host.innerHTML = ''; const root = buildSlide(slide, ctx); host.append(root);
    const tl = animate ? animateSlide(root, slide, ctx, { preview: true }) : null;
    if (!animate) { const t = animateSlide(root, slide, ctx, {}); t.progress(1); t.kill(); }
    return () => { tl?.kill(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, animate, replayKey]);
  return <div ref={ref} className={className} style={{ position: 'absolute', inset: 0 }} onClick={onPick ? (e) => { if ((e.target as HTMLElement).closest('.ov, .cap, [data-tx]')) return; const r = e.currentTarget.getBoundingClientRect(); onPick(Math.round((e.clientX - r.left) / r.width * 100), Math.round((e.clientY - r.top) / r.height * 100)); } : undefined} />;
}

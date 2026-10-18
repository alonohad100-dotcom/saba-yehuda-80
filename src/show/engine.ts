import gsap from 'gsap';
import { type Show, type Slide, type Chapter, type Asset, DERIVATIVES, slideSeconds, slideAdvance, slideTransition, slideTitle, TYPE_LABEL, slideAssetIds } from '@shared/model';
import { buildSlide, animateSlide, preloadSlide, type RenderCtx } from './slides';
import { resolveTheme, themeById, nextThemeId } from '@shared/themes';

/** Change data-theme with the browser's native cross-fade when available (View Transitions API), else instantly. */
export function applyThemeAttr(el: HTMLElement, theme: string) {
  if (el.dataset.theme === theme) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };
  el.classList.add('theming'); const done = () => setTimeout(() => el.classList.remove('theming'), 800);
  if (!reduce && typeof doc.startViewTransition === 'function' && !document.hidden) {
    try { const vt = doc.startViewTransition(() => { el.dataset.theme = theme; }) as { finished: Promise<void>; ready?: Promise<void>; updateCallbackDone?: Promise<void> };
      vt.ready?.catch(() => {}); vt.updateCallbackDone?.catch(() => {}); // a skipped transition rejects these too; never let that surface
      vt.finished.catch(() => { el.dataset.theme = theme; }).finally(done); return; } catch { /* fall through */ } }
  el.dataset.theme = theme; done();
}

/** Animate layer `inL` in and `outL` out with one of the six transitions (shared by the player and the guide's demos). */
export function runTransition(inL: HTMLElement, outL: HTMLElement, t: string, d: number) {
  gsap.killTweensOf([inL, outL]); gsap.set([inL, outL], { clearProps: 'transform' });
  if (t === 'dip') { gsap.fromTo(inL, { opacity: 0 }, { opacity: 1, duration: d * .6, delay: d * .5, ease: 'power1.inOut' }); gsap.to(outL, { opacity: 0, duration: d * .5, ease: 'power1.in' }); }
  else if (t === 'push') { gsap.fromTo(inL, { xPercent: -100, opacity: 1 }, { xPercent: 0, duration: d, ease: 'power3.inOut' }); gsap.fromTo(outL, { xPercent: 0 }, { xPercent: 100, duration: d, ease: 'power3.inOut', onComplete: () => { gsap.set(outL, { opacity: 0, xPercent: 0 }); } }); }
  else if (t === 'zoom') { gsap.fromTo(inL, { opacity: 0, scale: 1.15 }, { opacity: 1, scale: 1, duration: d, ease: 'power2.out' }); gsap.to(outL, { opacity: 0, scale: .92, duration: d * .8, ease: 'power2.in', onComplete: () => gsap.set(outL, { scale: 1 }) }); }
  else if (t === 'wipe') { gsap.fromTo(inL, { opacity: 1, clipPath: 'inset(0 0 0 100%)' }, { clipPath: 'inset(0 0 0 0%)', duration: d, ease: 'power2.inOut', onComplete: () => gsap.set(inL, { clearProps: 'clipPath' }) }); gsap.to(outL, { opacity: 0, duration: .1, delay: d }); }
  else if (t === 'blur') { gsap.fromTo(inL, { opacity: 0, filter: 'blur(24px)' }, { opacity: 1, filter: 'blur(0px)', duration: d * 1.2, ease: 'power2.out', onComplete: () => gsap.set(inL, { clearProps: 'filter' }) }); gsap.to(outL, { opacity: 0, filter: 'blur(24px)', duration: d, ease: 'power2.in', onComplete: () => gsap.set(outL, { clearProps: 'filter' }) }); }
  else { gsap.fromTo(inL, { opacity: 0 }, { opacity: 1, duration: d, ease: 'power1.inOut' }); gsap.to(outL, { opacity: 0, duration: d, ease: 'power1.inOut' }); }
}

/* ---------------- audio bus: music A/B crossfade + video, all through one AudioContext ---------------- */
export class AudioBus {
  ctx: AudioContext | null = null;
  master!: GainNode; musicGain!: GainNode; videoGain!: GainNode;
  private els: [HTMLAudioElement, HTMLAudioElement] | null = null; private active = 0; private sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();
  level = .7; duckLevel = .1; muted = false; ducked = false; currentId: string | null = null; private loopStart = 0;
  onMeter?: (music: number, video: number) => void;
  unlock() {
    if (this.ctx) { void this.ctx.resume(); return; }
    this.ctx = new AudioContext(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain(); this.musicGain.gain.value = 0; this.musicGain.connect(this.master);
    this.videoGain = this.ctx.createGain(); this.videoGain.gain.value = 1; this.videoGain.connect(this.master);
    this.els = [new Audio(), new Audio()]; for (const a of this.els) { a.preload = 'auto'; a.loop = false; this.source(a).connect(this.musicGain); a.addEventListener('timeupdate', () => this.maybeLoop(a)); }
  }
  private source(m: HTMLMediaElement): MediaElementAudioSourceNode { let s = this.sources.get(m); if (!s) { s = this.ctx!.createMediaElementSource(m); this.sources.set(m, s); } return s; }
  private target() { return this.muted ? 0 : (this.ducked ? this.level * this.duckLevel : this.level); }
  private ramp(g: GainNode, v: number, t: number) { if (!this.ctx) return; g.gain.cancelScheduledValues(this.ctx.currentTime); g.gain.setTargetAtTime(v, this.ctx.currentTime, Math.max(.01, t / 3)); }
  /** Switch to a chapter's track with a crossfade; same id keeps playing. */
  setTrack(assetId: string | undefined, startSec = 0, level?: number) {
    if (!this.ctx || !this.els) return;
    if (level != null) this.level = level;
    if (!assetId || assetId === this.currentId) { this.ramp(this.musicGain, this.target(), 1); this.meter(); return; }
    const url = DERIVATIVES.music(assetId); this.currentId = assetId; this.loopStart = startSec;
    const old = this.els[this.active]; const nxt = this.els[1 - this.active]; this.active = 1 - this.active;
    // per-element fade using the element volume while the shared gain stays at target
    nxt.src = url; nxt.currentTime = startSec; nxt.volume = 0; void nxt.play().catch(() => {});
    gsap.to(nxt, { volume: 1, duration: 2.2, ease: 'power1.inOut' });
    gsap.to(old, { volume: 0, duration: 1.8, ease: 'power1.inOut', onComplete: () => { old.pause(); old.removeAttribute('src'); old.load(); } });
    this.ramp(this.musicGain, this.target(), 1); this.meter();
  }
  private maybeLoop(a: HTMLAudioElement) { // seamless loop with a 2 s crossfade if the track runs out before the chapter ends
    if (!this.els || a !== this.els[this.active] || !isFinite(a.duration) || a.duration === 0) return;
    if (a.duration - a.currentTime < 2.2 && !(a as any).__looping) { (a as any).__looping = true; const other = this.els[1 - this.active]; this.active = 1 - this.active; other.src = a.currentSrc; other.currentTime = this.loopStart; other.volume = 0; void other.play().catch(() => {}); gsap.to(other, { volume: 1, duration: 2 }); gsap.to(a, { volume: 0, duration: 2, onComplete: () => { a.pause(); (a as any).__looping = false; } }); }
  }
  duck(on: boolean) { this.ducked = on; this.ramp(this.musicGain, this.target(), on ? .6 : 1.4); this.meter(); }
  mute(m: boolean) { this.muted = m; this.ramp(this.musicGain, this.target(), .3); this.meter(); }
  attachVideo(v: HTMLVideoElement, volume = 1) { if (!this.ctx) return; try { this.source(v).connect(this.videoGain); } catch { /* already connected */ } v.volume = Math.min(1, volume); }
  stopMusic() { if (!this.els) return; this.ramp(this.musicGain, 0, 1); setTimeout(() => this.els?.forEach(a => a.pause()), 1500); this.currentId = null; }
  meter() { this.onMeter?.(this.muted ? 0 : (this.ducked ? this.level * this.duckLevel : this.level), this.ducked ? 1 : 0); }
  destroy() { this.els?.forEach(a => { a.pause(); a.removeAttribute('src'); }); void this.ctx?.close(); this.ctx = null; }
}

/* ---------------- player ---------------- */
export interface PlayerState {
  started: boolean; idx: number; total: number; slideId: string | null; type: string | null; title: string; chapterId: string | null; chapterTitle: string;
  paused: boolean; black: boolean; muted: boolean; manual: boolean; seconds: number; startedAt: number; nextTitle: string; nextType: string | null; notes: string; ended: boolean;
  theme: string; liveTheme: string | null;
}
type Entry = { s: Slide; c: Chapter };

export class Player {
  root: HTMLElement; layers: [HTMLElement, HTMLElement]; private cur = 0; idx = -1; started = false; paused = false; black = false; ended = false;
  private tl: gsap.core.Timeline | null = null; private timer: gsap.core.Tween | null = null; private video: HTMLVideoElement | null = null;
  audio: AudioBus | null; startedAt = 0; private listeners: ((st: PlayerState) => void)[] = []; private confettiCanvas: HTMLCanvasElement | null = null;
  liveTheme: string | null = null;
  /** Theme for the slide at index i (live override → slide → chapter → show). */
  themeFor(i = this.idx): string { const sh = this.getShow(); const e = this.list()[i]; return resolveTheme(sh?.settings.theme, e?.c.theme, e?.s.theme, this.liveTheme); }
  applyTheme() { applyThemeAttr(this.root, this.themeFor()); }
  setLiveTheme(id: string | null) { this.liveTheme = id ? themeById(id).id : null; this.applyTheme(); this.emit(); }
  cycleTheme(dir: 1 | -1 = 1) { this.setLiveTheme(nextThemeId(this.themeFor(), dir)); }
  constructor(root: HTMLElement, private getShow: () => Show | null, private getAssets: () => Record<string, Asset>, private opts: { silent?: boolean; filter?: (e: Entry) => boolean } = {}) {
    this.root = root; const a = document.createElement('div'); a.className = 'layer'; const b = document.createElement('div'); b.className = 'layer'; root.append(a, b); this.layers = [a, b];
    this.audio = opts.silent ? null : new AudioBus();
  }
  list(): Entry[] { const sh = this.getShow(); if (!sh) return []; const all = sh.chapters.flatMap(c => c.slides.map(s => ({ s, c }))); return this.opts.filter ? all.filter(this.opts.filter) : all; }
  ctx(c?: Chapter): RenderCtx { const sh = this.getShow()!; return { assets: this.getAssets(), settings: sh.settings, chapter: c, showPhotoIds: sh.chapters.flatMap(ch => ch.slides.flatMap(s => s.type === 'photo' ? [s.assetId] : s.type === 'collage' ? s.assetIds : [])) }; }
  on(fn: (st: PlayerState) => void) { this.listeners.push(fn); return () => { this.listeners = this.listeners.filter(f => f !== fn); }; }
  state(): PlayerState {
    const L = this.list(); const e = L[this.idx]; const n = L[this.idx + 1]; const sh = this.getShow();
    return { started: this.started, idx: this.idx, total: L.length, slideId: e?.s.id ?? null, type: e?.s.type ?? null, title: e ? slideTitle(e.s) : '', chapterId: e?.c.id ?? null, chapterTitle: e?.c.title ?? '', paused: this.paused, black: this.black, muted: this.audio?.muted ?? false,
      manual: e ? slideAdvance(e.s) === 'manual' : false, seconds: e && sh ? slideSeconds(e.s, e.c, sh.settings, this.getAssets()) : 0, startedAt: this.startedAt, nextTitle: n ? `${n.c.title} · ${TYPE_LABEL[n.s.type]}${slideTitle(n.s) ? ' · ' + slideTitle(n.s) : ''}` : 'סוף המצגת', nextType: n?.s.type ?? null, notes: e?.s.notes ?? '', ended: this.ended,
      theme: this.themeFor(), liveTheme: this.liveTheme };
  }
  emit() { const st = this.state(); this.listeners.forEach(f => f(st)); }
  start(fromId?: string) {
    this.started = true; this.startedAt = Date.now(); this.ended = false;
    if (this.audio) { this.audio.unlock(); const sh = this.getShow(); if (sh) { this.audio.level = sh.settings.musicLevel; this.audio.duckLevel = sh.settings.duckLevel; } }
    const i = fromId ? this.list().findIndex(x => x.s.id === fromId) : 0; this.go(Math.max(0, i), 'fade');
  }
  goToId(id: string) { const i = this.list().findIndex(x => x.s.id === id); if (i >= 0) this.go(i, 'fade'); }
  go(i: number, trans?: string) {
    const L = this.list(); const sh = this.getShow(); if (!L.length || !sh) return;
    i = Math.max(0, Math.min(L.length - 1, i)); const { s, c } = L[i]; const prevEntry = L[this.idx]; this.idx = i; this.black = false; this.ended = false;
    this.tl?.kill(); this.timer?.kill(); if (this.video) { this.video.pause(); this.video = null; }
    const inL = this.layers[1 - this.cur], outL = this.layers[this.cur]; this.cur = 1 - this.cur;
    inL.innerHTML = ''; const ctx = this.ctx(c); const root = buildSlide(s, ctx); inL.append(root); inL.style.zIndex = '2'; outL.style.zIndex = '1';
    this.applyTheme();
    const t = trans ?? slideTransition(s, c, sh.settings); const d = sh.settings.transitionSeconds;
    runTransition(inL, outL, t, d);
    setTimeout(() => { if (this.layers[this.cur] === inL) outL.innerHTML = ''; }, (d + .3) * 1000); // free the old slide's media
    this.tl = animateSlide(root, s, ctx, { onFinale: () => this.confetti() });
    // music per chapter
    if (this.audio && (!prevEntry || prevEntry.c.id !== c.id || !this.audio.currentId)) { if (c.musicId) this.audio.setTrack(c.musicId, c.musicStartSec ?? 0, c.musicLevel ?? sh.settings.musicLevel); }
    // video: play, duck, advance on end
    const secs = slideSeconds(s, c, sh.settings, this.getAssets()); const manual = slideAdvance(s) === 'manual';
    if (s.type === 'video') {
      const v = root.querySelector('video') as HTMLVideoElement | null;
      if (v) { this.video = v; const inn = s.trimIn ?? 0; const out = s.trimOut; v.currentTime = inn; if (this.audio) this.audio.attachVideo(v, s.volume ?? 1); else v.muted = true;
        const prog = root.querySelector('.vprog i') as HTMLElement | null;
        v.addEventListener('timeupdate', () => { if (prog) prog.style.width = `${Math.min(100, ((v.currentTime - inn) / Math.max(.1, (out ?? v.duration) - inn)) * 100)}%`; if (out != null && v.currentTime >= out) { v.pause(); this.onVideoEnd(manual); } });
        v.addEventListener('ended', () => this.onVideoEnd(manual));
        const startPlay = () => { void v.play().catch(() => { /* autoplay blocked: user already clicked Start, so this is rare */ }); if (this.audio) this.audio.duck(true); };
        if (v.readyState >= 2) startPlay(); else v.addEventListener('loadeddata', startPlay, { once: true });
        if (!manual) this.timer = gsap.delayedCall(secs + 6, () => this.next()); // safety net if 'ended' never fires
      }
    } else {
      if (this.audio?.ducked) gsap.delayedCall(.3, () => this.audio?.duck(false));
      if (!manual && !this.paused) this.timer = gsap.delayedCall(secs + d * .5, () => this.next());
    }
    for (const e of L.slice(i + 1, i + 4)) preloadSlide(e.s, ctx);
    this.emit();
  }
  private onVideoEnd(manual: boolean) { if (this.audio) this.audio.duck(false); if (!manual && this.idx < this.list().length - 1 && !this.paused) { this.timer?.kill(); this.timer = gsap.delayedCall(.8, () => this.next()); } else if (!manual) { this.ended = true; this.emit(); } }
  next() { if (this.idx >= this.list().length - 1) { this.ended = true; this.timer?.kill(); this.emit(); return; } this.go(this.idx + 1); }
  prev() { this.go(Math.max(0, this.idx - 1)); }
  pause() { this.paused = !this.paused; if (this.paused) { this.timer?.pause(); this.tl?.pause(); this.video?.pause(); } else { this.timer?.resume(); this.tl?.resume(); void this.video?.play().catch(() => {}); } this.emit(); }
  toggleBlack() { this.black = !this.black; this.layers.forEach(l => gsap.to(l, { opacity: this.black ? 0 : 1, duration: .5 })); if (this.black) { this.timer?.pause(); this.tl?.pause(); this.video?.pause(); if (this.audio) this.audio.mute(true); } else { this.timer?.resume(); this.tl?.resume(); void this.video?.play().catch(() => {}); if (this.audio) this.audio.mute(false); } this.emit(); }
  toggleMute() { if (this.audio) this.audio.mute(!this.audio.muted); this.emit(); }
  restart() { this.paused = false; this.go(0, 'dip'); }
  fullscreen() { if (document.fullscreenElement) void document.exitFullscreen().catch(() => {}); else void this.root.requestFullscreen?.().catch(() => {}); }
  elapsed() { return this.started ? (Date.now() - this.startedAt) / 1000 : 0; }
  remaining() { const sh = this.getShow(); if (!sh) return 0; return this.list().slice(Math.max(0, this.idx)).reduce((t, e) => t + slideSeconds(e.s, e.c, sh.settings, this.getAssets()), 0); }
  confetti() {
    if (this.opts.silent) return; const c = document.createElement('canvas'); c.className = 'confetti'; this.root.append(c); this.confettiCanvas = c;
    const x = c.getContext('2d')!; const W = c.width = this.root.clientWidth, H = c.height = this.root.clientHeight;
    const palette = (getComputedStyle(this.root).getPropertyValue('--t-confetti') || '').split(',').map(s => s.trim()).filter(Boolean); const cols = palette.length ? palette : ['#d4a84b', '#f1d38a', '#ece6d8', '#b8862e', '#fff5d6'];
    const parts = Array.from({ length: 160 }, () => ({ x: Math.random() * W, y: -20 - Math.random() * H * .6, vx: (Math.random() - .5) * 2.2, vy: 2 + Math.random() * 3, r: 5 + Math.random() * 7, a: Math.random() * 6, va: (Math.random() - .5) * .2, col: cols[Math.floor(Math.random() * cols.length)] }));
    const t0 = performance.now(); const step = (now: number) => { x.clearRect(0, 0, W, H); for (const p of parts) { p.x += p.vx; p.y += p.vy; p.a += p.va; x.save(); x.translate(p.x, p.y); x.rotate(p.a); x.fillStyle = p.col; x.fillRect(-p.r / 2, -p.r / 4, p.r, p.r / 2); x.restore(); } if (now - t0 < 7000 && this.confettiCanvas === c) requestAnimationFrame(step); else c.remove(); }; requestAnimationFrame(step);
  }
  destroy() { this.tl?.kill(); this.timer?.kill(); this.video?.pause(); this.audio?.destroy(); this.layers.forEach(l => l.remove()); this.confettiCanvas?.remove(); }
}

export const usedAssetIds = (show: Show) => new Set(show.chapters.flatMap(c => c.slides.flatMap(slideAssetIds)));

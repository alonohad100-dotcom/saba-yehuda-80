import gsap from 'gsap';
import { type Slide, type Chapter, type Settings, type Asset, type Overlay, DERIVATIVES, slideSeconds, cssFilter } from '@shared/model';
import { symbolSvg } from '@shared/symbols';
gsap.config({ nullTargetWarn: false }); // optional parts (a caption, a hero image) are legitimately absent on some slides

export type MediaKind = 'display' | 'thumb' | 'poster' | 'posterThumb' | 'video';
/** `resolve` overrides where an asset's media comes from (the guide renders demo slides from generated images; the show uses the cache derivatives). */
export interface RenderCtx { assets: Record<string, Asset>; settings: Settings; chapter?: Chapter; showPhotoIds?: string[]; resolve?: (a: Asset, kind: MediaKind) => string }
export function mediaUrl(ctx: RenderCtx, a: Asset, kind: MediaKind): string {
  if (ctx.resolve) return ctx.resolve(a, kind);
  switch (kind) { case 'display': return DERIVATIVES.display(a.id); case 'thumb': return DERIVATIVES.thumb(a.id); case 'poster': return DERIVATIVES.poster(a.id); case 'posterThumb': return DERIVATIVES.posterThumb(a.id); case 'video': return DERIVATIVES.video(a.id); }
}

const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0.9 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}")`;

const el = (tag: string, cls?: string, html?: string) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = (s: string | undefined) => (s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
const words = (t: string) => esc(t).split(/\s+/).filter(Boolean).map(w => `<span class="w">${w}</span>`).join(' ');

function img(ctx: RenderCtx, id: string | undefined, cls = '', kind: 'display' | 'thumb' = 'display'): HTMLImageElement {
  const a = id ? ctx.assets[id] : undefined; const i = el('img', cls) as HTMLImageElement; i.alt = ''; i.draggable = false; i.decoding = 'async';
  if (a) { if (a.type === 'photo') i.src = mediaUrl(ctx, a, kind === 'display' ? 'display' : 'thumb'); else if (a.type === 'video') i.src = mediaUrl(ctx, a, kind === 'display' ? 'poster' : 'posterThumb'); }
  else i.classList.add('missing');
  return i;
}
const grain = () => { const g = el('div', 'grain'); g.style.backgroundImage = NOISE; return g; };
const KB: Record<string, { s0: number; s1: number; x0?: number; x1?: number; y0?: number; y1?: number }> = { in: { s0: 1, s1: 1.14 }, out: { s0: 1.14, s1: 1 }, left: { s0: 1.1, s1: 1.1, x0: -3, x1: 3 }, right: { s0: 1.1, s1: 1.1, x0: 3, x1: -3 }, up: { s0: 1.08, s1: 1.08, y0: 3, y1: -3 }, down: { s0: 1.08, s1: 1.08, y0: -3, y1: 3 }, none: { s0: 1, s1: 1 } };

const FONT: Record<string, string> = { display: 'var(--t-font-display)', ui: 'var(--t-font-ui)', num: 'var(--t-font-num)' }; const THEME_FONT = FONT;
const splitFor = (anim: string | undefined, text: string) => anim === 'letters' ? esc(text).split('').map(c => `<span class="ch">${c === ' ' ? '&nbsp;' : c}</span>`).join('') : anim === 'typewriter' || anim === 'words' ? esc(text).split(/(\s+)/).map(w => (/^\s+$/.test(w) ? ' ' : `<span class="w">${w}</span>`)).join('') : esc(text).replace(/\n/g, '<br>');

/** Free elements placed on the slide: text, symbols, emoji, shapes, image stickers. Positions are % of the stage. */
function buildOverlays(s: Slide, ctx: RenderCtx): HTMLElement | null {
  if (!s.overlays?.length) return null;
  const layer = el('div', 'ovl');
  for (const o of s.overlays.slice().sort((a, b) => a.z - b.z)) {
    const d = el('div', `ov ov-${o.kind}`); d.dataset.oid = o.id;
    d.style.left = `${o.x}%`; d.style.top = `${o.y}%`; d.style.width = `${o.w}%`; d.style.opacity = String(o.opacity); d.style.zIndex = String(10 + o.z); if (o.rotate) d.style.transform = `rotate(${o.rotate}deg)`;
    switch (o.kind) {
      case 'text': { d.classList.add(`bg-${o.bg}`, `al-${o.align}`); if (o.accent) d.classList.add('accent'); d.style.fontFamily = THEME_FONT[o.font]; d.style.fontSize = `${o.size}cqw`; if (o.color === 'auto') d.classList.add('color-auto'); else d.style.color = o.color; d.style.fontWeight = String(o.weight); if (!o.shadow) d.classList.add('noshadow'); d.innerHTML = `<div class="tx">${splitFor(o.anim?.in, o.text)}</div>`; break; }
      case 'symbol': { if (o.color === 'auto') { d.classList.add('color-auto'); if (o.fill) d.classList.add('filled'); } d.innerHTML = symbolSvg(o.name, o.color === 'auto' ? '#d4a84b' : o.color, o.stroke, o.fill); break; }
      case 'emoji': d.style.fontSize = `${o.w * 0.78}cqw`; d.textContent = o.char; break;
      case 'shape': { d.classList.add(`sh-${o.shape}`); if (o.color === 'auto') d.classList.add('color-auto'); const col = o.color === 'auto' ? '#d4a84b' : o.color; d.style.height = o.shape === 'line' ? `${o.stroke}cqw` : `${o.h}cqh`; if (o.shape === 'frame') { d.style.border = `${o.stroke}cqw solid ${col}`; d.style.borderRadius = `${o.radius}%`; } else { d.style.background = col; d.style.borderRadius = o.shape === 'circle' ? '50%' : `${o.radius}%`; } break; }
      case 'image': { const a = ctx.assets[o.assetId]; d.classList.add(`mask-${o.mask}`); if (o.border) d.classList.add('bordered'); d.style.height = `${o.h}cqh`; const im = img(ctx, o.assetId); im.style.objectFit = o.fit; if (a?.focal) im.style.objectPosition = `${a.focal[0]}% ${a.focal[1]}%`; d.append(im); break; }
    }
    layer.append(d);
  }
  return layer;
}

export function buildSlide(s: Slide, ctx: RenderCtx): HTMLElement {
  const root = el('div', 'sl ' + s.type); root.dataset.id = s.id;
  const filter = cssFilter(s.look); if (filter) root.style.setProperty('--media-filter', filter); if (s.look) root.style.setProperty('--vig', String(s.look.vignette));
  if (s.captionStyle) { root.classList.add(`cap-${s.captionStyle.position}`, `capal-${s.captionStyle.align}`); root.style.setProperty('--cap-scale', String(s.captionStyle.size)); root.style.setProperty('--cap-font', FONT[s.captionStyle.font]); if (s.captionStyle.box) root.classList.add('cap-box'); }
  buildInner(root, s, ctx);
  const ovl = buildOverlays(s, ctx); if (ovl) root.append(ovl);
  return root;
}

function buildInner(root: HTMLElement, s: Slide, ctx: RenderCtx) {
  switch (s.type) {
    case 'intro': root.innerHTML = `<div class="center"><div><div class="intro-name">${esc(s.title)}</div><div class="intro-num">${esc(s.number || '80')}</div><div class="intro-sub">${esc(s.subtitle)}</div></div></div>`; root.append(grain()); break;
    case 'chapter': { if (s.heroAssetId) root.append(img(ctx, s.heroAssetId, 'img')); else root.classList.add('nohero'); root.append(el('div', 'shade'), el('div', 'ch-label', `<div class="eb">${esc(s.eyebrow || 'פרק')}</div><div class="t">${esc(s.label)}</div><div class="rule"></div><div class="b">${esc(s.blurb)}</div>`)); if (s.heroAssetId) root.append(grain()); break; }
    case 'photo': { const a = ctx.assets[s.assetId]; const im = img(ctx, s.assetId, 'img'); const f = s.focal ?? a?.focal ?? [50, 50]; im.style.transformOrigin = `${f[0]}% ${f[1]}%`;
      const wrap = el('div', 'imgwrap'); const fr = s.frame; if (fr && (fr.rotate || fr.flipH)) wrap.style.transform = `rotate(${fr.rotate}deg) scaleX(${fr.flipH ? -1 : 1})`; wrap.append(im); root.append(wrap, el('div', 'vig'));
      const archival = s.grain ?? (ctx.settings.grainOnArchival && (s.year ?? a?.year ?? 2100) < ctx.settings.archivalBeforeYear); if (archival) root.append(grain());
      if (s.caption || s.year) root.append(el('div', 'cap', `${s.year ? `<span class="yr">${s.year}</span><span class="rule"></span>` : ''}<span class="tx">${splitFor(s.captionStyle?.anim, s.caption ?? '')}</span>`)); break; }
    case 'photo-pair': { const p = el('div', 'pair'); s.assetIds.forEach((id, i) => { const ph = el('div', 'ph'); ph.append(img(ctx, id)); const a = ctx.assets[id]; const tag = s.tags?.[i] ?? (a?.year ? String(a.year) : ''); if (tag) ph.append(el('div', 'tag', esc(tag))); p.append(ph); }); root.append(p); if (s.caption) root.append(el('div', 'cap', `<span class="tx">${esc(s.caption)}</span>`)); break; }
    case 'collage': { const ids = s.assetIds.slice(0, 6); const n = ids.length; const layout = s.layout ?? (n === 2 ? 'two-up' : n === 6 ? 'mosaic-6' : 'hero-right'); const g = el('div', `grid n${n} l-${layout}`); const hero = Math.min(s.heroIndex ?? 0, n - 1);
      // the hero photo is rendered first so the layout's first cell (the big one) always gets it
      const order = [ids[hero], ...ids.filter((_, i) => i !== hero)];
      order.forEach((id, i) => { const ph = el('div', 'ph' + (i === 0 ? ' hero' : '')); const im = img(ctx, id); const a = ctx.assets[id]; if (a?.focal) im.style.objectPosition = `${a.focal[0]}% ${a.focal[1]}%`; ph.append(im); g.append(ph); });
      root.append(g); if (s.caption) root.append(el('div', 'cap', `<span class="tx">${esc(s.caption)}</span>`)); break; }
    case 'timeline': { const tl = el('div', 'tl'); tl.append(el('div', 'tt', esc(s.title))); tl.append(el('div', 'line')); const ms = s.milestones; const ys = ms.map(m => m.year); const y0 = Math.min(...ys), y1 = Math.max(...ys);
      ms.forEach((m, i) => { const d = el('div', 'ms ' + (i % 2 ? 'below' : 'above')); d.style.right = `${8 + 84 * ((m.year - y0) / Math.max(1, y1 - y0))}%`; if (m.assetId) d.append(img(ctx, m.assetId, 'chip', 'thumb')); d.append(el('div', 'd'), el('div', 'y', String(m.year)), el('div', 'l', esc(m.label))); tl.append(d); }); root.append(tl, grain()); break; }
    case 'quote': root.innerHTML = `<div class="center"><div class="q"><span class="mark">„</span>${words(s.text)}<span class="q-by">— ${esc(s.by)}</span></div></div>`; root.append(grain()); break;
    case 'video': { const a = ctx.assets[s.assetId]; const bg = img(ctx, s.assetId, 'vbg'); const fr = el('div', 'vframe'); const ratio = a?.width && a?.height ? a.width / a.height : (a?.portrait ? 9 / 16 : 16 / 9); fr.style.aspectRatio = String(ratio); fr.classList.add(ratio < 1 ? 'portrait' : 'landscape');
      const v = document.createElement('video'); v.className = 'vmedia'; v.playsInline = true; v.preload = 'auto'; v.muted = false; if (a) { const src = mediaUrl(ctx, a, 'video'); if (src) v.src = src; v.poster = mediaUrl(ctx, a, 'poster'); } fr.append(v, el('div', 'vprog', '<i></i>'));
      root.append(bg, el('div', 'shade soft'), fr, el('div', 'lower', `<div class="rel">${esc(s.relation)}</div><div class="nm">${esc(s.name || a?.name.replace(/\.[^.]+$/, ''))}</div><div class="bar"></div>`)); break; }
    case 'video-wall': { const g = el('div', `wall n${Math.min(9, s.assetIds.length)}`); s.assetIds.slice(0, 9).forEach(id => { const a = ctx.assets[id]; const t = el('div', 'tile'); t.append(img(ctx, id)); t.append(el('div', 'nm', esc(a?.name.replace(/\.[^.]+$/, '')))); g.append(t); }); root.append(g, el('div', 'wall-title', esc(s.title || 'ברכות'))); break; }
    case 'names': { const n = el('div', 'names'); s.people.forEach(p => { const d = el('div', 'p'); d.append(img(ctx, p.assetId), el('span', '', esc(p.name))); n.append(d); }); root.innerHTML = `<div class="tl"><div class="tt">${esc(s.title || 'המשפחה')}</div></div>`; root.append(n, grain()); break; }
    case 'finale': { const m = el('div', 'mosaic'); const ids = (ctx.showPhotoIds?.length ? ctx.showPhotoIds : Object.values(ctx.assets).filter(a => a.type === 'photo').map(a => a.id)); const count = 40; for (let i = 0; i < count && ids.length; i++) m.append(img(ctx, ids[i % ids.length], '', 'thumb')); root.append(m, el('div', 'shade'), el('div', 'fin', `<div><div class="n">${esc(s.number || '80')}</div><div class="t">${esc(s.text)}</div></div>`)); break; }
    case 'black': if (s.caption) root.append(el('div', 'tiny', esc(s.caption))); break;
  }
}

const OV_FROM: Record<string, gsap.TweenVars> = { fade: { opacity: 0 }, rise: { opacity: 0, y: '+=40' }, drop: { opacity: 0, y: '-=40' }, zoom: { opacity: 0, scale: .4 }, pop: { opacity: 0, scale: 1.4 }, 'slide-right': { opacity: 0, x: '+=120' }, 'slide-left': { opacity: 0, x: '-=120' } };
function animateOverlays(root: HTMLElement, s: Slide, tl: gsap.core.Timeline, dur: number) {
  if (!s.overlays?.length) return;
  s.overlays.forEach((o, i) => {
    const d = root.querySelector<HTMLElement>(`.ov[data-oid="${o.id}"]`); if (!d) return;
    const a = o.anim ?? { in: 'fade', delay: 0.8 + i * 0.15, duration: 0.8, loop: 'none', out: 'none' }; const at = a.delay;
    if (a.in === 'typewriter' || a.in === 'letters') { const parts = d.querySelectorAll(a.in === 'letters' ? '.ch' : '.w'); tl.from(parts, { opacity: 0, duration: .05, stagger: Math.min(.12, a.duration / Math.max(1, parts.length)) }, at); }
    else if (a.in !== 'none') tl.from(d, { ...OV_FROM[a.in], duration: a.duration, ease: a.in === 'pop' ? 'back.out(2)' : a.in === 'zoom' ? 'back.out(1.6)' : 'power3.out' }, at);
    if (a.loop === 'pulse') tl.to(d, { scale: 1.06, duration: .9, yoyo: true, repeat: -1, ease: 'sine.inOut' }, at + a.duration);
    if (a.loop === 'float') tl.to(d, { y: '-=14', duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }, at + a.duration);
    if (a.loop === 'spin') tl.to(d, { rotation: '+=360', duration: 6, repeat: -1, ease: 'none' }, at + a.duration);
    if (a.loop === 'shimmer') tl.to(d, { opacity: Math.max(.2, o.opacity * .55), duration: .8, yoyo: true, repeat: -1, ease: 'sine.inOut' }, at + a.duration);
    if (a.out === 'fade') tl.to(d, { opacity: 0, duration: .6 }, Math.max(at + a.duration + .5, dur - .8));
  });
}
function animateCaption(root: HTMLElement, s: Slide, tl: gsap.core.Timeline) {
  const cap = root.querySelector('.cap'); if (!cap) return; const anim = s.captionStyle?.anim ?? 'rise';
  if (anim === 'none') return;
  if (anim === 'words' || anim === 'letters') { tl.from(cap.querySelectorAll('.yr, .rule'), { opacity: 0, duration: .6 }, .4); tl.from(cap.querySelectorAll(anim === 'letters' ? '.ch' : '.w'), { opacity: 0, y: 8, duration: .4, stagger: anim === 'letters' ? .03 : .1 }, .6); return; }
  tl.from(cap.querySelectorAll(':scope > *'), anim === 'fade' ? { opacity: 0, duration: 1, stagger: .12 } : { opacity: 0, y: 14, duration: .9, stagger: .14, ease: 'power2.out' }, .5);
}

export interface AnimOpts { preview?: boolean; onFinale?: () => void; paused?: boolean }
export function animateSlide(root: HTMLElement, s: Slide, ctx: RenderCtx, opts: AnimOpts = {}): gsap.core.Timeline {
  const tl = gsap.timeline({ paused: !!opts.paused });
  const dur = slideSeconds(s, ctx.chapter, ctx.settings, ctx.assets) || 6;
  const q = (sel: string) => root.querySelectorAll(sel);
  switch (s.type) {
    case 'intro':
      tl.from(q('.intro-name'), { opacity: 0, letterSpacing: '.6em', duration: 1.8, ease: 'power2.out' })
        .from(q('.intro-num'), { opacity: 0, scale: .55, duration: 1.6, ease: 'expo.out' }, '-=1')
        .from(q('.intro-sub'), { opacity: 0, y: 18, duration: 1 }, '-=0.7'); break;
    case 'chapter':
      if (q('.img').length) tl.fromTo(q('.img'), { scale: 1.16 }, { scale: 1.02, duration: dur + 1.2, ease: 'none' }, 0);
      tl.from(q('.eb'), { opacity: 0, x: 24, duration: .8 }, .2).from(q('.t'), { opacity: 0, y: 34, duration: 1.1, ease: 'power3.out' }, .45).from(q('.rule'), { scaleX: 0, transformOrigin: 'right center', duration: .9, ease: 'power2.inOut' }, .9).from(q('.b'), { opacity: 0, y: 10, duration: .9 }, 1.2); break;
    case 'photo': { const k = KB[s.kenBurns ?? ctx.chapter?.defaults?.kenBurns ?? 'in'] || KB.in; const z = s.frame?.zoom ?? 1; const amt = s.frame?.kenBurnsAmount ?? 1; const lerp = (v: number) => 1 + (v - 1) * amt;
      tl.fromTo(q('.img'), { scale: lerp(k.s0) * z, xPercent: (k.x0 || 0) * amt, yPercent: (k.y0 || 0) * amt }, { scale: lerp(k.s1) * z, xPercent: (k.x1 || 0) * amt, yPercent: (k.y1 || 0) * amt, duration: dur + 1.4, ease: 'none' }, 0); animateCaption(root, s, tl); break; }
    case 'photo-pair': tl.from(q('.ph'), { opacity: 0, xPercent: (i: number) => (i ? -10 : 10), duration: 1.1, ease: 'power3.out', stagger: .15 }, 0).fromTo(q('.ph img'), { scale: 1.08 }, { scale: 1, duration: dur + 1, ease: 'none' }, 0).from(q('.tag'), { opacity: 0, duration: .8 }, .9).from(q('.cap'), { opacity: 0, duration: .8 }, 1.1); break;
    case 'collage': tl.from(q('.ph'), { opacity: 0, scale: .86, y: 28, duration: .9, ease: 'power3.out', stagger: .12 }, 0).fromTo(q('.ph.hero img'), { scale: 1 }, { scale: 1.1, duration: dur + 1, ease: 'none' }, 0).from(q('.cap'), { opacity: 0, duration: .8 }, 1.2); break;
    case 'timeline': tl.from(q('.tt'), { opacity: 0, y: -18, duration: .8 }, 0).from(q('.line'), { scaleX: 0, duration: 1.6, ease: 'power2.inOut' }, .4).from(q('.ms'), { opacity: 0, y: 18, duration: .7, stagger: Math.min(.6, (dur - 3) / Math.max(1, s.milestones.length)), ease: 'back.out(1.6)' }, 1); break;
    case 'quote': tl.from(q('.mark'), { opacity: 0, scale: .6, duration: .8 }, 0).from(q('.q .w'), { opacity: 0, y: 10, duration: .6, stagger: Math.min(.14, (dur - 3) / Math.max(1, q('.q .w').length)), ease: 'power2.out' }, .3).from(q('.q-by'), { opacity: 0, duration: .8 }, '>-0.2'); break;
    case 'video': tl.from(q('.vframe'), { opacity: 0, scale: .94, duration: .9, ease: 'power2.out' }, 0).from(q('.lower > *'), { opacity: 0, x: 30, duration: .7, stagger: .1 }, .4); break;
    case 'video-wall': tl.from(q('.tile'), { opacity: 0, scale: .8, duration: .8, stagger: { each: .1, from: 'center' }, ease: 'back.out(1.4)' }, 0).from(q('.wall-title'), { opacity: 0, y: 20, duration: .9 }, .6); break;
    case 'names': tl.from(q('.tt'), { opacity: 0, duration: .8 }, 0).from(q('.p'), { opacity: 0, scale: .6, duration: .8, stagger: Math.min(.2, (dur - 2) / Math.max(1, s.people.length)), ease: 'back.out(1.8)' }, .4); break;
    case 'finale': tl.from(q('.mosaic img'), { opacity: 0, scale: .5, duration: .8, stagger: { each: Math.min(.06, 3 / 40), from: 'random' }, ease: 'power2.out' }, 0).from(q('.fin .n'), { opacity: 0, scale: .4, duration: 1.6, ease: 'expo.out' }, 1.8).from(q('.fin .t'), { opacity: 0, y: 20, duration: 1 }, 2.8).call(() => opts.onFinale?.(), undefined, 2.6); break;
    case 'black': if (q('.tiny').length) tl.from(q('.tiny'), { opacity: 0, duration: 1 }, .5); break;
  }
  animateOverlays(root, s, tl, dur);
  if (opts.preview) { tl.repeat(-1); tl.repeatDelay(1.2); }
  return tl;
}

/** Warm the browser cache for the images a slide will need. */
export function preloadSlide(s: Slide, ctx: RenderCtx) {
  const ids: string[] = []; switch (s.type) { case 'photo': ids.push(s.assetId); break; case 'chapter': if (s.heroAssetId) ids.push(s.heroAssetId); break; case 'photo-pair': case 'collage': ids.push(...s.assetIds); break; case 'video': ids.push(s.assetId); break; default: break; }
  for (const id of ids) { const a = ctx.assets[id]; if (!a) continue; const i = new Image(); i.src = a.type === 'photo' ? DERIVATIVES.display(id) : DERIVATIVES.poster(id); }
  if (s.type === 'video' && ctx.assets[s.assetId]) { const v = document.createElement('video'); v.preload = 'auto'; v.src = DERIVATIVES.video(s.assetId); v.load(); setTimeout(() => { v.src = ''; }, 30000); }
}

import { z } from 'zod';

/* ---------- assets (derived catalog, lives in SQLite, regenerable) ---------- */
export type AssetType = 'photo' | 'video' | 'music';
export type YearSource = 'exif' | 'name' | 'folder' | 'mtime' | 'manual'; // 'name' = parsed from the file name (WhatsApp IMG-20190612-WA0003, VID_2021_…)

export interface Asset {
  id: string;            // content hash (sha1 of size + first 4 MB)
  type: AssetType;
  relPath: string;       // relative to media/
  name: string;          // file name
  folder: string;        // parent folder name (used as decade/event hint)
  bytes: number;
  mtime: number;
  width?: number;
  height?: number;
  duration?: number;     // seconds (video/music)
  takenAt?: string;      // ISO date
  year?: number;
  yearSource: YearSource;
  portrait?: boolean;
  focal?: [number, number]; // 0..100
  peaks?: number[];      // music waveform (0..1), 512 buckets
  loudnessGain?: number; // dB applied by loudnorm
  status: 'ready' | 'processing' | 'error';
  error?: string;
  // ---- analysis (photos; computed from the 400 px thumbnail, incremental) ----
  dhash?: string;        // 64-bit perceptual difference hash, 16 hex chars
  sharpness?: number;    // sharp.stats().sharpness (Laplacian estimate)
  entropy?: number;
  luma?: number;         // mean luminance 0..255
  colorfulness?: number; // Hasler–Süsstrunk metric; < 8 ≈ black and white
  quality?: number;      // 0..1 library-relative score (percentile ranks), set by the grouping pass
  faceCount?: number;
  faceBox?: [number, number, number, number]; // x, y, w, h in % of the image
  dupGroup?: string;     // id of the group's best member; visually identical photos share it
  burstGroup?: string;   // id of the group's best member; same scene seconds apart
  isBest?: boolean;      // the representative of its dup group (or ungrouped)
}
export const DHASH_DUP = 2;    // Hamming distance ≤ 2 plus matching exposure and aspect → the same picture (re-exports, resizes, WhatsApp copies)
export const DHASH_BURST = 10; // ≤ 10 and same folder and ≤ 90 s apart (or consecutive file numbers when there is no EXIF) → same moment
export const DHASH_DIVERSE = 10; // the generator keeps chosen photos at least this far apart

export const COLLAGE_LAYOUTS = ['hero-right', 'hero-left', 'two-up', 'triptych', 'one-plus-three', 'four-grid', 'filmstrip', 'mosaic-6'] as const;
export type CollageLayout = typeof COLLAGE_LAYOUTS[number];
export const COLLAGE_LAYOUT_LABEL: Record<CollageLayout, string> = { 'hero-right': 'ראשית מימין', 'hero-left': 'ראשית משמאל', 'two-up': 'שתיים', triptych: 'שלוש עמודות', 'one-plus-three': 'אחת + שלוש', 'four-grid': 'רשת 2×2', filmstrip: 'פילם (לאורך)', 'mosaic-6': 'פסיפס 6' };
/** Which layouts can hold n photos. */
export function layoutsFor(n: number): CollageLayout[] {
  const out: CollageLayout[] = [];
  if (n === 2) out.push('two-up');
  if (n === 3) out.push('triptych', 'hero-right', 'hero-left', 'filmstrip');
  if (n === 4) out.push('one-plus-three', 'four-grid', 'hero-right', 'hero-left', 'filmstrip');
  if (n === 5) out.push('hero-right', 'hero-left', 'filmstrip');
  if (n === 6) out.push('mosaic-6');
  return out;
}

export const DERIVATIVES = {
  display: (id: string) => `/media/img/${id}.display.webp`,
  thumb: (id: string) => `/media/img/${id}.thumb.webp`,
  blur: (id: string) => `/media/img/${id}.blur.webp`,
  video: (id: string) => `/media/vid/${id}.1080.mp4`,
  poster: (id: string) => `/media/vid/${id}.poster.jpg`,
  posterThumb: (id: string) => `/media/vid/${id}.thumb.webp`,
  music: (id: string) => `/media/music/${id}.m4a`,
};

export function assetThumb(a: Asset): string {
  if (a.type === 'photo') return DERIVATIVES.thumb(a.id);
  if (a.type === 'video') return DERIVATIVES.posterThumb(a.id);
  return '';
}
export function assetDisplay(a: Asset): string {
  if (a.type === 'photo') return DERIVATIVES.display(a.id);
  if (a.type === 'video') return DERIVATIVES.poster(a.id);
  return '';
}

/* ---------- show (authored data, sacred) ---------- */
export const TransitionId = z.enum(['fade', 'dip', 'push', 'zoom', 'wipe', 'blur']);
export const TRANSITION_LABEL: Record<z.infer<typeof TransitionId>, string> = { fade: 'עמעום', dip: 'דרך שחור', push: 'דחיפה', zoom: 'זום', wipe: 'מחיקה', blur: 'טשטוש' };

/* ---------- overlays: free text, symbols, emoji, shapes and image stickers on any slide ---------- */
export const OverlayAnimIn = z.enum(['none', 'fade', 'rise', 'drop', 'zoom', 'pop', 'slide-right', 'slide-left', 'typewriter', 'letters']);
export const OverlayLoop = z.enum(['none', 'pulse', 'float', 'spin', 'shimmer']);
export const OverlayAnim = z.object({ in: OverlayAnimIn.default('fade'), delay: z.number().min(0).max(30).default(0.8), duration: z.number().min(0.1).max(5).default(0.8), loop: OverlayLoop.default('none'), out: z.enum(['none', 'fade']).default('none') });
export type OverlayAnim = z.infer<typeof OverlayAnim>;
const OverlayBase = z.object({
  id: z.string(), x: z.number().min(-50).max(150).default(50), y: z.number().min(-50).max(150).default(50), w: z.number().min(2).max(100).default(40), // % of the stage; x/y = top-left
  rotate: z.number().min(-180).max(180).default(0), opacity: z.number().min(0).max(1).default(1), z: z.number().default(1), anim: OverlayAnim.optional(), locked: z.boolean().optional(),
});
export const OverlayFont = z.enum(['display', 'ui', 'num']);
export const Overlay = z.discriminatedUnion('kind', [
  OverlayBase.extend({ kind: z.literal('text'), text: z.string(), font: OverlayFont.default('display'), size: z.number().min(0.8).max(20).default(4), color: z.string().default('#efe9db'), weight: z.number().default(400), align: z.enum(['right', 'center', 'left']).default('center'), bg: z.enum(['none', 'pill', 'bar', 'box']).default('none'), shadow: z.boolean().default(true), accent: z.boolean().default(false) }),
  OverlayBase.extend({ kind: z.literal('symbol'), name: z.string(), color: z.string().default('#d4a84b'), fill: z.boolean().default(false), stroke: z.number().min(0.5).max(4).default(1.6) }),
  OverlayBase.extend({ kind: z.literal('emoji'), char: z.string() }),
  OverlayBase.extend({ kind: z.literal('shape'), shape: z.enum(['rect', 'circle', 'line', 'frame']), color: z.string().default('#d4a84b'), h: z.number().min(0.2).max(100).default(20), radius: z.number().min(0).max(50).default(0), stroke: z.number().min(0.1).max(5).default(0.4) }),
  OverlayBase.extend({ kind: z.literal('image'), assetId: z.string(), h: z.number().min(2).max(100).default(30), mask: z.enum(['none', 'rounded', 'circle']).default('rounded'), border: z.boolean().default(true), fit: z.enum(['cover', 'contain']).default('cover') }),
]);
export type Overlay = z.infer<typeof Overlay>;
export type OverlayKind = Overlay['kind'];

/* ---------- per-slide look, photo frame and caption style ---------- */
export const Look = z.object({ filter: z.enum(['none', 'bw', 'sepia', 'warm', 'cool', 'faded', 'vivid']).default('none'), vignette: z.number().min(0).max(1).default(0.5), brightness: z.number().min(50).max(150).default(100), contrast: z.number().min(50).max(150).default(100), saturation: z.number().min(0).max(200).default(100) });
export type Look = z.infer<typeof Look>;
export const Frame = z.object({ zoom: z.number().min(1).max(3).default(1), rotate: z.number().default(0), flipH: z.boolean().default(false), kenBurnsAmount: z.number().min(0).max(2).default(1) });
export type Frame = z.infer<typeof Frame>;
export const CaptionStyle = z.object({ anim: z.enum(['fade', 'rise', 'words', 'letters', 'none']).default('rise'), size: z.number().min(0.5).max(2.5).default(1), position: z.enum(['bottom', 'top', 'center']).default('bottom'), align: z.enum(['right', 'center', 'left']).default('right'), font: OverlayFont.default('display'), box: z.boolean().default(false) });
export type CaptionStyle = z.infer<typeof CaptionStyle>;
export function cssFilter(look?: Look): string {
  if (!look) return '';
  const preset = { none: '', bw: 'grayscale(1) contrast(1.05)', sepia: 'sepia(.75) contrast(.95) brightness(1.03)', warm: 'sepia(.25) saturate(1.15) hue-rotate(-8deg)', cool: 'saturate(.9) hue-rotate(12deg) brightness(1.02)', faded: 'contrast(.82) brightness(1.08) saturate(.75)', vivid: 'saturate(1.35) contrast(1.08)' }[look.filter];
  const adj = [look.brightness !== 100 ? `brightness(${look.brightness / 100})` : '', look.contrast !== 100 ? `contrast(${look.contrast / 100})` : '', look.saturation !== 100 ? `saturate(${look.saturation / 100})` : ''].filter(Boolean).join(' ');
  return [preset, adj].filter(Boolean).join(' ');
}
export type TransitionId = z.infer<typeof TransitionId>;
export const KenBurns = z.enum(['in', 'out', 'left', 'right', 'up', 'down', 'none']);
export type KenBurns = z.infer<typeof KenBurns>;
export const Advance = z.enum(['auto', 'manual']);
export type Advance = z.infer<typeof Advance>;

const Base = z.object({
  id: z.string(),
  notes: z.string().optional(),          // presenter notes
  transition: TransitionId.optional(),   // falls back to chapter/show default
  advance: Advance.optional(),
  seconds: z.number().min(0.5).max(120).optional(),
  locked: z.boolean().optional(),        // auto-create keeps locked slides verbatim
  auto: z.object({ run: z.string() }).optional(), // provenance: produced by auto-create run <run>
  theme: z.string().optional(),          // colour theme override for this slide
  overlays: z.array(Overlay).optional(), // free text, symbols, shapes, stickers
  look: Look.optional(),                 // colour filter + adjustments + vignette for the slide's media
  frame: Frame.optional(),               // photo crop/zoom/rotate/flip and Ken Burns amount
  captionStyle: CaptionStyle.optional(),
});
export const CollageLayoutSchema = z.enum(COLLAGE_LAYOUTS);

export const Slide = z.discriminatedUnion('type', [
  Base.extend({ type: z.literal('intro'), title: z.string(), subtitle: z.string().optional(), number: z.string().default('80') }),
  Base.extend({ type: z.literal('chapter'), heroAssetId: z.string().optional(), label: z.string(), blurb: z.string().optional(), eyebrow: z.string().optional() }),
  Base.extend({ type: z.literal('photo'), assetId: z.string(), caption: z.string().optional(), year: z.number().optional(), kenBurns: KenBurns.optional(), focal: z.tuple([z.number(), z.number()]).optional(), grain: z.boolean().optional() }),
  Base.extend({ type: z.literal('photo-pair'), assetIds: z.tuple([z.string(), z.string()]), caption: z.string().optional(), tags: z.tuple([z.string(), z.string()]).optional() }),
  Base.extend({ type: z.literal('collage'), assetIds: z.array(z.string()).min(2).max(6), caption: z.string().optional(), heroIndex: z.number().optional(), layout: CollageLayoutSchema.optional() }),
  Base.extend({ type: z.literal('timeline'), title: z.string().optional(), milestones: z.array(z.object({ year: z.number(), label: z.string(), assetId: z.string().optional() })) }),
  Base.extend({ type: z.literal('quote'), text: z.string(), by: z.string().optional() }),
  Base.extend({ type: z.literal('video'), assetId: z.string(), name: z.string().optional(), relation: z.string().optional(), trimIn: z.number().optional(), trimOut: z.number().optional(), volume: z.number().min(0).max(1.5).optional(), hold: z.boolean().optional() }),
  Base.extend({ type: z.literal('video-wall'), assetIds: z.array(z.string()).min(2).max(9), title: z.string().optional() }),
  Base.extend({ type: z.literal('names'), title: z.string().optional(), people: z.array(z.object({ name: z.string(), assetId: z.string().optional() })) }),
  Base.extend({ type: z.literal('finale'), text: z.string(), number: z.string().default('80') }),
  Base.extend({ type: z.literal('black'), caption: z.string().optional() }),
]);
export type Slide = z.infer<typeof Slide>;
export type SlideType = Slide['type'];

export const Chapter = z.object({
  id: z.string(),
  title: z.string(),
  subtitle: z.string().optional(),
  musicId: z.string().optional(),      // asset id of a music file
  musicStartSec: z.number().optional(),
  musicLevel: z.number().min(0).max(1).optional(),
  defaults: z.object({ seconds: z.number().optional(), transition: TransitionId.optional(), kenBurns: KenBurns.optional() }).optional(),
  locked: z.boolean().optional(),
  auto: z.object({ run: z.string() }).optional(),
  theme: z.string().optional(),          // colour theme override for the chapter
  slides: z.array(Slide),
});
export type Chapter = z.infer<typeof Chapter>;

export const Settings = z.object({
  defaultSlideSeconds: z.number().default(6),
  defaultTransition: TransitionId.default('fade'),
  transitionSeconds: z.number().default(0.9),
  duckLevel: z.number().min(0).max(1).default(0.1),
  musicLevel: z.number().min(0).max(1).default(0.7),
  safeMarginPct: z.number().default(5),
  grainOnArchival: z.boolean().default(true),
  archivalBeforeYear: z.number().default(1990),
  theme: z.string().default('midnight-gold'),   // colour theme id (shared/themes.ts); chapters and slides may override
});
export type Settings = z.infer<typeof Settings>;

export const Show = z.object({
  version: z.literal(1),
  meta: z.object({ title: z.string(), subtitle: z.string().optional(), date: z.string(), language: z.literal('he') }),
  settings: Settings,
  chapters: z.array(Chapter),
});
export type Show = z.infer<typeof Show>;

export function defaultShow(): Show {
  return Show.parse({
    version: 1,
    meta: { title: 'סבא יהודה 80', subtitle: 'חוגגים שמונים', date: '2026-10-24', language: 'he' },
    settings: {},
    chapters: [
      { id: 'ch-open', title: 'פתיחה', slides: [{ id: 'sl-intro', type: 'intro', title: 'יהודה', subtitle: 'חוגגים 80 · אוקטובר 2026', seconds: 8 }] },
    ],
  });
}

/* ---------- helpers shared by editor + show ---------- */
export const TYPE_LABEL: Record<SlideType, string> = {
  intro: 'פתיחה', chapter: 'פרק', photo: 'תמונה', 'photo-pair': 'זוג תמונות', collage: 'קולאז׳', timeline: 'ציר זמן',
  quote: 'ציטוט', video: 'ברכה', 'video-wall': 'קיר ברכות', names: 'שמות', finale: 'סיום', black: 'שחור',
};
export const TYPE_DEFAULT_SECONDS: Record<SlideType, number> = {
  intro: 8, chapter: 6, photo: 6, 'photo-pair': 7, collage: 9, timeline: 12, quote: 9, video: 0, 'video-wall': 8, names: 8, finale: 12, black: 0,
};

export function slideSeconds(s: Slide, ch: Chapter | undefined, settings: Settings, assets: Record<string, Asset>): number {
  if (s.type === 'black') return 0;
  if (s.type === 'video') { const a = assets[s.assetId]; const d = a?.duration ?? 8; const out = s.trimOut ?? d; const inn = s.trimIn ?? 0; return Math.max(1, out - inn); }
  if (s.seconds) return s.seconds;
  if (ch?.defaults?.seconds && s.type === 'photo') return ch.defaults.seconds;
  if (s.type === 'photo') return settings.defaultSlideSeconds;
  return TYPE_DEFAULT_SECONDS[s.type] || 6;
}
export function slideAdvance(s: Slide): Advance { if (s.type === 'black') return 'manual'; if (s.type === 'video') return s.hold ? 'manual' : 'auto'; return s.advance ?? 'auto'; }
export function slideTransition(s: Slide, ch: Chapter | undefined, settings: Settings): TransitionId { return s.transition ?? ch?.defaults?.transition ?? settings.defaultTransition; }
export function slideAssetIds(s: Slide): string[] {
  switch (s.type) {
    case 'photo': case 'video': return [s.assetId];
    case 'chapter': return s.heroAssetId ? [s.heroAssetId] : [];
    case 'photo-pair': case 'collage': case 'video-wall': return [...s.assetIds];
    case 'timeline': return s.milestones.map(m => m.assetId).filter((x): x is string => !!x);
    case 'names': return s.people.map(p => p.assetId).filter((x): x is string => !!x);
    default: return [];
  }
}
export function slideThumbAsset(s: Slide): string | undefined { return slideAssetIds(s)[0]; }
export function slideTitle(s: Slide): string {
  switch (s.type) {
    case 'intro': return s.title; case 'chapter': return s.label; case 'photo': return s.caption || ''; case 'photo-pair': case 'collage': return s.caption || '';
    case 'timeline': return s.title || 'ציר זמן'; case 'quote': return s.text.slice(0, 40); case 'video': return s.name || ''; case 'video-wall': return s.title || 'ברכות';
    case 'names': return s.title || 'המשפחה'; case 'finale': return s.text; case 'black': return s.caption || '';
  }
}
export function fmtTime(sec: number): string { sec = Math.max(0, Math.round(sec)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }
export function uid(prefix = 's'): string { return prefix + '-' + Math.random().toString(36).slice(2, 9); }

/**
 * Demo material for the guide. The guide must show every effect even when the library is empty, so it renders real
 * slides (the same renderer the show uses) over generated SVG "photographs": era-coloured scenes with film grain.
 * Nothing here touches the server or the user's show.
 */
import { Settings as SettingsSchema, type Asset, type Settings, type Slide, type Chapter, type Overlay } from '@shared/model';
import type { RenderCtx, MediaKind } from '@/show/slides';

type Kind = 'portrait' | 'wedding' | 'field' | 'sea' | 'party' | 'kids' | 'city' | 'garden' | 'street' | 'birthday';
interface Scene { id: string; kind: Kind; year: number; label: string; w: number; h: number; focal: [number, number]; people?: number }

const SCENES: Scene[] = [
  { id: 'd-1949', kind: 'portrait', year: 1949, label: 'ילד קטן בחצר', w: 1600, h: 1100, focal: [50, 38] },
  { id: 'd-1958', kind: 'field', year: 1958, label: 'בשדה, קיץ', w: 1600, h: 1000, focal: [60, 55] },
  { id: 'd-1962', kind: 'street', year: 1962, label: 'ברחוב הראשי', w: 1600, h: 1000, focal: [45, 50] },
  { id: 'd-1966', kind: 'wedding', year: 1966, label: 'יום החתונה', w: 1500, h: 1100, focal: [50, 42] },
  { id: 'd-1974', kind: 'garden', year: 1974, label: 'הבית הראשון', w: 1600, h: 1000, focal: [40, 50] },
  { id: 'd-1983', kind: 'sea', year: 1983, label: 'חופשה בים', w: 1600, h: 1000, focal: [55, 48] },
  { id: 'd-1995', kind: 'city', year: 1995, label: 'הנסיעה הגדולה', w: 1600, h: 1000, focal: [50, 45] },
  { id: 'd-2008', kind: 'party', year: 2008, label: 'שישים', w: 1600, h: 1000, focal: [50, 55] },
  { id: 'd-2019', kind: 'kids', year: 2019, label: 'כל הנכדים', w: 1600, h: 1000, focal: [50, 55] },
  { id: 'd-2023', kind: 'birthday', year: 2023, label: 'עם הנינה', w: 1000, h: 1500, focal: [50, 40] },
];

/** Era palette: sepia before 1970, faded colour until 1990, full colour after. */
function palette(year: number, kind: Kind) {
  if (year < 1970) return { sky: ['#d9c2a0', '#b08a5e'], ground: ['#8a6a46', '#4a3421'], fig: '#3b2a1c', fig2: '#5b4330', accent: '#e8d4b2', tint: 'sepia(.6) contrast(1.05)', grainOp: .22, dark: '#2a1c10' };
  if (year < 1990) return { sky: kind === 'sea' ? ['#9fc7d4', '#5f93a6'] : ['#d6c9a8', '#a9b1a0'], ground: kind === 'sea' ? ['#3d7f94', '#1f4a5a'] : ['#7f8f66', '#4b5a3b'], fig: '#3a3f44', fig2: '#6d5d4e', accent: '#f1e4c8', tint: 'saturate(.75) contrast(.95) sepia(.15)', grainOp: .16, dark: '#23262a' };
  return { sky: kind === 'city' ? ['#1b2340', '#0a0d1b'] : ['#bfe0f3', '#79b6dc'], ground: kind === 'city' ? ['#2b3350', '#121626'] : ['#7fae6a', '#436f3a'], fig: '#2d2f3a', fig2: '#5a4f6a', accent: '#fff5dc', tint: 'none', grainOp: .08, dark: '#1a1b22' };
}

const fig = (x: number, y: number, h: number, c: string) => `<circle cx="${x}" cy="${y - h * .78}" r="${h * .14}" fill="${c}"/><path d="M${x - h * .22} ${y} v-${h * .5} q0 -${h * .14} ${h * .22} -${h * .14} q${h * .22} 0 ${h * .22} ${h * .14} V${y} z" fill="${c}"/>`;
const tree = (x: number, y: number, s: number, c: string) => `<rect x="${x - s * .06}" y="${y - s * .55}" width="${s * .12}" height="${s * .55}" fill="${c}"/><circle cx="${x}" cy="${y - s * .75}" r="${s * .32}" fill="${c}" opacity=".92"/><circle cx="${x - s * .25}" cy="${y - s * .6}" r="${s * .22}" fill="${c}" opacity=".85"/><circle cx="${x + s * .25}" cy="${y - s * .62}" r="${s * .24}" fill="${c}" opacity=".85"/>`;
const cypress = (x: number, y: number, s: number, c: string) => `<path d="M${x} ${y - s} q${s * .18} ${s * .5} ${s * .12} ${s} h-${s * .24} q-${s * .06} -${s * .5} ${s * .12} -${s} z" fill="${c}"/>`;

function sceneSvg(sc: Scene): string {
  const { w, h } = sc; const p = palette(sc.year, sc.kind); const hz = h * .62; let body = '';
  switch (sc.kind) {
    case 'portrait': body = `${tree(w * .18, hz + h * .1, h * .5, p.fig2)}<rect x="${w * .58}" y="${hz - h * .22}" width="${w * .4}" height="${h * .3}" fill="${p.fig2}" opacity=".5"/>${fig(w * .5, hz + h * .22, h * .46, p.fig)}`; break;
    case 'wedding': body = `<path d="M${w * .25} ${hz + 40} v-${h * .3} a${w * .25} ${h * .3} 0 0 1 ${w * .5} 0 v${h * .3}" fill="none" stroke="${p.accent}" stroke-width="${h * .02}" opacity=".8"/>${fig(w * .43, hz + h * .25, h * .5, p.fig)}${fig(w * .57, hz + h * .25, h * .46, p.accent)}${[.12, .2, .8, .88].map((x, i) => `<circle cx="${w * x}" cy="${h * (.25 + i * .07)}" r="${h * .03}" fill="${p.accent}" opacity=".35"/>`).join('')}`; break;
    case 'field': body = `<circle cx="${w * .76}" cy="${h * .3}" r="${h * .09}" fill="${p.accent}" opacity=".9"/>${[0, 1, 2, 3, 4, 5].map(i => `<path d="M0 ${hz + i * h * .07} Q${w / 2} ${hz + i * h * .07 - 14} ${w} ${hz + i * h * .07}" stroke="${p.dark}" stroke-width="3" fill="none" opacity=".35"/>`).join('')}${cypress(w * .14, hz + 6, h * .34, p.fig2)}${cypress(w * .2, hz + 6, h * .28, p.fig2)}${fig(w * .6, hz + h * .2, h * .4, p.fig)}`; break;
    case 'street': body = `${[.02, .2, .4, .62, .8].map((x, i) => `<rect x="${w * x}" y="${hz - h * (.3 + (i % 3) * .07)}" width="${w * .17}" height="${h * (.3 + (i % 3) * .07) + 10}" fill="${p.fig2}" opacity=".7"/>`).join('')}${fig(w * .45, hz + h * .24, h * .42, p.fig)}${fig(w * .62, hz + h * .24, h * .36, p.fig)}<rect x="0" y="${hz + h * .25}" width="${w}" height="${h * .13}" fill="${p.dark}" opacity=".35"/>`; break;
    case 'garden': body = `<rect x="${w * .55}" y="${hz - h * .26}" width="${w * .38}" height="${h * .3}" fill="${p.fig2}" opacity=".55"/><path d="M${w * .53} ${hz - h * .26} l${w * .21} -${h * .14} l${w * .21} ${h * .14} z" fill="${p.fig2}" opacity=".7"/>${tree(w * .22, hz + h * .06, h * .62, p.fig2)}${fig(w * .42, hz + h * .2, h * .38, p.fig)}${fig(w * .5, hz + h * .2, h * .3, p.fig)}`; break;
    case 'sea': body = `${[0, 1, 2, 3].map(i => `<path d="M0 ${hz + 30 + i * 44} q${w * .08} -14 ${w * .16} 0 t${w * .16} 0 t${w * .16} 0 t${w * .16} 0 t${w * .16} 0 t${w * .16} 0" stroke="${p.accent}" stroke-width="4" fill="none" opacity=".35"/>`).join('')}<path d="M${w * .6} ${hz} l${w * .07} -${h * .3} l${w * .02} ${h * .3} z" fill="${p.accent}"/><path d="M${w * .56} ${hz} h${w * .16} l-${w * .02} ${h * .04} h-${w * .12} z" fill="${p.dark}"/>${fig(w * .3, hz + h * .22, h * .34, p.fig)}`; break;
    case 'city': body = `${[.0, .09, .2, .3, .42, .5, .6, .72, .82, .92].map((x, i) => { const bh = h * (.22 + ((i * 7) % 5) * .06); return `<rect x="${w * x}" y="${hz - bh}" width="${w * .085}" height="${bh + 30}" fill="${p.fig2}"/>${[0, 1, 2, 3, 4].map(k => `<rect x="${w * x + 8 + (k % 2) * 30}" y="${hz - bh + 16 + k * 26}" width="12" height="14" fill="${p.accent}" opacity="${k % 3 ? .8 : .3}"/>`).join('')}`; }).join('')}${[.1, .3, .5, .7, .9, .2, .8].map((x, i) => `<circle cx="${w * x}" cy="${h * (.08 + (i % 3) * .07)}" r="2.5" fill="#fff" opacity=".8"/>`).join('')}${fig(w * .5, hz + h * .26, h * .4, p.accent)}`; break;
    case 'party': body = `<rect x="${w * .15}" y="${hz}" width="${w * .7}" height="${h * .05}" fill="${p.accent}" opacity=".85"/><rect x="${w * .44}" y="${hz - h * .1}" width="${w * .12}" height="${h * .1}" fill="${p.fig2}"/>${[0, 1, 2, 3].map(i => `<rect x="${w * (.455 + i * .03)}" y="${hz - h * .16}" width="6" height="${h * .06}" fill="${p.accent}"/><circle cx="${w * (.455 + i * .03) + 3}" cy="${hz - h * .17}" r="7" fill="#f6c453"/>`).join('')}${[.2, .3, .72, .8].map((x, i) => `<circle cx="${w * x}" cy="${h * (.28 + (i % 2) * .08)}" r="${h * .06}" fill="${['#c75b5b', '#5b8fc7', '#d9a84b', '#7fb46a'][i]}" opacity=".9"/><path d="M${w * x} ${h * (.34 + (i % 2) * .08)} q10 40 -6 90" stroke="${p.dark}" fill="none" opacity=".5"/>`).join('')}${fig(w * .3, hz, h * .36, p.fig)}${fig(w * .62, hz, h * .34, p.fig)}`; break;
    case 'kids': body = `${[.14, .27, .4, .53, .66, .79].map((x, i) => fig(w * x, hz + h * .22, h * (.22 + (i % 3) * .05), i % 2 ? p.fig : p.fig2)).join('')}${tree(w * .9, hz + h * .1, h * .5, p.fig2)}`; break;
    case 'birthday': body = `${fig(w * .5, h * .78, h * .42, p.fig)}${fig(w * .62, h * .75, h * .2, p.accent)}<circle cx="${w * .2}" cy="${h * .22}" r="${h * .05}" fill="#c75b5b" opacity=".85"/><circle cx="${w * .8}" cy="${h * .18}" r="${h * .045}" fill="#5b8fc7" opacity=".85"/>`; break;
  }
  const grain = `<filter id="g"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 .5 0 0 0 0 .5 0 0 0 0 .5 0 0 0 .9 0"/></filter>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><defs>${grain}<linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[0]}"/><stop offset="1" stop-color="${p.sky[1]}"/></linearGradient><linearGradient id="gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.ground[0]}"/><stop offset="1" stop-color="${p.ground[1]}"/></linearGradient><radialGradient id="v" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></radialGradient></defs><g style="filter:${p.tint}"><rect width="${w}" height="${hz + 2}" fill="url(#s)"/><rect y="${hz}" width="${w}" height="${h - hz}" fill="url(#gd)"/>${body}</g><rect width="${w}" height="${h}" fill="url(#v)"/><rect width="${w}" height="${h}" filter="url(#g)" opacity="${p.grainOp}" style="mix-blend-mode:overlay"/><text x="${w - 28}" y="${h - 26}" font-family="Heebo, Arial, sans-serif" font-size="${Math.round(h * .028)}" fill="#fff" fill-opacity=".55" text-anchor="end" direction="rtl">דוגמה · ${sc.year}</text></svg>`;
}

const cache = new Map<string, string>();
export function sceneUrl(id: string): string {
  let u = cache.get(id); if (u) return u;
  const sc = SCENES.find(s => s.id === id) ?? SCENES[0];
  u = `data:image/svg+xml;utf8,${encodeURIComponent(sceneSvg(sc))}`; cache.set(id, u); return u;
}

/** Fake waveform (0..1) for the music demo, deterministic. */
const PEAKS = Array.from({ length: 512 }, (_, i) => { const t = i / 512; const env = t < .08 ? t / .08 : t > .92 ? (1 - t) / .08 : 1; const beat = .55 + .45 * Math.abs(Math.sin(i * .9)) * (i % 7 ? 1 : .4); return Math.min(1, Math.max(.05, env * beat * (.7 + .3 * Math.sin(i * .11)))); });

const photoAsset = (sc: Scene): Asset => ({ id: sc.id, type: 'photo', relPath: `photos/דוגמה/${sc.id}.jpg`, name: `${sc.id}.jpg`, folder: 'דוגמה', bytes: 0, mtime: 0, width: sc.w, height: sc.h, year: sc.year, yearSource: 'exif', portrait: sc.h > sc.w, focal: sc.focal, status: 'ready', quality: .8, isBest: true });
export const DEMO_PHOTOS: Asset[] = SCENES.map(photoAsset);
export const DEMO_VIDEOS: Asset[] = [
  { id: 'dv-noa', type: 'video', relPath: 'videos/greetings/נועה.mp4', name: 'נועה.mp4', folder: 'greetings', bytes: 0, mtime: 0, width: 1080, height: 1920, duration: 42, year: 2026, yearSource: 'mtime', portrait: true, status: 'ready' },
  { id: 'dv-itay', type: 'video', relPath: 'videos/greetings/איתי.mp4', name: 'איתי.mp4', folder: 'greetings', bytes: 0, mtime: 0, width: 1920, height: 1080, duration: 38, year: 2026, yearSource: 'mtime', status: 'ready' },
  { id: 'dv-maya', type: 'video', relPath: 'videos/greetings/מאיה.mp4', name: 'מאיה.mp4', folder: 'greetings', bytes: 0, mtime: 0, width: 1080, height: 1920, duration: 51, year: 2026, yearSource: 'mtime', portrait: true, status: 'ready' },
  { id: 'dv-tamar', type: 'video', relPath: 'videos/greetings/תמר.mp4', name: 'תמר.mp4', folder: 'greetings', bytes: 0, mtime: 0, width: 1920, height: 1080, duration: 29, year: 2026, yearSource: 'mtime', status: 'ready' },
];
export const DEMO_MUSIC: Asset = { id: 'dm-1', type: 'music', relPath: 'music/ערב של שושנים.m4a', name: 'ערב של שושנים.m4a', folder: 'music', bytes: 0, mtime: 0, duration: 184, yearSource: 'mtime', peaks: PEAKS, status: 'ready' };
export const DEMO_ASSETS: Record<string, Asset> = Object.fromEntries([...DEMO_PHOTOS, ...DEMO_VIDEOS, DEMO_MUSIC].map(a => [a.id, a]));
const VIDEO_SCENE: Record<string, string> = { 'dv-noa': 'd-2023', 'dv-itay': 'd-2019', 'dv-maya': 'd-2008', 'dv-tamar': 'd-1995' };

export function demoResolve(a: Asset, kind: MediaKind): string {
  if (a.type === 'photo') return sceneUrl(a.id);
  if (a.type === 'video') return kind === 'video' ? '' : sceneUrl(VIDEO_SCENE[a.id] ?? 'd-2019'); // no real clip in the guide: the poster stands in
  return '';
}
export const DEMO_SETTINGS: Settings = SettingsSchema.parse({});
export const DEMO_CHAPTER: Chapter = { id: 'dc-1', title: 'המשפחה', subtitle: '1965–1989', musicId: 'dm-1', musicStartSec: 12, slides: [] };
export function demoCtx(settings: Partial<Settings> = {}, chapter: Chapter = DEMO_CHAPTER): RenderCtx {
  return { assets: DEMO_ASSETS, settings: { ...DEMO_SETTINGS, ...settings }, chapter, showPhotoIds: DEMO_PHOTOS.map(p => p.id), resolve: demoResolve };
}

/* ---------- demo slides, one per type plus variants used by the effect demos ---------- */
const P = (i: number) => DEMO_PHOTOS[i].id;
export function demoPhoto(extra: Partial<Extract<Slide, { type: 'photo' }>> = {}, i = 3): Slide {
  return { id: `demo-photo-${i}`, type: 'photo', assetId: P(i), caption: 'יום החתונה, תל אביב', year: DEMO_PHOTOS[i].year, kenBurns: 'in', seconds: 6, ...extra } as Slide;
}
export const DEMO_SLIDES: Record<Slide['type'], Slide> = {
  intro: { id: 'demo-intro', type: 'intro', title: 'יהודה', subtitle: 'חוגגים 80 · אוקטובר 2026', number: '80', seconds: 8 },
  chapter: { id: 'demo-chapter', type: 'chapter', heroAssetId: P(4), eyebrow: 'פרק שני', label: 'המשפחה גדלה', blurb: 'חתונה, בית, ארבעה ילדים', seconds: 6 },
  photo: demoPhoto(),
  'photo-pair': { id: 'demo-pair', type: 'photo-pair', assetIds: [P(0), P(9)], caption: 'אז והיום', tags: ['1949', '2023'], seconds: 7 },
  collage: { id: 'demo-collage', type: 'collage', assetIds: [P(4), P(5), P(6), P(7)], caption: 'שנות השמונים', layout: 'hero-right', seconds: 9 },
  timeline: { id: 'demo-timeline', type: 'timeline', title: 'שמונים שנה בדקה', seconds: 12, milestones: [{ year: 1946, label: 'נולד', assetId: P(0) }, { year: 1966, label: 'חתונה', assetId: P(3) }, { year: 1971, label: 'ילד ראשון', assetId: P(4) }, { year: 1995, label: 'נכדה ראשונה', assetId: P(6) }, { year: 2026, label: '80', assetId: P(9) }] },
  quote: { id: 'demo-quote', type: 'quote', text: 'מה שחשוב באמת זה מי יושב איתך לשולחן', by: 'סבא יהודה', seconds: 9 },
  video: { id: 'demo-video', type: 'video', assetId: 'dv-noa', name: 'נועה', relation: 'נכדה', seconds: 0 },
  'video-wall': { id: 'demo-wall', type: 'video-wall', assetIds: ['dv-noa', 'dv-itay', 'dv-maya', 'dv-tamar'], title: 'ברכות מהנכדים', seconds: 8 },
  names: { id: 'demo-names', type: 'names', title: 'המשפחה', seconds: 8, people: [{ name: 'רות', assetId: P(3) }, { name: 'דני', assetId: P(4) }, { name: 'מיכל', assetId: P(5) }, { name: 'יוסי', assetId: P(6) }, { name: 'נועה', assetId: P(8) }, { name: 'איתי', assetId: P(9) }] },
  finale: { id: 'demo-finale', type: 'finale', text: 'עד מאה ועשרים, סבא', number: '80', seconds: 12 },
  black: { id: 'demo-black', type: 'black', caption: 'הפסקה · לחיצה ממשיכה' },
};
export const DEMO_TEXT_OVERLAY: Overlay = { id: 'demo-ov-text', kind: 'text', text: 'מזל טוב!', font: 'display', size: 9, color: 'auto', weight: 700, align: 'center', bg: 'none', shadow: true, accent: true, x: 10, y: 34, w: 80, rotate: 0, opacity: 1, z: 1, anim: { in: 'pop', delay: .6, duration: .9, loop: 'none', out: 'none' } };
export const DEMO_DESIGNED: Slide = demoPhoto({ id: 'demo-designed', caption: '', overlays: [
  { id: 'o-frame', kind: 'shape', shape: 'frame', color: 'auto', h: 84, radius: 1, stroke: .35, x: 4, y: 8, w: 92, rotate: 0, opacity: .9, z: 0, anim: { in: 'fade', delay: .3, duration: 1, loop: 'none', out: 'none' } },
  { id: 'o-title', kind: 'text', text: 'יום החתונה', font: 'display', size: 7, color: 'auto', weight: 500, align: 'right', bg: 'bar', shadow: false, accent: false, x: 50, y: 62, w: 44, rotate: 0, opacity: 1, z: 2, anim: { in: 'slide-right', delay: .9, duration: .9, loop: 'none', out: 'none' } },
  { id: 'o-year', kind: 'text', text: '1966', font: 'num', size: 9, color: 'auto', weight: 400, align: 'center', bg: 'none', shadow: true, accent: true, x: 70, y: 10, w: 24, rotate: 0, opacity: 1, z: 2, anim: { in: 'pop', delay: .6, duration: .9, loop: 'none', out: 'none' } },
  { id: 'o-heart', kind: 'symbol', name: 'Heart', color: 'auto', fill: true, stroke: 1.6, x: 8, y: 14, w: 9, rotate: -12, opacity: .95, z: 2, anim: { in: 'zoom', delay: 1.4, duration: .8, loop: 'pulse', out: 'none' } },
  { id: 'o-sticker', kind: 'image', assetId: P(9), h: 36, mask: 'rounded', border: true, fit: 'cover', x: 8, y: 54, w: 20, rotate: 4, opacity: 1, z: 3, anim: { in: 'pop', delay: 1.8, duration: .9, loop: 'none', out: 'none' } },
] }, 3);

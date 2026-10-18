/**
 * Colour themes for the show. One source of truth: the catalogue below becomes CSS custom properties (themeCss())
 * that every slide, the start gate, the editor preview and the presenter read. Switching = changing data-theme.
 * Design rules (from the research notes in docs/THEMES-PLAN.md): dark grounds with ivory text and one metallic accent for the TV;
 * captions over photos always use the light "on-media" colour with a dark glass so they stay readable on any theme;
 * light themes keep their dark text for the typographic slides only.
 */
export interface Theme {
  id: string; name: string; kind: 'dark' | 'light'; description: string;
  bg0: string; bg1: string; bg2: string;           // solid ground, gradient centre, gradient edge
  fg: string; fg2: string; onMedia: string;        // text on theme ground, muted text, text over photos
  accent: string; accent2: string;                 // metallic accent and its lighter tint
  shade: string;                                   // rgb triplet used for photo shades and glass
  grain: number; vignette: number;
  fontDisplay: string; fontNum: string; fontUi: string;
  confetti: string[]; mediaFilter?: string;
}
const FRL = "'Frank Ruhl Libre','David Libre',Georgia,serif", SUEZ = "'Suez One','Frank Ruhl Libre',Georgia,serif", HEEBO = "'Heebo','Segoe UI',Arial,sans-serif";
const RUBIK = "'Rubik','Heebo',Arial,sans-serif", SECULAR = "'Secular One','Rubik',Arial,sans-serif", DAVID = "'David Libre','Frank Ruhl Libre',serif", AMATIC = "'Amatic SC','Secular One',cursive", BELLE = "'Bellefair','David Libre',serif", MIRIAM = "'Miriam Libre','Heebo',sans-serif";

export const THEMES: Theme[] = [
  { id: 'midnight-gold', name: 'לילה וזהב', kind: 'dark', description: 'כחול־לילה עמוק, שנהב וזהב חם. ברירת המחדל.', bg0: '#000000', bg1: '#1c1d2b', bg2: '#06060a', fg: '#efe9db', fg2: '#cfc8b8', onMedia: '#f3ecd9', accent: '#d4a84b', accent2: '#f1d38a', shade: '0,0,0', grain: .08, vignette: .5, fontDisplay: FRL, fontNum: SUEZ, fontUi: HEEBO, confetti: ['#d4a84b', '#f1d38a', '#ece6d8', '#b8862e', '#fff5d6'] },
  { id: 'navy-rosegold', name: 'כחול ורוד־זהב', kind: 'dark', description: 'נייבי חגיגי עם רוז־גולד רך.', bg0: '#070c16', bg1: '#17243f', bg2: '#080f1e', fg: '#f4ebe6', fg2: '#cfc3bd', onMedia: '#fbf2ee', accent: '#d9a39c', accent2: '#f2cbc3', shade: '6,10,22', grain: .06, vignette: .55, fontDisplay: FRL, fontNum: SUEZ, fontUi: HEEBO, confetti: ['#d9a39c', '#f2cbc3', '#f4ebe6', '#b8807a', '#ffffff'] },
  { id: 'ivory-classic', name: 'שנהב קלאסי', kind: 'light', description: 'נייר שנהב, דיו כהה, זהב עמוק. בהיר ומכובד.', bg0: '#f4efe4', bg1: '#fbf7ee', bg2: '#e8dfcc', fg: '#2a2419', fg2: '#6b6250', onMedia: '#fff8ea', accent: '#9a7421', accent2: '#b8862e', shade: '26,20,10', grain: .05, vignette: .35, fontDisplay: DAVID, fontNum: BELLE, fontUi: HEEBO, confetti: ['#9a7421', '#b8862e', '#d9bb77', '#2a2419', '#ffffff'] },
  { id: 'cinema', name: 'קולנועי', kind: 'dark', description: 'שחור עמוק, ענבר, גרעין פילם. מודרני ודרמטי.', bg0: '#040506', bg1: '#111518', bg2: '#030405', fg: '#ebe7df', fg2: '#b9b4aa', onMedia: '#f2eee6', accent: '#e0a458', accent2: '#f5c98a', shade: '0,0,0', grain: .14, vignette: .75, fontDisplay: RUBIK, fontNum: SUEZ, fontUi: RUBIK, confetti: ['#e0a458', '#f5c98a', '#ebe7df', '#8a5a2a', '#ffffff'] },
  { id: 'vintage', name: 'וינטג׳', kind: 'dark', description: 'חומים חמים, ספיה, אותיות של פעם.', bg0: '#1a130e', bg1: '#3c2d22', bg2: '#17110c', fg: '#f1e4cf', fg2: '#cdbba0', onMedia: '#f7ecd8', accent: '#c9a06a', accent2: '#e8caa0', shade: '28,20,12', grain: .16, vignette: .65, fontDisplay: MIRIAM, fontNum: DAVID, fontUi: HEEBO, confetti: ['#c9a06a', '#e8caa0', '#f1e4cf', '#8c6a3f', '#fff2dc'], mediaFilter: 'sepia(.35) contrast(.96) brightness(1.02)' },
  { id: 'emerald-copper', name: 'ירוק ונחושת', kind: 'dark', description: 'ירוק אזמרגד עמוק עם נחושת.', bg0: '#06110e', bg1: '#123129', bg2: '#06130f', fg: '#ecebe2', fg2: '#c3c4b6', onMedia: '#f3f2e9', accent: '#c9865a', accent2: '#e8b48f', shade: '4,16,12', grain: .07, vignette: .6, fontDisplay: FRL, fontNum: SUEZ, fontUi: HEEBO, confetti: ['#c9865a', '#e8b48f', '#ecebe2', '#2f6b55', '#ffffff'] },
  { id: 'burgundy', name: 'בורדו', kind: 'dark', description: 'יין עמוק עם זהב בהיר.', bg0: '#150508', bg1: '#3d1020', bg2: '#15060b', fg: '#f6e8e4', fg2: '#d4bcb6', onMedia: '#fbf0ec', accent: '#e2b27a', accent2: '#f4d6a8', shade: '20,6,10', grain: .08, vignette: .6, fontDisplay: FRL, fontNum: SUEZ, fontUi: HEEBO, confetti: ['#e2b27a', '#f4d6a8', '#f6e8e4', '#7a2b3e', '#ffffff'] },
  { id: 'sea', name: 'ים', kind: 'dark', description: 'כחול־ים עמוק וחול.', bg0: '#04101c', bg1: '#0d2a44', bg2: '#04101c', fg: '#eef4f6', fg2: '#c3d0d6', onMedia: '#f4f9fb', accent: '#e3c58b', accent2: '#f3dcae', shade: '4,16,28', grain: .06, vignette: .55, fontDisplay: FRL, fontNum: SUEZ, fontUi: HEEBO, confetti: ['#e3c58b', '#f3dcae', '#eef4f6', '#2b6f8f', '#ffffff'] },
  { id: 'modern', name: 'מודרני', kind: 'dark', description: 'פחם ולבן, גופן ישר, בלי קישוט.', bg0: '#0a0a0a', bg1: '#1d1d1f', bg2: '#0a0a0a', fg: '#fafafa', fg2: '#b5b5b5', onMedia: '#ffffff', accent: '#e9e9e9', accent2: '#ffffff', shade: '0,0,0', grain: 0, vignette: .3, fontDisplay: SECULAR, fontNum: RUBIK, fontUi: RUBIK, confetti: ['#ffffff', '#e9e9e9', '#9b9b9b', '#5a5a5a', '#fafafa'] },
  { id: 'pastel', name: 'פסטל', kind: 'light', description: 'ורוד־אבקה בהיר, כתב־יד חגיגי.', bg0: '#f6e9ee', bg1: '#fdf3f6', bg2: '#efd9e3', fg: '#4a3340', fg2: '#8a6e7c', onMedia: '#fff6f9', accent: '#b46a84', accent2: '#d58aa6', shade: '60,30,45', grain: .04, vignette: .3, fontDisplay: AMATIC, fontNum: BELLE, fontUi: HEEBO, confetti: ['#d58aa6', '#f2c4d4', '#fff6f9', '#b46a84', '#ffe8a3'] },
  { id: 'monochrome', name: 'שחור־לבן', kind: 'dark', description: 'אפור־כסף על שחור; התמונות בשחור־לבן.', bg0: '#050505', bg1: '#1e1e1e', bg2: '#050505', fg: '#f2f2f2', fg2: '#b0b0b0', onMedia: '#ffffff', accent: '#c4c4c4', accent2: '#ededed', shade: '0,0,0', grain: .12, vignette: .6, fontDisplay: FRL, fontNum: SUEZ, fontUi: HEEBO, confetti: ['#ffffff', '#ededed', '#c4c4c4', '#8a8a8a', '#f2f2f2'], mediaFilter: 'grayscale(1) contrast(1.06)' },
];
export const THEME_IDS = THEMES.map(t => t.id);
export const themeById = (id?: string | null): Theme => THEMES.find(t => t.id === id) ?? THEMES[0];
export const nextThemeId = (id: string, dir: 1 | -1 = 1) => THEME_IDS[(THEME_IDS.indexOf(id) + dir + THEME_IDS.length) % THEME_IDS.length];

function vars(t: Theme): string {
  return [`--t-bg0:${t.bg0}`, `--t-bg1:${t.bg1}`, `--t-bg2:${t.bg2}`, `--t-fg:${t.fg}`, `--t-fg2:${t.fg2}`, `--t-on-media:${t.onMedia}`, `--t-accent:${t.accent}`, `--t-accent2:${t.accent2}`, `--t-shade:${t.shade}`,
    `--t-grain:${t.grain}`, `--t-vig:${t.vignette}`, `--t-font-display:${t.fontDisplay}`, `--t-font-num:${t.fontNum}`, `--t-font-ui:${t.fontUi}`, `--t-confetti:${t.confetti.join(',')}`, `--t-media-filter:${t.mediaFilter ?? 'none'}`, `color-scheme:${t.kind}`].join(';');
}
/** CSS for every theme, keyed by [data-theme]; the default theme is also set on :root so nothing is ever unthemed. */
export function themeCss(): string {
  return `:root{${vars(THEMES[0])}}\n` + THEMES.map(t => `[data-theme="${t.id}"]{${vars(t)}}`).join('\n');
}
/** Which theme a slide should use: live override → slide → chapter → show setting. */
export function resolveTheme(settingsTheme: string | undefined, chapterTheme?: string, slideTheme?: string, live?: string | null): string {
  return themeById(live || slideTheme || chapterTheme || settingsTheme).id;
}

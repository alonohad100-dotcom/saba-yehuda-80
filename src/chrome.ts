/** Chrome theme (the tool's own look, not the show's): "light" (default) or "dark", on <html data-chrome>. Remembered on the server (kv chrome-theme). */
import { create } from 'zustand';
import { api } from '@/api';

export type ChromeTheme = 'light' | 'dark';
const KEY = 'chrome-theme';
const apply = (t: ChromeTheme) => { document.documentElement.dataset.chrome = t; };
const systemDefault = (): ChromeTheme => (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

interface ChromeState { theme: ChromeTheme; ready: boolean; set: (t: ChromeTheme) => void; toggle: () => void }
export const useChrome = create<ChromeState>((set, get) => ({
  theme: 'light', ready: false,
  set: (t) => { apply(t); set({ theme: t }); void api.kvSet(KEY, t).catch(() => {}); },
  toggle: () => get().set(get().theme === 'light' ? 'dark' : 'light'),
}));

/** Apply the remembered chrome theme as early as possible (system preference first, then the saved choice). */
export function initChrome() {
  const sys = systemDefault(); apply(sys); useChrome.setState({ theme: sys });
  void api.kvGet<ChromeTheme>(KEY).then(v => { const t = v === 'dark' || v === 'light' ? v : sys; apply(t); useChrome.setState({ theme: t, ready: true }); }).catch(() => useChrome.setState({ ready: true }));
}

/** Sliders show a filled track up to the thumb: keep --fill in sync for every range input (user input, React updates, new inputs). */
function fill(el: HTMLInputElement) { const min = el.min === '' ? 0 : +el.min, max = el.max === '' ? 100 : +el.max; const v = +el.value; el.style.setProperty('--fill', `${Math.max(0, Math.min(100, ((v - min) / ((max - min) || 1)) * 100))}%`); }
export function initRangeFill() {
  let raf = 0; const all = () => { raf = 0; document.querySelectorAll<HTMLInputElement>('input[type=range]').forEach(fill); };
  const schedule = () => { if (!raf) raf = requestAnimationFrame(all); };
  document.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (t?.type === 'range') fill(t); }, true);
  new MutationObserver(muts => { for (const m of muts) { if (m.type === 'attributes') { const t = m.target as HTMLInputElement; if (t.type === 'range') fill(t); } else { schedule(); return; } } }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['value', 'min', 'max'] });
  schedule();
}

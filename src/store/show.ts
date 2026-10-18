import { create } from 'zustand';
import { temporal } from 'zundo';
import { type Show, type Slide, type Chapter, type Settings, type CollageLayout, type Overlay, Show as ShowSchema, uid, slideSeconds, TYPE_DEFAULT_SECONDS, type Asset } from '@shared/model';
import { api } from '@/api';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

interface ShowState {
  show: Show | null;
  save: SaveState;
  saveError?: string;
  lastSavedAt?: number;
  selection: { chapterId: string | null; slideIds: string[] };
  load: () => Promise<void>;
  replace: (show: Show) => void;
  mutate: (fn: (show: Show) => void) => void;
  select: (chapterId: string | null, slideIds?: string[], opts?: { toggle?: boolean; range?: boolean }) => void;
  // slide actions
  addSlides: (chapterId: string, slides: Slide[], index?: number) => void;
  updateSlide: (id: string, patch: Partial<Slide> | ((s: Slide) => void)) => void;
  updateSlides: (ids: string[], patch: Record<string, unknown>) => void;
  removeSlides: (ids: string[]) => void;
  duplicateSlides: (ids: string[]) => void;
  moveSlide: (id: string, toChapterId: string, index: number) => void;
  reorderInChapter: (chapterId: string, from: number, to: number) => void;
  // chapter actions
  addChapter: (afterId?: string, title?: string) => string;
  updateChapter: (id: string, patch: Partial<Chapter>) => void;
  removeChapter: (id: string) => void;
  moveChapter: (id: string, dir: -1 | 1) => void;
  sortChapterByYear: (id: string, assets: Record<string, Asset>) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateMeta: (patch: Partial<Show['meta']>) => void;
  // auto-create
  applyGeneration: (generated: Show, mode: 'replace' | 'append' | 'fill', opts?: { afterChapterId?: string; fillChapterId?: string }) => void;
  setLocked: (ids: string[], locked: boolean) => void;
  setChapterLocked: (id: string, locked: boolean) => void;
  replaceAssetInSlide: (slideId: string, fromAssetId: string, toAsset: Asset) => void;
  setCollageLayout: (slideId: string, layout: CollageLayout) => void;
  // overlays
  addOverlay: (slideId: string, overlay: Overlay) => void;
  updateOverlay: (slideId: string, overlayId: string, patch: Partial<Overlay>) => void;
  removeOverlay: (slideId: string, overlayId: string) => void;
  duplicateOverlay: (slideId: string, overlayId: string) => string | null;
  reorderOverlay: (slideId: string, overlayId: string, dir: 1 | -1) => void;
}

function findSlide(show: Show, id: string): { c: Chapter; i: number; s: Slide } | null {
  for (const c of show.chapters) { const i = c.slides.findIndex(s => s.id === id); if (i >= 0) return { c, i, s: c.slides[i] }; }
  return null;
}

export const useShow = create<ShowState>()(
  temporal(
    (set, get) => ({
      show: null, save: 'idle', selection: { chapterId: null, slideIds: [] },
      load: async () => {
        const show = ShowSchema.parse(await api.show());
        set({ show, save: 'saved', lastSavedAt: Date.now(), selection: { chapterId: show.chapters[0]?.id ?? null, slideIds: show.chapters[0]?.slides[0] ? [show.chapters[0].slides[0].id] : [] } });
        useShow.temporal.getState().clear();
      },
      replace: (show) => set({ show, save: 'dirty' }),
      mutate: (fn) => { const cur = get().show; if (!cur) return; const next = structuredClone(cur); fn(next); set({ show: next, save: 'dirty' }); },
      select: (chapterId, slideIds = [], opts) => set(st => {
        if (opts?.toggle && slideIds.length === 1) { const has = st.selection.slideIds.includes(slideIds[0]); return { selection: { chapterId, slideIds: has ? st.selection.slideIds.filter(x => x !== slideIds[0]) : [...st.selection.slideIds, slideIds[0]] } }; }
        if (opts?.range && slideIds.length === 1 && st.show) { const all = st.show.chapters.flatMap(c => c.slides.map(s => s.id)); const anchor = st.selection.slideIds[0]; const a = all.indexOf(anchor), b = all.indexOf(slideIds[0]); if (a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; return { selection: { chapterId, slideIds: all.slice(lo, hi + 1) } }; } }
        return { selection: { chapterId, slideIds } };
      }),
      addSlides: (chapterId, slides, index) => { get().mutate(sh => { const c = sh.chapters.find(x => x.id === chapterId) ?? sh.chapters[0]; const at = index == null ? c.slides.length : Math.max(0, Math.min(c.slides.length, index)); c.slides.splice(at, 0, ...slides); }); set({ selection: { chapterId, slideIds: slides.map(s => s.id) } }); },
      updateSlide: (id, patch) => get().mutate(sh => { const f = findSlide(sh, id); if (!f) return; if (typeof patch === 'function') patch(f.s); else Object.assign(f.s, patch); }),
      updateSlides: (ids, patch) => get().mutate(sh => { for (const id of ids) { const f = findSlide(sh, id); if (f) Object.assign(f.s, patch); } }),
      removeSlides: (ids) => { const st = get(); let nextSel: string | null = null; let ch: string | null = st.selection.chapterId;
        st.mutate(sh => { for (const c of sh.chapters) { const idx = c.slides.findIndex(s => ids.includes(s.id)); c.slides = c.slides.filter(s => !ids.includes(s.id)); if (idx >= 0 && !nextSel) { nextSel = c.slides[Math.min(idx, c.slides.length - 1)]?.id ?? null; ch = c.id; } } });
        set({ selection: { chapterId: ch, slideIds: nextSel ? [nextSel] : [] } }); },
      duplicateSlides: (ids) => { const newIds: string[] = []; let ch: string | null = null;
        get().mutate(sh => { for (const c of sh.chapters) { for (let i = c.slides.length - 1; i >= 0; i--) { if (ids.includes(c.slides[i].id)) { const copy = structuredClone(c.slides[i]); copy.id = uid(); c.slides.splice(i + 1, 0, copy); newIds.unshift(copy.id); ch = c.id; } } } });
        if (newIds.length) set({ selection: { chapterId: ch, slideIds: newIds } }); },
      moveSlide: (id, toChapterId, index) => get().mutate(sh => { const f = findSlide(sh, id); if (!f) return; f.c.slides.splice(f.i, 1); const to = sh.chapters.find(c => c.id === toChapterId); if (!to) return; to.slides.splice(Math.max(0, Math.min(to.slides.length, index)), 0, f.s); }),
      reorderInChapter: (chapterId, from, to) => get().mutate(sh => { const c = sh.chapters.find(x => x.id === chapterId); if (!c || from === to) return; const [s] = c.slides.splice(from, 1); c.slides.splice(to, 0, s); }),
      addChapter: (afterId, title = 'פרק חדש') => { const id = uid('ch'); get().mutate(sh => { const i = afterId ? sh.chapters.findIndex(c => c.id === afterId) : sh.chapters.length - 1; sh.chapters.splice(i + 1, 0, { id, title, slides: [] }); }); set({ selection: { chapterId: id, slideIds: [] } }); return id; },
      updateChapter: (id, patch) => get().mutate(sh => { const c = sh.chapters.find(x => x.id === id); if (c) Object.assign(c, patch); }),
      removeChapter: (id) => { get().mutate(sh => { if (sh.chapters.length <= 1) return; sh.chapters = sh.chapters.filter(c => c.id !== id); }); const sh = get().show!; set({ selection: { chapterId: sh.chapters[0].id, slideIds: [] } }); },
      moveChapter: (id, dir) => get().mutate(sh => { const i = sh.chapters.findIndex(c => c.id === id); const j = i + dir; if (i < 0 || j < 0 || j >= sh.chapters.length) return; const [c] = sh.chapters.splice(i, 1); sh.chapters.splice(j, 0, c); }),
      sortChapterByYear: (id, assets) => get().mutate(sh => { const c = sh.chapters.find(x => x.id === id); if (!c) return; const year = (s: Slide) => { if (s.type === 'photo') return s.year ?? assets[s.assetId]?.year ?? 9999; if (s.type === 'chapter') return -1; return 5000; }; c.slides.sort((a, b) => year(a) - year(b)); }),
      updateSettings: (patch) => get().mutate(sh => Object.assign(sh.settings, patch)),
      updateMeta: (patch) => get().mutate(sh => Object.assign(sh.meta, patch)),
      applyGeneration: (generated, mode, opts) => {
        const cur = get().show; if (!cur) return; let next: Show; let firstId: string | null = null;
        if (mode === 'replace') { next = structuredClone(generated); firstId = next.chapters.find(c => c.auto)?.id ?? next.chapters[0]?.id ?? null; }
        else if (mode === 'fill') { next = structuredClone(cur); const g = generated.chapters.find(c => c.id === opts?.fillChapterId); const i = next.chapters.findIndex(c => c.id === opts?.fillChapterId); if (g && i >= 0) next.chapters[i] = structuredClone(g); firstId = opts?.fillChapterId ?? null; }
        else { next = structuredClone(cur); const add = structuredClone(generated.chapters.filter(c => c.auto && !['פתיחה', 'סיום'].includes(c.title))); const i = opts?.afterChapterId ? next.chapters.findIndex(c => c.id === opts.afterChapterId) : next.chapters.length - 1; next.chapters.splice(i + 1, 0, ...add); firstId = add[0]?.id ?? null; }
        set({ show: next, save: 'dirty', selection: { chapterId: firstId, slideIds: [] } });
      },
      setLocked: (ids, locked) => get().mutate(sh => { for (const c of sh.chapters) for (const s of c.slides) if (ids.includes(s.id)) s.locked = locked || undefined; }),
      setChapterLocked: (id, locked) => get().mutate(sh => { const c = sh.chapters.find(x => x.id === id); if (c) c.locked = locked || undefined; }),
      replaceAssetInSlide: (slideId, from, to) => get().mutate(sh => { const f = findSlide(sh, slideId); if (!f) return; const s = f.s as any;
        if (s.assetId === from) { s.assetId = to.id; if (s.type === 'photo') { s.focal = to.focal; s.year = to.year; } }
        if (Array.isArray(s.assetIds)) s.assetIds = s.assetIds.map((id: string) => (id === from ? to.id : id));
        if (s.heroAssetId === from) s.heroAssetId = to.id;
        if (Array.isArray(s.people)) for (const p of s.people) if (p.assetId === from) p.assetId = to.id;
        if (Array.isArray(s.milestones)) for (const m of s.milestones) if (m.assetId === from) m.assetId = to.id; }),
      setCollageLayout: (slideId, layout) => get().mutate(sh => { const f = findSlide(sh, slideId); if (f && f.s.type === 'collage') f.s.layout = layout; }),
      addOverlay: (slideId, overlay) => get().mutate(sh => { const f = findSlide(sh, slideId); if (!f) return; (f.s.overlays ??= []).push({ ...overlay, z: overlay.z || (f.s.overlays.length + 1) }); }),
      updateOverlay: (slideId, overlayId, patch) => get().mutate(sh => { const f = findSlide(sh, slideId); const o = f?.s.overlays?.find(x => x.id === overlayId); if (o) Object.assign(o, patch); }),
      removeOverlay: (slideId, overlayId) => get().mutate(sh => { const f = findSlide(sh, slideId); if (f?.s.overlays) f.s.overlays = f.s.overlays.filter(x => x.id !== overlayId); }),
      duplicateOverlay: (slideId, overlayId) => { let id: string | null = null; get().mutate(sh => { const f = findSlide(sh, slideId); const o = f?.s.overlays?.find(x => x.id === overlayId); if (!o || !f) return; const c = structuredClone(o); c.id = uid('o'); c.x = Math.min(90, c.x + 4); c.y = Math.min(90, c.y + 4); c.z = (f.s.overlays!.length + 1); f.s.overlays!.push(c); id = c.id; }); return id; },
      reorderOverlay: (slideId, overlayId, dir) => get().mutate(sh => { const f = findSlide(sh, slideId); const list = f?.s.overlays; if (!list) return; list.sort((a, b) => a.z - b.z); const i = list.findIndex(x => x.id === overlayId); const j = i + dir; if (i < 0 || j < 0 || j >= list.length) return; [list[i], list[j]] = [list[j], list[i]]; list.forEach((o, k) => { o.z = k + 1; }); }),
    }),
    { partialize: (s) => ({ show: s.show }), limit: 200, equality: (a, b) => a.show === b.show },
  ),
);

/* ---------- autosave: debounced PUT after every change ---------- */
let saveTimer: ReturnType<typeof setTimeout> | undefined; let inflight = false; let pending = false;
async function flush() {
  const st = useShow.getState(); if (!st.show || inflight) { pending = true; return; }
  inflight = true; pending = false; useShow.setState({ save: 'saving' });
  try { await api.saveShow(st.show); useShow.setState({ save: pending ? 'dirty' : 'saved', lastSavedAt: Date.now(), saveError: undefined }); }
  catch (e) { useShow.setState({ save: 'error', saveError: (e as Error).message }); }
  finally { inflight = false; if (pending) flush(); }
}
useShow.subscribe((s, prev) => { if (s.show && s.show !== prev.show && s.save === 'dirty') { clearTimeout(saveTimer); saveTimer = setTimeout(flush, 600); } });
export function saveNow(label?: string) { clearTimeout(saveTimer); const st = useShow.getState(); if (!st.show) return Promise.resolve(); useShow.setState({ save: 'saving' }); return api.saveShow(st.show, label).then(() => useShow.setState({ save: 'saved', lastSavedAt: Date.now() })).catch(e => useShow.setState({ save: 'error', saveError: (e as Error).message })); }
export function undo() { useShow.temporal.getState().undo(); markDirty(); }
export function redo() { useShow.temporal.getState().redo(); markDirty(); }
function markDirty() { useShow.setState({ save: 'dirty' }); }

/* ---------- derived helpers ---------- */
export function newSlideFor(asset: Asset, settings: Settings): Slide {
  if (asset.type === 'video') return { id: uid(), type: 'video', assetId: asset.id, name: asset.name.replace(/\.[^.]+$/, ''), relation: '' };
  return { id: uid(), type: 'photo', assetId: asset.id, caption: '', year: asset.year, kenBurns: 'in', focal: asset.focal, seconds: settings.defaultSlideSeconds };
}
export function blankSlide(type: Slide['type'], extra: Partial<Record<string, unknown>> = {}): Slide {
  const id = uid(); const seconds = TYPE_DEFAULT_SECONDS[type] || 6;
  const base: Record<string, unknown> = { id, seconds, ...extra };
  switch (type) {
    case 'intro': return { ...base, type, title: 'יהודה', subtitle: 'חוגגים 80', number: '80' } as unknown as Slide;
    case 'chapter': return { ...base, type, label: 'פרק חדש', blurb: '' } as unknown as Slide;
    case 'quote': return { ...base, type, text: 'משפט שהמשפחה אומרת עליו', by: '' } as unknown as Slide;
    case 'timeline': return { ...base, type, title: 'שמונים שנה בדקה', milestones: [{ year: 1946, label: 'נולד' }, { year: 2026, label: '80' }] } as unknown as Slide;
    case 'names': return { ...base, type, title: 'המשפחה', people: [] } as unknown as Slide;
    case 'finale': return { ...base, type, text: 'עד 120, אבא', number: '80' } as unknown as Slide;
    case 'black': return { id, type, caption: '' } as unknown as Slide;
    default: return { ...base, type } as unknown as Slide;
  }
}
export function showTotals(show: Show, assets: Record<string, Asset>) {
  let slides = 0, seconds = 0, videos = 0;
  for (const c of show.chapters) for (const s of c.slides) { slides++; seconds += slideSeconds(s, c, show.settings, assets); if (s.type === 'video') videos++; }
  return { slides, seconds, videos, chapters: show.chapters.length };
}

import { create } from 'zustand';

export type DialogId = null | 'settings' | 'versions' | 'ingest' | 'help' | 'auto' | 'export';
interface UiState {
  libSel: string[]; setLibSel: (ids: string[]) => void; toggleLibSel: (id: string) => void; clearLibSel: () => void;
  dialog: DialogId; openDialog: (d: DialogId, ctx?: { fillChapterId?: string }) => void; dialogCtx: { fillChapterId?: string };
  hideDups: boolean; toggleHideDups: () => void;
  selOverlay: string | null; selectOverlay: (id: string | null) => void;
  safeGuides: boolean; toggleSafe: () => void;
  storyH: number; setStoryH: (h: number) => void;
  tour: string | null; tourStep: number; startTour: (id: string, step?: number) => void; setTourStep: (n: number) => void; stopTour: () => void;
  welcome: boolean; setWelcome: (v: boolean) => void;
  // layout: resizable side panels, storyboard card size, drawers on narrow screens, inspector tab, collapsed sections
  libW: number; inspW: number; setLibW: (w: number) => void; setInspW: (w: number) => void;
  storyZoom: number; setStoryZoom: (z: number) => void;
  libOpen: boolean; inspOpen: boolean; toggleLib: () => void; toggleInsp: () => void;
  inspTab: 'props' | 'checks'; setInspTab: (t: 'props' | 'checks') => void;
  collapsed: Record<string, boolean>; toggleSection: (id: string) => void;
}
const num = (k: string, d: number) => { try { const v = +(localStorage.getItem(k) ?? ''); return v > 0 ? v : d; } catch { return d; } };
const save = (k: string, v: number) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };
export const useUi = create<UiState>((set) => ({
  libSel: [], setLibSel: (ids) => set({ libSel: ids }), toggleLibSel: (id) => set(s => ({ libSel: s.libSel.includes(id) ? s.libSel.filter(x => x !== id) : [...s.libSel, id] })), clearLibSel: () => set({ libSel: [] }),
  dialog: null, dialogCtx: {}, openDialog: (d, ctx = {}) => set({ dialog: d, dialogCtx: ctx }),
  hideDups: true, toggleHideDups: () => set(s => ({ hideDups: !s.hideDups })),
  selOverlay: null, selectOverlay: (id) => set({ selOverlay: id }),
  safeGuides: false, toggleSafe: () => set(s => ({ safeGuides: !s.safeGuides })),
  storyH: 236, setStoryH: (h) => set({ storyH: Math.max(140, Math.min(520, h)) }),
  tour: null, tourStep: 0, startTour: (id, step = 0) => set({ tour: id, tourStep: step, welcome: false, dialog: null }), setTourStep: (n) => set({ tourStep: n }), stopTour: () => set({ tour: null, tourStep: 0 }),
  welcome: false, setWelcome: (v) => set({ welcome: v }),
  libW: num('sy80.libW', 320), inspW: num('sy80.inspW', 320), setLibW: (w) => { const v = Math.max(240, Math.min(440, Math.round(w))); save('sy80.libW', v); set({ libW: v }); }, setInspW: (w) => { const v = Math.max(240, Math.min(440, Math.round(w))); save('sy80.inspW', v); set({ inspW: v }); },
  storyZoom: num('sy80.storyZoom', 144), setStoryZoom: (z) => { const v = Math.max(96, Math.min(220, Math.round(z))); save('sy80.storyZoom', v); set({ storyZoom: v }); },
  libOpen: false, inspOpen: false, toggleLib: () => set(s => ({ libOpen: !s.libOpen, inspOpen: false })), toggleInsp: () => set(s => ({ inspOpen: !s.inspOpen, libOpen: false })),
  inspTab: 'props', setInspTab: (t) => set({ inspTab: t }),
  collapsed: (() => { try { return JSON.parse(localStorage.getItem('sy80.collapsed') || '{}'); } catch { return {}; } })(), toggleSection: (id) => set(s => { const collapsed = { ...s.collapsed, [id]: !s.collapsed[id] }; try { localStorage.setItem('sy80.collapsed', JSON.stringify(collapsed)); } catch { /* ignore */ } return { collapsed }; }),
}));

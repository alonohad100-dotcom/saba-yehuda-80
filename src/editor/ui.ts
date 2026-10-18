import { create } from 'zustand';

export type DialogId = null | 'settings' | 'versions' | 'ingest' | 'help' | 'auto';
interface UiState {
  libSel: string[]; setLibSel: (ids: string[]) => void; toggleLibSel: (id: string) => void; clearLibSel: () => void;
  dialog: DialogId; openDialog: (d: DialogId, ctx?: { fillChapterId?: string }) => void; dialogCtx: { fillChapterId?: string };
  hideDups: boolean; toggleHideDups: () => void;
  selOverlay: string | null; selectOverlay: (id: string | null) => void;
  safeGuides: boolean; toggleSafe: () => void;
  storyH: number; setStoryH: (h: number) => void;
}
export const useUi = create<UiState>((set) => ({
  libSel: [], setLibSel: (ids) => set({ libSel: ids }), toggleLibSel: (id) => set(s => ({ libSel: s.libSel.includes(id) ? s.libSel.filter(x => x !== id) : [...s.libSel, id] })), clearLibSel: () => set({ libSel: [] }),
  dialog: null, dialogCtx: {}, openDialog: (d, ctx = {}) => set({ dialog: d, dialogCtx: ctx }),
  hideDups: true, toggleHideDups: () => set(s => ({ hideDups: !s.hideDups })),
  selOverlay: null, selectOverlay: (id) => set({ selOverlay: id }),
  safeGuides: false, toggleSafe: () => set(s => ({ safeGuides: !s.safeGuides })),
  storyH: 236, setStoryH: (h) => set({ storyH: Math.max(140, Math.min(520, h)) }),
}));

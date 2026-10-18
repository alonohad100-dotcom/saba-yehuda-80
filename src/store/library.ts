import { create } from 'zustand';
import type { Asset } from '@shared/model';
import { api } from '@/api';

interface LibraryState {
  assets: Record<string, Asset>;
  list: Asset[];
  loaded: boolean;
  error?: string;
  load: () => Promise<void>;
  setAsset: (a: Asset) => void;
}

export const useLibrary = create<LibraryState>((set) => ({
  assets: {}, list: [], loaded: false,
  load: async () => {
    try { const list = await api.assets(); set({ list, assets: Object.fromEntries(list.map(a => [a.id, a])), loaded: true, error: undefined }); }
    catch (e) { set({ error: (e as Error).message, loaded: true }); }
  },
  setAsset: (a) => set(s => { const assets = { ...s.assets, [a.id]: a }; return { assets, list: s.list.map(x => x.id === a.id ? a : x) }; }),
}));

import { create } from 'zustand';

interface Toast { id: number; text: string; kind: 'info' | 'ok' | 'warn' | 'error' }
interface ToastState { items: Toast[]; push: (text: string, kind?: Toast['kind']) => void; remove: (id: number) => void }
let n = 0;
export const useToast = create<ToastState>((set) => ({
  items: [],
  push: (text, kind = 'info') => { const id = ++n; set(s => ({ items: [...s.items.slice(-3), { id, text, kind }] })); setTimeout(() => set(s => ({ items: s.items.filter(t => t.id !== id) })), kind === 'error' ? 6000 : 2600); },
  remove: (id) => set(s => ({ items: s.items.filter(t => t.id !== id) })),
}));
export const toast = (text: string, kind?: Toast['kind']) => useToast.getState().push(text, kind);

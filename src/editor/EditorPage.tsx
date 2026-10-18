import { useEffect, useMemo, useState } from 'react';
import { DndContext, DragOverlay, PointerSensor, useSensor, useSensors, closestCenter, type DragStartEvent, type DragOverEvent, type DragEndEvent } from '@dnd-kit/core';
import { useShow, undo, redo, saveNow, newSlideFor } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { TopBar } from './TopBar';
import { Library, AssetCard } from './Library';
import { Storyboard, SlideCard } from './Storyboard';
import { Inspector } from './Inspector';
import { Preview } from './Preview';
import { Dialogs } from './Dialogs';
import { toast } from '@/store/toast';
import type { Slide } from '@shared/model';

export function EditorPage() {
  const show = useShow(s => s.show); const load = useShow(s => s.load); const sel = useShow(s => s.selection); const select = useShow(s => s.select);
  const lib = useLibrary(); const libSel = useUi(s => s.libSel); const storyH = useUi(s => s.storyH);
  const [active, setActive] = useState<{ type: 'slide' | 'asset'; id: string } | null>(null);
  useEffect(() => { void load().catch(e => toast('טעינת המצגת נכשלה: ' + e.message, 'error')); void lib.load(); document.title = 'סבא יהודה 80 · עורך'; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const h = useShow.getState(); return useShow.subscribe((s) => { if (s.save === 'error' && s.saveError && s.saveError !== h.saveError) toast('השמירה נכשלה: ' + s.saveError, 'error'); }); }, []);

  // global shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable;
      const st = useShow.getState(); if (!st.show) return; const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); void saveNow(); toast('נשמר', 'ok'); return; }
      if (mod && e.key.toLowerCase() === 'z') { if (typing) return; e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
      if (mod && e.key.toLowerCase() === 'y') { if (typing) return; e.preventDefault(); redo(); return; }
      if (typing) return;
      const ids = st.selection.slideIds; const ui = useUi.getState();
      if (ui.selOverlay && ids.length === 1) { // an overlay is selected: keys act on it, not on the slide
        const sid = ids[0]; const o = st.show.chapters.flatMap(c => c.slides).find(s => s.id === sid)?.overlays?.find(x => x.id === ui.selOverlay);
        if (e.key === 'Escape') { ui.selectOverlay(null); return; }
        if (!o) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); st.removeOverlay(sid, o.id); ui.selectOverlay(null); toast('השכבה נמחקה'); return; }
        if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); const nid = st.duplicateOverlay(sid, o.id); if (nid) ui.selectOverlay(nid); return; }
        if (mod && (e.key === ']' || e.key === '[')) { e.preventDefault(); st.reorderOverlay(sid, o.id, e.key === ']' ? 1 : -1); return; }
        if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { if (o.locked) return; e.preventDefault(); const step = e.shiftKey ? 5 : 1; const p: Record<string, number> = {}; if (e.key === 'ArrowLeft') p.x = o.x - step; if (e.key === 'ArrowRight') p.x = o.x + step; if (e.key === 'ArrowUp') p.y = o.y - step; if (e.key === 'ArrowDown') p.y = o.y + step; st.updateOverlay(sid, o.id, p); return; }
        return;
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && ids.length) { e.preventDefault(); st.removeSlides(ids); toast(`${ids.length} שקופיות נמחקו`); }
      if (mod && e.key.toLowerCase() === 'd' && ids.length) { e.preventDefault(); st.duplicateSlides(ids); }
      if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); const c = st.show.chapters.find(x => x.id === st.selection.chapterId) ?? st.show.chapters[0]; st.select(c.id, c.slides.map(s => s.id)); }
      if (e.key === 'Escape') st.select(st.selection.chapterId, []);
      if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !mod) { const all = st.show.chapters.flatMap(c => c.slides.map(s => ({ s, c }))); const i = all.findIndex(x => x.s.id === ids[ids.length - 1]); if (i < 0) return; const j = Math.max(0, Math.min(all.length - 1, i + (e.key === 'ArrowLeft' ? 1 : -1))); st.select(all[j].c.id, [all[j].s.id], { range: e.shiftKey }); }
      if (e.key === 'Enter' && libSel.length) { const c = st.show.chapters.find(x => x.id === st.selection.chapterId) ?? st.show.chapters[0]; const slides = libSel.map(id => lib.assets[id]).filter(Boolean).sort((a, b) => (a.year ?? 0) - (b.year ?? 0)).map(a => newSlideFor(a, st.show!.settings)); st.addSlides(c.id, slides); useUi.getState().clearLibSel(); }
      if (e.key === '?' ) useUi.getState().openDialog('help');
    };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [libSel, lib.assets]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const onDragStart = (e: DragStartEvent) => { const d = e.active.data.current as any; setActive({ type: d?.type ?? 'slide', id: String(e.active.id) }); useShow.temporal.getState().pause(); };
  const onDragOver = (e: DragOverEvent) => {
    const a = e.active.data.current as any, o = e.over?.data.current as any; if (!o || a?.type !== 'slide') return;
    const toCh = o.chapterId as string; if (!toCh || toCh === a.chapterId) return;
    const st = useShow.getState(); const c = st.show!.chapters.find(x => x.id === toCh)!; const idx = o.type === 'slide' ? c.slides.findIndex(s => s.id === e.over!.id) : c.slides.length;
    st.moveSlide(String(e.active.id), toCh, Math.max(0, idx));
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null); const st = useShow.getState(); useShow.temporal.getState().resume(); if (!e.over || !st.show) return;
    const a = e.active.data.current as any, o = e.over.data.current as any; const toCh = o?.chapterId as string | undefined; if (!toCh) return;
    const c = st.show.chapters.find(x => x.id === toCh)!;
    if (a?.type === 'slide') { const from = c.slides.findIndex(s => s.id === e.active.id); const to = o.type === 'slide' ? c.slides.findIndex(s => s.id === e.over!.id) : c.slides.length - 1; if (from >= 0 && to >= 0 && from !== to) st.reorderInChapter(toCh, from, to); else st.mutate(() => {}); st.select(toCh, [String(e.active.id)]); return; }
    if (a?.type === 'asset') {
      const aid = a.assetId as string; const ids = libSel.includes(aid) ? libSel : [aid];
      const slides: Slide[] = ids.map(id => lib.assets[id]).filter(Boolean).sort((x, y) => (x.year ?? 0) - (y.year ?? 0)).map(x => newSlideFor(x, st.show!.settings));
      const idx = o.type === 'slide' ? c.slides.findIndex(s => s.id === e.over!.id) : c.slides.length;
      st.addSlides(toCh, slides, idx); useUi.getState().clearLibSel(); toast(`${slides.length} שקופיות נוספו לפרק „${c.title}”`, 'ok');
    }
  };

  const activeSlide = useMemo(() => { if (!active || active.type !== 'slide' || !show) return null; for (const c of show.chapters) { const s = c.slides.find(x => x.id === active.id); if (s) return { s, c }; } return null; }, [active, show]);
  if (!show) return <div className="loading">טוען את המצגת…</div>;
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={() => { setActive(null); useShow.temporal.getState().resume(); }}>
      <div className="app" style={{ ['--story-h' as any]: `${storyH}px` }}>
        <TopBar />
        <div className="editor">
          <Library />
          <Preview />
          <Inspector />
          <Storyboard />
        </div>
        <Dialogs />
      </div>
      <DragOverlay dropAnimation={null} className="drag-overlay">
        {active?.type === 'slide' && activeSlide ? <SlideCard slide={activeSlide.s} chapter={activeSlide.c} index={0} overlay /> : null}
        {active?.type === 'asset' && lib.assets[active.id.replace('asset:', '')] ? <div style={{ width: 110 }}><AssetCard a={lib.assets[active.id.replace('asset:', '')]} selected count={libSel.includes(active.id.replace('asset:', '')) ? libSel.length : 1} overlay /></div> : null}
      </DragOverlay>
    </DndContext>
  );
}

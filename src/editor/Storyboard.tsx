import { useEffect, useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Music, AlertTriangle, Type, BookOpen, Quote, Clock, Users, Sparkles, Square, Film, Play, Lock, Unlock, ZoomIn, Copy, Trash2 } from 'lucide-react';
import { useShow, blankSlide, showTotals, newSlideFor } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { toast } from '@/store/toast';
import { openGuide } from '@/guide/bridge';
import { Image as ImageIcon, Columns2, LayoutGrid } from 'lucide-react';
import { type Slide, type Chapter, slideSeconds, slideAdvance, slideThumbAsset, slideTitle, assetThumb, fmtTime, uid, TYPE_LABEL, MUSIC_CUE_LABEL } from '@shared/model';

export function SlideCard({ slide, chapter, index, overlay, selected, warn, onClick, onDouble, onContextMenu, onDelete, onDuplicate }: { slide: Slide; chapter: Chapter; index: number; overlay?: boolean; selected?: boolean; warn?: boolean; onClick?: (e: React.MouseEvent) => void; onDouble?: () => void; onContextMenu?: (e: React.MouseEvent) => void; onDelete?: () => void; onDuplicate?: () => void }) {
  const show = useShow(s => s.show)!; const assets = useLibrary(s => s.assets);
  const thumbId = slideThumbAsset(slide); const a = thumbId ? assets[thumbId] : undefined; const secs = slideSeconds(slide, chapter, show.settings, assets); const manual = slideAdvance(slide) === 'manual';
  const title = slideTitle(slide);
  return (
    <div className={`slide ${selected ? 'sel' : ''} ${!a ? 'text' : ''}`} data-id={slide.id} data-type={slide.type} onClick={onClick} onDoubleClick={onDouble} onContextMenu={onContextMenu} title={`${TYPE_LABEL[slide.type]}${title ? ' · ' + title : ''}\nלחיצה ימנית לתפריט`}>
      {a ? <img src={assetThumb(a)} alt="" draggable={false} /> : <span className="tx">{title || TYPE_LABEL[slide.type]}</span>}
      <span className="ty">{TYPE_LABEL[slide.type]}</span>
      {!overlay && <span className="idx num">{index + 1}</span>}
      <span className={`du num ${manual ? 'manual' : ''}`}>{manual && slide.type !== 'video' ? 'לחיצה' : fmtTime(secs)}</span>
      {a && title && <span className="cap">{title}</span>}
      {warn && <span className="warnmark"><AlertTriangle /></span>}
      {slide.locked && <span className="lock" title="נעול"><Lock /></span>}
      {(slide.musicId || (slide.music && slide.music !== 'auto')) && <span className="mcue" title={`${slide.musicId ? `שיר: ${assets[slide.musicId]?.name.replace(/\.[^.]+$/, '') ?? '?'}` : ''}${slide.musicId && slide.music && slide.music !== 'auto' ? ' · ' : ''}${slide.music && slide.music !== 'auto' ? `מוזיקה: ${MUSIC_CUE_LABEL[slide.music]}` : ''}`}><Music /></span>}
      {slide.auto && !slide.locked && <span className="autob" title="נוצרה אוטומטית"><Sparkles /></span>}
      {/* hover actions; pointerdown propagates so the card can still be dragged from here (the sensor needs 6 px of movement, so a plain click never starts a drag) */}
      {!overlay && onDelete && <span className="acts" onClick={e => e.stopPropagation()} onDoubleClick={e => e.stopPropagation()}>
        <button title="שכפל (Ctrl+D)" aria-label="שכפל" onClick={onDuplicate}><Copy /></button>
        <button title="מחק (Delete)" aria-label="מחק" className="del" onClick={onDelete}><Trash2 /></button>
      </span>}
    </div>
  );
}

function SortableSlide(props: { slide: Slide; chapter: Chapter; index: number; selected: boolean; warn: boolean; onClick: (e: React.MouseEvent) => void; onDouble: () => void; onContextMenu: (e: React.MouseEvent) => void; onDelete: () => void; onDuplicate: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.slide.id, data: { type: 'slide', chapterId: props.chapter.id } });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, flex: '0 0 auto' }} {...attributes} {...listeners} className={isDragging ? 'dragging' : ''}><SlideCard {...props} /></div>;
}

/** Right-click menu for a slide card (or several selected cards). Fixed position so the scrolling strip cannot clip it; clamped to the viewport. */
function SlideMenu({ at, ids, onClose }: { at: { x: number; y: number }; ids: string[]; onClose: () => void }) {
  const show = useShow(s => s.show)!; const dup = useShow(s => s.duplicateSlides); const removeSlides = useShow(s => s.removeSlides); const setLocked = useShow(s => s.setLocked);
  const slides = show.chapters.flatMap(c => c.slides).filter(s => ids.includes(s.id)); const allLocked = slides.length > 0 && slides.every(s => s.locked); const n = ids.length;
  useEffect(() => { const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true); }, [onClose]);
  const W = 220, H = 190; const left = Math.max(8, Math.min(window.innerWidth - W - 8, at.x - W + 8)); const top = Math.max(8, Math.min(window.innerHeight - H - 8, at.y));
  const act = (fn: () => void) => () => { fn(); onClose(); };
  return <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose(); }} /><div className="menu fixed slide-menu" role="menu" style={{ left, top, minWidth: W }}>
    <div className="menu-h">{n > 1 ? `${n} שקופיות נבחרות` : `${TYPE_LABEL[slides[0]?.type ?? 'photo']}${slides[0] && slideTitle(slides[0]) ? ' · ' + slideTitle(slides[0]) : ''}`}</div>
    <button onClick={act(() => window.open(`/show?from=${ids[0]}`, 'sy80-show'))}><Play /> נגן מכאן</button>
    <button onClick={act(() => dup(ids))}><Copy /> שכפל<span className="k">Ctrl+D</span></button>
    <button onClick={act(() => setLocked(ids, !allLocked))}>{allLocked ? <Unlock /> : <Lock />} {allLocked ? 'שחרר נעילה' : 'נעל'}</button>
    <hr />
    <button className="danger" onClick={act(() => { removeSlides(ids); toast(`${n > 1 ? `${n} שקופיות נמחקו` : 'השקופית נמחקה'} · Ctrl+Z לביטול`); })}><Trash2 /> מחק{n > 1 ? ` ${n}` : ''}<span className="k">Delete</span></button>
  </div></>;
}

const TYPES: { t: Slide['type']; icon: React.ReactNode; label: string }[] = [
  { t: 'chapter', icon: <BookOpen />, label: 'כותרת פרק' }, { t: 'quote', icon: <Quote />, label: 'ציטוט' }, { t: 'timeline', icon: <Clock />, label: 'ציר זמן' }, { t: 'names', icon: <Users />, label: 'שמות' },
  { t: 'intro', icon: <Type />, label: 'פתיחה' }, { t: 'finale', icon: <Sparkles />, label: 'סיום' }, { t: 'video-wall', icon: <Film />, label: 'קיר ברכות' }, { t: 'black', icon: <Square />, label: 'מסך שחור' },
];

function ChapterRow({ c, warnIds }: { c: Chapter; warnIds: Set<string> }) {
  const show = useShow(s => s.show)!; const sel = useShow(s => s.selection); const select = useShow(s => s.select); const addSlides = useShow(s => s.addSlides);
  const assets = useLibrary(s => s.assets); const [menu, setMenu] = useState<null | { right: number; bottom: number }>(null);
  // the menu is position:fixed so the storyboard's horizontal scroll area cannot clip it; Esc closes it
  useEffect(() => { if (!menu) return; const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); setMenu(null); } }; window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true); }, [menu]);
  const openMenu = (e: React.MouseEvent) => { if (menu) { setMenu(null); return; } const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); setMenu({ right: Math.min(window.innerWidth - 228, Math.max(8, window.innerWidth - r.left + 6)), bottom: Math.max(8, window.innerHeight - r.bottom) }); };
  const { setNodeRef, isOver } = useDroppable({ id: 'chapter:' + c.id, data: { type: 'chapter', chapterId: c.id } });
  const dur = c.slides.reduce((t, s) => t + slideSeconds(s, c, show.settings, assets), 0); const m = c.musicId ? assets[c.musicId] : undefined; const avail = m?.duration ? m.duration - (c.musicStartSec ?? 0) : 0; const short = !!m && avail < dur;
  const chSel = sel.chapterId === c.id && sel.slideIds.length === 0;
  const dup = useShow(s => s.duplicateSlides); const removeSlides = useShow(s => s.removeSlides); const [ctx, setCtx] = useState<null | { x: number; y: number; ids: string[] }>(null);
  const onSlideClick = (s: Slide, e: React.MouseEvent) => { if (e.shiftKey) select(c.id, [s.id], { range: true }); else if (e.ctrlKey || e.metaKey) select(c.id, [s.id], { toggle: true }); else select(c.id, [s.id]); };
  const playFrom = (s: Slide) => window.open(`/show?from=${s.id}`, 'sy80-show');
  // right-click: act on the whole selection when the card is part of it, else on that card alone
  const onSlideMenu = (s: Slide, e: React.MouseEvent) => { e.preventDefault(); const ids = sel.slideIds.includes(s.id) ? sel.slideIds : [s.id]; if (!sel.slideIds.includes(s.id)) select(c.id, [s.id]); setCtx({ x: e.clientX, y: e.clientY, ids }); };
  const delOne = (s: Slide) => { removeSlides([s.id]); toast('השקופית נמחקה · Ctrl+Z לביטול'); };
  const addType = (t: Slide['type']) => { const s = blankSlide(t); if (t === 'video-wall') { const vids = Object.values(assets).filter(a => a.type === 'video').slice(0, 9).map(a => a.id); if (vids.length < 2) { setMenu(null); toast('קיר ברכות צריך לפחות שני סרטוני ברכה בספרייה', 'warn'); return; } (s as any).assetIds = vids; } addSlides(c.id, [s]); setMenu(null); };
  // media slides are built from the library selection; the menu shows them with the reason when the selection does not fit
  const libSel = useUi(s => s.libSel); const clearLibSel = useUi(s => s.clearLibSel); const photoSel = libSel.filter(id => assets[id]?.type === 'photo'); const mediaSel = libSel.filter(id => assets[id] && assets[id].type !== 'music');
  const libEmpty = !Object.values(assets).some(a => a.type !== 'music');
  const addFromLib = (kind: 'photo' | 'pair' | 'collage') => {
    const sorted = (ids: string[]) => ids.map(id => assets[id]).filter(Boolean).sort((a, b) => (a.year ?? 0) - (b.year ?? 0));
    if (kind === 'photo') addSlides(c.id, sorted(mediaSel).map(a => newSlideFor(a, show.settings)));
    else if (kind === 'pair') addSlides(c.id, [{ id: uid(), type: 'photo-pair', assetIds: [photoSel[0], photoSel[1]], caption: '', seconds: 7 }]);
    else addSlides(c.id, [{ id: uid(), type: 'collage', assetIds: sorted(photoSel).map(a => a.id), caption: '', seconds: 9 }]);
    clearLibSel(); setMenu(null); toast(kind === 'photo' ? `${mediaSel.length} שקופיות נוספו` : kind === 'pair' ? 'נוצר זוג תמונות' : 'נוצר קולאז׳', 'ok');
  };
  const why = { photo: libEmpty ? 'הספרייה ריקה: סרקו את media/ קודם' : mediaSel.length ? '' : 'בחרו תמונות או סרטונים בספרייה', pair: libEmpty ? 'הספרייה ריקה: סרקו את media/ קודם' : photoSel.length === 2 ? '' : `בחרו בדיוק 2 תמונות בספרייה (נבחרו ${photoSel.length})`, collage: libEmpty ? 'הספרייה ריקה: סרקו את media/ קודם' : photoSel.length >= 2 && photoSel.length <= 6 ? '' : `בחרו 2 עד 6 תמונות בספרייה (נבחרו ${photoSel.length})` };
  return (
    <div className="chapter-row">
      <div className={`ch-head ${chSel ? 'sel' : ''}`} data-tour="chapter" onClick={() => select(c.id, [])} role="button" tabIndex={0}>
        <div className="t">{c.title}</div>
        {c.locked && <span className="lock" title="פרק נעול"><Lock /></span>}
        <div className="m"><span>{c.slides.length} שק׳</span><span>{fmtTime(dur)}</span>{c.subtitle && <span className="muted">{c.subtitle}</span>}</div>
        {m ? <><div className="music"><Music /><span>{m.name.replace(/\.[^.]+$/, '')}</span></div><div className={`musicbar ${short ? 'short' : ''}`} title={short ? `המוזיקה (${fmtTime(avail)}) קצרה מהפרק (${fmtTime(dur)}) — חזרה עם crossfade` : `מוזיקה ${fmtTime(avail)} · פרק ${fmtTime(dur)}`}><i style={{ width: `${Math.max(2, Math.min(100, avail / Math.max(1, dur) * 100))}%` }} /></div></> : <div className="music muted"><Music style={{ color: 'var(--muted)' }} /><span>{c.musicOff ? 'שקט — המוזיקה נעצרת' : 'ממשיכה מהפרק הקודם'}</span></div>}
      </div>
      <div ref={setNodeRef} className={`slides ${isOver ? 'over' : ''}`}>
        <SortableContext items={c.slides.map(s => s.id)} strategy={horizontalListSortingStrategy}>
          {c.slides.map((s, i) => <SortableSlide key={s.id} slide={s} chapter={c} index={i} selected={sel.slideIds.includes(s.id)} warn={warnIds.has(s.id)} onClick={(e) => onSlideClick(s, e)} onDouble={() => playFrom(s)} onContextMenu={(e) => onSlideMenu(s, e)} onDelete={() => delOne(s)} onDuplicate={() => dup([s.id])} />)}
        </SortableContext>
        {ctx && <SlideMenu at={ctx} ids={ctx.ids} onClose={() => setCtx(null)} />}
        {c.slides.length === 0 && <div className="slides-empty">גררו תמונות לכאן מהספרייה, או לחצו + להוספת שקופית טקסט</div>}
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <button className="addslide" data-tour="add-slide" title="הוסף שקופית טקסט" aria-expanded={!!menu} onClick={openMenu}><Plus /></button>
          {menu && <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setMenu(null)} /><div className="menu fixed" style={{ right: menu.right, bottom: menu.bottom }}>
            <div className="menu-h">מהבחירה בספרייה{libSel.length ? ` (${libSel.length} נבחרו)` : ''}</div>
            <button disabled={!!why.photo} title={why.photo || 'שקופית לכל קובץ שנבחר, לפי שנה'} onClick={() => addFromLib('photo')}><ImageIcon />תמונה / ברכה{mediaSel.length > 1 ? ` (${mediaSel.length})` : ''}{why.photo && <span className="k">{why.photo}</span>}</button>
            <button disabled={!!why.pair} title={why.pair || 'שתי תמונות זו לצד זו'} onClick={() => addFromLib('pair')}><Columns2 />זוג תמונות{why.pair && <span className="k">{why.pair}</span>}</button>
            <button disabled={!!why.collage} title={why.collage || 'קולאז׳ מהתמונות שנבחרו'} onClick={() => addFromLib('collage')}><LayoutGrid />קולאז׳{photoSel.length >= 2 ? ` (${photoSel.length})` : ''}{why.collage && <span className="k">{why.collage}</span>}</button>
            <hr /><div className="menu-h">שקופיות טקסט</div>{TYPES.map(x => <button key={x.t} onClick={() => addType(x.t)}>{x.icon}{x.label}</button>)}</div></>}
        </div>
      </div>
    </div>
  );
}

export function Storyboard() {
  const show = useShow(s => s.show)!; const assets = useLibrary(s => s.assets); const list = useLibrary(s => s.list); const setStoryH = useUi(s => s.setStoryH); const openDialog = useUi(s => s.openDialog); const storyH = useUi(s => s.storyH); const zoom = useUi(s => s.storyZoom); const setZoom = useUi(s => s.setStoryZoom);
  const t = showTotals(show, assets); const drag = useRef<{ y: number; h: number } | null>(null);
  const warnIds = useMemo(() => { const s = new Set<string>(); for (const c of show.chapters) for (const sl of c.slides) { const ids = (sl as any).assetId ? [(sl as any).assetId] : (sl as any).assetIds ?? []; if (ids.some((id: string) => !assets[id] || assets[id].status !== 'ready')) s.add(sl.id); } return s; }, [show, assets]);
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h: storyH }; const move = (ev: PointerEvent) => { if (drag.current) setStoryH(drag.current.h + (drag.current.y - ev.clientY)); }; const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  return (
    <section className="panel story-panel" data-tour="storyboard">
      <div className="resizer" onPointerDown={onDown} title="גרור לשינוי גובה" />
      <div className="story" style={{ ['--card-w' as any]: `${zoom}px`, ['--card-h' as any]: `${Math.round(zoom * 0.625)}px` }}>{show.chapters.map(c => <ChapterRow key={c.id} c={c} warnIds={warnIds} />)}
        {t.slides <= 1 && <div className="story-hint"><Sparkles /><div><b>המצגת עוד ריקה.</b> הדרך המהירה: „צור אוטומטית” בונה טיוטה שלמה מהספרייה. או גררו תמונות מהספרייה אל שורת הפרק, והוסיפו שקופיות טקסט עם ה־+.</div><button className="btn sm soft" onClick={() => openDialog('auto')}><Sparkles /> צור אוטומטית</button><button className="btn sm ghost" onClick={() => openGuide('structure')}><BookOpen /> איך בונים</button></div>}</div>
      <div className="story-foot">
        <span>גרירה מסדרת ומעבירה בין פרקים · <kbd>Shift</kbd>/<kbd>Ctrl</kbd> בחירה מרובה · <kbd>Del</kbd> מחיקה · <kbd>Ctrl</kbd>+<kbd>D</kbd> שכפול · לחיצה כפולה = <Play style={{ width: 11, height: 11, verticalAlign: -1 }} /> נגן מכאן</span>
        <span className="grow" />
        <span className="zoom" title="גודל הכרטיסים"><ZoomIn /><input type="range" min={96} max={220} step={4} value={zoom} onChange={e => setZoom(+e.target.value)} aria-label="גודל כרטיסים" /></span>
        <span className="num">{t.chapters} פרקים · {t.slides} שקופיות · {t.videos} ברכות · {fmtTime(t.seconds)} · {list.length} קבצים בספרייה</span>
      </div>
    </section>
  );
}

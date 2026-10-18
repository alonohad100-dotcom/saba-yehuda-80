import { useMemo, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Music, AlertTriangle, Type, BookOpen, Quote, Clock, Users, Sparkles, Square, Film, Play, Lock } from 'lucide-react';
import { useShow, blankSlide, showTotals } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { type Slide, type Chapter, slideSeconds, slideAdvance, slideThumbAsset, slideTitle, assetThumb, fmtTime, TYPE_LABEL } from '@shared/model';

export function SlideCard({ slide, chapter, index, overlay, selected, warn, onClick, onDouble }: { slide: Slide; chapter: Chapter; index: number; overlay?: boolean; selected?: boolean; warn?: boolean; onClick?: (e: React.MouseEvent) => void; onDouble?: () => void }) {
  const show = useShow(s => s.show)!; const assets = useLibrary(s => s.assets);
  const thumbId = slideThumbAsset(slide); const a = thumbId ? assets[thumbId] : undefined; const secs = slideSeconds(slide, chapter, show.settings, assets); const manual = slideAdvance(slide) === 'manual';
  const title = slideTitle(slide);
  return (
    <div className={`slide ${selected ? 'sel' : ''} ${!a ? 'text' : ''}`} data-id={slide.id} data-type={slide.type} onClick={onClick} onDoubleClick={onDouble} title={`${TYPE_LABEL[slide.type]}${title ? ' · ' + title : ''}`}>
      {a ? <img src={assetThumb(a)} alt="" draggable={false} /> : <span className="tx">{title || TYPE_LABEL[slide.type]}</span>}
      <span className="ty">{TYPE_LABEL[slide.type]}</span>
      {!overlay && <span className="idx num">{index + 1}</span>}
      <span className={`du num ${manual ? 'manual' : ''}`}>{manual && slide.type !== 'video' ? 'לחיצה' : fmtTime(secs)}</span>
      {a && title && <span className="cap">{title}</span>}
      {warn && <span className="warnmark"><AlertTriangle /></span>}
      {slide.locked && <span className="lock" title="נעול"><Lock /></span>}
      {slide.auto && !slide.locked && <span className="autob" title="נוצרה אוטומטית"><Sparkles /></span>}
    </div>
  );
}

function SortableSlide(props: { slide: Slide; chapter: Chapter; index: number; selected: boolean; warn: boolean; onClick: (e: React.MouseEvent) => void; onDouble: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.slide.id, data: { type: 'slide', chapterId: props.chapter.id } });
  return <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, flex: '0 0 auto' }} {...attributes} {...listeners} className={isDragging ? 'dragging' : ''}><SlideCard {...props} /></div>;
}

const TYPES: { t: Slide['type']; icon: React.ReactNode; label: string }[] = [
  { t: 'chapter', icon: <BookOpen />, label: 'כותרת פרק' }, { t: 'quote', icon: <Quote />, label: 'ציטוט' }, { t: 'timeline', icon: <Clock />, label: 'ציר זמן' }, { t: 'names', icon: <Users />, label: 'שמות' },
  { t: 'intro', icon: <Type />, label: 'פתיחה' }, { t: 'finale', icon: <Sparkles />, label: 'סיום' }, { t: 'video-wall', icon: <Film />, label: 'קיר ברכות' }, { t: 'black', icon: <Square />, label: 'מסך שחור' },
];

function ChapterRow({ c, warnIds }: { c: Chapter; warnIds: Set<string> }) {
  const show = useShow(s => s.show)!; const sel = useShow(s => s.selection); const select = useShow(s => s.select); const addSlides = useShow(s => s.addSlides);
  const assets = useLibrary(s => s.assets); const [menu, setMenu] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: 'chapter:' + c.id, data: { type: 'chapter', chapterId: c.id } });
  const dur = c.slides.reduce((t, s) => t + slideSeconds(s, c, show.settings, assets), 0); const m = c.musicId ? assets[c.musicId] : undefined; const avail = m?.duration ? m.duration - (c.musicStartSec ?? 0) : 0; const short = !!m && avail < dur;
  const chSel = sel.chapterId === c.id && sel.slideIds.length === 0;
  const onSlideClick = (s: Slide, e: React.MouseEvent) => { if (e.shiftKey) select(c.id, [s.id], { range: true }); else if (e.ctrlKey || e.metaKey) select(c.id, [s.id], { toggle: true }); else select(c.id, [s.id]); };
  const playFrom = (s: Slide) => window.open(`/show?from=${s.id}`, 'sy80-show');
  const addType = (t: Slide['type']) => { const s = blankSlide(t); if (t === 'video-wall') { const vids = Object.values(assets).filter(a => a.type === 'video').slice(0, 9).map(a => a.id); if (vids.length < 2) return; (s as any).assetIds = vids; } addSlides(c.id, [s]); setMenu(false); };
  return (
    <div className="chapter-row">
      <div className={`ch-head ${chSel ? 'sel' : ''}`} onClick={() => select(c.id, [])} role="button" tabIndex={0}>
        <div className="t">{c.title}</div>
        {c.locked && <span className="lock" title="פרק נעול"><Lock /></span>}
        <div className="m"><span>{c.slides.length} שק׳</span><span>{fmtTime(dur)}</span>{c.subtitle && <span className="muted">{c.subtitle}</span>}</div>
        {m ? <><div className="music"><Music /><span>{m.name.replace(/\.[^.]+$/, '')}</span></div><div className={`musicbar ${short ? 'short' : ''}`} title={short ? `המוזיקה (${fmtTime(avail)}) קצרה מהפרק (${fmtTime(dur)}) — חזרה עם crossfade` : `מוזיקה ${fmtTime(avail)} · פרק ${fmtTime(dur)}`}><i style={{ width: `${Math.max(2, Math.min(100, avail / Math.max(1, dur) * 100))}%` }} /></div></> : <div className="music muted"><Music style={{ color: 'var(--muted)' }} /><span>ללא מוזיקה</span></div>}
      </div>
      <div ref={setNodeRef} className={`slides ${isOver ? 'over' : ''}`}>
        <SortableContext items={c.slides.map(s => s.id)} strategy={horizontalListSortingStrategy}>
          {c.slides.map((s, i) => <SortableSlide key={s.id} slide={s} chapter={c} index={i} selected={sel.slideIds.includes(s.id)} warn={warnIds.has(s.id)} onClick={(e) => onSlideClick(s, e)} onDouble={() => playFrom(s)} />)}
        </SortableContext>
        <div style={{ position: 'relative', flex: '0 0 auto' }}>
          <button className="addslide" title="הוסף שקופית טקסט" onClick={() => setMenu(v => !v)}><Plus /></button>
          {menu && <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setMenu(false)} /><div className="menu" style={{ bottom: 0, insetInlineStart: 50 }}>{TYPES.map(x => <button key={x.t} onClick={() => addType(x.t)}>{x.icon}{x.label}</button>)}</div></>}
        </div>
      </div>
    </div>
  );
}

export function Storyboard() {
  const show = useShow(s => s.show)!; const assets = useLibrary(s => s.assets); const list = useLibrary(s => s.list); const setStoryH = useUi(s => s.setStoryH); const storyH = useUi(s => s.storyH);
  const t = showTotals(show, assets); const drag = useRef<{ y: number; h: number } | null>(null);
  const warnIds = useMemo(() => { const s = new Set<string>(); for (const c of show.chapters) for (const sl of c.slides) { const ids = (sl as any).assetId ? [(sl as any).assetId] : (sl as any).assetIds ?? []; if (ids.some((id: string) => !assets[id] || assets[id].status !== 'ready')) s.add(sl.id); } return s; }, [show, assets]);
  const onDown = (e: React.PointerEvent) => { drag.current = { y: e.clientY, h: storyH }; const move = (ev: PointerEvent) => { if (drag.current) setStoryH(drag.current.h + (drag.current.y - ev.clientY)); }; const up = () => { drag.current = null; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); };
  return (
    <section className="panel story-panel">
      <div className="resizer" onPointerDown={onDown} title="גרור לשינוי גובה" />
      <div className="story">{show.chapters.map(c => <ChapterRow key={c.id} c={c} warnIds={warnIds} />)}</div>
      <div className="story-foot">
        <span>גרור שקופיות בין פרקים · <kbd>Shift</kbd>/<kbd>Ctrl</kbd> בחירה מרובה · <kbd>Del</kbd> מחיקה · <kbd>Ctrl</kbd>+<kbd>D</kbd> שכפול · לחיצה כפולה = <Play style={{ width: 11, height: 11, verticalAlign: -1 }} /> נגן מכאן</span>
        <span className="grow" />
        <span className="num">{t.chapters} פרקים · {t.slides} שקופיות · {t.videos} ברכות · {fmtTime(t.seconds)} · {list.length} קבצים בספרייה</span>
      </div>
    </section>
  );
}

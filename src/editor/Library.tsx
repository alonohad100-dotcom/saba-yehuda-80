import { useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useDraggable } from '@dnd-kit/core';
import { Search, Play, Music, Plus, LayoutGrid, RefreshCw, CalendarClock } from 'lucide-react';
import { useLibrary } from '@/store/library';
import { useShow, newSlideFor } from '@/store/show';
import { useUi } from './ui';
import { usedAssetIds } from '@/show/engine';
import { assetThumb, fmtTime, uid, type Asset } from '@shared/model';
import { toast } from '@/store/toast';
import { api } from '@/api';

export function AssetCard({ a, selected, count, overlay, dupCount, onClick, onDouble }: { a: Asset; selected: boolean; count?: number; overlay?: boolean; dupCount?: number; onClick?: (e: React.MouseEvent) => void; onDouble?: () => void }) {
  const thumb = assetThumb(a); const lowQ = a.type === 'photo' && a.quality != null && a.quality < 0.3;
  return (
    <div className={`asset ${selected ? 'sel' : ''}`} onClick={onClick} onDoubleClick={onDouble} title={`${a.name}\n${a.folder} · ${a.year ?? '—'}${a.duration ? ` · ${fmtTime(a.duration)}` : ''}${a.width ? ` · ${a.width}×${a.height}` : ''}${a.quality != null ? `\nאיכות ${Math.round(a.quality * 100)}%${(a.faceCount ?? 0) > 0 ? ` · ${a.faceCount} פנים` : ''}` : ''}${dupCount ? `\n${dupCount} עותקים נוספים מוסתרים` : ''}`}>
      {a.type === 'music' ? <div className="music"><Music /></div> : <img src={thumb} alt="" loading="lazy" draggable={false} />}
      {dupCount ? <span className="dupn" title={`${dupCount} כפילויות`}>×{dupCount + 1}</span> : lowQ ? <span className="blur">איכות נמוכה</span> : null}
      {a.status === 'error' && <div className="err">שגיאה בעיבוד</div>}
      {a.type === 'video' && <><span className="play"><Play /></span><span className="badge dur num">{fmtTime(a.duration ?? 0)}</span><span className="badge nm">{a.name.replace(/\.[^.]+$/, '')}</span></>}
      {a.type === 'photo' && a.year && <span className={`badge yr ${a.yearSource}`}>{a.year}</span>}
      {a.type === 'music' && <span className="badge nm">{a.name.replace(/\.[^.]+$/, '')}</span>}
      {!!count && <span className="use">{count}</span>}
      {overlay && count && count > 1 ? <span className="use" style={{ top: 'auto', bottom: 5 }}>×{count}</span> : null}
    </div>
  );
}

function DraggableAsset(props: { a: Asset; selected: boolean; count?: number; dupCount?: number; onClick: (e: React.MouseEvent) => void; onDouble: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: 'asset:' + props.a.id, data: { type: 'asset', assetId: props.a.id } });
  return <div ref={setNodeRef} {...listeners} {...attributes} style={{ opacity: isDragging ? .4 : 1 }}><AssetCard {...props} /></div>;
}

type Filter = 'all' | 'photo' | 'video' | 'music' | 'unused';
export function Library() {
  const { list, assets, loaded, error } = useLibrary(); const show = useShow(s => s.show)!; const sel = useShow(s => s.selection); const addSlides = useShow(s => s.addSlides);
  const libSel = useUi(s => s.libSel); const setLibSel = useUi(s => s.setLibSel); const toggleLibSel = useUi(s => s.toggleLibSel); const openDialog = useUi(s => s.openDialog);
  const [filter, setFilter] = useState<Filter>('all'); const [decade, setDecade] = useState(''); const [folder, setFolder] = useState(''); const [q, setQ] = useState(''); const [yearEdit, setYearEdit] = useState<string>(''); const [sortQ, setSortQ] = useState(false);
  const hideDups = useUi(s => s.hideDups); const toggleHideDups = useUi(s => s.toggleHideDups);
  const used = useMemo(() => usedAssetIds(show), [show]);
  const dupCounts = useMemo(() => { const m: Record<string, number> = {}; for (const a of list) if (a.type === 'photo' && a.dupGroup && a.dupGroup !== a.id) m[a.dupGroup] = (m[a.dupGroup] ?? 0) + 1; return m; }, [list]);
  const useCount = useMemo(() => { const m: Record<string, number> = {}; for (const c of show.chapters) for (const s of c.slides) { for (const id of (s as any).assetIds ?? []) m[id] = (m[id] ?? 0) + 1; if ((s as any).assetId) m[(s as any).assetId] = (m[(s as any).assetId] ?? 0) + 1; if ((s as any).heroAssetId) m[(s as any).heroAssetId] = (m[(s as any).heroAssetId] ?? 0) + 1; } return m; }, [show]);
  const folders = useMemo(() => Array.from(new Set(list.map(a => a.folder))).sort(), [list]);
  const filtered = useMemo(() => list.filter(a => {
    if (filter === 'photo' && a.type !== 'photo') return false; if (filter === 'video' && a.type !== 'video') return false; if (filter === 'music' && a.type !== 'music') return false;
    if (filter === 'unused' && (used.has(a.id) || a.type === 'music')) return false;
    if (decade && (!a.year || a.year < +decade || a.year >= +decade + 10)) return false;
    if (folder && a.folder !== folder) return false;
    if (q && !`${a.name} ${a.folder} ${a.year ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (hideDups && a.type === 'photo' && a.dupGroup && a.dupGroup !== a.id && !used.has(a.id)) return false; // hidden behind the kept copy
    return true;
  }).sort(sortQ ? (x, y) => (y.quality ?? 0) - (x.quality ?? 0) : () => 0), [list, filter, decade, folder, q, used, hideDups, sortQ]);

  // virtualized grid
  const scrollRef = useRef<HTMLDivElement>(null); const [cols, setCols] = useState(3); const cell = useRef(96);
  useEffect(() => { const el = scrollRef.current; if (!el) return; const ro = new ResizeObserver(() => { const w = el.clientWidth - 20; const c = Math.max(2, Math.floor(w / 92)); setCols(c); cell.current = Math.floor((w - (c - 1) * 6) / c); }); ro.observe(el); return () => ro.disconnect(); }, []);
  const rows = Math.ceil(filtered.length / cols);
  const v = useVirtualizer({ count: rows, getScrollElement: () => scrollRef.current, estimateSize: () => cell.current + 6, overscan: 4 });
  useEffect(() => { v.measure(); }, [cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const lastClick = useRef<string | null>(null);
  const onClick = (a: Asset, e: React.MouseEvent) => {
    if (e.shiftKey && lastClick.current) { const i = filtered.findIndex(x => x.id === lastClick.current), j = filtered.findIndex(x => x.id === a.id); if (i >= 0 && j >= 0) { const [lo, hi] = i < j ? [i, j] : [j, i]; setLibSel(Array.from(new Set([...libSel, ...filtered.slice(lo, hi + 1).map(x => x.id)]))); return; } }
    if (e.ctrlKey || e.metaKey) toggleLibSel(a.id); else setLibSel(libSel.length === 1 && libSel[0] === a.id ? [] : [a.id]);
    lastClick.current = a.id;
  };
  const addSelected = (ids = libSel) => { const chId = sel.chapterId ?? show.chapters[0].id; const items = ids.map(id => assets[id]).filter(a => a && a.type !== 'music').sort((a, b) => (a.year ?? 0) - (b.year ?? 0)); if (!items.length) return toast('בחר תמונות או סרטונים', 'warn'); const slides = items.map(a => newSlideFor(a, show.settings)); const idx = sel.slideIds.length ? (show.chapters.find(c => c.id === chId)?.slides.findIndex(s => s.id === sel.slideIds[sel.slideIds.length - 1]) ?? -1) + 1 : undefined; addSlides(chId, slides, idx); setLibSel([]); toast(`${slides.length} שקופיות נוספו`, 'ok'); };
  const addCollage = () => { const ids = libSel.filter(id => assets[id]?.type === 'photo'); if (ids.length < 2 || ids.length > 6) return toast('קולאז׳: בחר 2 עד 6 תמונות', 'warn'); const chId = sel.chapterId ?? show.chapters[0].id; addSlides(chId, [{ id: uid(), type: 'collage', assetIds: ids, caption: '', seconds: 9 }]); setLibSel([]); toast('נוצר קולאז׳', 'ok'); };
  const addPair = () => { const ids = libSel.filter(id => assets[id]?.type === 'photo'); if (ids.length !== 2) return toast('זוג: בחר בדיוק 2 תמונות', 'warn'); const chId = sel.chapterId ?? show.chapters[0].id; addSlides(chId, [{ id: uid(), type: 'photo-pair', assetIds: [ids[0], ids[1]], caption: '', seconds: 7 }]); setLibSel([]); };
  const setYear = async () => { const y = parseInt(yearEdit, 10); if (!y || y < 1900 || y > 2100) return; for (const id of libSel) { const a = await api.patchAsset(id, { year: y }); useLibrary.getState().setAsset(a); } setYearEdit(''); toast(`השנה עודכנה ל־${y} עבור ${libSel.length} קבצים`, 'ok'); };
  const photoSel = libSel.filter(id => assets[id]?.type === 'photo').length;

  return (
    <aside className="panel lib">
      <div className="panel-h">ספריית מדיה <span className="count num">{filtered.length} / {list.length}</span><button className="btn ghost sm icon tip" data-tip="קליטה מחדש" onClick={() => openDialog('ingest')}><RefreshCw /></button></div>
      <div className="lib-tools">
        <div className="row wrap" style={{ gap: 5 }}>
          {([['all', 'הכל'], ['photo', 'תמונות'], ['video', 'ברכות'], ['music', 'מוזיקה'], ['unused', 'לא בשימוש']] as [Filter, string][]).map(([f, l]) => <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{l}</button>)}
        </div>
        <div className="row">
          <select value={decade} onChange={e => setDecade(e.target.value)} className="grow" aria-label="עשור"><option value="">כל השנים</option>{[1940, 1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020].map(d => <option key={d} value={d}>{d}–{d + 9}</option>)}</select>
          <select value={folder} onChange={e => setFolder(e.target.value)} className="grow" aria-label="תיקייה"><option value="">כל התיקיות</option>{folders.map(f => <option key={f} value={f}>{f}</option>)}</select>
        </div>
        <div className="search"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש לפי שם, תיקייה או שנה…" aria-label="חיפוש" /></div>
        <div className="row wrap" style={{ gap: 5 }}><button className="chip" aria-pressed={hideDups} onClick={toggleHideDups} title="כפילויות וצילומי רצף מוסתרים מאחורי העותק הטוב ביותר">{hideDups ? 'כפילויות מוסתרות' : 'מציג כפילויות'}{Object.keys(dupCounts).length ? ` (${Object.values(dupCounts).reduce((a, b) => a + b, 0)})` : ''}</button><button className="chip" aria-pressed={sortQ} onClick={() => setSortQ(v => !v)}>מיון לפי איכות</button></div>
      </div>
      <div className="lib-grid-wrap" ref={scrollRef}>
        {!loaded ? <div className="lib-empty">טוען ספרייה…</div> : error ? <div className="lib-empty">שגיאה: {error}</div> : list.length === 0 ? <div className="lib-empty">הספרייה ריקה.<br />הנח תמונות ב־<b>media/photos</b>, סרטוני ברכה ב־<b>media/videos/greetings</b> ומוזיקה ב־<b>media/music</b>, ואז לחץ „ספרייה” למעלה.</div> : filtered.length === 0 ? <div className="lib-empty">אין תוצאות לסינון הנוכחי</div> : (
          <div style={{ height: v.getTotalSize(), position: 'relative' }}>
            {v.getVirtualItems().map(row => (
              <div key={row.key} style={{ position: 'absolute', top: 0, insetInlineStart: 0, width: '100%', transform: `translateY(${row.start}px)`, display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 6 }}>
                {filtered.slice(row.index * cols, row.index * cols + cols).map(a => <DraggableAsset key={a.id} a={a} selected={libSel.includes(a.id)} count={useCount[a.id]} dupCount={hideDups ? dupCounts[a.id] : undefined} onClick={(e) => onClick(a, e)} onDouble={() => a.type !== 'music' && addSelected([a.id])} />)}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="lib-foot">
        <button className="btn sm primary" disabled={!libSel.length} onClick={() => addSelected()}><Plus /> הוסף לפרק {libSel.length > 1 ? `(${libSel.length})` : ''}</button>
        <button className="btn sm" disabled={photoSel < 2 || photoSel > 6} onClick={addCollage}><LayoutGrid /> קולאז׳</button>
        <button className="btn sm" disabled={photoSel !== 2} onClick={addPair}>זוג</button>
        {libSel.length > 0 && <span className="row" style={{ gap: 4 }}><CalendarClock style={{ width: 14, height: 14, color: 'var(--muted)' }} /><input type="number" value={yearEdit} onChange={e => setYearEdit(e.target.value)} placeholder="שנה" style={{ width: 70, padding: '3px 6px' }} onKeyDown={e => e.key === 'Enter' && setYear()} title="קבע שנה לקבצים הנבחרים" /></span>}
        <span className="muted lib-hint">{libSel.length ? `${libSel.length} נבחרו · Enter מוסיף · אפשר לגרור לסטוריבורד` : 'Ctrl / Shift לבחירה מרובה · לחיצה כפולה מוסיפה לפרק'}</span>
      </div>
    </aside>
  );
}

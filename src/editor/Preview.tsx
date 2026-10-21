import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { RotateCcw, Crosshair, Play, Grid3X3, Type, Smile, Shapes, ImagePlus, Lock, Film, Pause } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { SlideView } from '@/show/SlideView';
import { toast } from '@/store/toast';
import { slideSeconds, slideTransition, fmtTime, TYPE_LABEL, TRANSITION_LABEL, uid, type Overlay, type Slide, DEFAULT_CAPTION, TEXT_BLOCKS } from '@shared/model';
import { SYMBOLS, SYMBOL_GROUPS, EMOJI, symbolSvg } from '@shared/symbols';
import { resolveTheme, themeById } from '@shared/themes';

type OvPatch = Partial<Overlay>;
const TEXT_PRESETS: { label: string; make: (s: Slide) => Overlay }[] = [
  { label: 'כותרת גדולה', make: () => ({ id: uid('o'), kind: 'text', text: 'כותרת', font: 'display', size: 7, color: 'auto', weight: 500, align: 'center', bg: 'none', shadow: true, accent: false, x: 10, y: 36, w: 80, rotate: 0, opacity: 1, z: 1, anim: { in: 'rise', delay: .8, duration: .9, loop: 'none', out: 'none' } }) },
  { label: 'כיתוב קטן', make: () => ({ id: uid('o'), kind: 'text', text: 'כיתוב', font: 'ui', size: 2.4, color: 'auto', weight: 400, align: 'center', bg: 'pill', shadow: false, accent: false, x: 30, y: 82, w: 40, rotate: 0, opacity: 1, z: 1, anim: { in: 'fade', delay: 1, duration: .8, loop: 'none', out: 'none' } }) },
  { label: 'שנה', make: (s) => ({ id: uid('o'), kind: 'text', text: String((s as any).year ?? 1946), font: 'num', size: 9, color: '#f1d38a', weight: 400, align: 'center', bg: 'none', shadow: true, accent: true, x: 68, y: 7, w: 26, rotate: 0, opacity: 1, z: 1, anim: { in: 'pop', delay: .6, duration: .9, loop: 'none', out: 'none' } }) },
  { label: 'תגית שם', make: () => ({ id: uid('o'), kind: 'text', text: 'שם', font: 'display', size: 3.4, color: 'auto', weight: 500, align: 'right', bg: 'bar', shadow: false, accent: false, x: 52, y: 72, w: 42, rotate: 0, opacity: 1, z: 1, anim: { in: 'slide-right', delay: 1, duration: .8, loop: 'none', out: 'none' } }) },
  { label: 'מזל טוב!', make: () => ({ id: uid('o'), kind: 'text', text: 'מזל טוב!', font: 'display', size: 11, color: '#f1d38a', weight: 700, align: 'center', bg: 'none', shadow: true, accent: true, x: 10, y: 30, w: 80, rotate: -4, opacity: 1, z: 1, anim: { in: 'pop', delay: .8, duration: 1, loop: 'pulse', out: 'none' } }) },
  { label: 'פסקה', make: () => ({ id: uid('o'), kind: 'text', text: 'כמה מילים על התמונה הזאת…', font: 'display', size: 3, color: 'auto', weight: 300, align: 'right', bg: 'box', shadow: false, accent: false, x: 52, y: 55, w: 42, rotate: 0, opacity: 1, z: 1, anim: { in: 'typewriter', delay: 1, duration: 2, loop: 'none', out: 'none' } }) },
];
const SHAPES: { label: string; make: () => Overlay }[] = [
  { label: 'מסגרת', make: () => ({ id: uid('o'), kind: 'shape', shape: 'frame', color: 'auto', h: 80, radius: 1, stroke: .35, x: 6, y: 10, w: 88, rotate: 0, opacity: .9, z: 1, anim: { in: 'fade', delay: .4, duration: 1, loop: 'none', out: 'none' } }) },
  { label: 'פס', make: () => ({ id: uid('o'), kind: 'shape', shape: 'line', color: 'auto', h: 1, radius: 0, stroke: .35, x: 30, y: 50, w: 40, rotate: 0, opacity: 1, z: 1, anim: { in: 'slide-right', delay: .8, duration: .8, loop: 'none', out: 'none' } }) },
  { label: 'מלבן כהה', make: () => ({ id: uid('o'), kind: 'shape', shape: 'rect', color: 'rgba(13,14,19,.72)', h: 24, radius: 2, stroke: 0, x: 50, y: 64, w: 44, rotate: 0, opacity: 1, z: 1, anim: { in: 'fade', delay: .6, duration: .8, loop: 'none', out: 'none' } }) },
  { label: 'עיגול', make: () => ({ id: uid('o'), kind: 'shape', shape: 'circle', color: 'auto', h: 18, radius: 50, stroke: 0, x: 44, y: 41, w: 10, rotate: 0, opacity: .85, z: 1, anim: { in: 'zoom', delay: .8, duration: .8, loop: 'pulse', out: 'none' } }) },
];

export function Preview() {
  const show = useShow(s => s.show)!; const sel = useShow(s => s.selection); const updateSlide = useShow(s => s.updateSlide);
  const addOverlay = useShow(s => s.addOverlay); const updateOverlay = useShow(s => s.updateOverlay);
  const assets = useLibrary(s => s.assets); const safe = useUi(s => s.safeGuides); const toggleSafe = useUi(s => s.toggleSafe); const selOverlay = useUi(s => s.selOverlay); const selectOverlay = useUi(s => s.selectOverlay); const libSel = useUi(s => s.libSel);
  const wrap = useRef<HTMLDivElement>(null); const stage = useRef<HTMLDivElement>(null); const [size, setSize] = useState({ w: 640, h: 360 }); const [replay, setReplay] = useState(0); const [animate, setAnimate] = useState(true); const [menu, setMenu] = useState<null | 'text' | 'symbol' | 'shape'>(null); const [symTab, setSymTab] = useState<string>(SYMBOL_GROUPS[0]);
  const [box, setBox] = useState<{ l: number; t: number; w: number; h: number } | null>(null); const [guides, setGuides] = useState<{ v?: number; h?: number }>({});
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => { const W = el.clientWidth - 36, H = el.clientHeight - 36; const w = Math.max(100, Math.min(W, H * 16 / 9)); setSize({ w, h: w * 9 / 16 }); }); ro.observe(el); return () => ro.disconnect(); }, []);
  const entry = useMemo(() => { const id = sel.slideIds[sel.slideIds.length - 1]; for (const c of show.chapters) { if (id) { const s = c.slides.find(x => x.id === id); if (s) return { s, c }; } } const c = show.chapters.find(x => x.id === sel.chapterId) ?? show.chapters[0]; return c?.slides[0] ? { s: c.slides[0], c, fallback: true } : null; }, [show, sel]);
  const ctx = { assets, settings: show.settings, chapter: entry?.c, showPhotoIds: show.chapters.flatMap(ch => ch.slides.flatMap(s => s.type === 'photo' ? [s.assetId] : s.type === 'collage' ? s.assetIds : [])) };
  const photo = entry?.s.type === 'photo' ? entry.s : null; const focal = photo ? (photo.focal ?? assets[photo.assetId]?.focal ?? [50, 50]) : null;
  const m = show.settings.safeMarginPct; const overlay = entry?.s.overlays?.find(o => o.id === selOverlay) ?? null;
  useEffect(() => { if (selOverlay && !overlay) selectOverlay(null); }, [selOverlay, overlay, selectOverlay]);
  const measure = () => { const st = stage.current; if (!st || !selOverlay) { setBox(null); return; } const el = st.querySelector<HTMLElement>(`.ov[data-oid="${selOverlay}"]`); if (!el) { setBox(null); return; } const r = el.getBoundingClientRect(), sr = st.getBoundingClientRect(); setBox({ l: r.left - sr.left, t: r.top - sr.top, w: r.width, h: r.height }); };
  useLayoutEffect(() => { const id = requestAnimationFrame(measure); return () => cancelAnimationFrame(id); }); // eslint-disable-line react-hooks/exhaustive-deps
  const liveAnimate = animate && !selOverlay;

  // ---- drag / resize / rotate ----
  const drag = useRef<{ mode: 'move' | 'resize' | 'rotate' | 'cap'; oid: string; sx: number; sy: number; ox: number; oy: number; ow: number; orot: number; cx: number; cy: number; hPct: number } | null>(null);
  const pct = (dx: number, dy: number) => [dx / size.w * 100, dy / size.h * 100] as const;
  const onPointerDown = (e: React.PointerEvent) => {
    if (!entry || entry.fallback) return; const t = e.target as HTMLElement; const ovEl = t.closest<HTMLElement>('.ov'); const handle = t.closest<HTMLElement>('.ov-handles .h'); const capEl = t.closest<HTMLElement>('.cap, [data-tx]');
    const st = stage.current!.getBoundingClientRect();
    if (handle && overlay) { const mode = handle.classList.contains('rot') ? 'rotate' : 'resize'; const bx = box!; drag.current = { mode, oid: overlay.id, sx: e.clientX, sy: e.clientY, ox: overlay.x, oy: overlay.y, ow: overlay.w, orot: overlay.rotate, cx: st.left + bx.l + bx.w / 2, cy: st.top + bx.t + bx.h / 2, hPct: bx.h / size.h * 100 }; }
    else if (ovEl) { const oid = ovEl.dataset.oid!; const o = entry.s.overlays!.find(x => x.id === oid)!; if (o.locked) { selectOverlay(oid); return; } selectOverlay(oid); const bx = ovEl.getBoundingClientRect(); drag.current = { mode: 'move', oid, sx: e.clientX, sy: e.clientY, ox: o.x, oy: o.y, ow: o.w, orot: o.rotate, cx: 0, cy: 0, hPct: bx.height / size.h * 100 }; }
    else if (capEl && (capEl.dataset.tx || 'caption' in entry.s)) { // drag the caption or any built-in text block: x/y in % of the stage (top-left of the box)
      const key = capEl.dataset.tx ?? ''; const cs = key ? entry.s.texts?.[key] : ('caption' in entry.s ? entry.s.captionStyle : undefined); const r = capEl.getBoundingClientRect(); if (selOverlay) selectOverlay(null);
      drag.current = { mode: 'cap', oid: key, sx: e.clientX, sy: e.clientY, ox: cs?.x ?? (r.left - st.left) / size.w * 100, oy: cs?.y ?? (r.top - st.top) / size.h * 100, ow: r.width / size.w * 100, orot: 0, cx: 0, cy: 0, hPct: r.height / size.h * 100 }; }
    else { if (selOverlay) selectOverlay(null); return; }
    e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); useShow.temporal.getState().pause();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current; if (!d || !entry) return; const [dx, dy] = pct(e.clientX - d.sx, e.clientY - d.sy); let patch: OvPatch = {}; const g: { v?: number; h?: number } = {};
    if (d.mode === 'cap') { if (!d.oid && !('caption' in entry.s)) return; let x = d.ox + dx, y = d.oy + dy; const cx = x + d.ow / 2, cy = y + d.hPct / 2; if (Math.abs(cx - 50) < 1.2) { x = 50 - d.ow / 2; g.v = 50; } if (Math.abs(cy - 50) < 1.2) { y = 50 - d.hPct / 2; g.h = 50; } if (Math.abs(x - m) < 1) { x = m; g.v = m; } if (Math.abs(y - m) < 1) { y = m; g.h = m; }
      x = Math.max(-20, Math.min(100, x)); y = Math.max(-20, Math.min(100, y)); // the schema's range
      setGuides(g); const rx = Math.round(x * 10) / 10, ry = Math.round(y * 10) / 10;
      if (d.oid) updateSlide(entry.s.id, { texts: { ...entry.s.texts, [d.oid]: { ...entry.s.texts?.[d.oid], x: rx, y: ry } } } as any);
      else updateSlide(entry.s.id, { captionStyle: { ...DEFAULT_CAPTION, ...('caption' in entry.s ? entry.s.captionStyle : undefined), x: rx, y: ry } } as any);
      return; }
    if (d.mode === 'move') { let x = d.ox + dx, y = d.oy + dy; const cx = x + d.ow / 2, cy = y + d.hPct / 2; if (Math.abs(cx - 50) < 1.2) { x = 50 - d.ow / 2; g.v = 50; } if (Math.abs(cy - 50) < 1.2) { y = 50 - d.hPct / 2; g.h = 50; } if (Math.abs(x - m) < 1) { x = m; g.v = m; } if (Math.abs(x + d.ow - (100 - m)) < 1) { x = 100 - m - d.ow; g.v = 100 - m; } if (Math.abs(y - m) < 1) { y = m; g.h = m; } patch = { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 }; }
    else if (d.mode === 'resize') patch = { w: Math.max(2, Math.min(100, Math.round((d.ow + dx) * 10) / 10)) };
    else { const ang = Math.atan2(e.clientY - d.cy, e.clientX - d.cx) * 180 / Math.PI + 90; let r = ((ang + 540) % 360) - 180; for (const snap of [-180, -90, 0, 90, 180]) if (Math.abs(r - snap) < 4) r = snap === -180 ? 180 : snap; patch = { rotate: Math.round(r) }; }
    setGuides(g); updateOverlay(entry.s.id, d.oid, patch);
  };
  const onPointerUp = (e: React.PointerEvent) => { const d = drag.current; if (!d || !entry) return; drag.current = null; setGuides({}); (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); useShow.temporal.getState().resume(); if (d.mode === 'cap') { if (d.oid) updateSlide(entry.s.id, { texts: { ...entry.s.texts } } as any); else if ('caption' in entry.s && entry.s.captionStyle) updateSlide(entry.s.id, { captionStyle: { ...entry.s.captionStyle } } as any); return; } const o = entry.s.overlays?.find(x => x.id === d.oid); if (o) updateOverlay(entry.s.id, d.oid, { x: o.x }); };

  const add = (o: Overlay) => { if (!entry) return; addOverlay(entry.s.id, o); selectOverlay(o.id); setMenu(null); setAnimate(true); };
  const addImage = () => { const id = libSel.find(i => assets[i]?.type === 'photo'); if (!id) return toast('בחר תמונה בספרייה ואז לחץ „+ תמונה”', 'warn'); add({ id: uid('o'), kind: 'image', assetId: id, h: 38, mask: 'rounded', border: true, fit: 'cover', x: 62, y: 10, w: 28, rotate: -3, opacity: 1, z: 1, anim: { in: 'pop', delay: .9, duration: .9, loop: 'none', out: 'none' } }); };
  const canAdd = !!entry && !entry.fallback;
  const theme = entry ? themeById(resolveTheme(show.settings.theme, entry.c.theme, entry.s.theme)) : themeById(show.settings.theme);
  return (
    <section className="panel preview">
      <div className="preview-status">
        {entry ? <><span className="pill accent">{TYPE_LABEL[entry.s.type]}</span><span className="num"><b>{fmtTime(slideSeconds(entry.s, entry.c, show.settings, assets))}</b></span><span>מעבר: {TRANSITION_LABEL[slideTransition(entry.s, entry.c, show.settings)]}</span><span className="theme-mini" title="ערכת הצבעים של השקופית"><i style={{ background: theme.accent }} />{theme.name}</span>{entry.fallback && <span className="muted">(השקופית הראשונה בפרק · בחרו שקופית כדי לערוך)</span>}</> : <span className="muted">בחרו שקופית בסטוריבורד כדי לראות תצוגה מקדימה</span>}
        <span className="grow" />
        {photo && !selOverlay && <span className="muted"><Crosshair style={{ width: 13, height: 13, verticalAlign: -2 }} /> לחיצה על התמונה קובעת נקודת מוקד</span>}
        {overlay && <span className="muted">שכבה נבחרת: גרירה מזיזה · פינה משנה גודל · ידית עליונה מסובבת · Esc חזרה</span>}
      </div>
      <div className="stage-wrap" ref={wrap}>
        <div className="stage" ref={stage} data-tour="stage" data-theme={entry ? resolveTheme(show.settings.theme, entry.c.theme, entry.s.theme) : show.settings.theme} style={{ width: size.w, height: size.h }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
          {entry ? <SlideView slide={entry.s} ctx={ctx} animate={liveAnimate} replayKey={replay} onPick={photo && !selOverlay ? (x, y) => updateSlide(photo.id, { focal: [x, y] } as any) : undefined} /> : <div className="stage-empty">הפרק ריק. גררו תמונות מהספרייה (מימין) אל הסטוריבורד (למטה), או לחצו „+” בפרק.</div>}
          {focal && !selOverlay && <div className="focal" style={{ left: `${focal[0]}%`, top: `${focal[1]}%` }} />}
          {safe && <div className="safe" style={{ inset: `${m}%` }} />}
          {guides.v != null && <div className="guide v" style={{ left: `${guides.v}%` }} />}{guides.h != null && <div className="guide h" style={{ top: `${guides.h}%` }} />}
          {overlay && box && <div className="ov-handles" style={{ left: box.l, top: box.t, width: box.w, height: box.h }}><span className="lab">{overlay.kind === 'text' ? 'טקסט' : overlay.kind === 'symbol' ? 'סמל' : overlay.kind === 'emoji' ? 'אימוג׳י' : overlay.kind === 'shape' ? 'צורה' : 'תמונה'}{overlay.locked ? ' · נעול' : ''} · {Math.round(overlay.x)}%, {Math.round(overlay.y)}%{overlay.rotate ? ` · ${overlay.rotate}°` : ''}</span>{!overlay.locked && <><span className="rotline" /><span className="h rot" title="סובב (נצמד ל־90°)" /><span className="h se" title="שנה גודל" /></>}{overlay.locked && <Lock style={{ position: 'absolute', top: 4, insetInlineStart: 4, width: 12, height: 12, color: 'var(--accent)' }} />}</div>}
          {entry && !photo && !selOverlay && (TEXT_BLOCKS[entry.s.type]?.length ?? 0) > 0 && <div className="hint">גררו כותרת או טקסט כדי למקם אותם</div>}
          {photo && !selOverlay && <div className="hint">מוקד <span className="ltr">{focal![0]}% · {focal![1]}%</span>{photo.caption ? (photo.captionStyle?.x != null ? <> · כיתוב <span className="ltr">{photo.captionStyle.x}% · {photo.captionStyle.y}%</span></> : ' · גררו את הכיתוב למקום אחר') : ''}</div>}
        </div>
      </div>
      <div className="preview-tools">
        {canAdd ? <div className="add-tools" data-tour="add-tools" style={{ position: 'relative' }}>
          {/* the menu must live outside .btn-group: that group clips its overflow and would hide a menu that pops out of it */}
          <div className="btn-group">
            <button className="btn tip" data-tip="שכבת טקסט (שישה סגנונות)" aria-expanded={menu === 'text'} onClick={() => setMenu(menu === 'text' ? null : 'text')}><Type /> טקסט</button>
            <button className="btn tip" data-tip="אייקון או אימוג׳י" aria-expanded={menu === 'symbol'} onClick={() => setMenu(menu === 'symbol' ? null : 'symbol')}><Smile /> סמל</button>
            <button className="btn tip" data-tip="מסגרת, פס, מלבן, עיגול" aria-expanded={menu === 'shape'} onClick={() => setMenu(menu === 'shape' ? null : 'shape')}><Shapes /> צורה</button>
            <button className="btn tip" data-tip={libSel.some(i => assets[i]?.type === 'photo') ? 'תמונה קטנה מהבחירה בספרייה' : 'בחרו קודם תמונה בספרייה'} onClick={addImage}><ImagePlus /> תמונה</button>
          </div>
          {menu && <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setMenu(null)} /><div className="menu addmenu" style={{ bottom: 'calc(100% + 6px)', insetInlineStart: 0 }}>
            {menu === 'text' && <><div className="menu-h">סגנונות טקסט</div>{TEXT_PRESETS.map(p => <button key={p.label} onClick={() => add(p.make(entry!.s))}><Type />{p.label}</button>)}</>}
            {menu === 'shape' && <><div className="menu-h">צורות</div>{SHAPES.map(p => <button key={p.label} onClick={() => add(p.make())}><Shapes />{p.label}</button>)}</>}
            {menu === 'symbol' && <div style={{ padding: 4 }}>
              <div className="sym-tabs">{[...SYMBOL_GROUPS, 'אימוג׳י'].map(g => <button key={g} aria-pressed={symTab === g} onClick={() => setSymTab(g)}>{g}</button>)}</div>
              <div className="sym-grid">{symTab === 'אימוג׳י' ? EMOJI.map(e => <button key={e.char} title={e.label} onClick={() => add({ id: uid('o'), kind: 'emoji', char: e.char, x: 44, y: 36, w: 12, rotate: 0, opacity: 1, z: 1, anim: { in: 'pop', delay: .8, duration: .8, loop: 'none', out: 'none' } })}>{e.char}</button>)
                : SYMBOLS.filter(s => s.group === symTab).map(s => <button key={s.name} title={s.label} dangerouslySetInnerHTML={{ __html: symbolSvg(s.name, 'currentColor', 1.6) }} onClick={() => add({ id: uid('o'), kind: 'symbol', name: s.name, color: 'auto', fill: false, stroke: 1.6, x: 44, y: 36, w: 12, rotate: 0, opacity: 1, z: 1, anim: { in: 'zoom', delay: .8, duration: .8, loop: 'none', out: 'none' } })} />)}</div>
            </div>}
          </div></>}
        </div> : <span className="muted small">בחרו שקופית כדי להוסיף שכבות עיצוב</span>}
        <span className="grow" />
        <div className="btn-group" data-tour="preview-tools">
          <button className="btn tip" aria-pressed={safe} data-tip="שולי הבטיחות של הטלוויזיה" onClick={toggleSafe}><Grid3X3 /><span className="lbl">שוליים</span></button>
          <button className="btn tip" data-tip="הפעל את האנימציה מההתחלה" onClick={() => { setAnimate(true); selectOverlay(null); setReplay(r => r + 1); }}><RotateCcw /><span className="lbl">נגן שוב</span></button>
          <button className="btn tip" data-tip={animate ? 'עצור את האנימציה' : 'הפעל אנימציה'} onClick={() => setAnimate(a => !a)}>{animate ? <Pause /> : <Film />}<span className="lbl">{animate ? 'עצור אנימציה' : 'אנימציה'}</span></button>
        </div>
        {entry && <button className="btn primary" onClick={() => window.open(`/show?from=${entry.s.id}`, 'sy80-show')}><Play /> נגן מכאן</button>}
      </div>
    </section>
  );
}

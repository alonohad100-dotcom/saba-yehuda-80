import { useMemo } from 'react';
import { Copy, Trash2, Play, ArrowUp, ArrowDown, SortAsc, ImagePlus, X, Star, Plus, ZoomIn, ZoomOut, MoveLeft, MoveRight, MoveUp, MoveDown, Ban, RefreshCcw, Lock, Unlock, Sparkles, Shuffle } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { Waveform } from './Waveform';
import { Checks } from './Checks';
import { toast } from '@/store/toast';
import { similarUnused } from '@shared/autoshow/generate';
import { usedAssetIds } from '@/show/engine';
import { type Slide, type Chapter, type KenBurns, type TransitionId, type Look, type Frame, type CaptionStyle, slideSeconds, assetThumb, fmtTime, TYPE_LABEL, TRANSITION_LABEL, layoutsFor, COLLAGE_LAYOUTS, COLLAGE_LAYOUT_LABEL, type CollageLayout } from '@shared/model';
import { OverlayInspector } from './OverlayInspector';
import { ThemeGrid } from './ThemePicker';
import { themeById, THEMES as THEMES_LIST } from '@shared/themes';
import { Eye, EyeOff, Type, Smile, Shapes, Image as ImageIcon } from 'lucide-react';
const DEF_LOOK: Look = { filter: 'none', vignette: .5, brightness: 100, contrast: 100, saturation: 100 };
const DEF_FRAME: Frame = { zoom: 1, rotate: 0, flipH: false, kenBurnsAmount: 1 };
const DEF_CAP: CaptionStyle = { anim: 'rise', size: 1, position: 'bottom', align: 'right', font: 'display', box: false };
const LOOK_PRESETS: [string, Partial<Look>][] = [['נקי', { filter: 'none', vignette: .3, brightness: 100, contrast: 100, saturation: 100 }], ['ארכיון', { filter: 'sepia', vignette: .75, contrast: 95, saturation: 100, brightness: 102 }], ['קולנועי', { filter: 'cool', vignette: .85, contrast: 112, saturation: 85, brightness: 98 }], ['שחור־לבן', { filter: 'bw', vignette: .6, contrast: 110, brightness: 100, saturation: 100 }], ['חם', { filter: 'warm', vignette: .5, contrast: 104, saturation: 110, brightness: 103 }], ['דהוי', { filter: 'faded', vignette: .4, contrast: 100, saturation: 100, brightness: 100 }]];

const LAYOUT_ICON: Record<CollageLayout, [number, number, number, number][]> = { // x y w h in a 30×20 box
  'hero-right': [[12, 0, 18, 20], [0, 0, 11, 9.5], [0, 10.5, 11, 9.5]], 'hero-left': [[0, 0, 18, 20], [19, 0, 11, 9.5], [19, 10.5, 11, 9.5]], 'two-up': [[0, 0, 14.5, 20], [15.5, 0, 14.5, 20]],
  triptych: [[0, 0, 9.3, 20], [10.3, 0, 9.3, 20], [20.6, 0, 9.3, 20]], 'one-plus-three': [[0, 0, 30, 12.5], [0, 13.5, 9.3, 6.5], [10.3, 13.5, 9.3, 6.5], [20.6, 13.5, 9.3, 6.5]], 'four-grid': [[0, 0, 14.5, 9.5], [15.5, 0, 14.5, 9.5], [0, 10.5, 14.5, 9.5], [15.5, 10.5, 14.5, 9.5]],
  filmstrip: [[0, 2, 6.5, 16], [7.5, 2, 6.5, 16], [15, 2, 6.5, 16], [22.5, 2, 6.5, 16]], 'mosaic-6': [[16, 0, 14, 20], [0, 0, 7.5, 9.5], [8, 0, 7.5, 9.5], [0, 10.5, 7.5, 9.5], [8, 10.5, 7.5, 9.5], [16, 0, 0, 0]],
};
function LayoutIcon({ l }: { l: CollageLayout }) { return <svg viewBox="0 0 30 20">{LAYOUT_ICON[l].map((r, i) => <rect key={i} x={r[0]} y={r[1]} width={r[2]} height={r[3]} rx="1" />)}</svg>; }
function LockButton({ locked, onToggle }: { locked?: boolean; onToggle: () => void }) { return <button className={`btn sm ${locked ? 'gold' : ''}`} onClick={onToggle} title={locked ? 'נעול: יצירה אוטומטית לא תחליף' : 'נעל מפני יצירה אוטומטית'}>{locked ? <Lock /> : <Unlock />} {locked ? 'נעול' : 'נעל'}</button>; }

const TRANS = Object.entries(TRANSITION_LABEL) as [TransitionId, string][];
const KBS: { k: KenBurns; icon: React.ReactNode; l: string }[] = [{ k: 'in', icon: <ZoomIn />, l: 'פנימה' }, { k: 'out', icon: <ZoomOut />, l: 'החוצה' }, { k: 'none', icon: <Ban />, l: 'ללא' }, { k: 'left', icon: <MoveLeft />, l: 'שמאלה' }, { k: 'right', icon: <MoveRight />, l: 'ימינה' }, { k: 'up', icon: <MoveUp />, l: 'למעלה' }, { k: 'down', icon: <MoveDown />, l: 'למטה' }];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="field"><label><span>{label}</span>{hint && <b>{hint}</b>}</label>{children}</div>; }
function Seg<T extends string>({ value, options, onChange, allowUnset }: { value: T | undefined; options: [T, string][]; onChange: (v: T | undefined) => void; allowUnset?: string }) {
  return <div className="seg full">{allowUnset && <button aria-pressed={value === undefined} onClick={() => onChange(undefined)}>{allowUnset}</button>}{options.map(([v, l]) => <button key={v} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
function Mini({ id, hero, onRemove, onHero, onClick }: { id: string; hero?: boolean; onRemove?: () => void; onHero?: () => void; onClick?: () => void }) {
  const a = useLibrary(s => s.assets[id]);
  return <div className={`mini ${hero ? 'hero' : ''}`} onClick={onClick} title={a ? `${a.name} · ${a.year ?? ''}` : 'קובץ חסר'} style={{ cursor: onClick ? 'pointer' : 'default' }}>{a ? <img src={assetThumb(a)} alt="" /> : <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--bad)', fontSize: 10 }}>חסר</div>}{onHero && <button onClick={(e) => { e.stopPropagation(); onHero(); }} style={{ insetInlineEnd: 'auto', insetInlineStart: 2 }} title="תמונה ראשית"><Star /></button>}{onRemove && <button onClick={(e) => { e.stopPropagation(); onRemove(); }} title="הסר"><X /></button>}</div>;
}
function useLibPick() { const libSel = useUi(s => s.libSel); const assets = useLibrary(s => s.assets); return { libSel, photos: libSel.filter(id => assets[id]?.type === 'photo'), videos: libSel.filter(id => assets[id]?.type === 'video'), clear: useUi.getState().clearLibSel }; }

export function Inspector() {
  const show = useShow(s => s.show)!; const sel = useShow(s => s.selection); const selOverlay = useUi(s => s.selOverlay);
  const entry = useMemo(() => { const ids = sel.slideIds; if (ids.length !== 1) return null; for (const c of show.chapters) { const s = c.slides.find(x => x.id === ids[0]); if (s) return { s, c }; } return null; }, [show, sel]);
  const chapter = show.chapters.find(c => c.id === sel.chapterId) ?? show.chapters[0];
  const overlay = entry?.s.overlays?.find(o => o.id === selOverlay);
  return (
    <aside className="panel insp">
      <div className="panel-b" style={{ padding: 0 }}>
        {sel.slideIds.length > 1 ? <BulkInspector ids={sel.slideIds} /> : entry && overlay ? <OverlayInspector slideId={entry.s.id} o={overlay} /> : entry ? <SlideInspector s={entry.s} c={entry.c} /> : <ChapterInspector c={chapter} />}
      </div>
      <Checks />
    </aside>
  );
}

function ChapterInspector({ c }: { c: Chapter }) {
  const show = useShow(s => s.show)!; const upd = useShow(s => s.updateChapter); const remove = useShow(s => s.removeChapter); const move = useShow(s => s.moveChapter); const sort = useShow(s => s.sortChapterByYear); const { assets, list } = useLibrary();
  const setChapterLocked = useShow(s => s.setChapterLocked); const openDialog = useUi(s => s.openDialog);
  const music = list.filter(a => a.type === 'music' && a.status === 'ready'); const m = c.musicId ? assets[c.musicId] : undefined;
  const dur = c.slides.reduce((t, s) => t + slideSeconds(s, c, show.settings, assets), 0); const idx = show.chapters.findIndex(x => x.id === c.id);
  return (<>
    <div className="insp-title"><span className="ty">פרק</span><span>{c.title}</span><span className="sub num">{c.slides.length} שק׳ · {fmtTime(dur)}</span></div>
    <div className="insp-section">
      <Field label="שם הפרק"><input className="he" value={c.title} onChange={e => upd(c.id, { title: e.target.value })} /></Field>
      <Field label="כותרת משנה (למציג בלבד)"><input value={c.subtitle ?? ''} onChange={e => upd(c.id, { subtitle: e.target.value })} placeholder="למשל 1946–1964" /></Field>
    </div>
    <div className="insp-section"><h4>מוזיקה</h4>
      <Field label="קטע"><select value={c.musicId ?? ''} onChange={e => upd(c.id, { musicId: e.target.value || undefined, musicStartSec: 0 })}><option value="">ללא מוזיקה (ממשיך מהפרק הקודם)</option>{music.map(a => <option key={a.id} value={a.id}>{a.name.replace(/\.[^.]+$/, '')} · {fmtTime(a.duration ?? 0)}</option>)}</select></Field>
      {m && <>
        <Field label="נקודת התחלה" hint={fmtTime(c.musicStartSec ?? 0)}><Waveform peaks={m.peaks ?? []} duration={m.duration ?? 0} start={c.musicStartSec ?? 0} cover={dur} onStart={(s) => upd(c.id, { musicStartSec: s })} /></Field>
        <Field label="עוצמה" hint={`${Math.round((c.musicLevel ?? show.settings.musicLevel) * 100)}%`}><input type="range" min={0} max={1} step={.05} value={c.musicLevel ?? show.settings.musicLevel} onChange={e => upd(c.id, { musicLevel: +e.target.value })} /></Field>
        {m.duration && m.duration - (c.musicStartSec ?? 0) < dur && <div className="check warn" style={{ cursor: 'default' }}>המוזיקה קצרה מהפרק ב־{fmtTime(dur - (m.duration - (c.musicStartSec ?? 0)))}; תתבצע חזרה עם crossfade.</div>}
      </>}
      {!music.length && <div className="muted small">אין קטעי מוזיקה בספרייה. הנח קבצים ב־media/music והרץ קליטה.</div>}
    </div>
    <div className="insp-section"><h4>ערכת צבעים לפרק</h4>
      <div className="muted small" style={{ marginBottom: 8 }}>כרגע: {themeById(c.theme ?? show.settings.theme).name}{c.theme ? ' (דריסה)' : ' (כללי)'}</div>
      <ThemeGrid value={c.theme} allowInherit={themeById(show.settings.theme).name} onChange={id => upd(c.id, { theme: id })} />
    </div>
    <div className="insp-section"><h4>ברירות מחדל לפרק</h4>
      <Field label="משך תמונה" hint={c.defaults?.seconds ? `${c.defaults.seconds}s` : `כללי (${show.settings.defaultSlideSeconds}s)`}><input type="range" min={2} max={20} step={.5} value={c.defaults?.seconds ?? show.settings.defaultSlideSeconds} onChange={e => upd(c.id, { defaults: { ...c.defaults, seconds: +e.target.value } })} /></Field>
      <Field label="מעבר"><Seg value={c.defaults?.transition} options={TRANS} allowUnset="כללי" onChange={v => upd(c.id, { defaults: { ...c.defaults, transition: v } })} /></Field>
      <Field label="תנועת מצלמה"><Seg value={c.defaults?.kenBurns} options={KBS.map(k => [k.k, k.l] as [KenBurns, string])} allowUnset="כללי" onChange={v => upd(c.id, { defaults: { ...c.defaults, kenBurns: v } })} /></Field>
    </div>
    <div className="insp-section"><h4>פעולות</h4>
      <div className="row wrap">
        <button className="btn sm" onClick={() => { sort(c.id, assets); toast('הפרק סודר לפי שנה'); }}><SortAsc /> סדר לפי שנה</button>
        <button className="btn sm" disabled={idx === 0} onClick={() => move(c.id, -1)}><ArrowUp /> הקדם</button>
        <button className="btn sm" disabled={idx === show.chapters.length - 1} onClick={() => move(c.id, 1)}><ArrowDown /> אחר</button>
        <button className="btn sm" onClick={() => window.open(`/show${c.slides[0] ? `?from=${c.slides[0].id}` : ''}`, 'sy80-show')}><Play /> נגן מהפרק</button>
        <button className="btn sm danger" disabled={show.chapters.length <= 1} onClick={() => { if (c.slides.length && !confirm(`למחוק את הפרק „${c.title}” עם ${c.slides.length} שקופיות?`)) return; remove(c.id); toast('הפרק נמחק'); }}><Trash2 /> מחק פרק</button>
      </div>
    </div>
    <div className="insp-section"><h4>יצירה אוטומטית</h4>
      <div className="row wrap">
        <button className="btn sm gold" onClick={() => openDialog('auto', { fillChapterId: c.id })}><Sparkles /> מלא את הפרק אוטומטית</button>
        <LockButton locked={c.locked} onToggle={() => setChapterLocked(c.id, !c.locked)} />
      </div>
      <div className="muted small" style={{ marginTop: 6 }}>{c.locked ? 'הפרק נעול: יצירה מחדש של המצגת משאירה אותו כמו שהוא.' : 'מילוי אוטומטי מחליף רק שקופיות שנוצרו אוטומטית; שקופיות ידניות ונעולות נשארות.'}</div>
    </div>
  </>);
}

function R({ label, value, min, max, step = 1, fmt, onChange }: { label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void }) { return <Field label={label} hint={fmt ? fmt(value) : String(value)}><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} /></Field>; }
function LookSection({ s, set }: { s: Slide; set: (p: Record<string, unknown>) => void }) {
  const look = s.look ?? DEF_LOOK; const u = (p: Partial<Look>) => set({ look: { ...look, ...p } });
  return <div className="insp-section"><h4>מראה</h4>
    <div className="preset-row" style={{ marginBottom: 10 }}>{LOOK_PRESETS.map(([l, p]) => <button key={l} className="chip" onClick={() => u(p)}>{l}</button>)}{s.look && <button className="chip" onClick={() => set({ look: undefined })}>איפוס</button>}</div>
    <Field label="פילטר"><Seg value={look.filter} options={[['none', 'ללא'], ['bw', 'שחור־לבן'], ['sepia', 'ספיה'], ['warm', 'חם'], ['cool', 'קר'], ['faded', 'דהוי'], ['vivid', 'חי']]} onChange={v => u({ filter: v as Look['filter'] })} /></Field>
    <div className="field-row"><R label="בהירות" value={look.brightness} min={50} max={150} fmt={v => `${v}%`} onChange={v => u({ brightness: v })} /><R label="ניגודיות" value={look.contrast} min={50} max={150} fmt={v => `${v}%`} onChange={v => u({ contrast: v })} /></div>
    <div className="field-row"><R label="רוויה" value={look.saturation} min={0} max={200} fmt={v => `${v}%`} onChange={v => u({ saturation: v })} /><R label="וינייטה" value={look.vignette} min={0} max={1} step={0.05} fmt={v => `${Math.round(v * 100)}%`} onChange={v => u({ vignette: v })} /></div>
  </div>;
}
function FrameSection({ s, set }: { s: Slide; set: (p: Record<string, unknown>) => void }) {
  const f = s.frame ?? DEF_FRAME; const u = (p: Partial<Frame>) => set({ frame: { ...f, ...p } });
  return <div className="insp-section"><h4>מסגרת וחיתוך</h4>
    <R label="זום (סביב נקודת המוקד)" value={f.zoom} min={1} max={3} step={0.05} fmt={v => `×${v.toFixed(2)}`} onChange={v => u({ zoom: v })} />
    <R label="עוצמת תנועת המצלמה" value={f.kenBurnsAmount} min={0} max={2} step={0.1} fmt={v => v === 0 ? 'ללא' : `×${v.toFixed(1)}`} onChange={v => u({ kenBurnsAmount: v })} />
    <div className="row wrap"><Seg value={String(f.rotate)} options={[['0', '0°'], ['90', '90°'], ['180', '180°'], ['270', '270°']]} onChange={v => u({ rotate: +(v ?? 0) })} /><label className="chk"><input type="checkbox" checked={f.flipH} onChange={e => u({ flipH: e.target.checked })} /> מראה</label>{s.frame && <button className="btn sm ghost" onClick={() => set({ frame: undefined })}>איפוס</button>}</div>
  </div>;
}
function CaptionSection({ s, set }: { s: Slide; set: (p: Record<string, unknown>) => void }) {
  const c = s.captionStyle ?? DEF_CAP; const u = (p: Partial<CaptionStyle>) => set({ captionStyle: { ...c, ...p } });
  return <div className="insp-section"><h4>סגנון הכיתוב</h4>
    <Field label="כניסה"><Seg value={c.anim} options={[['rise', 'עלייה'], ['fade', 'עמעום'], ['words', 'מילה־מילה'], ['letters', 'אות־אות'], ['none', 'ללא']]} onChange={v => u({ anim: v as CaptionStyle['anim'] })} /></Field>
    <div className="field-row"><Field label="מיקום"><Seg value={c.position} options={[['bottom', 'למטה'], ['center', 'מרכז'], ['top', 'למעלה']]} onChange={v => u({ position: v as CaptionStyle['position'] })} /></Field><Field label="יישור"><Seg value={c.align} options={[['right', 'ימין'], ['center', 'מרכז'], ['left', 'שמאל']]} onChange={v => u({ align: v as CaptionStyle['align'] })} /></Field></div>
    <div className="field-row"><R label="גודל" value={c.size} min={0.5} max={2.5} step={0.05} fmt={v => `×${v.toFixed(2)}`} onChange={v => u({ size: v })} /><Field label="גופן"><Seg value={c.font} options={[['display', 'פרנק־רוהל'], ['ui', 'היבו']]} onChange={v => u({ font: v as CaptionStyle['font'] })} /></Field></div>
    <div className="row wrap"><label className="chk"><input type="checkbox" checked={c.box} onChange={e => u({ box: e.target.checked })} /> תיבה כהה מאחורי הכיתוב</label>{s.captionStyle && <button className="btn sm ghost" onClick={() => set({ captionStyle: undefined })}>איפוס</button>}</div>
  </div>;
}
function LayersSection({ s }: { s: Slide }) {
  const selOverlay = useUi(st => st.selOverlay); const selectOverlay = useUi(st => st.selectOverlay); const upd = useShow(st => st.updateOverlay);
  const list = (s.overlays ?? []).slice().sort((a, b) => b.z - a.z);
  const icon = (k: string) => k === 'text' ? <Type /> : k === 'symbol' ? <Smile /> : k === 'emoji' ? <Smile /> : k === 'shape' ? <Shapes /> : <ImageIcon />;
  const name = (o: NonNullable<Slide['overlays']>[number]) => o.kind === 'text' ? o.text.slice(0, 28) : o.kind === 'symbol' ? o.name : o.kind === 'emoji' ? o.char : o.kind === 'shape' ? ({ rect: 'מלבן', circle: 'עיגול', line: 'פס', frame: 'מסגרת' })[o.shape] : 'תמונה';
  return <div className="insp-section"><h4>שכבות ({list.length})</h4>
    {list.length ? <div className="layers">{list.map(o => <div key={o.id} className={`layer-row ${selOverlay === o.id ? 'sel' : ''}`} onClick={() => selectOverlay(o.id)}>{icon(o.kind)}<span className="nm">{name(o)}{o.locked ? ' 🔒' : ''}</span><button className="btn ghost sm icon" title={o.opacity === 0 ? 'הצג' : 'הסתר'} onClick={e => { e.stopPropagation(); upd(s.id, o.id, { opacity: o.opacity === 0 ? 1 : 0 }); }}>{o.opacity === 0 ? <EyeOff /> : <Eye />}</button></div>)}</div> : <div className="muted small">הוסף טקסט, סמל, צורה או תמונה מהכפתורים מעל התצוגה המקדימה.</div>}
  </div>;
}

function BulkInspector({ ids }: { ids: string[] }) {
  const show = useShow(s => s.show)!; const updAll = useShow(s => s.updateSlides); const removeSlides = useShow(s => s.removeSlides); const dup = useShow(s => s.duplicateSlides); const setLocked = useShow(s => s.setLocked);
  const slides = show.chapters.flatMap(c => c.slides).filter(s => ids.includes(s.id)); const photos = slides.filter(s => s.type === 'photo'); const allLocked = slides.every(s => s.locked);
  return (<>
    <div className="insp-title"><span className="ty">{ids.length} שקופיות</span><span className="sub">עריכה קבוצתית</span></div>
    <div className="insp-section">
      <Field label="משך (לכל הנבחרות)"><div className="row">{[4, 5, 6, 7, 8, 10].map(n => <button key={n} className="chip" onClick={() => { updAll(ids.filter(id => slides.find(s => s.id === id)?.type !== 'video' && slides.find(s => s.id === id)?.type !== 'black'), { seconds: n }); toast(`${n} שניות הוגדרו`); }}>{n}s</button>)}</div></Field>
      <Field label="מעבר"><Seg value={undefined} options={TRANS} onChange={v => updAll(ids, { transition: v })} /></Field>
      {photos.length > 0 && <Field label={`תנועת מצלמה (${photos.length} תמונות)`}><div className="kb-grid">{KBS.map(k => <button key={k.k} onClick={() => updAll(photos.map(p => p.id), { kenBurns: k.k })}>{k.icon}<span>{k.l}</span></button>)}</div></Field>}
      <Field label="התקדמות"><Seg value={undefined} options={[['auto', 'אוטומטי'], ['manual', 'לחיצה']]} onChange={v => updAll(ids, { advance: v })} /></Field>
    </div>
    <div className="insp-section"><div className="row wrap"><button className="btn sm" onClick={() => dup(ids)}><Copy /> שכפל</button><LockButton locked={allLocked} onToggle={() => setLocked(ids, !allLocked)} /><button className="btn sm danger" onClick={() => removeSlides(ids)}><Trash2 /> מחק {ids.length}</button></div></div>
  </>);
}

function SlideInspector({ s, c }: { s: Slide; c: Chapter }) {
  const show = useShow(s0 => s0.show)!; const upd = useShow(st => st.updateSlide); const removeSlides = useShow(st => st.removeSlides); const dup = useShow(st => st.duplicateSlides); const { assets, list } = useLibrary();
  const setLocked = useShow(st => st.setLocked); const replaceAsset = useShow(st => st.replaceAssetInSlide); const setLayout = useShow(st => st.setCollageLayout);
  const set = (patch: Record<string, unknown>) => upd(s.id, patch as Partial<Slide>);
  const pick = useLibPick();
  const replaceSimilar = (fromId: string) => { const from = assets[fromId]; if (!from) return; const used = usedAssetIds(show); const to = similarUnused(from, list, used); if (!to) return toast('לא נמצאה תמונה דומה שלא בשימוש (אותה תקופה, לא כפילות)', 'warn'); replaceAsset(s.id, fromId, to); toast(`הוחלף ב־${to.name}${to.year ? ` (${to.year})` : ''}`, 'ok'); };
  const secs = slideSeconds(s, c, show.settings, assets); const hasSeconds = s.type !== 'video' && s.type !== 'black';
  const a = 'assetId' in s ? assets[s.assetId] : undefined;
  return (<>
    <div className="insp-title"><span className="ty">{TYPE_LABEL[s.type]}</span><span className="sub">{c.title} · {fmtTime(secs)}</span></div>
    <div className="insp-section">
      {s.type === 'intro' && <><Field label="שם"><input className="he" value={s.title} onChange={e => set({ title: e.target.value })} /></Field><Field label="המספר"><input value={s.number} onChange={e => set({ number: e.target.value })} style={{ width: 90 }} /></Field><Field label="כותרת משנה"><input className="he" value={s.subtitle ?? ''} onChange={e => set({ subtitle: e.target.value })} /></Field></>}
      {s.type === 'chapter' && <><Field label="שורת פתיח קטנה"><input value={s.eyebrow ?? ''} onChange={e => set({ eyebrow: e.target.value })} placeholder="פרק" /></Field><Field label="כותרת"><input className="he" value={s.label} onChange={e => set({ label: e.target.value })} /></Field><Field label="שורת תיאור"><input className="he" value={s.blurb ?? ''} onChange={e => set({ blurb: e.target.value })} /></Field>
        <Field label="תמונת רקע"><div className="row"><div className="asset-strip">{s.heroAssetId ? <Mini id={s.heroAssetId} onRemove={() => set({ heroAssetId: undefined })} /> : <div className="muted small">אין</div>}</div><button className="btn sm" disabled={pick.photos.length !== 1} onClick={() => { set({ heroAssetId: pick.photos[0] }); pick.clear(); }}><ImagePlus /> מהבחירה בספרייה</button></div></Field></>}
      {s.type === 'photo' && <>
        <Field label="כיתוב"><textarea className="he" value={s.caption ?? ''} onChange={e => set({ caption: e.target.value })} rows={2} placeholder="מה רואים בתמונה, מי, איפה…" /></Field>
        <div className="field-row"><Field label="שנה" hint={a?.year && a.year !== s.year ? `בקובץ: ${a.year}` : undefined}><input type="number" value={s.year ?? ''} onChange={e => set({ year: e.target.value ? +e.target.value : undefined })} /></Field>
          <Field label="גרעין פילם"><Seg value={s.grain === undefined ? 'auto' : s.grain ? 'on' : 'off'} options={[['auto', 'אוטו׳'], ['on', 'כן'], ['off', 'לא']]} onChange={v => set({ grain: v === 'auto' ? undefined : v === 'on' })} /></Field></div>
        <Field label="תנועת מצלמה (Ken Burns)"><div className="kb-grid">{KBS.map(k => <button key={k.k} aria-pressed={(s.kenBurns ?? c.defaults?.kenBurns ?? 'in') === k.k} onClick={() => set({ kenBurns: k.k })}>{k.icon}<span>{k.l}</span></button>)}</div></Field>
        <Field label="נקודת מוקד" hint={`⁦${(s.focal ?? a?.focal ?? [50, 50]).join('% · ')}%⁩`}><div className="row"><span className="muted small grow">לחיצה על התמונה בתצוגה המקדימה</span><button className="btn sm ghost" onClick={() => set({ focal: undefined })}><RefreshCcw /> אוטומטי</button></div></Field>
        <Field label="תמונה"><div className="row wrap"><div className="asset-strip"><Mini id={s.assetId} /></div><button className="btn sm" disabled={pick.photos.length !== 1} onClick={() => { set({ assetId: pick.photos[0], focal: undefined, year: assets[pick.photos[0]]?.year }); pick.clear(); }}><ImagePlus /> החלף מהבחירה</button><button className="btn sm" onClick={() => replaceSimilar(s.assetId)} title="תמונה אחרת מאותה תקופה שעדיין לא במצגת"><Shuffle /> תמונה דומה</button></div></Field>
      </>}
      {s.type === 'photo-pair' && <>
        <Field label="שתי התמונות"><div className="row"><div className="asset-strip">{s.assetIds.map((id, i) => <Mini key={i} id={id} onClick={() => { if (pick.photos.length === 1) { const ids = [...s.assetIds] as [string, string]; ids[i] = pick.photos[0]; set({ assetIds: ids }); pick.clear(); } else toast('בחר תמונה אחת בספרייה ואז לחץ על התמונה להחלפה'); }} />)}</div><button className="btn sm" onClick={() => set({ assetIds: [s.assetIds[1], s.assetIds[0]] })}>החלף צדדים</button></div></Field>
        <div className="field-row"><Field label="תגית ימין"><input value={s.tags?.[0] ?? ''} placeholder={assets[s.assetIds[0]]?.year ? String(assets[s.assetIds[0]]!.year) : 'שנה'} onChange={e => set({ tags: [e.target.value, s.tags?.[1] ?? ''] })} /></Field><Field label="תגית שמאל"><input value={s.tags?.[1] ?? ''} placeholder={assets[s.assetIds[1]]?.year ? String(assets[s.assetIds[1]]!.year) : 'שנה'} onChange={e => set({ tags: [s.tags?.[0] ?? '', e.target.value] })} /></Field></div>
        <Field label="כיתוב"><input className="he" value={s.caption ?? ''} onChange={e => set({ caption: e.target.value })} /></Field>
      </>}
      {s.type === 'collage' && <>
        <Field label={`תמונות (${s.assetIds.length}/6) · ★ = ראשית`}><div className="asset-strip">{s.assetIds.map((id, i) => <Mini key={id + i} id={id} hero={(s.heroIndex ?? 0) === i} onHero={() => set({ heroIndex: i })} onRemove={() => s.assetIds.length > 2 && set({ assetIds: s.assetIds.filter((_, j) => j !== i), heroIndex: 0 })} />)}</div></Field>
        <div className="row wrap" style={{ marginBottom: 10 }}><button className="btn sm" disabled={!pick.photos.length || s.assetIds.length + pick.photos.length > 6} onClick={() => { set({ assetIds: [...s.assetIds, ...pick.photos.filter(id => !s.assetIds.includes(id))].slice(0, 6) }); pick.clear(); }}><Plus /> הוסף מהבחירה ({pick.photos.length})</button>
          <button className="btn sm" onClick={() => { const used = usedAssetIds(show); for (const id of s.assetIds) { const a = assets[id]; const to = a && similarUnused(a, list, used); if (to) { replaceAsset(s.id, id, to); used.add(to.id); } } toast('התמונות הוחלפו בדומות שלא בשימוש', 'ok'); }} title="החלף את כל תמונות הקולאז׳ בתמונות דומות שלא בשימוש"><Shuffle /> ערבב תמונות</button></div>
        <Field label="פריסה"><div className="layout-pick">{COLLAGE_LAYOUTS.map(l => { const ok = layoutsFor(s.assetIds.length).includes(l); return <button key={l} disabled={!ok} aria-pressed={(s.layout ?? (s.assetIds.length === 2 ? 'two-up' : s.assetIds.length === 6 ? 'mosaic-6' : 'hero-right')) === l} onClick={() => setLayout(s.id, l)} title={COLLAGE_LAYOUT_LABEL[l]}><LayoutIcon l={l} /><span>{COLLAGE_LAYOUT_LABEL[l]}</span></button>; })}</div></Field>
        <Field label="כיתוב"><input className="he" value={s.caption ?? ''} onChange={e => set({ caption: e.target.value })} /></Field>
      </>}
      {s.type === 'timeline' && <>
        <Field label="כותרת"><input className="he" value={s.title ?? ''} onChange={e => set({ title: e.target.value })} /></Field>
        <Field label="אבני דרך (שנה · תיאור · תמונה)"><div className="list-edit">{s.milestones.map((m, i) => <div className="item" key={i}><input type="number" value={m.year} onChange={e => upd(s.id, sl => { (sl as any).milestones[i].year = +e.target.value; })} /><input className="he" value={m.label} onChange={e => upd(s.id, sl => { (sl as any).milestones[i].label = e.target.value; })} /><div className="mini" title="לחיצה: תמונה מהבחירה בספרייה" onClick={() => { if (pick.photos.length === 1) { upd(s.id, sl => { (sl as any).milestones[i].assetId = pick.photos[0]; }); pick.clear(); } else toast('בחר תמונה אחת בספרייה ואז לחץ כאן'); }}>{m.assetId && assets[m.assetId] && <img src={assetThumb(assets[m.assetId])} alt="" />}</div><button className="btn ghost sm icon" onClick={() => upd(s.id, sl => { (sl as any).milestones.splice(i, 1); })}><X /></button></div>)}</div></Field>
        <button className="btn sm" onClick={() => upd(s.id, sl => { (sl as any).milestones.push({ year: 2000, label: '' }); (sl as any).milestones.sort((x: any, y: any) => x.year - y.year); })}><Plus /> אבן דרך</button>
      </>}
      {s.type === 'quote' && <><Field label="הציטוט"><textarea className="he" value={s.text} rows={4} onChange={e => set({ text: e.target.value })} /></Field><Field label="מי אמר"><input className="he" value={s.by ?? ''} onChange={e => set({ by: e.target.value })} placeholder="הנכדים / רותי / …" /></Field></>}
      {s.type === 'video' && <>
        <div className="field-row"><Field label="שם המברך/ת"><input className="he" value={s.name ?? ''} onChange={e => set({ name: e.target.value })} /></Field><Field label="קרבה"><input className="he" value={s.relation ?? ''} onChange={e => set({ relation: e.target.value })} placeholder="נכדה, אחיין…" /></Field></div>
        {a && <>
          <Field label="חיתוך" hint={`${(s.trimIn ?? 0).toFixed(1)}s – ${(s.trimOut ?? a.duration ?? 0).toFixed(1)}s · ${fmtTime(secs)}`}><div className="field-row"><input type="range" min={0} max={Math.max(0, (a.duration ?? 1) - 1)} step={.5} value={s.trimIn ?? 0} onChange={e => set({ trimIn: Math.min(+e.target.value, (s.trimOut ?? a.duration ?? 1) - 1) })} title="התחלה" /><input type="range" min={1} max={a.duration ?? 1} step={.5} value={s.trimOut ?? a.duration ?? 1} onChange={e => set({ trimOut: Math.max(+e.target.value, (s.trimIn ?? 0) + 1) })} title="סיום" /></div></Field>
          <Field label="עוצמת קול" hint={`${Math.round((s.volume ?? 1) * 100)}%`}><input type="range" min={0} max={1.5} step={.05} value={s.volume ?? 1} onChange={e => set({ volume: +e.target.value })} /></Field>
          <div className="muted small" style={{ marginBottom: 10 }}>{a.portrait ? 'סרטון לאורך — רקע מטושטש אוטומטי' : 'סרטון לרוחב'} · {a.width}×{a.height} · {fmtTime(a.duration ?? 0)}{a.loudnessGain != null ? ` · עוצמה תוקנה ${a.loudnessGain > 0 ? '+' : ''}${a.loudnessGain} dB` : ''}</div>
        </>}
        <Field label="בסיום הסרטון"><Seg value={s.hold ? 'hold' : 'auto'} options={[['auto', 'המשך אוטומטית'], ['hold', 'חכה ללחיצה']]} onChange={v => set({ hold: v === 'hold' })} /></Field>
        <Field label="סרטון"><div className="row"><div className="asset-strip"><Mini id={s.assetId} /></div><button className="btn sm" disabled={pick.videos.length !== 1} onClick={() => { const v = assets[pick.videos[0]]; set({ assetId: v.id, name: v.name.replace(/\.[^.]+$/, ''), trimIn: undefined, trimOut: undefined }); pick.clear(); }}><ImagePlus /> החלף מהבחירה</button></div></Field>
      </>}
      {s.type === 'video-wall' && <><Field label="כותרת"><input className="he" value={s.title ?? ''} onChange={e => set({ title: e.target.value })} /></Field><Field label={`ברכות (${s.assetIds.length}/9)`}><div className="asset-strip">{s.assetIds.map((id, i) => <Mini key={id} id={id} onRemove={() => s.assetIds.length > 2 && set({ assetIds: s.assetIds.filter((_, j) => j !== i) })} />)}</div></Field><button className="btn sm" disabled={!pick.videos.length} onClick={() => { set({ assetIds: Array.from(new Set([...s.assetIds, ...pick.videos])).slice(0, 9) }); pick.clear(); }}><Plus /> הוסף מהבחירה ({pick.videos.length})</button></>}
      {s.type === 'names' && <>
        <Field label="כותרת"><input className="he" value={s.title ?? ''} onChange={e => set({ title: e.target.value })} /></Field>
        <Field label="אנשים (שם · תמונה)"><div className="list-edit">{s.people.map((p, i) => <div className="item" key={i} style={{ gridTemplateColumns: '1fr 54px 24px' }}><input className="he" value={p.name} onChange={e => upd(s.id, sl => { (sl as any).people[i].name = e.target.value; })} /><div className="mini" onClick={() => { if (pick.photos.length === 1) { upd(s.id, sl => { (sl as any).people[i].assetId = pick.photos[0]; }); pick.clear(); } else toast('בחר תמונה אחת בספרייה ואז לחץ כאן'); }}>{p.assetId && assets[p.assetId] && <img src={assetThumb(assets[p.assetId])} alt="" />}</div><button className="btn ghost sm icon" onClick={() => upd(s.id, sl => { (sl as any).people.splice(i, 1); })}><X /></button></div>)}</div></Field>
        <div className="row wrap"><button className="btn sm" onClick={() => upd(s.id, sl => { (sl as any).people.push({ name: '' }); })}><Plus /> אדם</button><button className="btn sm" disabled={!pick.photos.length} onClick={() => { upd(s.id, sl => { for (const id of pick.photos) (sl as any).people.push({ name: '', assetId: id }); }); pick.clear(); }}><ImagePlus /> מהבחירה ({pick.photos.length})</button></div>
      </>}
      {s.type === 'finale' && <><Field label="שורת סיום"><input className="he" value={s.text} onChange={e => set({ text: e.target.value })} /></Field><Field label="המספר"><input value={s.number} onChange={e => set({ number: e.target.value })} style={{ width: 90 }} /></Field></>}
      {s.type === 'black' && <Field label="כיתוב קטן (אופציונלי)"><input className="he" value={s.caption ?? ''} onChange={e => set({ caption: e.target.value })} /></Field>}
    </div>
    {['photo', 'photo-pair', 'collage', 'chapter', 'video', 'video-wall'].includes(s.type) && <LookSection s={s} set={set} />}
    {s.type === 'photo' && <FrameSection s={s} set={set} />}
    {['photo', 'photo-pair', 'collage'].includes(s.type) && <CaptionSection s={s} set={set} />}
    <LayersSection s={s} />
    <div className="insp-section"><h4>ערכת צבעים לשקופית</h4>
      <Field label="ערכה"><select value={s.theme ?? ''} onChange={e => set({ theme: e.target.value || undefined })}><option value="">כמו הפרק / המצגת ({themeById(c.theme ?? show.settings.theme).name})</option>{THEMES_LIST.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
    </div>
    <div className="insp-section"><h4>תזמון ומעבר</h4>
      {hasSeconds && <Field label="משך" hint={`${secs}s${!s.seconds ? ' (ברירת מחדל)' : ''}`}><input type="range" min={2} max={30} step={.5} value={secs} onChange={e => set({ seconds: +e.target.value })} /></Field>}
      <Field label="מעבר אל השקופית"><Seg value={s.transition} options={TRANS} allowUnset="פרק" onChange={v => set({ transition: v })} /></Field>
      {s.type !== 'video' && s.type !== 'black' && <Field label="התקדמות"><Seg value={s.advance ?? 'auto'} options={[['auto', 'אוטומטי'], ['manual', 'חכה ללחיצה']]} onChange={v => set({ advance: v })} /></Field>}
      <Field label="הערות למציג"><textarea value={s.notes ?? ''} rows={2} onChange={e => set({ notes: e.target.value })} placeholder="מה לומר כשהשקופית מופיעה…" /></Field>
    </div>
    <div className="insp-section"><div className="row wrap"><button className="btn sm" onClick={() => dup([s.id])}><Copy /> שכפל</button><LockButton locked={s.locked} onToggle={() => setLocked([s.id], !s.locked)} /><button className="btn sm danger" onClick={() => removeSlides([s.id])}><Trash2 /> מחק</button><button className="btn sm primary" onClick={() => window.open(`/show?from=${s.id}`, 'sy80-show')}><Play /> נגן מכאן</button></div>
      {s.auto && <div className="muted small" style={{ marginTop: 6 }}><Sparkles style={{ width: 11, height: 11, verticalAlign: -1 }} /> נוצרה אוטומטית{s.locked ? ' · נעולה' : ' · יצירה מחדש תחליף אותה אלא אם תנעל'}</div>}</div>
  </>);
}

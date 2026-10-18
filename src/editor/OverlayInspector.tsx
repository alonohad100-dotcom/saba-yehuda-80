import { Trash2, Copy, ArrowUp, ArrowDown, Lock, Unlock, ChevronRight } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { type Overlay, type OverlayAnim, assetThumb } from '@shared/model';
import { SYMBOLS, EMOJI, symbolSvg } from '@shared/symbols';

const COLORS = ['#efe9db', '#f1d38a', '#d4a84b', '#ffffff', '#e06c6c', '#6fbf8a', '#7aa7d6', '#c8a2ff', '#1a1405', '#000000'];
const ANIM_IN: [OverlayAnim['in'], string][] = [['none', 'ללא'], ['fade', 'עמעום'], ['rise', 'עלייה'], ['drop', 'ירידה'], ['zoom', 'זום'], ['pop', 'קפיצה'], ['slide-right', 'מימין'], ['slide-left', 'משמאל'], ['typewriter', 'מילה־מילה'], ['letters', 'אות־אות']];
const LOOPS: [OverlayAnim['loop'], string][] = [['none', 'ללא'], ['pulse', 'פעימה'], ['float', 'ריחוף'], ['spin', 'סיבוב'], ['shimmer', 'נצנוץ']];
const DEF_ANIM: OverlayAnim = { in: 'fade', delay: .8, duration: .8, loop: 'none', out: 'none' };

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="field"><label><span>{label}</span>{hint && <b>{hint}</b>}</label>{children}</div>; }
function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) { const n = options.length; const cols = n > 4 ? (n === 5 || n === 6 ? 3 : n === 10 ? 5 : 4) : n; const rest = n % cols; const lastSpan = n > 4 && rest ? cols - rest + 1 : 1; return <div className={`seg full ${n > 4 ? 'grid' : ''}`} style={n > 4 ? { ['--cols' as any]: cols } : undefined}>{options.map(([v, l], i) => <button key={v} style={lastSpan > 1 && i === n - 1 ? { gridColumn: `span ${lastSpan}` } : undefined} aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>; }
function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) { return <div className="swatches"><button aria-pressed={value === 'auto'} style={{ background: 'conic-gradient(var(--accent), var(--fg), var(--accent))' }} onClick={() => onChange('auto')} title="לפי ערכת הצבעים (משתנה עם הערכה)" />{COLORS.map(c => <button key={c} aria-pressed={value.toLowerCase() === c} style={{ background: c }} onClick={() => onChange(c)} title={c} />)}<input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#d4a84b'} onChange={e => onChange(e.target.value)} title="צבע חופשי" /></div>; }
function Range({ label, value, min, max, step = 1, fmt, onChange }: { label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void }) { return <Field label={label} hint={fmt ? fmt(value) : String(value)}><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} /></Field>; }

export function OverlayInspector({ slideId, o }: { slideId: string; o: Overlay }) {
  const upd = useShow(s => s.updateOverlay); const remove = useShow(s => s.removeOverlay); const dup = useShow(s => s.duplicateOverlay); const reorder = useShow(s => s.reorderOverlay); const assets = useLibrary(s => s.assets);
  const selectOverlay = useUi(s => s.selectOverlay); const libSel = useUi(s => s.libSel);
  const set = (patch: Partial<Overlay>) => upd(slideId, o.id, patch); const anim = o.anim ?? DEF_ANIM; const setAnim = (p: Partial<OverlayAnim>) => set({ anim: { ...anim, ...p } } as Partial<Overlay>);
  const kindLabel = { text: 'טקסט', symbol: 'סמל', emoji: 'אימוג׳י', shape: 'צורה', image: 'תמונה' }[o.kind];
  return (<>
    <div className="insp-title"><button className="btn ghost sm icon" onClick={() => selectOverlay(null)} title="חזרה לשקופית"><ChevronRight /></button><span className="ty">{kindLabel}</span><span className="sub">שכבה · גרירה בתצוגה המקדימה מזיזה, פינה משנה גודל, ידית עליונה מסובבת</span></div>
    <div className="insp-section">
      {o.kind === 'text' && <>
        <Field label="טקסט"><textarea className="he" rows={3} value={o.text} onChange={e => set({ text: e.target.value } as Partial<Overlay>)} /></Field>
        <Field label="גופן"><Seg value={o.font} options={[['display', 'פרנק־רוהל'], ['ui', 'היבו'], ['num', 'סואץ (מספרים)']]} onChange={v => set({ font: v } as Partial<Overlay>)} /></Field>
        <div className="field-row"><Range label="גודל" value={o.size} min={0.8} max={20} step={0.1} fmt={v => `${v.toFixed(1)}`} onChange={v => set({ size: v } as Partial<Overlay>)} /><Field label="משקל"><Seg value={String(o.weight)} options={[['300', 'דק'], ['400', 'רגיל'], ['500', 'בינוני'], ['700', 'מודגש']]} onChange={v => set({ weight: +v } as Partial<Overlay>)} /></Field></div>
        <Field label="צבע"><Swatches value={o.color} onChange={c => set({ color: c } as Partial<Overlay>)} /></Field>
        <Field label="יישור"><Seg value={o.align} options={[['right', 'ימין'], ['center', 'מרכז'], ['left', 'שמאל']]} onChange={v => set({ align: v } as Partial<Overlay>)} /></Field>
        <Field label="רקע"><Seg value={o.bg} options={[['none', 'ללא'], ['pill', 'גלולה'], ['bar', 'פס'], ['box', 'תיבה']]} onChange={v => set({ bg: v } as Partial<Overlay>)} /></Field>
        <div className="row wrap"><label className="chk"><input type="checkbox" checked={o.shadow} onChange={e => set({ shadow: e.target.checked } as Partial<Overlay>)} /> צל</label><label className="chk"><input type="checkbox" checked={o.accent} onChange={e => set({ accent: e.target.checked } as Partial<Overlay>)} /> צבע הדגשה של הערכה</label></div>
      </>}
      {o.kind === 'symbol' && <>
        <Field label="סמל"><div className="sym-grid" style={{ maxHeight: 150, overflow: 'auto' }}>{SYMBOLS.map(s => <button key={s.name} aria-pressed={s.name === o.name} title={s.label} style={s.name === o.name ? { borderColor: 'var(--accent)' } : undefined} dangerouslySetInnerHTML={{ __html: symbolSvg(s.name, '#f1d38a', 1.6) }} onClick={() => set({ name: s.name } as Partial<Overlay>)} />)}</div></Field>
        <Field label="צבע"><Swatches value={o.color} onChange={c => set({ color: c } as Partial<Overlay>)} /></Field>
        <div className="field-row"><Range label="עובי קו" value={o.stroke} min={0.5} max={4} step={0.1} fmt={v => v.toFixed(1)} onChange={v => set({ stroke: v } as Partial<Overlay>)} /><Field label="מילוי"><Seg value={o.fill ? 'y' : 'n'} options={[['n', 'קו'], ['y', 'מלא']]} onChange={v => set({ fill: v === 'y' } as Partial<Overlay>)} /></Field></div>
      </>}
      {o.kind === 'emoji' && <Field label="אימוג׳י"><div className="sym-grid" style={{ maxHeight: 170, overflow: 'auto' }}>{EMOJI.map(e => <button key={e.char} aria-pressed={e.char === o.char} title={e.label} style={e.char === o.char ? { borderColor: 'var(--accent)' } : undefined} onClick={() => set({ char: e.char } as Partial<Overlay>)}>{e.char}</button>)}</div></Field>}
      {o.kind === 'shape' && <>
        <Field label="צורה"><Seg value={o.shape} options={[['rect', 'מלבן'], ['circle', 'עיגול'], ['line', 'פס'], ['frame', 'מסגרת']]} onChange={v => set({ shape: v } as Partial<Overlay>)} /></Field>
        <Field label="צבע"><Swatches value={o.color} onChange={c => set({ color: c } as Partial<Overlay>)} /></Field>
        {o.shape !== 'line' && <Range label="גובה" value={o.h} min={0.2} max={100} step={0.5} fmt={v => `${v}%`} onChange={v => set({ h: v } as Partial<Overlay>)} />}
        {(o.shape === 'rect' || o.shape === 'frame') && <Range label="עיגול פינות" value={o.radius} min={0} max={50} fmt={v => `${v}%`} onChange={v => set({ radius: v } as Partial<Overlay>)} />}
        {(o.shape === 'line' || o.shape === 'frame') && <Range label="עובי" value={o.stroke} min={0.1} max={5} step={0.05} fmt={v => v.toFixed(2)} onChange={v => set({ stroke: v } as Partial<Overlay>)} />}
      </>}
      {o.kind === 'image' && <>
        <Field label="תמונה"><div className="row"><div className="asset-strip"><div className="mini">{assets[o.assetId] && <img src={assetThumb(assets[o.assetId])} alt="" />}</div></div><button className="btn sm" disabled={!libSel.some(i => assets[i]?.type === 'photo')} onClick={() => set({ assetId: libSel.find(i => assets[i]?.type === 'photo') } as Partial<Overlay>)}>החלף מהבחירה</button></div></Field>
        <Field label="מסכה"><Seg value={o.mask} options={[['none', 'ללא'], ['rounded', 'מעוגל'], ['circle', 'עיגול']]} onChange={v => set({ mask: v } as Partial<Overlay>)} /></Field>
        <Range label="גובה" value={o.h} min={2} max={100} step={0.5} fmt={v => `${v}%`} onChange={v => set({ h: v } as Partial<Overlay>)} />
        <div className="row wrap"><label className="chk"><input type="checkbox" checked={o.border} onChange={e => set({ border: e.target.checked } as Partial<Overlay>)} /> מסגרת צבע הדגשה של הערכה</label><Seg value={o.fit} options={[['cover', 'מילוי'], ['contain', 'הכל נראה']]} onChange={v => set({ fit: v } as Partial<Overlay>)} /></div>
      </>}
    </div>
    <div className="insp-section"><h4>מיקום וגודל</h4>
      <div className="field-row"><Range label="X" value={o.x} min={-50} max={150} step={0.5} fmt={v => `${v}%`} onChange={v => set({ x: v })} /><Range label="Y" value={o.y} min={-50} max={150} step={0.5} fmt={v => `${v}%`} onChange={v => set({ y: v })} /></div>
      <div className="field-row"><Range label="רוחב" value={o.w} min={2} max={100} step={0.5} fmt={v => `${v}%`} onChange={v => set({ w: v })} /><Range label="סיבוב" value={o.rotate} min={-180} max={180} fmt={v => `${v}°`} onChange={v => set({ rotate: v })} /></div>
      <Range label="שקיפות" value={o.opacity} min={0} max={1} step={0.05} fmt={v => `${Math.round(v * 100)}%`} onChange={v => set({ opacity: v })} />
      <div className="row wrap"><button className="btn sm" onClick={() => reorder(slideId, o.id, 1)}><ArrowUp /> קדימה</button><button className="btn sm" onClick={() => reorder(slideId, o.id, -1)}><ArrowDown /> אחורה</button><button className="btn sm ghost" onClick={() => set({ x: Math.round((100 - o.w) / 2 * 10) / 10 })}>מרכז אופקי</button><button className="btn sm ghost" onClick={() => set({ rotate: 0 })}>יישר</button></div>
    </div>
    <div className="insp-section"><h4>אנימציה</h4>
      <Field label="כניסה"><Seg value={anim.in} options={ANIM_IN} onChange={v => setAnim({ in: v })} /></Field>
      <div className="field-row"><Range label="השהיה" value={anim.delay} min={0} max={15} step={0.1} fmt={v => `${v.toFixed(1)}s`} onChange={v => setAnim({ delay: v })} /><Range label="משך" value={anim.duration} min={0.1} max={5} step={0.1} fmt={v => `${v.toFixed(1)}s`} onChange={v => setAnim({ duration: v })} /></div>
      <Field label="בלולאה"><Seg value={anim.loop} options={LOOPS} onChange={v => setAnim({ loop: v })} /></Field>
      <Field label="יציאה"><Seg value={anim.out} options={[['none', 'נשאר'], ['fade', 'נעלם לקראת הסוף']]} onChange={v => setAnim({ out: v })} /></Field>
      <div className="muted small">לחץ „נגן שוב” בתצוגה המקדימה כדי לראות את האנימציה</div>
    </div>
    <div className="insp-section"><div className="row wrap">
      <button className="btn sm" onClick={() => { const id = dup(slideId, o.id); if (id) selectOverlay(id); }}><Copy /> שכפל</button>
      <button className={`btn sm ${o.locked ? 'gold' : ''}`} onClick={() => set({ locked: !o.locked })}>{o.locked ? <Lock /> : <Unlock />} {o.locked ? 'נעול' : 'נעל מיקום'}</button>
      <button className="btn sm danger" onClick={() => { remove(slideId, o.id); selectOverlay(null); }}><Trash2 /> מחק</button>
    </div><div className="muted small" style={{ marginTop: 6 }}>חיצים מזיזים (Shift = 5%) · Ctrl+D שכפול · Delete מחיקה · Ctrl+] / Ctrl+[ סדר שכבות</div></div>
  </>);
}

/** Live, self-contained demos for the guide: real slides rendered by the show engine over generated demo photos. */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Play, RotateCcw, ArrowUpLeft } from 'lucide-react';
import { SlideView } from '@/show/SlideView';
import { buildSlide, animateSlide } from '@/show/slides';
import { runTransition, applyThemeAttr } from '@/show/engine';
import { TRANSITION_LABEL, TYPE_LABEL, COLLAGE_LAYOUTS, COLLAGE_LAYOUT_LABEL, layoutsFor, type Slide, type TransitionId, type CollageLayout, type Overlay, type Look, type Frame, type CaptionStyle, type KenBurns, type Chapter, type Settings } from '@shared/model';
import { THEMES, themeById } from '@shared/themes';
import { SYMBOLS, SYMBOL_GROUPS, EMOJI, symbolSvg } from '@shared/symbols';
import { demoCtx, demoPhoto, DEMO_SLIDES, DEMO_TEXT_OVERLAY, DEMO_DESIGNED, DEMO_PHOTOS, DEMO_CHAPTER } from './demoData';
import { guideSend, type GuideCmd } from './bridge';

/* ---------- small building blocks ---------- */
export function useVisible<T extends Element>(ref: React.RefObject<T | null>, margin = '120px') {
  const [v, setV] = useState(false);
  useEffect(() => { const el = ref.current; if (!el) return; const io = new IntersectionObserver(es => setV(es.some(e => e.isIntersecting)), { rootMargin: margin }); io.observe(el); return () => io.disconnect(); }, [ref, margin]);
  return v;
}
/** "Ctrl + S / Ctrl + Z" → key caps with separators; words other than the separators become caps. */
export function Keys({ k }: { k: string }) { return <span className="gd-keys">{k.split(' ').map((x, i) => x === '/' || x === '+' || x === 'או' ? <span key={i} className="gd-keysep">{x}</span> : <kbd key={i}>{x}</kbd>)}</span>; }
export function Tip({ kind = 'tip', title, children }: { kind?: 'tip' | 'warn' | 'note'; title?: string; children: ReactNode }) { return <div className={`gd-tip ${kind}`}>{title && <b>{title}</b>}<div>{children}</div></div>; }
export function Try({ cmd, children, primary }: { cmd: GuideCmd; children: ReactNode; primary?: boolean }) {
  const [state, setState] = useState<'idle' | 'sent' | 'opened'>('idle');
  return <button className={`btn sm ${primary ? 'primary' : 'gold'} gd-try`} onClick={async () => { const how = await guideSend(cmd); setState(how === 'editor' ? 'sent' : 'opened'); setTimeout(() => setState('idle'), 2200); }}><ArrowUpLeft />{state === 'idle' ? children : state === 'sent' ? 'בוצע בחלון העורך' : 'העורך נפתח בחלון חדש'}</button>;
}
export function Steps({ items }: { items: { t: ReactNode; d?: ReactNode; cmd?: GuideCmd; cmdLabel?: string }[] }) {
  return <ol className="gd-steps">{items.map((s, i) => <li key={i}><div className="n">{i + 1}</div><div className="b"><div className="t">{s.t}</div>{s.d && <div className="d">{s.d}</div>}{s.cmd && <div style={{ marginTop: 6 }}><Try cmd={s.cmd}>{s.cmdLabel ?? 'נסה בעורך'}</Try></div>}</div></li>)}</ol>;
}
export function KeyTable({ rows, title }: { rows: [string, ReactNode][]; title?: string }) {
  return <div className="gd-keytable">{title && <h4>{title}</h4>}<table><tbody>{rows.map(([k, d], i) => <tr key={i}><td><Keys k={k} /></td><td>{d}</td></tr>)}</tbody></table></div>;
}
export function Cards({ items, cols = 3 }: { items: { icon?: ReactNode; t: ReactNode; d: ReactNode }[]; cols?: number }) {
  return <div className="gd-cards" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{items.map((c, i) => <div key={i} className="gd-card">{c.icon && <div className="ic">{c.icon}</div>}<b>{c.t}</b><div>{c.d}</div></div>)}</div>;
}

/* ---------- a live slide ---------- */
export function Stage({ slide, theme, settings, chapter = DEMO_CHAPTER, label, sub, size = 'md', animate = true, children, onClick, className = '' }: { slide: Slide; theme?: string; settings?: Partial<Settings>; chapter?: Chapter; label?: ReactNode; sub?: ReactNode; size?: 'xs' | 'sm' | 'md' | 'lg' | 'fill'; animate?: boolean; children?: ReactNode; onClick?: () => void; className?: string }) {
  const ref = useRef<HTMLDivElement>(null); const visible = useVisible(ref); const [replay, setReplay] = useState(0);
  const ctx = useMemo(() => demoCtx(settings, chapter), [settings, chapter]);
  return (
    <figure className={`gd-fig ${size} ${className}`}>
      <div ref={ref} className="gd-stage" data-theme={theme ?? ctx.settings.theme} onClick={() => { setReplay(r => r + 1); onClick?.(); }} title="לחיצה מנגנת שוב">
        <SlideView slide={slide} ctx={ctx} animate={animate && visible} replayKey={replay} />
        {children}
        <span className="gd-replay"><RotateCcw /></span>
      </div>
      {(label || sub) && <figcaption>{label && <b>{label}</b>}{sub && <span>{sub}</span>}</figcaption>}
    </figure>
  );
}
export function Gallery({ items, size = 'sm' }: { items: { slide: Slide; label?: ReactNode; sub?: ReactNode; theme?: string; settings?: Partial<Settings> }[]; size?: 'xs' | 'sm' | 'md' }) {
  return <div className={`gd-gallery ${size}`}>{items.map((it, i) => <Stage key={i} size={size} {...it} />)}</div>;
}
function Chips<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return <div className="gd-chips">{options.map(([v, l]) => <button key={v} className="chip" aria-pressed={value === v} onClick={() => onChange(v)}>{l}</button>)}</div>;
}
function Slider({ label, value, min, max, step = 1, fmt, onChange }: { label: string; value: number; min: number; max: number; step?: number; fmt?: (v: number) => string; onChange: (v: number) => void }) {
  return <label className="gd-slider"><span>{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} /><b className="num">{fmt ? fmt(value) : value}</b></label>;
}

/* ---------- the twelve slide types ---------- */
const WHEN: Record<Slide['type'], string> = {
  intro: 'השקופית הראשונה: השם, המספר 80 וכותרת משנה. המוזיקה של הפרק מתחילה איתה.', chapter: 'כותרת פרק על תמונת רקע: שורת פתיח קטנה, כותרת ושורת תיאור. פותחת כל תקופה.', photo: 'תמונה אחת עם כיתוב ושנה, תנועת מצלמה ונקודת מוקד. אבן הבניין של המצגת.',
  'photo-pair': 'שתי תמונות זו לצד זו, כל אחת עם תגית. מצוין ל„אז והיום”.', collage: '2–6 תמונות בפריסה אחת, עם תמונה ראשית. שמונה פריסות לבחירה.', timeline: 'ציר שנים עם אבני דרך ותמונות קטנות. טוב כפתיח או כסיכום.',
  quote: 'משפט אחד גדול, מילה אחר מילה, ושם האומר.', video: 'סרטון ברכה: מנוגן במסגרת עם שם וקרבה; המוזיקה נחלשת מעצמה ועוצרת כשהוא נגמר.', 'video-wall': 'קיר של 2–9 ברכות (תמונות פוסטר ושמות) כפתיח לפרק הברכות.',
  names: 'עיגולי תמונה עם שמות: הילדים, הנכדים, החברים.', finale: 'סיום: פסיפס מכל תמונות המצגת, המספר 80, שורת סיום וקונפטי בצבעי הערכה.', black: 'מסך שחור שעוצר את המצגת עד לחיצה. למעבר לנאום או להפסקה.',
};
export function TypesGallery() {
  return <div className="gd-types">{(Object.keys(DEMO_SLIDES) as Slide['type'][]).map(t => <div key={t} className="gd-type"><Stage slide={DEMO_SLIDES[t]} size="sm" /><div className="gd-type-t"><b>{TYPE_LABEL[t]}</b><p>{WHEN[t]}</p></div></div>)}</div>;
}

/* ---------- transitions: a two-layer mini player ---------- */
const A: Slide = demoPhoto({ id: 'tr-a', caption: 'לפני המעבר', kenBurns: 'none' }, 4);
const B: Slide = demoPhoto({ id: 'tr-b', caption: 'אחרי המעבר', kenBurns: 'none' }, 5);
export function TransitionDemo() {
  const [t, setT] = useState<TransitionId>('fade'); const [auto, setAuto] = useState(true); const host = useRef<HTMLDivElement>(null); const visible = useVisible(host);
  const cur = useRef(0); const layers = useRef<[HTMLDivElement, HTMLDivElement] | null>(null); const ctx = useMemo(() => demoCtx(), []);
  const play = (trans: TransitionId) => {
    const h = host.current; if (!h) return;
    if (!layers.current) { const a = document.createElement('div'); a.className = 'layer'; const b = document.createElement('div'); b.className = 'layer'; h.append(a, b); layers.current = [a, b]; a.append(buildSlide(A, ctx)); }
    const [l0, l1] = layers.current; const inL = cur.current === 0 ? l1 : l0, outL = cur.current === 0 ? l0 : l1; cur.current = 1 - cur.current;
    const slide = cur.current === 0 ? A : B; inL.innerHTML = ''; const root = buildSlide(slide, ctx); inL.append(root); inL.style.zIndex = '2'; outL.style.zIndex = '1';
    const tl = animateSlide(root, slide, ctx, {}); tl.play(); runTransition(inL, outL, trans, .9);
  };
  useEffect(() => { if (!visible || !auto) return; play(t); const id = setInterval(() => play(t), 3200); return () => clearInterval(id); }, [t, auto, visible]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="gd-demo">
      <div className="gd-demo-ctl"><Chips value={t} options={Object.entries(TRANSITION_LABEL) as [TransitionId, string][]} onChange={v => { setT(v); setAuto(true); }} /><button className="btn sm" onClick={() => { setAuto(false); play(t); }}><Play /> נגן מעבר</button></div>
      <figure className="gd-fig lg"><div ref={host} className="gd-stage gd-player" data-theme="midnight-gold" /><figcaption><b>{TRANSITION_LABEL[t]}</b><span>{{ fade: 'הבסיס השקט. מתאים לכמעט הכול.', dip: 'דרך שחור קצר. טוב בין פרקים ולפני ברכה.', push: 'השקופית הבאה דוחפת את הקודמת. אנרגטי.', zoom: 'הנכנסת מתקרבת מעט תוך עמעום. חגיגי.', wipe: 'מחיקה מצד לצד. בולט, להשתמש במידה.', blur: 'הקודמת מתטשטשת, הבאה מתחדדת. חלומי.' }[t]}</span></figcaption></figure>
    </div>
  );
}

/* ---------- camera moves ---------- */
const KB_LABEL: Record<KenBurns, string> = { in: 'פנימה', out: 'החוצה', left: 'שמאלה', right: 'ימינה', up: 'למעלה', down: 'למטה', none: 'ללא' };
export function KenBurnsDemo() {
  return <Gallery size="xs" items={(['in', 'out', 'left', 'right', 'up', 'down', 'none'] as KenBurns[]).map(k => ({ slide: demoPhoto({ id: 'kb-' + k, kenBurns: k, caption: '', year: undefined, seconds: 5 }, 1), label: KB_LABEL[k] }))} />;
}

/* ---------- overlay animation playground ---------- */
const IN: [NonNullable<Overlay['anim']>['in'], string][] = [['fade', 'עמעום'], ['rise', 'עלייה'], ['drop', 'ירידה'], ['zoom', 'זום'], ['pop', 'קפיצה'], ['slide-right', 'מימין'], ['slide-left', 'משמאל'], ['typewriter', 'מילה־מילה'], ['letters', 'אות־אות'], ['none', 'ללא']];
const LOOP: [NonNullable<Overlay['anim']>['loop'], string][] = [['none', 'ללא'], ['pulse', 'פעימה'], ['float', 'ריחוף'], ['spin', 'סיבוב'], ['shimmer', 'נצנוץ']];
export function AnimDemo() {
  const [inn, setIn] = useState<NonNullable<Overlay['anim']>['in']>('pop'); const [loop, setLoop] = useState<NonNullable<Overlay['anim']>['loop']>('none'); const [out, setOut] = useState<'none' | 'fade'>('none'); const [text, setText] = useState('מזל טוב!'); const [bg, setBg] = useState<'none' | 'pill' | 'bar' | 'box'>('none');
  const slide = useMemo<Slide>(() => demoPhoto({ id: 'anim-demo', caption: '', year: undefined, kenBurns: 'none', seconds: 6, overlays: [{ ...(DEMO_TEXT_OVERLAY as Extract<Overlay, { kind: 'text' }>), text, bg, shadow: bg === 'none', anim: { in: inn, delay: .4, duration: inn === 'typewriter' || inn === 'letters' ? 1.8 : .9, loop, out } } as Overlay] }, 7), [inn, loop, out, text, bg]);
  return (
    <div className="gd-demo">
      <div className="gd-demo-ctl col">
        <div className="row wrap" style={{ gap: 8 }}><span className="gd-lab">כניסה</span><Chips value={inn} options={IN} onChange={setIn} /></div>
        <div className="row wrap" style={{ gap: 8 }}><span className="gd-lab">בלולאה</span><Chips value={loop} options={LOOP} onChange={setLoop} /><span className="gd-lab">יציאה</span><Chips value={out} options={[['none', 'נשאר'], ['fade', 'נעלם לקראת הסוף']]} onChange={setOut} /></div>
        <div className="row wrap" style={{ gap: 8 }}><span className="gd-lab">רקע</span><Chips value={bg} options={[['none', 'ללא'], ['pill', 'גלולה'], ['bar', 'פס'], ['box', 'תיבה']]} onChange={setBg} /><span className="gd-lab">טקסט</span><input className="he" value={text} onChange={e => setText(e.target.value)} style={{ width: 180 }} /></div>
      </div>
      <Stage slide={slide} size="lg" label="כך זה נראה במצגת" sub="לחיצה על התמונה מנגנת שוב · אותם שמות מופיעים בחלונית „אנימציה” של השכבה" />
    </div>
  );
}

/* ---------- look / frame / caption ---------- */
const DEF_LOOK: Look = { filter: 'none', vignette: .5, brightness: 100, contrast: 100, saturation: 100 };
export function LookDemo() {
  const [look, setLook] = useState<Look>(DEF_LOOK); const u = (p: Partial<Look>) => setLook(l => ({ ...l, ...p }));
  const slide = useMemo(() => demoPhoto({ id: 'look-demo', look, caption: 'חופשה בים', kenBurns: 'none' }, 5), [look]);
  return (
    <div className="gd-demo side">
      <div className="gd-demo-ctl col">
        <div className="row wrap" style={{ gap: 6 }}><span className="gd-lab">פילטר</span><Chips value={look.filter} options={[['none', 'ללא'], ['bw', 'שחור־לבן'], ['sepia', 'ספיה'], ['warm', 'חם'], ['cool', 'קר'], ['faded', 'דהוי'], ['vivid', 'חי']]} onChange={v => u({ filter: v })} /></div>
        <Slider label="בהירות" value={look.brightness} min={50} max={150} fmt={v => `${v}%`} onChange={v => u({ brightness: v })} />
        <Slider label="ניגודיות" value={look.contrast} min={50} max={150} fmt={v => `${v}%`} onChange={v => u({ contrast: v })} />
        <Slider label="רוויה" value={look.saturation} min={0} max={200} fmt={v => `${v}%`} onChange={v => u({ saturation: v })} />
        <Slider label="וינייטה" value={look.vignette} min={0} max={1} step={.05} fmt={v => `${Math.round(v * 100)}%`} onChange={v => u({ vignette: v })} />
        <div className="row wrap" style={{ gap: 6 }}><span className="gd-lab">מהירים</span>{([['נקי', { filter: 'none', vignette: .3, brightness: 100, contrast: 100, saturation: 100 }], ['ארכיון', { filter: 'sepia', vignette: .75, contrast: 95, saturation: 100, brightness: 102 }], ['קולנועי', { filter: 'cool', vignette: .85, contrast: 112, saturation: 85, brightness: 98 }], ['שחור־לבן', { filter: 'bw', vignette: .6, contrast: 110, brightness: 100, saturation: 100 }], ['חם', { filter: 'warm', vignette: .5, contrast: 104, saturation: 110, brightness: 103 }], ['דהוי', { filter: 'faded', vignette: .4, contrast: 100, saturation: 100, brightness: 100 }]] as [string, Look][]).map(([l, p]) => <button key={l} className="chip" onClick={() => setLook(p)}>{l}</button>)}<button className="chip" onClick={() => setLook(DEF_LOOK)}>איפוס</button></div>
      </div>
      <Stage slide={slide} size="md" label="מראה" sub="אותם מחוונים בדיוק נמצאים במפקח, בחלונית „מראה”" />
    </div>
  );
}
const DEF_FRAME: Frame = { zoom: 1, rotate: 0, flipH: false, kenBurnsAmount: 1 };
export function FrameDemo() {
  const [f, setF] = useState<Frame>(DEF_FRAME); const u = (p: Partial<Frame>) => setF(x => ({ ...x, ...p }));
  const slide = useMemo(() => demoPhoto({ id: 'frame-demo', frame: f, caption: 'הבית הראשון', kenBurns: 'in', focal: [40, 50] }, 4), [f]);
  return (
    <div className="gd-demo side">
      <div className="gd-demo-ctl col">
        <Slider label="זום (סביב נקודת המוקד)" value={f.zoom} min={1} max={3} step={.05} fmt={v => `×${v.toFixed(2)}`} onChange={v => u({ zoom: v })} />
        <Slider label="עוצמת תנועת המצלמה" value={f.kenBurnsAmount} min={0} max={2} step={.1} fmt={v => v === 0 ? 'ללא' : `×${v.toFixed(1)}`} onChange={v => u({ kenBurnsAmount: v })} />
        <Slider label="סיבוב" value={f.rotate} min={-15} max={15} step={.5} fmt={v => `${v}°`} onChange={v => u({ rotate: v })} />
        <div className="row" style={{ gap: 8 }}><span className="gd-lab">מראה</span><button className="chip" aria-pressed={f.flipH} onClick={() => u({ flipH: !f.flipH })}>הפוך אופקית</button><button className="chip" onClick={() => setF(DEF_FRAME)}>איפוס</button></div>
        <Tip kind="note">זום גדול מתקרב אל נקודת המוקד שסימנת בלחיצה על התמונה. „הפוך אופקית” מתקן תמונות שנסרקו הפוך.</Tip>
      </div>
      <Stage slide={slide} size="md" label="מסגרת וחיתוך" />
    </div>
  );
}
const DEF_CAP: CaptionStyle = { anim: 'rise', size: 1, position: 'bottom', align: 'right', font: 'display', box: false };
export function CaptionDemo() {
  const [c, setC] = useState<CaptionStyle>(DEF_CAP); const u = (p: Partial<CaptionStyle>) => setC(x => ({ ...x, ...p }));
  const slide = useMemo(() => demoPhoto({ id: 'cap-demo', captionStyle: c, caption: 'יום החתונה, תל אביב', year: 1966, kenBurns: 'none' }, 3), [c]);
  return (
    <div className="gd-demo side">
      <div className="gd-demo-ctl col">
        <div className="row wrap" style={{ gap: 6 }}><span className="gd-lab">אנימציה</span><Chips value={c.anim} options={[['rise', 'עלייה'], ['fade', 'עמעום'], ['words', 'מילה־מילה'], ['letters', 'אות־אות'], ['none', 'ללא']]} onChange={v => u({ anim: v })} /></div>
        <div className="row wrap" style={{ gap: 6 }}><span className="gd-lab">מיקום</span><Chips value={c.position} options={[['bottom', 'למטה'], ['top', 'למעלה'], ['center', 'מרכז']]} onChange={v => u({ position: v })} /><span className="gd-lab">יישור</span><Chips value={c.align} options={[['right', 'ימין'], ['center', 'מרכז'], ['left', 'שמאל']]} onChange={v => u({ align: v })} /></div>
        <div className="row wrap" style={{ gap: 6 }}><span className="gd-lab">גופן</span><Chips value={c.font} options={[['display', 'פרנק־רוהל'], ['ui', 'היבו'], ['num', 'סואץ (מספרים)']]} onChange={v => u({ font: v })} /><button className="chip" aria-pressed={c.box} onClick={() => u({ box: !c.box })}>תיבה כהה</button></div>
        <Slider label="גודל" value={c.size} min={.5} max={2.5} step={.1} fmt={v => `×${v.toFixed(1)}`} onChange={v => u({ size: v })} />
      </div>
      <Stage slide={slide} size="md" label="סגנון הכיתוב" sub="השנה והקו הקצר מגיעים מהשדה „שנה” של השקופית" />
    </div>
  );
}

/* ---------- collage layouts ---------- */
export function LayoutDemo() {
  const ids = DEMO_PHOTOS.map(p => p.id);
  const count: Record<CollageLayout, number> = { 'hero-right': 3, 'hero-left': 3, 'two-up': 2, triptych: 3, 'one-plus-three': 4, 'four-grid': 4, filmstrip: 4, 'mosaic-6': 6 };
  return <Gallery size="sm" items={COLLAGE_LAYOUTS.map((l, i) => ({ slide: { id: 'lay-' + l, type: 'collage', assetIds: ids.slice(i % 3, i % 3 + count[l]), caption: '', layout: l, seconds: 9 } as Slide, label: COLLAGE_LAYOUT_LABEL[l], sub: `${count[l]} תמונות · מתאים ל־${layoutsFor(count[l]).length === 1 ? 'מספר זה בלבד' : [2, 3, 4, 5, 6].filter(n => layoutsFor(n).includes(l)).join('/') + ' תמונות'}` }))} />;
}

/* ---------- themes with the live cross-fade ---------- */
export function ThemeDemo() {
  const [theme, setTheme] = useState('midnight-gold'); const ref = useRef<HTMLDivElement>(null); const ctx = useMemo(() => demoCtx(), []);
  const pick = (id: string) => { setTheme(id); const el = ref.current?.querySelector<HTMLElement>('.gd-stage'); if (el) applyThemeAttr(el, id); };
  const slide = DEMO_DESIGNED;
  return (
    <div className="gd-demo" ref={ref}>
      <div className="gd-theme-chips">{THEMES.map(t => <button key={t.id} className="gd-theme-chip" aria-pressed={theme === t.id} onClick={() => pick(t.id)} style={{ background: t.bg1, color: t.fg, borderColor: theme === t.id ? t.accent : 'transparent' }}><i style={{ background: t.accent }} />{t.name}</button>)}</div>
      <figure className="gd-fig lg"><div className="gd-stage" data-theme={theme}><SlideView slide={slide} ctx={ctx} animate /></div><figcaption><b>{themeById(theme).name}</b><span>{themeById(theme).description} · הטקסט, הסמל והמסגרת בצבע „לפי הערכה” ולכן מתחלפים יחד איתה</span></figcaption></figure>
      <Gallery size="xs" items={THEMES.map(t => ({ slide: DEMO_SLIDES.intro, theme: t.id, label: t.name }))} />
    </div>
  );
}

/* ---------- symbols ---------- */
export function SymbolsDemo() {
  return <div className="gd-symbols">{SYMBOL_GROUPS.map(g => <div key={g} className="gd-symgroup"><b>{g}</b><div className="gd-symrow">{SYMBOLS.filter(s => s.group === g).slice(0, 10).map(s => <span key={s.name} title={s.label} dangerouslySetInnerHTML={{ __html: symbolSvg(s.name, 'currentColor', 1.6) }} />)}</div></div>)}<div className="gd-symgroup"><b>אימוג׳י</b><div className="gd-symrow emoji">{EMOJI.slice(0, 16).map(e => <span key={e.char} title={e.label}>{e.char}</span>)}</div></div></div>;
}

/* ---------- audio diagram ---------- */
export function AudioDiagram() {
  return (
    <svg className="gd-audio" viewBox="0 0 760 170" role="img" aria-label="עוצמת המוזיקה לאורך פרק: מתחילה ב־crossfade, נחלשת בזמן ברכה, וחוזרת">
      <defs><linearGradient id="gm" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style={{ stopColor: 'var(--accent)', stopOpacity: .35 }} /><stop offset="1" style={{ stopColor: 'var(--accent)', stopOpacity: .03 }} /></linearGradient></defs>
      <rect x="0.5" y="0.5" width="759" height="169" rx="10" style={{ fill: 'var(--panel)', stroke: 'var(--line-2)' }} />
      <text x="750" y="22" textAnchor="end" style={{ fill: 'var(--fg-3)' }} fontSize="12" direction="rtl">פרק אחד · המוזיקה (כחול) והברכה (סגול)</text>
      <path d="M20 120 C60 120 70 60 110 60 L300 60 C320 60 325 112 345 112 L450 112 C470 112 475 60 495 60 L680 60 C710 60 720 125 740 125" fill="url(#gm)" style={{ stroke: 'var(--accent)' }} strokeWidth="2.5" />
      <rect x="345" y="78" width="105" height="48" rx="6" style={{ fill: 'var(--violet)' }} opacity=".92" /><text x="397" y="106" textAnchor="middle" fill="#ffffff" fontSize="13" direction="rtl">ברכה של נועה</text>
      <text x="70" y="140" textAnchor="middle" style={{ fill: 'var(--fg-2)' }} fontSize="12" direction="rtl">crossfade כניסה</text>
      <text x="397" y="150" textAnchor="middle" style={{ fill: 'var(--fg-2)' }} fontSize="12" direction="rtl">המוזיקה נחלשת ל־10% (ducking)</text>
      <text x="710" y="150" textAnchor="middle" style={{ fill: 'var(--fg-2)' }} fontSize="12" direction="rtl">מעבר לפרק הבא</text>
      <text x="200" y="50" textAnchor="middle" style={{ fill: 'var(--accent-2)' }} fontSize="12" fontWeight="600" direction="rtl">עוצמה 70%</text>
      <line x1="20" y1="128" x2="740" y2="128" style={{ stroke: 'var(--line-2)' }} />
      <rect className="gd-playhead" x="20" y="30" width="2" height="100" style={{ fill: 'var(--fg)' }} opacity=".7" />
    </svg>
  );
}

/* ---------- the designed example for the editing chapter ---------- */
export function DesignedExample() { return <Stage slide={DEMO_DESIGNED} size="lg" label="שקופית אחת, חמש שכבות" sub="מסגרת (צורה) · כותרת על פס · שנה בגופן המספרים · לב פועם (סמל) · תמונה קטנה (מדבקה). כולן ניתנות לגרירה, סיבוב ושינוי גודל." />; }

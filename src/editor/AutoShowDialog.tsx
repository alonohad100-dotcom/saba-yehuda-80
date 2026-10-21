import { useEffect, useMemo, useState } from 'react';
import { X, Sparkles, ChevronLeft, ChevronRight, RefreshCw, Check, AlertTriangle, FolderOpen } from 'lucide-react';
import { useShow, saveNow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { api } from '@/api';
import { toast } from '@/store/toast';
import { SlideView } from '@/show/SlideView';
import { generate } from '@shared/autoshow/generate';
import { buildPool, dirTree, type DirNode } from '@shared/autoshow/pool';
import { DEFAULT_OPTIONS, type AutoOptions, type GenOutput } from '@shared/autoshow/types';
import { assetThumb, fmtTime, TYPE_LABEL, COLLAGE_LAYOUT_LABEL, type CollageLayout } from '@shared/model';

const KV = 'autoshow-options';
const REASON: Record<string, string> = { dup: 'כפילות', burst: 'צילום רצף', quality: 'איכות נמוכה', locked: 'בשימוש בשקופית נעולה' };

export function AutoShowDialog({ onClose, fillChapterId }: { onClose: () => void; fillChapterId?: string }) {
  const show = useShow(s => s.show)!; const apply = useShow(s => s.applyGeneration); const { assets, list } = useLibrary();
  const [step, setStep] = useState(1); const [o, setO] = useState<AutoOptions>({ ...DEFAULT_OPTIONS, personName: show.meta.title.replace(/\s*80\s*$/, '').replace(/^סבא\s*/, '') || 'יהודה' });
  const [result, setResult] = useState<GenOutput | null>(null); const [mode, setMode] = useState<'replace' | 'append' | 'fill'>(fillChapterId ? 'fill' : 'replace'); const [afterId, setAfterId] = useState(show.chapters[show.chapters.length - 1]?.id ?? ''); const [busy, setBusy] = useState(false);
  const fillChapter = fillChapterId ? show.chapters.find(c => c.id === fillChapterId) : undefined;
  useEffect(() => { void api.kvGet<Partial<AutoOptions>>(KV).then(saved => { if (saved) setO(prev => ({ ...prev, ...saved, seed: prev.seed })); }).catch(() => {}); }, []);
  const set = (patch: Partial<AutoOptions>) => { setO(prev => ({ ...prev, ...patch })); setResult(null); };
  const tree = useMemo(() => dirTree(list), [list]);
  const pool = useMemo(() => buildPool(list, o, new Set()), [list, o]);
  const years = useMemo(() => { const m = new Map<number, number>(); for (const a of list) if (a.type === 'photo' && a.status === 'ready' && a.year) m.set(a.year, (m.get(a.year) ?? 0) + 1); return [...m.entries()].sort((a, b) => a[0] - b[0]); }, [list]);
  const yMin = years[0]?.[0] ?? 1946, yMax = years[years.length - 1]?.[0] ?? 2026, yPeak = Math.max(1, ...years.map(y => y[1]));
  const run = (seed = o.seed) => { const r = generate({ assets: list, options: { ...o, seed }, settings: show.settings, meta: show.meta, existing: show, mode: fillChapterId ? 'fill' : 'replace', fillChapterId }); setResult(r); setO(prev => ({ ...prev, seed })); return r; };
  const estimate = useMemo(() => { try { const r = generate({ assets: list, options: o, settings: show.settings, meta: show.meta, existing: show, mode: fillChapterId ? 'fill' : 'replace', fillChapterId }); const slides = r.show.chapters.reduce((n, c) => n + c.slides.length, 0); return { slides, chapters: r.show.chapters.length, seconds: r.report.estimatedSeconds, collages: Object.values(r.report.layoutsUsed).reduce((a, b) => a + b, 0) }; } catch { return null; } }, [list, o, show, fillChapterId]);
  const next = () => { if (step === 2) run(); setStep(s => Math.min(4, s + 1)); };
  const doApply = async () => {
    const r = result ?? run(); setBusy(true);
    try { await saveNow('לפני יצירה אוטומטית'); apply(r.show, mode, { afterChapterId: afterId, fillChapterId }); void api.kvSet(KV, { ...o, seed: undefined }).catch(() => {}); toast(mode === 'fill' ? `הפרק „${fillChapter?.title}” מולא אוטומטית · Ctrl+Z לביטול` : `נוצרה מצגת: ${r.show.chapters.length} פרקים · ${fmtTime(r.report.estimatedSeconds)} · Ctrl+Z לביטול`, 'ok'); onClose(); }
    catch (e) { toast('היצירה נכשלה: ' + (e as Error).message, 'error'); } finally { setBusy(false); }
  };
  /** Everything under `nodes` except the branch `p`, expressed as the smallest list of folder paths. */
  const except = (nodes: DirNode[], p: string): string[] => nodes.flatMap(n => n.path === p ? [] : p.startsWith(n.path + '/') ? except(n.children, p) : [n.path]);
  const toggleFolder = (p: string, on: boolean) => {
    // an empty list means "all folders": unchecking one must first spell the list out, otherwise the click has no effect
    const current = o.folders.length ? o.folders : tree.children.map(c => c.path);
    const cur = current.flatMap(f => f === p ? [] : p.startsWith(f + '/') ? except(tree.children.find(c => c.path === f.split('/')[0])?.path === f ? tree.children.filter(c => c.path === f) : (function find(ns: DirNode[]): DirNode[] { for (const n of ns) { if (n.path === f) return [n]; const d = find(n.children); if (d.length) return d; } return []; })(tree.children), p) : f.startsWith(p + '/') ? [] : [f]);
    const next = on ? [...cur, p] : cur;
    set({ folders: next.length === tree.children.length && tree.children.every(c => next.includes(c.path)) ? [] : next });
  };
  const folderOn = (p: string) => !o.folders.length || o.folders.some(f => f === p || p.startsWith(f + '/'));
  const ctx = (c?: typeof show.chapters[number]) => ({ assets, settings: show.settings, chapter: c, showPhotoIds: result?.report.usedPhotoIds });
  const stepsLabels = fillChapterId ? ['מקור', 'צורה', 'תצוגה מקדימה', 'מילוי'] : ['מקור', 'צורה', 'תצוגה מקדימה', 'החלה'];

  return (<>
    <div className="wiz-backdrop" style={{ position: 'fixed', inset: 0, zIndex: 59, backdropFilter: 'blur(3px)' }} onClick={onClose} />
    <dialog open className="wiz" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="dlg-h"><Sparkles /><h2>{fillChapterId ? `מילוי אוטומטי של „${fillChapter?.title}”` : 'יצירת מצגת אוטומטית'}</h2>
        <div className="wiz-steps">{stepsLabels.map((l, i) => <button key={l} className={step === i + 1 ? 'cur' : step > i + 1 ? 'done' : ''} onClick={() => { if (i + 1 <= step || result) setStep(i + 1); }}><span className="n">{i + 1}</span>{l}</button>)}</div>
        <button className="btn ghost icon x" onClick={onClose}><X /></button></div>
      <div className="dlg-b wiz-b">
        {step === 1 && <div className="wiz-cols">
          <div>
            <h4>תיקיות</h4>
            <div className="tree">{tree.children.length ? <TreeRow node={tree} depth={0} on={folderOn} toggle={toggleFolder} /> : <div className="empty" style={{ padding: 16 }}><div className="ic"><FolderOpen /></div><b>אין עדיין תמונות בספרייה</b><div>הניחו תמונות ב־media/photos וסרקו („ספרייה” בסרגל העליון). התיקיות יופיעו כאן.</div></div>}</div>
            <div className="row" style={{ marginTop: 8 }}><button className="btn sm ghost" onClick={() => set({ folders: [] })}>כל התיקיות</button><span className="muted small">סימון תיקייה כולל את תתי־התיקיות שלה</span></div>
          </div>
          <div>
            <h4>שנים</h4>
            <div className="hist">{years.map(([y, n]) => { const on = (o.yearFrom == null || y >= o.yearFrom) && (o.yearTo == null || y <= o.yearTo); return <div key={y} className={on ? 'on' : ''} style={{ height: `${Math.max(4, n / yPeak * 100)}%` }} title={`${y}: ${n}`} />; })}</div>
            <div className="field-row"><div className="field"><label>משנה</label><input type="number" value={o.yearFrom ?? ''} placeholder={String(yMin)} onChange={e => set({ yearFrom: e.target.value ? +e.target.value : undefined })} /></div><div className="field"><label>עד שנה</label><input type="number" value={o.yearTo ?? ''} placeholder={String(yMax)} onChange={e => set({ yearTo: e.target.value ? +e.target.value : undefined })} /></div></div>
            <h4>כלול</h4>
            <label className="chk"><input type="checkbox" checked={o.includeGreetings} onChange={e => set({ includeGreetings: e.target.checked })} /> סרטוני ברכה ({list.filter(a => a.type === 'video' && a.relPath.startsWith('videos/greetings/')).length})</label>
            <label className="chk"><input type="checkbox" checked={o.includeClips} onChange={e => set({ includeClips: e.target.checked })} /> קליפים קצרים מתוך תיקיות התמונות (פחות מ־20 שניות)</label>
            <label className="chk"><input type="checkbox" checked={o.dropLowQuality} onChange={e => set({ dropLowQuality: e.target.checked })} /> דלג על תמונות באיכות נמוכה (מטושטשות / חשוכות)</label>
            <div className="poolbox"><div className="stat"><div className="v">{pool.photosTotal}</div><div className="l">תמונות במקור</div></div><div className="stat"><div className="v" style={{ color: 'var(--accent-2)' }}>{pool.photos.length}</div><div className="l">אחרי כפילויות ואיכות</div></div><div className="stat"><div className="v">{pool.greetings.length + pool.clips.length}</div><div className="l">סרטונים</div></div><div className="stat"><div className="v">{pool.music.length}</div><div className="l">קטעי מוזיקה</div></div></div>
            <div className="muted small">הוסרו: {pool.dropped.filter(d => d.reason === 'dup').length} כפילויות · {pool.dropped.filter(d => d.reason === 'burst').length} צילומי רצף · {pool.dropped.filter(d => d.reason === 'quality').length} באיכות נמוכה{pool.dropped.some(d => d.reason === 'locked') ? ` · ${pool.dropped.filter(d => d.reason === 'locked').length} בשימוש בשקופיות נעולות/ידניות` : ''}</div>
          </div>
        </div>}
        {step === 2 && <div className="wiz-cols">
          <div>
            <div className="field"><label><span>אורך יעד</span><b>{o.targetMinutes} דק׳</b></label><input type="range" min={5} max={45} step={1} value={o.targetMinutes} onChange={e => set({ targetMinutes: +e.target.value })} /></div>
            <div className="field"><label>קצב</label><div className="seg full">{([['calm', 'רגוע · 7 ש׳'], ['normal', 'רגיל · 6 ש׳'], ['dynamic', 'דינמי · 4.5 ש׳']] as const).map(([v, l]) => <button key={v} aria-pressed={o.pacing === v} onClick={() => set({ pacing: v })}>{l}</button>)}</div></div>
            {!fillChapterId && <div className="field"><label>פרקים</label><div className="seg full">{([['auto', 'אוטומטי (אירועים + עשורים)'], ['folder', 'לפי תיקייה'], ['decade', 'לפי עשור']] as const).map(([v, l]) => <button key={v} aria-pressed={o.chapterMode === v} onClick={() => set({ chapterMode: v })}>{l}</button>)}</div></div>}
            <div className="field"><label>קולאז׳ים</label><div className="seg full">{([['none', 'בלי'], ['some', 'קצת'], ['many', 'הרבה']] as const).map(([v, l]) => <button key={v} aria-pressed={o.collageDensity === v} onClick={() => set({ collageDensity: v })}>{l}</button>)}</div></div>
            <label className="chk"><input type="checkbox" checked={o.pairs} onChange={e => set({ pairs: e.target.checked })} /> זוגות תמונות ו„אז · והיום”</label>
            {!fillChapterId && <><label className="chk"><input type="checkbox" checked={o.timeline} onChange={e => set({ timeline: e.target.checked })} /> שקופית ציר זמן בפתיחה</label>
              <label className="chk"><input type="checkbox" checked={o.names} onChange={e => set({ names: e.target.checked })} /> שקופית שמות מתמונות עם פנים (דורש מודל פנים)</label></>}
            <label className="chk"><input type="checkbox" checked={o.quotes} onChange={e => set({ quotes: e.target.checked })} /> שקופיות ציטוט לעריכה (אחת לפרק)</label>
          </div>
          <div>
            {!fillChapterId && <>
              <div className="field"><label>ברכות</label><div className="seg full"><button aria-pressed={o.greetingsMode === 'chapter'} onClick={() => set({ greetingsMode: 'chapter' })}>פרק ברכות + קיר</button><button aria-pressed={o.greetingsMode === 'interleave'} onClick={() => set({ greetingsMode: 'interleave' })}>לשלב בין הפרקים</button></div></div>
              {o.greetingsMode === 'chapter' ? <div className="field"><label>מיקום פרק הברכות</label><div className="seg full"><button aria-pressed={o.greetingsPosition === 'beforeFinale'} onClick={() => set({ greetingsPosition: 'beforeFinale' })}>לפני הסיום</button><button aria-pressed={o.greetingsPosition === 'afterIntro'} onClick={() => set({ greetingsPosition: 'afterIntro' })}>אחרי הפתיחה</button></div></div>
                : <div className="field"><label><span>ברכה כל</span><b>{o.greetingsEveryMin} דק׳</b></label><input type="range" min={1} max={10} step={.5} value={o.greetingsEveryMin} onChange={e => set({ greetingsEveryMin: +e.target.value })} /></div>}
            </>}
            <div className="field"><label>מוזיקה</label><div className="seg full"><button aria-pressed={o.musicMode === 'roundRobin'} onClick={() => set({ musicMode: 'roundRobin' })}>קטע שונה לכל פרק</button><button aria-pressed={o.musicMode === 'single'} onClick={() => set({ musicMode: 'single' })}>קטע אחד</button><button aria-pressed={o.musicMode === 'none'} onClick={() => set({ musicMode: 'none' })}>בלי</button></div></div>
            {o.musicMode === 'single' && <div className="field"><label>הקטע</label><select value={o.musicId ?? ''} onChange={e => set({ musicId: e.target.value || undefined })}><option value="">הארוך ביותר</option>{pool.music.map(m => <option key={m.id} value={m.id}>{m.name.replace(/\.[^.]+$/, '')} · {fmtTime(m.duration ?? 0)}</option>)}</select></div>}
            {o.musicMode === 'roundRobin' && <label className="chk"><input type="checkbox" checked={o.preferLongTrack} onChange={e => set({ preferLongTrack: e.target.checked })} /> העדף קטע ארוך לפחות כמו הפרק</label>}
            {!fillChapterId && <><h4 style={{ marginTop: 10 }}>פרטי הסיפור (לציר הזמן ולפתיחה)</h4>
              <div className="field-row"><div className="field"><label>שם</label><input className="he" value={o.personName} onChange={e => set({ personName: e.target.value })} /></div><div className="field"><label>שנת לידה</label><input type="number" value={o.birthYear ?? ''} onChange={e => set({ birthYear: e.target.value ? +e.target.value : undefined })} /></div><div className="field"><label>שנת חתונה</label><input type="number" value={o.weddingYear ?? ''} onChange={e => set({ weddingYear: e.target.value ? +e.target.value : undefined })} /></div></div></>}
            {estimate && <div className="poolbox"><div className="stat"><div className="v">{fmtTime(estimate.seconds)}</div><div className="l">משך משוער</div></div><div className="stat"><div className="v">{estimate.slides}</div><div className="l">שקופיות</div></div><div className="stat"><div className="v">{estimate.chapters}</div><div className="l">פרקים</div></div><div className="stat"><div className="v">{estimate.collages}</div><div className="l">קולאז׳ים</div></div></div>}
          </div>
        </div>}
        {step === 3 && result && <div>
          <div className="row wrap" style={{ marginBottom: 10 }}>
            <span className="pill gold">{fmtTime(result.report.estimatedSeconds)} / יעד {fmtTime(result.report.targetSeconds)}</span>
            <span className="pill">{result.show.chapters.length} פרקים · {result.show.chapters.reduce((n, c) => n + c.slides.length, 0)} שקופיות</span>
            <span className="pill">{result.report.usedPhotoIds.length} תמונות בשימוש · {result.report.unusedPhotoIds.length} לא בשימוש</span>
            <span className="pill">פריסות: {Object.entries(result.report.layoutsUsed).map(([l, n]) => `${COLLAGE_LAYOUT_LABEL[l as CollageLayout]} ×${n}`).join(' · ') || '—'}</span>
            <span className="grow" />
            <button className="btn sm" onClick={() => run(o.seed + 1)}><RefreshCw /> צור מחדש (גרסה {o.seed})</button>
          </div>
          {result.report.warnings.length > 0 && <div className="checks" style={{ marginBottom: 10 }}>{result.report.warnings.map((w, i) => <div key={i} className="check warn" style={{ cursor: 'default' }}><AlertTriangle />{w}</div>)}</div>}
          <h4>עמודים ראשונים</h4>
          <div className="strip">{result.show.chapters.flatMap(c => c.slides.map(s => ({ s, c }))).filter(x => !['black'].includes(x.s.type)).slice(0, 14).map(({ s, c }) => <div key={s.id} className="strip-item"><div className="stage" style={{ width: 176, height: 99 }}><SlideView slide={s} ctx={ctx(c)} animate={false} /></div><div className="muted small">{TYPE_LABEL[s.type]}{s.type === 'collage' && s.layout ? ` · ${COLLAGE_LAYOUT_LABEL[s.layout]}` : ''}</div></div>)}</div>
          <h4 style={{ marginTop: 12 }}>פרקים</h4>
          <div className="tbl"><table><thead><tr><th>פרק</th><th>שנים</th><th>תמונות (נבחרו / זמינות)</th><th>קולאז׳ים</th><th>משך</th><th>מוזיקה</th></tr></thead><tbody>
            {result.report.chapters.map(r => <tr key={r.id}><td>{r.title}{r.event && <span className="pill" style={{ marginInlineStart: 6 }}>אירוע</span>}</td><td className="num">{r.yearFrom}–{r.yearTo}</td><td className="num">{r.chosen} / {r.candidates}</td><td className="num">{r.collages}</td><td className="num">{fmtTime(r.seconds)}</td><td>{r.musicId ? assets[r.musicId]?.name.replace(/\.[^.]+$/, '') : '—'}</td></tr>)}
          </tbody></table></div>
          {result.report.dropped.length > 0 && <><h4 style={{ marginTop: 12 }}>לא נכללו ({result.report.dropped.length})</h4>
            <div className="drop-grid">{result.report.dropped.slice(0, 60).map(d => { const a = assets[d.id]; return a ? <div key={d.id} className="drop-item" title={`${a.name}\n${REASON[d.reason]}`}><img src={assetThumb(a)} alt="" /><span>{REASON[d.reason]}</span></div> : null; })}</div></>}
        </div>}
        {step === 4 && result && <div className="wiz-cols">
          <div>
            {fillChapterId ? <p>השקופיות האוטומטיות בפרק „{fillChapter?.title}” יוחלפו. שקופיות נעולות ושקופיות שנוצרו ידנית נשארות. השם, המוזיקה וההגדרות של הפרק נשמרים.</p> : <>
              <label className="radio"><input type="radio" checked={mode === 'replace'} onChange={() => setMode('replace')} /> <b>החלף את כל המצגת</b><span className="muted small">רק פרקים ושקופיות נעולים נשמרים במקומם; כל השאר מוחלף (הגרסה הקודמת נשמרת)</span></label>
              <label className="radio"><input type="radio" checked={mode === 'append'} onChange={() => setMode('append')} /> <b>הוסף את הפרקים שנוצרו אחרי פרק קיים</b>
                <select value={afterId} onChange={e => setAfterId(e.target.value)} disabled={mode !== 'append'} title={mode === 'append' ? 'אחרי איזה פרק להוסיף' : 'זמין כשבוחרים „הוסף את הפרקים”'} style={{ marginTop: 6 }}>{show.chapters.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            </>}
            <div className="note" style={{ marginTop: 12 }}>גרסה מסומנת „לפני יצירה אוטומטית” נשמרת קודם, ו־<kbd>Ctrl</kbd>+<kbd>Z</kbd> מבטל את כל היצירה בצעד אחד.</div>
          </div>
          <div className="poolbox"><div className="stat"><div className="v">{fmtTime(result.report.estimatedSeconds)}</div><div className="l">משך</div></div><div className="stat"><div className="v">{result.show.chapters.reduce((n, c) => n + c.slides.length, 0)}</div><div className="l">שקופיות</div></div><div className="stat"><div className="v">{result.report.pool.greetings}</div><div className="l">ברכות</div></div><div className="stat"><div className="v">{result.report.pool.dupRemoved + result.report.pool.burstRemoved}</div><div className="l">כפילויות שנמנעו</div></div></div>
        </div>}
      </div>
      <div className="dlg-f">
        <span className="muted small grow" style={{ textAlign: 'start' }}>{step === 1 ? 'בחר מאיפה לקחת תמונות' : step === 2 ? 'כוונן את צורת המצגת; ההערכה מתעדכנת מיד' : step === 3 ? 'לא מרוצה? „צור מחדש” מגריל סידור אחר מאותן תמונות' : ''}</span>
        {step > 1 && <button className="btn" onClick={() => setStep(s => s - 1)}><ChevronRight /> חזרה</button>}
        {step < 4 ? <button className="btn primary" disabled={!pool.photos.length} onClick={next}>{step === 2 ? 'צור תצוגה מקדימה' : 'המשך'} <ChevronLeft /></button>
          : <button className="btn primary" disabled={busy} onClick={doApply}><Check /> {fillChapterId ? 'מלא את הפרק' : mode === 'replace' ? 'החלף את המצגת' : 'הוסף פרקים'}</button>}
      </div>
    </dialog>
  </>);
}

function TreeRow({ node, depth, on, toggle }: { node: DirNode; depth: number; on: (p: string) => boolean; toggle: (p: string, v: boolean) => void }) {
  if (depth === 0) return <>{node.children.map(c => <TreeRow key={c.path} node={c} depth={1} on={on} toggle={toggle} />)}</>;
  const checked = on(node.path);
  return <div className="tree-node"><label style={{ paddingInlineStart: (depth - 1) * 16 }}><input type="checkbox" checked={checked} onChange={e => toggle(node.path, e.target.checked)} /><FolderOpen /><span className="nm">{node.name}</span><span className="muted small num">{node.photos ? `${node.photos} תמונות` : ''}{node.videos ? ` · ${node.videos} סרטונים` : ''}</span></label>{node.children.map(c => <TreeRow key={c.path} node={c} depth={depth + 1} on={on} toggle={toggle} />)}</div>;
}

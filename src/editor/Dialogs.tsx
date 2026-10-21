import { useEffect, useRef, useState } from 'react';
import { X, Play, RotateCcw, Tag, Settings, History, HardDriveDownload, HelpCircle, Sun, Moon, PackageCheck, FolderOpen, Usb, AlertTriangle, Film, Smartphone, Monitor } from 'lucide-react';
import { useChrome } from '@/chrome';
import { useUi } from './ui';
import { useShow, saveNow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { api, ingestEvents, type IngestProgress, type ExportEstimate, type ExportProgress, type VideoEstimate, type VideoProgress } from '@/api';
import { toast } from '@/store/toast';
import { fmtTime, Show as ShowSchema, TRANSITION_LABEL, VIDEO_MUSIC_LABEL } from '@shared/model';
import { AutoShowDialog } from './AutoShowDialog';
import { ThemeGrid } from './ThemePicker';

function Dialog({ title, icon, children, footer, onClose, wide }: { title: string; icon?: React.ReactNode; children: React.ReactNode; footer?: React.ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const d = ref.current; if (!d) return; if (!d.open) d.showModal(); const onCancel = (e: Event) => { e.preventDefault(); onClose(); }; d.addEventListener('cancel', onCancel); return () => { d.removeEventListener('cancel', onCancel); if (d.open) d.close(); }; }, [onClose]);
  return <dialog ref={ref} style={wide ? { width: 'min(92vw, 900px)' } : undefined} onClick={(e) => { if (e.target === ref.current) onClose(); }}><div className="dlg-h">{icon}<h2>{title}</h2><button className="btn ghost icon x" onClick={onClose} aria-label="סגור"><X /></button></div><div className="dlg-b">{children}</div>{footer && <div className="dlg-f">{footer}</div>}</dialog>;
}

export function Dialogs() {
  const dialog = useUi(s => s.dialog); const open = useUi(s => s.openDialog); const ctx = useUi(s => s.dialogCtx); const close = () => open(null);
  if (dialog === 'auto') return <AutoShowDialog onClose={close} fillChapterId={ctx.fillChapterId} />;
  if (dialog === 'settings') return <SettingsDialog onClose={close} />;
  if (dialog === 'versions') return <VersionsDialog onClose={close} />;
  if (dialog === 'ingest') return <IngestDialog onClose={close} />;
  if (dialog === 'help') return <HelpDialog onClose={close} />;
  if (dialog === 'export') return <ExportDialog onClose={close} />;
  return null;
}

/** The tool's own light/dark look (independent of the show's colour theme). */
function ChromeChoice() {
  const theme = useChrome(s => s.theme); const set = useChrome(s => s.set);
  return <div className="row" style={{ gap: 10 }}><div className="seg"><button aria-pressed={theme === 'light'} onClick={() => set('light')}><Sun /> בהיר</button><button aria-pressed={theme === 'dark'} onClick={() => set('dark')}><Moon /> כהה</button></div><span className="muted small">משנה רק את העורך, המציג והמדריך. המצגת עצמה נשארת בערכת הצבעים שלה.</span></div>;
}

const mb = (b?: number) => b == null ? '?' : b >= 1073741824 ? `${(b / 1073741824).toFixed(1)} GB` : `${Math.max(1, Math.round(b / 1048576))} MB`;

/** Export the whole show (player + every photo, video and song it uses) as an offline folder, optionally zipped, to this disk or a USB drive. */
function PackageExport({ onClose, kindSwitch }: { onClose: () => void; kindSwitch: React.ReactNode }) {
  const [est, setEst] = useState<ExportEstimate | null>(null); const [err, setErr] = useState('');
  const [dest, setDest] = useState(''); const [custom, setCustom] = useState(''); const [zip, setZip] = useState(false);
  const [p, setP] = useState<ExportProgress | null>(null);
  useEffect(() => { void saveNow().then(() => api.exportEstimate()).then(e => { setEst(e); setDest(e.defaultDest); }).catch(e => setErr((e as Error).message)); void api.exportStatus().then(s => { if (s.running) setP(s); }).catch(() => {}); }, []);
  useEffect(() => { if (!p?.running) return; const t = setInterval(() => { void api.exportStatus().then(s => { setP(s); if (!s.running) { if (s.phase === 'done') toast('הייצוא הסתיים', 'ok'); else if (s.phase === 'error') toast('הייצוא נכשל: ' + s.error, 'error'); } }); }, 400); return () => clearInterval(t); }, [p?.running]);
  const target = dest === '__custom__' ? custom.trim() : dest;
  const free = !est ? undefined : dest === est.defaultDest ? est.defaultFree : est.drives.find(d => d.root === dest)?.free;
  const need = est ? est.bytes * (zip ? 2 : 1) : 0; const tight = free != null && free < need;
  const start = async () => { setErr(''); try { await saveNow(); setP(await api.startExport({ dest: target || undefined, zip })); } catch (e) { setErr((e as Error).message.replace(/^\d+ [\w ]+? /, '')); } };
  const busy = !!p?.running; const done = p?.phase === 'done'; const pct = p && p.totalBytes ? Math.min(100, Math.round(p.bytes / p.totalBytes * 100)) : 0;
  return (
    <Dialog title="ייצוא המצגת" icon={<PackageCheck />} onClose={onClose} wide footer={<>
      <span className="muted small grow" style={{ textAlign: 'start' }}>הייצוא שומר את המצגת כפי שהיא עכשיו. שינויים אחרי הייצוא דורשים ייצוא חדש.</span>
      {done && <button className="btn" onClick={() => void api.revealExport().catch(e => toast((e as Error).message, 'error'))}><FolderOpen /> פתח את התיקייה</button>}
      <button className="btn primary" disabled={!est || busy || !target || tight || !est.dist} onClick={() => void start()}><PackageCheck /> {busy ? (p?.phase === 'zip' ? 'יוצר ZIP…' : 'מייצא…') : done ? 'ייצא שוב' : 'ייצא'}</button>
    </>}>
      {kindSwitch}
      {!est && !err && <div className="muted">מחשב מה ייכנס לייצוא…</div>}
      {est && <>
        <div className="statgrid">
          <div className="stat"><div className="v">{est.slides}</div><div className="l">שקופיות · {fmtTime(est.seconds)}</div></div>
          <div className="stat"><div className="v">{est.photos}</div><div className="l">תמונות</div></div>
          <div className="stat"><div className="v">{est.videos}</div><div className="l">סרטונים</div></div>
          <div className="stat"><div className="v">{est.music}</div><div className="l">שירים</div></div>
          <div className="stat"><div className="v">{mb(est.bytes)}</div><div className="l">גודל</div></div>
        </div>
        <p className="muted small" style={{ margin: '12px 0' }}>נוצרת תיקייה אחת עם המצגת, כל התמונות, הסרטונים והמוזיקה שבה, ונגן שעובד בלי אינטרנט ובלי להתקין כלום. במחשב Windows: לחיצה כפולה על <b>START-SHOW.bat</b>.</p>
        {est.missing.length > 0 && <div className="check warn" style={{ cursor: 'default', marginBottom: 12 }}><AlertTriangle /> {est.missing.length} קבצים חסרים ולא ייכנסו: {est.missing.slice(0, 3).join(' · ')}{est.missing.length > 3 ? ' …' : ''}</div>}
        {!est.dist && <div className="check bad" style={{ cursor: 'default', marginBottom: 12 }}>האפליקציה לא בנויה. הריצו npm run build.</div>}
        <div className="field"><label>לאן לייצא</label>
          <div className="seg full">
            <button aria-pressed={dest === est.defaultDest} onClick={() => setDest(est.defaultDest)} disabled={busy}>תיקיית הייצוא במחשב</button>
            {est.drives.map(d => <button key={d.root} aria-pressed={dest === d.root} onClick={() => setDest(d.root)} disabled={busy} title={d.free != null ? `פנוי ${mb(d.free)}` : ''}><Usb /> <span className="ltr">{d.root}</span></button>)}
            <button aria-pressed={dest === '__custom__'} onClick={() => setDest('__custom__')} disabled={busy}>תיקייה אחרת</button>
          </div>
          {dest === '__custom__' ? <input className="ltr" value={custom} onChange={e => setCustom(e.target.value)} placeholder="C:\Users\...\Desktop" disabled={busy} /> : <span className="muted small ltr" style={{ textAlign: 'start' }}>{target}{free != null ? `  ·  פנוי ${mb(free)}` : ''}</span>}
          {tight && <span className="small" style={{ color: 'var(--bad)' }}>אין מספיק מקום: צריך {mb(need)}, פנוי {mb(free)}.</span>}
        </div>
        <label className="chk"><input type="checkbox" checked={zip} onChange={e => setZip(e.target.checked)} disabled={busy} /> גם קובץ ZIP אחד (נוח להעברה ולשליחה)</label>
      </>}
      {p && p.phase !== 'idle' && <div style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b>{p.phase === 'copy' ? 'מעתיק קבצים…' : p.phase === 'zip' ? 'יוצר קובץ ZIP…' : p.phase === 'done' ? 'הייצוא הסתיים' : 'הייצוא נכשל'}</b><span className="num muted small">{p.done}/{p.total} · {mb(p.bytes)} / {mb(p.totalBytes)}</span></div>
        <div className="progress" style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', margin: '6px 0' }}><i style={{ display: 'block', height: '100%', width: `${p.phase === 'done' ? 100 : pct}%`, background: p.phase === 'error' ? 'var(--bad)' : 'var(--accent)', transition: 'width .3s' }} /></div>
        {done && <div className="small" style={{ lineHeight: 1.7 }}>התיקייה: <span className="ltr">{p.dir}</span>{p.zip && <><br />ZIP: <span className="ltr">{p.zip}</span></>}<br />להפעלה: לחיצה כפולה על <b>START-SHOW.bat</b> בתוך התיקייה, במחשב הזה או בכל מחשב Windows אחר.</div>}
        {p.phase === 'error' && <div className="small" style={{ color: 'var(--bad)' }}>{p.error}</div>}
      </div>}
      {err && <div className="small" style={{ color: 'var(--bad)', marginTop: 10 }}>{err}</div>}
    </Dialog>
  );
}

/** Where to save: the exports folder, a USB drive, or a typed folder. Shared by both kinds of export. */
function DestPicker({ est, dest, setDest, custom, setCustom, busy }: { est: { defaultDest: string; defaultFree?: number; drives: { root: string; free?: number }[] }; dest: string; setDest: (d: string) => void; custom: string; setCustom: (s: string) => void; busy: boolean }) {
  const target = dest === '__custom__' ? custom.trim() : dest; const free = dest === est.defaultDest ? est.defaultFree : est.drives.find(d => d.root === dest)?.free;
  return <div className="field"><label>לאן לשמור</label>
    <div className="seg full">
      <button aria-pressed={dest === est.defaultDest} onClick={() => setDest(est.defaultDest)} disabled={busy}>תיקיית הייצוא במחשב</button>
      {est.drives.map(d => <button key={d.root} aria-pressed={dest === d.root} onClick={() => setDest(d.root)} disabled={busy} title={d.free != null ? `פנוי ${mb(d.free)}` : ''}><Usb /> <span className="ltr">{d.root}</span></button>)}
      <button aria-pressed={dest === '__custom__'} onClick={() => setDest('__custom__')} disabled={busy}>תיקייה אחרת</button>
    </div>
    {dest === '__custom__' ? <input className="ltr" value={custom} onChange={e => setCustom(e.target.value)} placeholder="C:\\Users\\...\\Desktop" disabled={busy} /> : <span className="muted small ltr" style={{ textAlign: 'start' }}>{target}{free != null ? `  ·  פנוי ${mb(free)}` : ''}</span>}
  </div>;
}

/** The whole show as one MP4: recorded in real time in a hidden browser, then encoded. Plays on phones, TVs and WhatsApp. */
function VideoExport({ onClose, kindSwitch }: { onClose: () => void; kindSwitch: React.ReactNode }) {
  const [est, setEst] = useState<VideoEstimate | null>(null); const [dests, setDests] = useState<ExportEstimate | null>(null); const [err, setErr] = useState('');
  const [quality, setQuality] = useState<'720' | '1080'>('720'); const [dest, setDest] = useState(''); const [custom, setCustom] = useState('');
  const [p, setP] = useState<VideoProgress | null>(null);
  useEffect(() => { void saveNow().then(() => Promise.all([api.videoEstimate(), api.exportEstimate()])).then(([v, e]) => { setEst(v); setDests(e); setDest(e.defaultDest); }).catch(e => setErr((e as Error).message)); void api.videoStatus().then(s => { if (s.running || s.phase === 'done') setP(s); }).catch(() => {}); }, []);
  useEffect(() => { if (!p?.running) return; const t = setInterval(() => { void api.videoStatus().then(s => { setP(s); if (!s.running) { if (s.phase === 'done') toast('הסרטון מוכן', 'ok'); else if (s.phase === 'error') toast('ייצוא הסרטון נכשל: ' + s.error, 'error'); } }); }, 700); return () => clearInterval(t); }, [p?.running]);
  const target = dest === '__custom__' ? custom.trim() : dest; const busy = !!p?.running; const done = p?.phase === 'done';
  const start = async () => { setErr(''); try { await saveNow(); setP(await api.startVideoExport({ dest: target || undefined, quality })); } catch (e) { setErr((e as Error).message.replace(/^\d+ [\w ]+? /, '')); } };
  const pct = !p ? 0 : p.phase === 'record' ? Math.min(100, p.recorded / Math.max(1, p.expected) * 100) : p.phase === 'encode' ? p.encodePct : p.phase === 'done' ? 100 : 0;
  const totalWait = est ? est.seconds + est.encodeSeconds[quality] : 0;
  return (
    <Dialog title="ייצוא המצגת" icon={<PackageCheck />} onClose={onClose} wide footer={<>
      <span className="muted small grow" style={{ textAlign: 'start' }}>ההקלטה נמשכת כאורך המצגת. אפשר להמשיך לעבוד בינתיים; הרמקולים לא משמיעים כלום.</span>
      {busy && <button className="btn" onClick={() => void api.cancelVideoExport().then(() => toast('הייצוא בוטל'))}>ביטול</button>}
      {done && <button className="btn" onClick={() => void api.revealVideo().catch(e => toast((e as Error).message, 'error'))}><FolderOpen /> הצג את הקובץ</button>}
      <button className="btn primary" disabled={!est || !est.browser || busy || !target} onClick={() => void start()}><Film /> {busy ? (p?.phase === 'encode' ? 'ממיר…' : 'מקליט…') : done ? 'צור סרטון שוב' : 'צור סרטון'}</button>
    </>}>
      {kindSwitch}
      {!est && !err && <div className="muted">מחשב את אורך הסרטון…</div>}
      {est && dests && <>
        <p className="muted small" style={{ margin: '0 0 12px' }}>קובץ MP4 אחד עם כל המצגת: מעברים, תמונות, סרטונים ומוזיקה. מתנגן בכל טלפון, טאבלט, טלוויזיה ומחשב, בלי אינטרנט ובלי אפליקציה. אפשר לשלוח בוואטסאפ כמסמך.</p>
        {!est.browser && <div className="check bad" style={{ cursor: 'default', marginBottom: 12 }}>לא נמצא Chrome או Edge במחשב; הם נדרשים להקלטה.</div>}
        <div className="field"><label>איכות</label>
          <div className="seg full">
            <button aria-pressed={quality === '720'} onClick={() => setQuality('720')} disabled={busy}><Smartphone /> לטלפון · 720p · כ־{mb(est.sizes['720'])}</button>
            <button aria-pressed={quality === '1080'} onClick={() => setQuality('1080')} disabled={busy}><Monitor /> לטלוויזיה · 1080p · כ־{mb(est.sizes['1080'])}</button>
          </div>
        </div>
        <div className="statgrid">
          <div className="stat"><div className="v">{est.slides}</div><div className="l">שקופיות</div></div>
          <div className="stat"><div className="v num">{fmtTime(est.seconds)}</div><div className="l">אורך הסרטון</div></div>
          <div className="stat"><div className="v num">{fmtTime(totalWait)}</div><div className="l">זמן הכנה משוער</div></div>
        </div>
        <div style={{ height: 12 }} />
        <DestPicker est={dests} dest={dest} setDest={setDest} custom={custom} setCustom={setCustom} busy={busy} />
      </>}
      {p && p.phase !== 'idle' && <div style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}><b>{({ launch: 'מכין…', record: 'מקליט את המצגת…', encode: 'ממיר ל־MP4…', done: 'הסרטון מוכן', error: 'הייצוא נכשל', cancelled: 'הייצוא בוטל', idle: '' } as Record<string, string>)[p.phase]}</b>
          <span className="num muted small">{p.phase === 'record' ? `שקופית ${p.slide}/${p.slides} · ${fmtTime(p.recorded)} / ${fmtTime(p.expected)}` : p.phase === 'encode' ? `${p.encodePct}%` : p.phase === 'done' && p.bytes ? mb(p.bytes) : ''}</span></div>
        <div style={{ height: 6, background: 'var(--line)', borderRadius: 3, overflow: 'hidden', margin: '6px 0' }}><i style={{ display: 'block', height: '100%', width: `${pct}%`, background: p.phase === 'error' ? 'var(--bad)' : 'var(--accent)', transition: 'width .5s' }} /></div>
        {done && <div className="small" style={{ lineHeight: 1.7 }}>הקובץ: <span className="ltr">{p.file}</span><br />שולחים את הקובץ הזה. בוואטסאפ: אטב ← מסמך, כדי שלא יכווץ.</div>}
        {p.phase === 'error' && <div className="small" style={{ color: 'var(--bad)' }}>{p.error}</div>}
      </div>}
      {err && <div className="small" style={{ color: 'var(--bad)', marginTop: 10 }}>{err}</div>}
    </Dialog>
  );
}

/** Export: a video for phones and TVs, or the full offline package for a computer. */
function ExportDialog({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'video' | 'package'>('video');
  const sw = <div className="field"><label>מה לייצא</label><div className="seg full">
    <button aria-pressed={kind === 'video'} onClick={() => setKind('video')}><Film /> סרטון MP4 — לטלפון, לטלוויזיה ולשליחה</button>
    <button aria-pressed={kind === 'package'} onClick={() => setKind('package')}><PackageCheck /> חבילה למחשב — המצגת החיה</button>
  </div></div>;
  return kind === 'video' ? <VideoExport onClose={onClose} kindSwitch={sw} /> : <PackageExport onClose={onClose} kindSwitch={sw} />;
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const show = useShow(s => s.show)!; const updS = useShow(s => s.updateSettings); const updM = useShow(s => s.updateMeta); const st = show.settings;
  const R = ({ label, k, min, max, step, fmt }: { label: string; k: keyof typeof st; min: number; max: number; step: number; fmt: (v: number) => string }) => <div className="field"><label><span>{label}</span><b>{fmt(st[k] as number)}</b></label><input type="range" min={min} max={max} step={step} value={st[k] as number} onChange={e => updS({ [k]: +e.target.value } as any)} /></div>;
  return (
    <Dialog title="הגדרות המצגת" icon={<Settings />} onClose={onClose} footer={<button className="btn" onClick={onClose}>סגור</button>}>
      <div className="field-row">
        <div className="field"><label>כותרת (מסך הפתיחה)</label><input className="he" value={show.meta.title} onChange={e => updM({ title: e.target.value })} /></div>
        <div className="field"><label>תאריך האירוע</label><input type="date" value={show.meta.date} onChange={e => updM({ date: e.target.value })} /></div>
      </div>
      <h4 style={{ margin: '10px 0' }}>מראה הממשק</h4>
      <ChromeChoice />
      <h4 style={{ margin: '14px 0 10px' }}>ערכת צבעים של המצגת</h4>
      <ThemeGrid value={st.theme} onChange={id => id && updS({ theme: id })} />
      <h4 style={{ margin: '10px 0' }}>תזמון</h4>
      <R label="משך תמונה (ברירת מחדל)" k="defaultSlideSeconds" min={3} max={15} step={.5} fmt={v => `${v}s`} />
      <R label="אורך מעבר" k="transitionSeconds" min={.3} max={2} step={.1} fmt={v => `${v.toFixed(1)}s`} />
      <div className="field"><label>מעבר ברירת מחדל</label><div className="seg full">{(Object.entries(TRANSITION_LABEL) as [typeof st.defaultTransition, string][]).map(([v, l]) => <button key={v} aria-pressed={st.defaultTransition === v} onClick={() => updS({ defaultTransition: v })}>{l}</button>)}</div></div>
      <h4 style={{ margin: '10px 0' }}>שמע</h4>
      <R label="עוצמת מוזיקה" k="musicLevel" min={0} max={1} step={.05} fmt={v => `${Math.round(v * 100)}%`} />
      <div className="field"><label>מוזיקה בזמן סרטון</label><div className="seg full">{(Object.entries(VIDEO_MUSIC_LABEL) as [typeof st.videoMusic, string][]).map(([v, l]) => <button key={v} aria-pressed={st.videoMusic === v} onClick={() => updS({ videoMusic: v })}>{l}</button>)}</div><span className="muted small">מושהית: דועכת וחוזרת מאותה נקודה אחרי הסרטון. זו ברירת המחדל לכל סרטון; לכל שקופית אפשר לקבוע אחרת ב„מוזיקה בשקופית”.</span></div>
      <R label="עוצמת מוזיקה כשהיא מונמכת" k="duckLevel" min={0} max={.6} step={.05} fmt={v => `${Math.round(v * 100)}%`} />
      <R label="משך הדעיכה בעצירה או בהשהיה" k="musicFadeSec" min={.2} max={6} step={.1} fmt={v => `${v.toFixed(1)}s`} />
      <h4 style={{ margin: '10px 0' }}>תמונה</h4>
      <div className="field"><label>התאמת תמונות למסך</label><div className="seg full"><button aria-pressed={st.photoFit !== 'cover'} onClick={() => updS({ photoFit: 'contain' })}>כל התמונה (ללא חיתוך)</button><button aria-pressed={st.photoFit === 'cover'} onClick={() => updS({ photoFit: 'cover' })}>מילוי מסך (חיתוך)</button></div><span className="muted small">ללא חיתוך: כל תמונה מוצגת בשלמותה על רקע מטושטש שלה, ותנועת המצלמה עוברת לרקע. לשקופית בודדת אפשר לשנות ב„מסגרת וחיתוך”.</span></div>
      <div className="field"><label>שנה על התמונות</label><div className="seg full"><button aria-pressed={!st.showYears} onClick={() => updS({ showYears: false })}>לא להציג</button><button aria-pressed={!!st.showYears} onClick={() => updS({ showYears: true })}>להציג ליד הכיתוב</button></div><span className="muted small">השנה מהקובץ נשמרת למיון לפי שנה, אבל אינה מודפסת על התמונה אלא אם מפעילים כאן.</span></div>
      <R label="שולי בטיחות לטלוויזיה" k="safeMarginPct" min={0} max={10} step={.5} fmt={v => `${v}%`} />
      <div className="field"><label>גרעין פילם לתמונות ישנות</label><div className="row"><div className="seg"><button aria-pressed={st.grainOnArchival} onClick={() => updS({ grainOnArchival: true })}>כן</button><button aria-pressed={!st.grainOnArchival} onClick={() => updS({ grainOnArchival: false })}>לא</button></div><span className="muted small">לתמונות לפני</span><input type="number" value={st.archivalBeforeYear} onChange={e => updS({ archivalBeforeYear: +e.target.value })} style={{ width: 90 }} /></div></div>
    </Dialog>
  );
}

function VersionsDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<Awaited<ReturnType<typeof api.versions>>>([]); const [confirmId, setConfirmId] = useState<number | null>(null); const [label, setLabel] = useState('');
  const [labelId, setLabelId] = useState<number | null>(null); const [rowLabel, setRowLabel] = useState(''); const [details, setDetails] = useState<Record<number, string>>({});
  const reload = () => api.versions().then(setList).catch(e => toast(e.message, 'error'));
  useEffect(() => { void reload(); }, []);
  const restore = async (id: number) => { const show = await api.restoreVersion(id); useShow.getState().replace(ShowSchema.parse(show)); useShow.setState({ save: 'saved', lastSavedAt: Date.now() }); toast(`גרסה ${id} שוחזרה`, 'ok'); onClose(); };
  const showDetails = async (id: number) => { if (details[id]) { setDetails(d => { const n = { ...d }; delete n[id]; return n; }); return; } const v = await api.version(id); setDetails(d => ({ ...d, [id]: v.chapters.map(c => `${c.title} (${c.slides.length})`).join(' · ') })); };
  const applyLabel = async (id: number) => { if (!rowLabel.trim()) return; await api.labelVersion(id, rowLabel.trim()); setLabelId(null); setRowLabel(''); toast('הגרסה סומנה — תישמר לתמיד', 'ok'); void reload(); };
  return (
    <Dialog title="היסטוריית גרסאות" icon={<History />} onClose={onClose} wide footer={<><input value={label} onChange={e => setLabel(e.target.value)} placeholder="שם לגרסה הנוכחית (למשל: לפני שינוי הסדר)" style={{ flex: 1 }} /><button className="btn primary" disabled={!label} title={label ? 'שומר את המצב הנוכחי כגרסה קבועה בשם הזה' : 'הקלידו שם לגרסה בשדה משמאל'} onClick={async () => { await saveNow(label); setLabel(''); toast('הגרסה נשמרה עם שם', 'ok'); void reload(); }}><Tag /> שמור גרסה מסומנת</button></>}>
      <p className="muted small" style={{ marginBottom: 10 }}>כל שמירה אוטומטית נרשמת (נשמרות 300 האחרונות). גרסאות עם שם נשמרות לתמיד. השחזור עצמו נרשם כגרסה חדשה, כך שאפשר תמיד לחזור. „פרטים” מציג את פרקי הגרסה; „תן שם” הופך שמירה אוטומטית לקבועה.</p>
      <div className="versions">{list.map(v => <div key={v.id}><div className="version"><span>{v.label ? <span className="lab">{v.label}</span> : <span className="muted">שמירה אוטומטית</span>} <span className="m">#{v.id}</span></span><span className="m num">{new Date(v.saved_at).toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span><span className="m num">{v.slides} שק׳ · {fmtTime(v.seconds)}</span>
        <span className="row">{confirmId === v.id ? <><button className="btn sm primary" onClick={() => restore(v.id)}>אישור שחזור</button><button className="btn sm ghost" onClick={() => setConfirmId(null)}>ביטול</button></> : labelId === v.id ? <><input value={rowLabel} onChange={e => setRowLabel(e.target.value)} placeholder="שם" style={{ width: 140, padding: '3px 8px' }} onKeyDown={e => e.key === 'Enter' && applyLabel(v.id)} autoFocus /><button className="btn sm primary" onClick={() => applyLabel(v.id)}>שמור</button><button className="btn sm ghost" onClick={() => setLabelId(null)}>ביטול</button></> : <><button className="btn sm ghost" onClick={() => showDetails(v.id)}>פרטים</button>{!v.label && <button className="btn sm ghost" onClick={() => { setLabelId(v.id); setRowLabel(''); }}><Tag /> תן שם</button>}<button className="btn sm" onClick={() => setConfirmId(v.id)}><RotateCcw /> שחזר</button></>}</span></div>
        {details[v.id] && <div className="muted small" style={{ padding: '4px 12px 8px' }}>{details[v.id]}</div>}</div>)}{!list.length && <div className="empty-hint">אין גרסאות עדיין</div>}</div>
    </Dialog>
  );
}

function IngestDialog({ onClose }: { onClose: () => void }) {
  const [p, setP] = useState<IngestProgress | null>(null); const [log, setLog] = useState<string[]>([]); const load = useLibrary(s => s.load);
  const [health, setHealth] = useState<Awaited<ReturnType<typeof api.health>> | null>(null); const [groups, setGroups] = useState<number | null>(null); const [analyzing, setAnalyzing] = useState(false);
  const refreshInfo = () => { void api.health().then(setHealth).catch(() => setHealth(null)); void api.groups().then(g => setGroups(g.length)).catch(() => {}); };
  useEffect(() => { void api.ingestStatus().then(s => { setP(s); setLog(s.log); }); refreshInfo(); const off = ingestEvents((type, data) => { if (type === 'log') setLog(l => [...l.slice(-300), data as string]); else { setP(data as IngestProgress); if (type === 'done') { void load(); refreshInfo(); toast('הספרייה עודכנה', 'ok'); } } }); return off; }, [load]);
  const pct = p && p.total ? Math.round(p.done / p.total * 100) : 0;
  const reanalyze = async () => { setAnalyzing(true); try { const r = await api.analyze(); toast(`ניתוח: ${r.analysed} תמונות חדשות · ${r.dupGroups} כפילויות · ${r.burstGroups} צילומי רצף`, 'ok'); void load(); refreshInfo(); } catch (e) { toast('הניתוח נכשל: ' + (e as Error).message, 'error'); } finally { setAnalyzing(false); } };
  return (
    <Dialog title="קליטת מדיה" icon={<HardDriveDownload />} onClose={onClose} wide footer={<><span className="muted small grow" style={{ textAlign: 'start' }}>תיקיות: media/photos · media/videos/greetings · media/music. קבצים שכבר עובדו לא מעובדים שוב.</span><button className="btn" disabled={p?.running || analyzing} onClick={reanalyze} title="חישוב מחדש של כפילויות, צילומי רצף ואיכות (ללא עיבוד מחדש של הקבצים)">{analyzing ? 'מנתח…' : 'נתח כפילויות ואיכות'}</button><button className="btn primary" disabled={p?.running} onClick={() => api.startIngest().then(setP)}><Play /> {p?.running ? 'רץ…' : 'סרוק את media/‎'}</button></>}>
      <div className="row wrap" style={{ marginBottom: 10, gap: 6 }}>
        <span className={`pill ${health ? 'ok' : 'bad'}`}><span className="dot" />{health ? `שרת מחובר · ${health.assets} קבצים בספרייה` : 'אין חיבור לשרת'}</span>
        {health && <span className="pill" title={health.mediaDir}>media: {health.mediaDir}</span>}
        {groups != null && <span className="pill">{groups} קבוצות כפילויות</span>}
        {health && <span className={`pill ${health.faces ? 'ok' : ''}`} title="models/ultraface-rfb-320.onnx + onnxruntime-node">{health.faces ? 'זיהוי פנים פעיל' : 'זיהוי פנים: לא מותקן (אופציונלי)'}</span>}
      </div>
      <div className="statgrid"><div className="stat"><div className="v">{p?.photos ?? 0}</div><div className="l">תמונות עובדו</div></div><div className="stat"><div className="v">{p?.videos ?? 0}</div><div className="l">סרטונים הומרו</div></div><div className="stat"><div className="v">{p?.music ?? 0}</div><div className="l">קטעי מוזיקה</div></div><div className="stat"><div className="v" style={{ color: p?.warnings.length ? 'var(--warn)' : undefined }}>{p?.warnings.length ?? 0}</div><div className="l">אזהרות</div></div><div className="stat"><div className="v" style={{ color: p?.errors ? 'var(--bad)' : undefined }}>{p?.errors ?? 0}</div><div className="l">שגיאות</div></div></div>
      <div style={{ margin: '12px 0 6px' }} className="row"><span className={`pill ${p?.running ? 'warn' : p?.phase === 'done' ? 'ok' : ''}`}><span className="dot" />{p?.running ? `רץ · ${p.phase}` : p?.phase === 'done' ? 'הושלם' : p?.phase === 'failed' ? 'נכשל' : 'ממתין'}</span><span className="muted small num">{p ? `${p.done} / ${p.total}` : ''}</span><span className="muted small grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', direction: 'ltr', textAlign: 'end' }}>{p?.current ?? ''}</span></div>
      <div className="prog"><i style={{ width: `${pct}%` }} /></div>
      {p?.warnings.length ? <><h4 style={{ margin: '14px 0 6px' }}>אזהרות ({p.warnings.length})</h4><div className="log" style={{ maxHeight: 150 }}>{p.warnings.slice(0, 80).map((w, i) => <div key={i}><span className="w">⚠</span> <span style={{ direction: 'ltr', unicodeBidi: 'isolate' }}>{w.file}</span> — {w.message}</div>)}</div></> : null}
      <h4 style={{ margin: '14px 0 6px' }}>יומן</h4>
      <div className="log">{log.length ? log.map((l, i) => <div key={i} className={l.startsWith('⚠') ? 'w' : ''}>{l}</div>) : <span className="muted">אין פעילות עדיין</span>}</div>
    </Dialog>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const K = ({ k, d }: { k: string; d: string }) => <tr><td style={{ whiteSpace: 'nowrap', padding: '4px 8px' }}>{k.split(' ').map((x, i) => <kbd key={i} style={{ marginInlineEnd: 4 }}>{x}</kbd>)}</td><td style={{ padding: '4px 8px' }}>{d}</td></tr>;
  return (
    <Dialog title="עזרה" icon={<HelpCircle />} onClose={onClose} wide footer={<button className="btn" onClick={onClose}>סגור</button>}>
      <div className="field-row" style={{ gap: 20 }}>
        <div><h4 style={{ marginBottom: 8 }}>עורך</h4><table style={{ fontSize: 13 }}><tbody>
          <K k="Enter" d="הוסף את הבחירה מהספרייה לפרק הנבחר" /><K k="Delete" d="מחק שקופיות נבחרות" /><K k="Ctrl D" d="שכפל" /><K k="Ctrl Z / Ctrl Y" d="בטל / חזור" /><K k="Ctrl S" d="שמור עכשיו" /><K k="Ctrl A" d="בחר את כל השקופיות בפרק" /><K k="← →" d="נווט בין שקופיות (Shift לטווח)" /><K k="Esc" d="נקה בחירה" /><K k="?" d="חלון זה" />
        </tbody></table></div>
        <div><h4 style={{ marginBottom: 8 }}>מצגת (וגם שלט מצגות)</h4><table style={{ fontSize: 13 }}><tbody>
          <K k="Space → PgDn" d="השקופית הבאה" /><K k="← PgUp" d="הקודמת" /><K k="P" d="השהה / המשך" /><K k="B" d="מסך שחור" /><K k="M" d="השתק מוזיקה" /><K k="F" d="מסך מלא" /><K k="Home / End" d="להתחלה / לסוף" />
        </tbody></table></div>
      </div>
      <h4 style={{ margin: '14px 0 6px' }}>זרימת עבודה</h4>
      <ol style={{ margin: 0, paddingInlineStart: 20, lineHeight: 1.8, fontSize: 13 }}>
        <li>הנח קבצים: תמונות ב־<code>media/photos</code> (תיקיות לפי עשור/אירוע עוזרות לשנה), ברכות ב־<code>media/videos/greetings</code> (שם הקובץ = שם המברך), מוזיקה ב־<code>media/music</code>. לחץ „ספרייה” → „סרוק”.</li>
        <li>בחר תמונות בספרייה (Ctrl/Shift לבחירה מרובה) וגרור לסטוריבורד, או לחץ „הוסף לפרק”. 2–6 תמונות → „קולאז׳”.</li>
        <li>לחץ על שקופית כדי לערוך: כיתוב, שנה, תנועת מצלמה, נקודת מוקד (לחיצה על התצוגה המקדימה), משך, מעבר.</li>
        <li>לכל פרק: מוזיקה ונקודת התחלה (גרירה על צורת הגל). המוזיקה נחלשת אוטומטית בזמן ברכות.</li>
        <li>„נגן מצגת” פותח חלון מצגת — העבר אותו למסך הטלוויזיה. „מציג” פותח חלון עזר למסך הלפטופ.</li>
      </ol>
    </Dialog>
  );
}

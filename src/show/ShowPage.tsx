import { useEffect, useRef, useState } from 'react';
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, Square, Palette, Maximize2 } from 'lucide-react';
import { themeById, THEMES } from '@shared/themes';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { Player, type PlayerState } from './engine';
import { fmtTime, slideSeconds } from '@shared/model';
import { api } from '@/api';

export const CHANNEL = 'sy80';
/** /show/?render=1 is driven by the video export: no controls, no start screen, nothing waits for a click, and the state is reported to the recorder. */
const RENDER = new URLSearchParams(location.search).has('render');
type RenderHooks = { __sy80state?: (s: { idx: number; total: number; ended: boolean; started: boolean }) => void; __sy80start?: () => boolean };

export function ShowPage() {
  const show = useShow(s => s.show); const load = useShow(s => s.load);
  const assets = useLibrary(s => s.assets); const loadLib = useLibrary(s => s.load); const loaded = useLibrary(s => s.loaded);
  const host = useRef<HTMLDivElement>(null); const player = useRef<Player | null>(null);
  const [st, setSt] = useState<PlayerState | null>(null); const [hud, setHud] = useState(true); const hudTimer = useRef<number>(0);
  const [progress, setProgress] = useState(0);
  useEffect(() => { void load(); void loadLib(); document.title = 'סבא יהודה 80 · מצגת'; }, [load, loadLib]);

  // create the player once data is present
  useEffect(() => {
    if (!show || !loaded || !host.current || player.current) return;
    const p = new Player(host.current, () => useShow.getState().show, () => useLibrary.getState().assets, { fullscreenEl: host.current.parentElement ?? undefined, render: RENDER });
    player.current = p;
    const bc = new BroadcastChannel(CHANNEL);
    let rehearsed = false;
    const off = p.on(s => { setSt({ ...s }); if (RENDER) (window as RenderHooks).__sy80state?.({ idx: s.idx, total: s.total, ended: s.ended, started: s.started }); bc.postMessage({ kind: 'state', state: s, elapsed: p.elapsed(), remaining: p.remaining() }); if (s.ended && !rehearsed && !RENDER) { rehearsed = true; void api.kvSet('rehearsed', { at: new Date().toISOString(), slides: s.total }).catch(() => {}); } }); // the guide's checklist marks "rehearsed" when a run reaches the end
    bc.onmessage = (e) => { const m = e.data; if (m?.kind === 'hello') { bc.postMessage({ kind: 'state', state: p.state(), elapsed: p.elapsed(), remaining: p.remaining() }); return; } if (m?.kind !== 'cmd') return; if (m.cmd === 'theme') { p.setLiveTheme(m.id ?? null); return; } if (!p.started) return; ({ next: () => p.next(), prev: () => p.prev(), pause: () => p.pause(), black: () => p.toggleBlack(), mute: () => p.toggleMute(), goto: () => m.id && p.goToId(m.id), restart: () => p.restart() } as Record<string, () => void>)[m.cmd]?.(); };
    p.applyTheme(); setSt(p.state());
    if (RENDER) (window as RenderHooks).__sy80start = () => { if (p.started) return false; p.start(); return true; };
    const tick = setInterval(() => { if (p.started) bc.postMessage({ kind: 'tick', elapsed: p.elapsed(), remaining: p.remaining(), idx: p.idx }); }, 1000);
    p.audio!.onMeter = () => {};
    return () => { off(); clearInterval(tick); bc.close(); p.destroy(); player.current = null; };
  }, [show, loaded]);

  // progress bar for the current slide
  useEffect(() => { if (!st?.started || st.manual || st.paused) { setProgress(0); return; } const t0 = performance.now(); const id = setInterval(() => setProgress(Math.min(100, (performance.now() - t0) / 1000 / Math.max(.1, st.seconds) * 100)), 100); return () => clearInterval(id); }, [st?.slideId, st?.paused, st?.started, st?.manual, st?.seconds]);

  // keyboard: clicker keys + letters
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { const p = player.current; if (!p) return; const k = e.key;
      if (!p.started) { if (k === ' ' || k === 'Enter') { e.preventDefault(); start(); } return; }
      if ([' ', 'ArrowRight', 'PageDown', 'Enter', 'ArrowDown'].includes(k)) { e.preventDefault(); p.next(); }
      else if (['ArrowLeft', 'PageUp', 'Backspace', 'ArrowUp'].includes(k)) { e.preventDefault(); p.prev(); }
      else if (k === 'p' || k === 'P' || k === 'פ') p.pause(); else if (k === 'b' || k === 'B' || k === '.' || k === 'נ') p.toggleBlack(); else if (k === 'm' || k === 'M' || k === 'צ') p.toggleMute(); else if (k === 'f' || k === 'F' || k === 'כ') p.fullscreen(); else if (k === 'Home') p.go(0, 'dip'); else if (k === 'End') p.go(p.list().length - 1, 'dip')
      else if (k === 't' || k === 'T' || k === 'א') p.cycleTheme(e.shiftKey ? -1 : 1); else if (k === '0') p.setLiveTheme(null); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  });
  // HUD shows on mouse movement, hides after a moment
  useEffect(() => { const onMove = () => { setHud(true); window.clearTimeout(hudTimer.current); hudTimer.current = window.setTimeout(() => setHud(false), 2600); }; window.addEventListener('mousemove', onMove); onMove(); return () => window.removeEventListener('mousemove', onMove); }, []);

  const start = () => { const p = player.current; if (!p) return; const from = new URLSearchParams(location.search).get('from') || undefined; p.start(from); void p.fullscreenTarget().requestFullscreen?.().catch(() => {}); void (navigator as any).wakeLock?.request?.('screen').catch(() => {}); };

  const total = show ? show.chapters.reduce((t, c) => t + c.slides.reduce((u, s) => u + slideSeconds(s, c, show.settings, assets), 0), 0) : 0;
  const slides = show ? show.chapters.reduce((n, c) => n + c.slides.length, 0) : 0;
  const missing = show ? show.chapters.flatMap(c => c.slides).filter(s => ('assetId' in s && !assets[(s as any).assetId])).length : 0;
  const themeNow = st?.theme ?? show?.settings.theme ?? 'midnight-gold'; const theme = themeById(themeNow);
  return (
    <div className="showpage" data-theme={themeNow} data-chrome="dark">
      <div ref={host} className={`player ${hud || !st?.started ? 'idle' : ''}`} tabIndex={0} onClick={(e) => { const p = player.current; if (p?.started && !(e.target as HTMLElement).closest('button')) p.next(); }} />
      {!st?.started && !RENDER && (
        <div className="startgate">
          <div className="inner">
            <div className="name">{show?.meta.title ?? 'סבא יהודה'}</div>
            <div className="big">80</div>
            <button className="btn primary" onClick={start} disabled={!show || !loaded}><Play /> התחל את המצגת</button>
            <div className="meta"><span>{slides} שקופיות</span><span className="num">{fmtTime(total)}</span><span>{Object.keys(assets).length} קבצי מדיה</span></div>
            {missing > 0 && <div className="warn">⚠ {missing} שקופיות מצביעות על קבצים שלא נמצאו בספרייה</div>}
            <div className="keys"><span><kbd>Space</kbd><kbd>→</kbd> הבא</span><span><kbd>←</kbd> הקודם</span><span><kbd>P</kbd> השהיה</span><span><kbd>B</kbd> מסך שחור</span><span><kbd>M</kbd> השתקה</span><span><kbd>F</kbd> מסך מלא</span><span><kbd>T</kbd> ערכה הבאה</span><span><kbd>0</kbd> חזרה לערכה</span></div>
            <div className="meta"><span className="theme-chip"><i style={{ background: theme.accent }} /> ערכה: {theme.name}</span></div>
          </div>
        </div>
      )}
      {st?.started && !RENDER && (
        <div className={`hud ${hud || st.paused || st.ended ? 'on' : ''}`} onClick={e => e.stopPropagation()}>
          <span className="num">{st.idx + 1} / {st.total}</span>
          <span>{st.chapterTitle}</span>
          <div className="bar"><i style={{ width: st.manual ? '100%' : `${progress}%`, opacity: st.manual ? .3 : 1 }} /></div>
          <span className="state">{st.paused ? 'מושהה' : st.manual ? 'ממתין ללחיצה' : fmtTime(st.seconds)}</span>
          <button className="btn" onClick={() => player.current?.prev()} title="הקודם"><SkipBack /></button>
          <button className="btn" onClick={() => player.current?.pause()} title={st.paused ? 'המשך' : 'השהה'}>{st.paused ? <Play /> : <Pause />}</button>
          <button className="btn" onClick={() => player.current?.next()} title="הבא"><SkipForward /></button>
          <button className="btn" onClick={() => player.current?.toggleBlack()} title="מסך שחור"><Square /></button>
          <button className="btn" onClick={() => player.current?.toggleMute()} title="השתק מוזיקה">{st.muted ? <VolumeX /> : <Volume2 />}</button>
          <button className="btn" onClick={() => player.current?.fullscreen()} title="מסך מלא"><Maximize2 /></button>
          <button className="btn" onClick={() => player.current?.cycleTheme(1)} title={`ערכת צבעים: ${themeById(st.theme).name} (T לערכה הבאה, 0 לחזרה)`}><Palette /></button>
          <span className="theme-mini" style={{ fontSize: 11.5 }}><i style={{ background: themeById(st.theme).accent }} />{themeById(st.theme).name}{st.liveTheme ? ' · זמני' : ''}</span>
        </div>
      )}
      <select aria-label="theme" style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }} value={themeNow} onChange={e => player.current?.setLiveTheme(e.target.value)}>{THEMES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      {st?.ended && !RENDER && <div className="endcard">סוף המצגת · <kbd>Home</kbd> להתחלה מחדש</div>}
    </div>
  );
}

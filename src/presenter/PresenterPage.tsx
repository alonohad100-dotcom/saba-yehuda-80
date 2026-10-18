import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX, RotateCcw } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { SlideView } from '@/show/SlideView';
import type { PlayerState } from '@/show/engine';
import { CHANNEL } from '@/show/ShowPage';
import { ChromeToggle } from '@/editor/ChromeToggle';
import { fmtTime, slideSeconds, slideThumbAsset, assetThumb, TYPE_LABEL } from '@shared/model';
import { THEMES, themeById, resolveTheme } from '@shared/themes';

export function PresenterPage() {
  const show = useShow(s => s.show); const load = useShow(s => s.load);
  const assets = useLibrary(s => s.assets); const loadLib = useLibrary(s => s.load);
  const [st, setSt] = useState<PlayerState | null>(null); const [elapsed, setElapsed] = useState(0); const [remaining, setRemaining] = useState(0); const [clock, setClock] = useState('');
  const [bc] = useState(() => new BroadcastChannel(CHANNEL)); const strip = useRef<HTMLDivElement>(null);
  useEffect(() => { void load(); void loadLib(); document.title = 'סבא יהודה 80 · מציג'; }, [load, loadLib]);
  useEffect(() => { bc.onmessage = (e) => { const m = e.data; if (m.kind === 'state') { setSt(m.state); setElapsed(m.elapsed); setRemaining(m.remaining); } else if (m.kind === 'tick') { setElapsed(m.elapsed); setRemaining(m.remaining); } }; bc.postMessage({ kind: 'hello' }); /* ask a show that is already running for its state */ const hello = setInterval(() => { if (!st) bc.postMessage({ kind: 'hello' }); }, 3000); const t = setInterval(() => setClock(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })), 1000); return () => { clearInterval(t); clearInterval(hello); }; }, [bc]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c: string, id?: string) => bc.postMessage({ kind: 'cmd', cmd: c, id });
  const list = useMemo(() => show ? show.chapters.flatMap(c => c.slides.map(s => ({ s, c }))) : [], [show]);
  const cur = st && st.idx >= 0 ? list[st.idx] : undefined; const nxt = st ? list[st.idx + 1] : undefined;
  const ctx = (c?: typeof list[number]['c']) => ({ assets, settings: show!.settings, chapter: c });
  // keep the current slide visible in the strip
  useEffect(() => { const el = strip.current?.querySelector<HTMLElement>('button.cur'); el?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [st?.idx]);
  if (!show) return <div className="loading">טוען…</div>;
  return (
    <div className="presenter">
      <div className="pr-top">
        <div className="pr-k big"><div className="v">{clock || '--:--'}</div><div className="l">שעה</div></div>
        <div className="pr-k small"><div className="v">{fmtTime(elapsed)}</div><div className="l">זמן שעבר</div></div>
        <div className="pr-k big"><div className="v">{fmtTime(remaining)}</div><div className="l">נותר (משוער)</div></div>
        <div className="pr-k small"><div className="v">{st ? `${st.idx + 1}/${st.total}` : '—'}</div><div className="l">שקופית</div></div>
        <div className="grow" />
        <div className="pr-controls btn-group">
          <button className="btn" onClick={() => cmd('prev')}><SkipBack /> הקודם</button>
          <button className="btn" onClick={() => cmd('pause')}>{st?.paused ? <Play /> : <Pause />} {st?.paused ? 'המשך' : 'השהה'}</button>
          <button className="btn primary" onClick={() => cmd('next')}>הבא <SkipForward /></button>
          <button className="btn" onClick={() => cmd('black')}><Square /> שחור</button>
          <button className="btn" onClick={() => cmd('mute')}>{st?.muted ? <VolumeX /> : <Volume2 />} {st?.muted ? 'בטל השתקה' : 'השתק'}</button>
          <button className="btn" onClick={() => cmd('restart')}><RotateCcw /> מההתחלה</button>
        </div>
        <ChromeToggle />
      </div>
      <div className="pr-top pr-themes">
        <span className="muted small">ערכת צבעים (מיידי, לכל המצגת):</span>
        {THEMES.map(t => <button key={t.id} className="btn sm" aria-pressed={st?.theme === t.id} onClick={() => cmd('theme', t.id)} title={t.description}><span className="theme-mini"><i style={{ background: t.accent }} />{t.name}</span></button>)}
        {st?.liveTheme && <button className="btn sm ghost" onClick={() => cmd('theme', undefined)}>חזרה לערכת המצגת</button>}
      </div>
      <div className="pr-stage" data-theme={st?.theme ?? show.settings.theme}>
        <span className="pr-lab">עכשיו{cur ? ` · ${cur.c.title} · ${TYPE_LABEL[cur.s.type]}` : ''}{st ? ` · ${themeById(st.theme).name}` : ''}</span>
        {cur ? <SlideView slide={cur.s} ctx={ctx(cur.c)} animate={false} /> : <div className="empty-hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#cbd5e1' }}>{st ? 'המצגת נטענה. לחצו „התחל” בחלון המצגת.' : 'פתחו את חלון המצגת (/show) באותו דפדפן. התצוגה כאן מתעדכנת אוטומטית.'}</div>}
      </div>
      <div className="pr-side">
        <div className="pr-stage" style={{ aspectRatio: '16/9' }} data-theme={nxt ? resolveTheme(show.settings.theme, nxt.c.theme, nxt.s.theme, st?.liveTheme) : st?.theme}>
          <span className="pr-lab">הבא{nxt ? ` · ${nxt.c.title} · ${TYPE_LABEL[nxt.s.type]}` : ''}</span>
          {nxt ? <SlideView slide={nxt.s} ctx={ctx(nxt.c)} animate={false} /> : <div className="empty-hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#cbd5e1' }}>סוף המצגת</div>}
        </div>
        <div className="pr-notes"><div className="nl">הערות</div>
          {cur ? [cur.s.notes, st?.manual ? '⏸ ממתין ללחיצה' : `⏱ ${fmtTime(slideSeconds(cur.s, cur.c, show.settings, assets))}`, (cur.s as any).caption, (cur.s as any).name ? `ברכה: ${(cur.s as any).name}${(cur.s as any).relation ? ` (${(cur.s as any).relation})` : ''}` : null].filter(Boolean).join(' · ') : '—'}
        </div>
      </div>
      <div className="pr-strip" ref={strip}>
        {show.chapters.map(c => <div key={c.id} className="grp"><span className="gt" title={c.title}>{c.title}</span>{c.slides.map(s => { const i = list.findIndex(e => e.s.id === s.id); const th = slideThumbAsset(s); const a = th ? assets[th] : undefined; return <button key={s.id} className={i === st?.idx ? 'cur' : i < (st?.idx ?? -1) ? 'done' : ''} onClick={() => cmd('goto', s.id)} title={`${i + 1} · ${c.title} · ${TYPE_LABEL[s.type]}`}>{a && <img src={assetThumb(a)} alt="" />}<span className="n">{i + 1}</span><span className="t">{TYPE_LABEL[s.type]}{s.type === 'chapter' ? ` ${s.label}` : ''}</span></button>; })}</div>)}
      </div>
    </div>
  );
}

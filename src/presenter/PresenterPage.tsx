import { useEffect, useMemo, useState } from 'react';
import { Pause, Play, SkipBack, SkipForward, Square, Volume2, RotateCcw } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { SlideView } from '@/show/SlideView';
import type { PlayerState } from '@/show/engine';
import { CHANNEL } from '@/show/ShowPage';
import { fmtTime, slideSeconds, TYPE_LABEL } from '@shared/model';
import { THEMES, themeById, resolveTheme } from '@shared/themes';

export function PresenterPage() {
  const show = useShow(s => s.show); const load = useShow(s => s.load);
  const assets = useLibrary(s => s.assets); const loadLib = useLibrary(s => s.load);
  const [st, setSt] = useState<PlayerState | null>(null); const [elapsed, setElapsed] = useState(0); const [remaining, setRemaining] = useState(0); const [clock, setClock] = useState('');
  const [bc] = useState(() => new BroadcastChannel(CHANNEL));
  useEffect(() => { void load(); void loadLib(); document.title = 'סבא יהודה 80 · מציג'; }, [load, loadLib]);
  useEffect(() => { bc.onmessage = (e) => { const m = e.data; if (m.kind === 'state') { setSt(m.state); setElapsed(m.elapsed); setRemaining(m.remaining); } else if (m.kind === 'tick') { setElapsed(m.elapsed); setRemaining(m.remaining); } }; bc.postMessage({ kind: 'hello' }); /* ask a show that is already running for its state */ const hello = setInterval(() => { if (!st) bc.postMessage({ kind: 'hello' }); }, 3000); const t = setInterval(() => setClock(new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })), 1000); return () => { clearInterval(t); clearInterval(hello); }; }, [bc]); // eslint-disable-line react-hooks/exhaustive-deps
  const cmd = (c: string, id?: string) => bc.postMessage({ kind: 'cmd', cmd: c, id });
  const list = useMemo(() => show ? show.chapters.flatMap(c => c.slides.map(s => ({ s, c }))) : [], [show]);
  const cur = st && st.idx >= 0 ? list[st.idx] : undefined; const nxt = st ? list[st.idx + 1] : undefined;
  const ctx = (c?: typeof list[number]['c']) => ({ assets, settings: show!.settings, chapter: c });
  if (!show) return <div className="loading">טוען…</div>;
  return (
    <div className="presenter">
      <div className="pr-top">
        <div className="pr-k"><div className="v">{clock || '--:--'}</div><div className="l">שעה</div></div>
        <div className="pr-k"><div className="v">{fmtTime(elapsed)}</div><div className="l">זמן שעבר</div></div>
        <div className="pr-k"><div className="v">{fmtTime(remaining)}</div><div className="l">נותר (משוער)</div></div>
        <div className="pr-k"><div className="v">{st ? `${st.idx + 1}/${st.total}` : '—'}</div><div className="l">שקופית</div></div>
        <div className="grow" />
        <div className="pr-controls">
          <button className="btn" onClick={() => cmd('prev')}><SkipBack /> הקודם</button>
          <button className="btn" onClick={() => cmd('pause')}>{st?.paused ? <Play /> : <Pause />} {st?.paused ? 'המשך' : 'השהה'}</button>
          <button className="btn primary" onClick={() => cmd('next')}>הבא <SkipForward /></button>
          <button className="btn" onClick={() => cmd('black')}><Square /> שחור</button>
          <button className="btn" onClick={() => cmd('mute')}><Volume2 /> {st?.muted ? 'בטל השתקה' : 'השתק'}</button>
          <button className="btn ghost" onClick={() => cmd('restart')}><RotateCcw /> מההתחלה</button>
        </div>
      </div>
      <div className="pr-top" style={{ gridColumn: '1 / -1' }}>
        <span className="muted small">ערכת צבעים (מיידי, לכל המצגת):</span>
        {THEMES.map(t => <button key={t.id} className={`btn sm ${st?.theme === t.id ? 'gold' : ''}`} onClick={() => cmd('theme', t.id)} title={t.description}><span className="theme-mini"><i style={{ background: t.accent, borderColor: t.fg }} />{t.name}</span></button>)}
        {st?.liveTheme && <button className="btn sm ghost" onClick={() => cmd('theme', undefined)}>חזרה לערכת המצגת</button>}
      </div>
      <div className="pr-stage" data-theme={st?.theme ?? show.settings.theme}>
        <span className="pr-lab">עכשיו{cur ? ` · ${cur.c.title} · ${TYPE_LABEL[cur.s.type]}` : ''}{st ? ` · ${themeById(st.theme).name}` : ''}</span>
        {cur ? <SlideView slide={cur.s} ctx={ctx(cur.c)} animate={false} /> : <div className="empty-hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>{st ? 'המצגת נטענה. לחץ „התחל” בחלון המצגת.' : 'פתח את חלון המצגת (/show) באותו דפדפן — התצוגה כאן מתעדכנת אוטומטית.'}</div>}
      </div>
      <div className="pr-side">
        <div className="pr-stage" style={{ aspectRatio: '16/9' }} data-theme={nxt ? resolveTheme(show.settings.theme, nxt.c.theme, nxt.s.theme, st?.liveTheme) : st?.theme}>
          <span className="pr-lab">הבא{nxt ? ` · ${nxt.c.title} · ${TYPE_LABEL[nxt.s.type]}` : ''}</span>
          {nxt ? <SlideView slide={nxt.s} ctx={ctx(nxt.c)} animate={false} /> : <div className="empty-hint" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>סוף המצגת</div>}
        </div>
        <div className="pr-notes">
          {cur ? [cur.s.notes, st?.manual ? '⏸ ממתין ללחיצה' : `⏱ ${fmtTime(slideSeconds(cur.s, cur.c, show.settings, assets))}`, (cur.s as any).caption, (cur.s as any).name ? `ברכה: ${(cur.s as any).name}${(cur.s as any).relation ? ` (${(cur.s as any).relation})` : ''}` : null].filter(Boolean).join(' · ') : '—'}
        </div>
      </div>
      <div className="pr-list">
        {list.map((e, i) => <button key={e.s.id} className={i === st?.idx ? 'cur' : i < (st?.idx ?? -1) ? 'done' : ''} onClick={() => cmd('goto', e.s.id)} title={`${e.c.title} · ${TYPE_LABEL[e.s.type]}`}>{i + 1} · {TYPE_LABEL[e.s.type]}{e.s.type === 'chapter' ? ` ${e.s.label}` : ''}</button>)}
      </div>
    </div>
  );
}

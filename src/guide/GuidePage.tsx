/** The guide: a standalone page (/guide) with chapter navigation, live demos, a progress checklist read from the real show, and "try it" buttons that drive the editor. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, LayoutList, Compass, Printer, CheckCircle2, Circle, ChevronLeft, ChevronRight } from 'lucide-react';
import { CHAPTERS } from './content';
import { guideSend, openEditor, type GuideCmd } from './bridge';
import { api } from '@/api';
import { Show as ShowSchema, type Show, type Asset, slideAssetIds } from '@shared/model';

interface Item { id: string; t: string; done: boolean; hint: string; cmd?: GuideCmd }
function progressItems(show: Show | null, assets: Asset[], versions: { label: string | null }[], rehearsed: boolean): Item[] {
  const photos = assets.filter(a => a.type === 'photo' && a.status === 'ready'), videos = assets.filter(a => a.type === 'video' && a.status === 'ready'), music = assets.filter(a => a.type === 'music' && a.status === 'ready');
  const slides = show?.chapters.flatMap(c => c.slides) ?? []; const used = new Set(slides.flatMap(slideAssetIds));
  const photoSlides = slides.filter(s => s.type === 'photo'); const captioned = photoSlides.filter(s => s.type === 'photo' && s.caption).length;
  return [
    { id: 'photos', t: 'תמונות', done: photos.length > 0, hint: photos.length ? `${photos.length} תמונות` : '„הוסף” בספרייה, או גררו תמונות לחלון העורך', cmd: { cmd: 'dialog', id: 'ingest' } },
    { id: 'videos', t: 'סרטוני ברכה', done: videos.length > 0, hint: videos.length ? `${videos.length} ברכות` : 'media/videos/greetings', cmd: { cmd: 'dialog', id: 'ingest' } },
    { id: 'music', t: 'מוזיקה', done: music.length > 0, hint: music.length ? `${music.length} קטעים` : 'media/music', cmd: { cmd: 'dialog', id: 'ingest' } },
    { id: 'chapters', t: 'לפחות 3 פרקים', done: (show?.chapters.length ?? 0) >= 3, hint: `${show?.chapters.length ?? 0} פרקים`, cmd: { cmd: 'dialog', id: 'auto' } },
    { id: 'slides', t: 'לפחות 20 שקופיות', done: slides.length >= 20, hint: `${slides.length} שקופיות` },
    { id: 'intro', t: 'פתיחה וסיום', done: slides.some(s => s.type === 'intro') && slides.some(s => s.type === 'finale'), hint: 'שקופית „פתיחה” בהתחלה ו„סיום” בסוף' },
    { id: 'captions', t: 'כיתובים לתמונות', done: photoSlides.length > 0 && captioned / photoSlides.length >= .8, hint: photoSlides.length ? `${captioned} מתוך ${photoSlides.length}` : 'אין עדיין שקופיות תמונה' },
    { id: 'chmusic', t: 'מוזיקה לכל פרק', done: !!show && show.chapters.length > 0 && show.chapters.every(c => c.musicId || !c.slides.some(s => s.type !== 'video' && s.type !== 'black')), hint: show ? `${show.chapters.filter(c => c.musicId).length} מתוך ${show.chapters.length}` : '' },
    { id: 'greetings', t: 'כל הברכות במצגת', done: videos.length > 0 && videos.every(v => used.has(v.id)), hint: videos.length ? `${videos.filter(v => used.has(v.id)).length} מתוך ${videos.length}` : 'אין ברכות בספרייה' },
    { id: 'version', t: 'גרסה עם שם', done: versions.some(v => v.label), hint: '„גרסאות” → שם לגרסה הנוכחית', cmd: { cmd: 'dialog', id: 'versions' } },
    { id: 'rehearsed', t: 'חזרה גנרלית', done: rehearsed, hint: 'מסומן אוטומטית כשהמצגת מגיעה לשקופית האחרונה', cmd: { cmd: 'show' } },
  ];
}

export function GuidePage() {
  const [q, setQ] = useState(''); const [active, setActive] = useState(CHAPTERS[0].id); const [show, setShow] = useState<Show | null>(null); const [assets, setAssets] = useState<Asset[]>([]); const [versions, setVersions] = useState<{ label: string | null }[]>([]); const [rehearsed, setRehearsed] = useState(false); const [online, setOnline] = useState(true);
  const main = useRef<HTMLElement>(null); const spyLock = useRef(0); // the scroll spy stays quiet while a programmatic scroll is in flight
  useEffect(() => { document.title = 'סבא יהודה 80 · מדריך'; }, []);
  // live progress from the real show; refresh on focus and every 8 s
  useEffect(() => {
    let alive = true;
    const load = async () => { try { const [s, a, v, r] = await Promise.all([api.show(), api.assets(), api.versions().catch(() => []), api.kvGet<{ at: string }>('rehearsed').catch(() => null)]); if (!alive) return; setShow(ShowSchema.parse(s)); setAssets(a); setVersions(v); setRehearsed(!!r); setOnline(true); } catch { if (alive) setOnline(false); } };
    void load(); const id = setInterval(load, 8000); window.addEventListener('focus', load); return () => { alive = false; clearInterval(id); window.removeEventListener('focus', load); };
  }, []);
  const items = useMemo(() => progressItems(show, assets, versions, rehearsed), [show, assets, versions, rehearsed]); const done = items.filter(i => i.done).length;
  const visible = useMemo(() => { const s = q.trim().toLowerCase(); if (!s) return CHAPTERS; return CHAPTERS.filter(c => `${c.title} ${c.blurb} ${c.keywords}`.toLowerCase().includes(s)); }, [q]);
  // scroll spy + hash
  useEffect(() => {
    const root = main.current; if (!root) return;
    const io = new IntersectionObserver(es => { if (Date.now() < spyLock.current) return; const top = es.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (top) setActive((top.target as HTMLElement).dataset.chapter!); }, { root, rootMargin: '-10% 0px -70% 0px', threshold: 0 });
    root.querySelectorAll('[data-chapter]').forEach(el => io.observe(el)); return () => io.disconnect();
  }, [visible]);
  const go = (id: string) => { const el = main.current?.querySelector<HTMLElement>(`[data-chapter="${id}"]`); if (el) { spyLock.current = Date.now() + 1200; el.scrollIntoView({ block: 'start', behavior: 'smooth' }); history.replaceState(null, '', '#' + id); setActive(id); } };
  useEffect(() => { const h = location.hash.slice(1); if (h && CHAPTERS.some(c => c.id === h)) setTimeout(() => go(h), 80); const onHash = () => { const x = location.hash.slice(1); if (x) go(x); }; window.addEventListener('hashchange', onHash); return () => window.removeEventListener('hashchange', onHash); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const idx = CHAPTERS.findIndex(c => c.id === active);
  return (
    <div className="guide">
      <header className="guide-head">
        <div className="brand"><span className="mark">80</span><span>סבא יהודה</span><span className="guide-title">המדריך</span></div>
        <div className="search guide-search"><Search /><input value={q} onChange={e => setQ(e.target.value)} placeholder="חיפוש במדריך… (למשל: מוקד, מוזיקה, T)" aria-label="חיפוש במדריך" /></div>
        <span className="grow" />
        <span className={`pill ${online ? 'ok' : 'bad'}`}><span className="dot" />{online ? 'מחובר לעורך' : 'השרת לא רץ'}</span>
        <button className="btn" onClick={() => guideSend({ cmd: 'tour' })}><Compass /> סיור מודרך בעורך</button>
        <button className="btn ghost icon tip" data-tip="הדפסה / שמירה כ־PDF" onClick={() => window.print()}><Printer /></button>
        <button className="btn primary" onClick={() => openEditor()}><LayoutList /> פתח את העורך</button>
      </header>
      <nav className="guide-nav" aria-label="פרקי המדריך">
        <div className="guide-progress">
          <div className="row" style={{ justifyContent: 'space-between' }}><b>המצגת שלכם</b><span className="num muted">{done} / {items.length}</span></div>
          <div className="prog"><i style={{ width: `${done / items.length * 100}%` }} /></div>
          <ul>{items.map(it => <li key={it.id} className={it.done ? 'done' : ''} title={it.hint}>{it.done ? <CheckCircle2 /> : <Circle />}<span>{it.t}</span>{!it.done && it.cmd && <button className="btn sm ghost" onClick={() => guideSend(it.cmd!)}>לשם</button>}</li>)}</ul>
          {!online && <div className="muted small" style={{ marginTop: 6 }}>הרשימה מתעדכנת כשהשרת רץ (npm start).</div>}
        </div>
        <ol>{CHAPTERS.map((c, i) => <li key={c.id}><button className={active === c.id ? 'cur' : ''} onClick={() => go(c.id)} disabled={!visible.includes(c)}><span className="n num">{i + 1}</span><span className="ic">{c.icon}</span><span className="t"><b>{c.title}</b><small>{c.blurb}</small></span></button></li>)}</ol>
      </nav>
      <main className="guide-main" ref={main}>
        {visible.length === 0 && <div className="empty-hint">אין פרק שמתאים ל„{q}”. נסו מילה אחרת, או עברו לפרק „כל קיצורי המקלדת”.</div>}
        {visible.map((c, i) => <section key={c.id} className="guide-ch" data-chapter={c.id} id={c.id}>
          <header><span className="n num">{CHAPTERS.indexOf(c) + 1}</span><span className="ic">{c.icon}</span><div><h2>{c.title}</h2><p>{c.blurb}</p></div></header>
          <div className="guide-body">{c.body}</div>
          <footer className="guide-ch-f">{i > 0 && <button className="btn sm ghost" onClick={() => go(visible[i - 1].id)}><ChevronRight /> {visible[i - 1].title}</button>}<span className="grow" />{i < visible.length - 1 && <button className="btn sm" onClick={() => go(visible[i + 1].id)}>{visible[i + 1].title} <ChevronLeft /></button>}</footer>
        </section>)}
        <div className="guide-end muted small">סבא יהודה 80 · המדריך מכסה את כל היכולות בגרסה הזאת. פרק {idx + 1} מתוך {CHAPTERS.length}.</div>
      </main>
    </div>
  );
}

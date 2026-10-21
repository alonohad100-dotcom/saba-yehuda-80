import { useState } from 'react';
import { Undo2, Redo2, Settings, History, HardDriveDownload, Play, MonitorSpeaker, HelpCircle, Plus, Save, Sparkles, Palette, BookOpen, MoreHorizontal, PackageCheck } from 'lucide-react';
import { useStore } from 'zustand';
import { ThemeGrid, ThemeSwatch } from './ThemePicker';
import { ChromeToggle } from './ChromeToggle';
import { useShow, undo, redo, saveNow, showTotals } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { fmtTime } from '@shared/model';
import { toast } from '@/store/toast';
import { openGuide } from '@/guide/bridge';

export function TopBar() {
  const show = useShow(s => s.show)!; const save = useShow(s => s.save); const lastSavedAt = useShow(s => s.lastSavedAt); const addChapter = useShow(s => s.addChapter); const sel = useShow(s => s.selection);
  const assets = useLibrary(s => s.assets); const openDialog = useUi(s => s.openDialog); const updateSettings = useShow(s => s.updateSettings); const [themeOpen, setThemeOpen] = useState(false); const [more, setMore] = useState(false);
  const t = showTotals(show, assets);
  const past = useStore(useShow.temporal, s => s.pastStates.length), future = useStore(useShow.temporal, s => s.futureStates.length); // reactive: buttons enable the moment there is history
  const label = save === 'saving' ? 'שומר…' : save === 'dirty' ? 'שינויים לא שמורים' : save === 'error' ? 'שגיאת שמירה' : lastSavedAt ? `נשמר ${new Date(lastSavedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'נשמר';
  const playFrom = () => { const id = sel.slideIds[0]; window.open(`/show${id ? `?from=${id}` : ''}`, 'sy80-show', 'popup=no'); };
  return (
    <header className="topbar">
      <div className="tb-group">
        <div className="brand"><span className="mark">80</span><span>{show.meta.title.replace(/\s*80\s*$/, '')}</span></div>
        <span className={`savestate ${save}`} data-tour="save" title={save === 'error' ? useShow.getState().saveError : 'כל שינוי נשמר מעצמו'}><span className="dot" />{label}</span>
        <span className="totals" title={`${t.slides} שקופיות · ${t.chapters} פרקים · ${t.videos} ברכות`}><b className="num">{fmtTime(t.seconds)}</b><span>{t.slides} שק׳ · {t.chapters} פרקים · {t.videos} ברכות</span></span>
      </div>
      <div className="tb-group tb-center">
        <button className="btn tip" data-tour="ingest" data-tip="קליטת מדיה מהתיקייה media/" onClick={() => openDialog('ingest')}><HardDriveDownload /><span className="lbl">ספרייה</span></button>
        <button className="btn soft gold tip" data-tour="auto" data-tip="יצירת מצגת שלמה מספריית התמונות" onClick={() => openDialog('auto')}><Sparkles /><span className="lbl">צור אוטומטית</span></button>
        <button className="btn tip" data-tour="add-chapter" data-tip="פרק חדש אחרי הפרק הנבחר" onClick={() => addChapter(sel.chapterId ?? undefined)}><Plus /><span className="lbl">פרק</span></button>
      </div>
      <div className="tb-group">
        <div className="btn-group">
          <button className="btn ghost icon tip" data-tip="בטל (Ctrl+Z)" onClick={undo} disabled={!past}><Undo2 /></button>
          <button className="btn ghost icon tip" data-tip="חזור (Ctrl+Y)" onClick={redo} disabled={!future}><Redo2 /></button>
          <button className="btn ghost icon tip" data-tip="שמור עכשיו (Ctrl+S)" onClick={() => saveNow().then(() => toast('נשמר', 'ok'))}><Save /></button>
        </div>
        <span className="tb-group tb-secondary">
          <div style={{ position: 'relative' }}>
            <button className="btn tip" data-tour="theme" data-tip="ערכת צבעים של המצגת (ניתן לדרוס בפרק או בשקופית)" onClick={() => setThemeOpen(o => !o)}><Palette /> <ThemeSwatch id={show.settings.theme} /></button>
            {themeOpen && <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setThemeOpen(false)} /><div className="theme-pop"><div className="row" style={{ marginBottom: 8 }}><b>ערכת צבעים של המצגת</b><span className="muted small grow">משנה את כל המצגת מיד · בפרק או בשקופית אפשר לבחור ערכה אחרת · במצגת: <kbd>T</kbd> מחליף ערכה חי</span></div><ThemeGrid value={show.settings.theme} onChange={id => { if (id) { updateSettings({ theme: id }); toast(`ערכת צבעים: ${id}`, 'ok'); } }} /></div></>}
          </div>
          <button className="btn tip" data-tour="versions" data-tip="היסטוריית גרסאות" onClick={() => openDialog('versions')}><History /><span className="lbl">גרסאות</span></button>
          <button className="btn tip" data-tour="export" data-tip="ייצוא המצגת עם כל התמונות, הסרטונים והמוזיקה לתיקייה או לדיסק און קי" onClick={() => openDialog('export')}><PackageCheck /><span className="lbl">ייצוא</span></button>
          <button className="btn ghost icon tip" data-tour="settings" data-tip="הגדרות המצגת" onClick={() => openDialog('settings')}><Settings /></button>
          <ChromeToggle />
          <button className="btn tip" data-tour="guide" data-tip="המדריך המלא: כל היכולות עם הדגמות חיות, וסיור מודרך" onClick={() => openGuide()}><BookOpen /><span className="lbl">מדריך</span></button>
          <button className="btn ghost icon tip" data-tour="help" data-tip="עזרה וקיצורי מקלדת (?)" onClick={() => openDialog('help')}><HelpCircle /></button>
        </span>
        <div className="tb-more">
          <button className="btn icon tip" data-tip="עוד" onClick={() => setMore(m => !m)}><MoreHorizontal /></button>
          {more && <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setMore(false)} /><div className="menu" style={{ top: '110%', insetInlineEnd: 0 }}>
            <button onClick={() => { setMore(false); setThemeOpen(true); }}><Palette /> ערכת צבעים של המצגת</button>
            <button onClick={() => { setMore(false); openDialog('versions'); }}><History /> גרסאות</button>
            <button onClick={() => { setMore(false); openDialog('export'); }}><PackageCheck /> ייצוא המצגת</button>
            <button onClick={() => { setMore(false); openDialog('settings'); }}><Settings /> הגדרות</button>
            <button onClick={() => { setMore(false); openGuide(); }}><BookOpen /> מדריך</button>
            <button onClick={() => { setMore(false); openDialog('help'); }}><HelpCircle /> עזרה</button>
          </div></>}
        </div>
        <span className="sep" />
        <button className="btn tip" data-tour="presenter" data-tip="חלון המציג (למסך הלפטופ כשהטלוויזיה מחוברת)" onClick={() => window.open('/presenter', 'sy80-presenter')}><MonitorSpeaker /><span className="lbl">מציג</span></button>
        <button className="btn primary" data-tour="play" onClick={playFrom}><Play /> {sel.slideIds.length ? 'נגן מכאן' : 'נגן מצגת'}</button>
      </div>
    </header>
  );
}

import { useState } from 'react';
import { Undo2, Redo2, Settings, History, HardDriveDownload, Play, MonitorSpeaker, HelpCircle, Plus, Save, Sparkles, Palette } from 'lucide-react';
import { useStore } from 'zustand';
import { ThemeGrid, ThemeSwatch } from './ThemePicker';
import { useShow, undo, redo, saveNow, showTotals } from '@/store/show';
import { useLibrary } from '@/store/library';
import { useUi } from './ui';
import { fmtTime } from '@shared/model';
import { toast } from '@/store/toast';

export function TopBar() {
  const show = useShow(s => s.show)!; const save = useShow(s => s.save); const lastSavedAt = useShow(s => s.lastSavedAt); const addChapter = useShow(s => s.addChapter); const sel = useShow(s => s.selection);
  const assets = useLibrary(s => s.assets); const openDialog = useUi(s => s.openDialog); const updateSettings = useShow(s => s.updateSettings); const [themeOpen, setThemeOpen] = useState(false);
  const t = showTotals(show, assets);
  const past = useStore(useShow.temporal, s => s.pastStates.length), future = useStore(useShow.temporal, s => s.futureStates.length); // reactive: buttons enable the moment there is history
  const label = save === 'saving' ? 'שומר…' : save === 'dirty' ? 'שינויים לא שמורים' : save === 'error' ? 'שגיאת שמירה' : lastSavedAt ? `נשמר ${new Date(lastSavedAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}` : 'נשמר';
  const playFrom = () => { const id = sel.slideIds[0]; window.open(`/show${id ? `?from=${id}` : ''}`, 'sy80-show', 'popup=no'); };
  return (
    <header className="topbar">
      <div className="brand"><span>{show.meta.title.replace(/\s*80\s*$/, '')}</span><b>80</b></div>
      <span className={`savestate ${save}`} title={save === 'error' ? useShow.getState().saveError : ''}><span className="dot" />{label}</span>
      <span className="pill"><span>סה״כ</span><b className="num">{fmtTime(t.seconds)}</b><span className="muted">· {t.slides} שק׳ · {t.chapters} פרקים · {t.videos} ברכות</span></span>
      <div className="grow" />
      <button className="btn ghost icon tip" data-tip="בטל (Ctrl+Z)" onClick={undo} disabled={!past}><Undo2 /></button>
      <button className="btn ghost icon tip" data-tip="חזור (Ctrl+Y)" onClick={redo} disabled={!future}><Redo2 /></button>
      <button className="btn ghost icon tip" data-tip="שמור עכשיו (Ctrl+S)" onClick={() => saveNow().then(() => toast('נשמר', 'ok'))}><Save /></button>
      <span className="sep" />
      <div style={{ position: 'relative' }}>
        <button className="btn tip" data-tip="ערכת צבעים של המצגת (ניתן לדרוס בפרק או בשקופית)" onClick={() => setThemeOpen(o => !o)}><Palette /> <ThemeSwatch id={show.settings.theme} /></button>
        {themeOpen && <><div style={{ position: 'fixed', inset: 0, zIndex: 39 }} onClick={() => setThemeOpen(false)} /><div className="theme-pop"><div className="row" style={{ marginBottom: 8 }}><b>ערכת צבעים</b><span className="muted small grow">משנה את כל המצגת מיד · בפרק או בשקופית אפשר לבחור ערכה אחרת · במצגת: <kbd>T</kbd> מחליף ערכה חי</span></div><ThemeGrid value={show.settings.theme} onChange={id => { if (id) { updateSettings({ theme: id }); toast(`ערכת צבעים: ${id}`, 'ok'); } }} /></div></>}
      </div>
      <button className="btn gold tip" data-tip="יצירת מצגת שלמה מספריית תמונות" onClick={() => openDialog('auto')}><Sparkles /> צור אוטומטית</button>
      <button className="btn" onClick={() => addChapter(sel.chapterId ?? undefined)}><Plus /> פרק</button>
      <button className="btn tip" data-tip="קליטת מדיה מהתיקייה media/" onClick={() => openDialog('ingest')}><HardDriveDownload /> ספרייה</button>
      <button className="btn tip" data-tip="היסטוריית גרסאות" onClick={() => openDialog('versions')}><History /> גרסאות</button>
      <button className="btn tip" data-tip="הגדרות המצגת" onClick={() => openDialog('settings')}><Settings /></button>
      <button className="btn ghost icon tip" data-tip="עזרה וקיצורי מקלדת (?)" onClick={() => openDialog('help')}><HelpCircle /></button>
      <span className="sep" />
      <button className="btn tip" data-tip="חלון המציג (למסך הלפטופ כשהטלוויזיה מחוברת)" onClick={() => window.open('/presenter', 'sy80-presenter')}><MonitorSpeaker /> מציג</button>
      <button className="btn primary" onClick={playFrom}><Play /> {sel.slideIds.length ? 'נגן מכאן' : 'נגן מצגת'}</button>
    </header>
  );
}

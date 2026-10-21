/** Guided tour inside the editor: a spotlight on the real control plus a card with the explanation. Targets are `[data-tour]` attributes. */
import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react';
import { X, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react';
import { useUi } from '@/editor/ui';
import { useShow } from '@/store/show';
import { openGuide } from './bridge';

export interface TourStep { target: string; title: string; body: ReactNode; guide?: string; before?: () => void }
export const TOURS: Record<string, { title: string; steps: TourStep[] }> = {
  editor: { title: 'סיור בעורך', steps: [
    { target: 'library', title: 'ספריית המדיה', body: <>כל התמונות, סרטוני הברכה והמוזיקה שנסרקו מהתיקייה <code>media/</code>. סינון לפי סוג, עשור ותיקייה; חיפוש; <kbd>Ctrl</kbd> ו־<kbd>Shift</kbd> לבחירה מרובה. גוררים מכאן אל הסטוריבורד, או לוחצים לחיצה כפולה. כאן מתחילים: „הוסף” בראש הספרייה בוחר קבצים או תיקייה שלמה, ואפשר גם לגרור קבצים ותיקיות מהמחשב לכל מקום בחלון. הם מועתקים אל media/&lrm; ונסרקים.</>, guide: 'media' },
    { target: 'ingest', title: 'סריקה של media/‎', body: <>מי שמעתיק קבצים בעצמו אל <code>media/photos</code>, <code>media/videos/greetings</code> ו־<code>media/music</code> (ב„הוסף” → „פתח את media/&lrm; בסייר”) לוחץ כאן „סרוק”. העיבוד חד־פעמי; קבצים שכבר עובדו לא מעובדים שוב.</>, guide: 'media' },
    { target: 'storyboard', title: 'הסטוריבורד', body: <>המצגת עצמה: פרקים (שורות) ושקופיות (כרטיסים). גרירה משנה סדר ומעבירה בין פרקים. לחיצה בוחרת, לחיצה כפולה מנגנת מהשקופית הזאת.</>, guide: 'structure' },
    { target: 'chapter', title: 'ראש הפרק', body: <>לחיצה על ראש הפרק פותחת אותו במפקח: שם, מוזיקה ונקודת ההתחלה שלה, ערכת צבעים לפרק, ברירות מחדל (משך, מעבר, תנועת מצלמה), נעילה ומילוי אוטומטי.</>, guide: 'structure' },
    { target: 'add-slide', title: 'שקופיות טקסט', body: <>הפלוס בסוף כל פרק מוסיף שקופיות שאינן תמונה: כותרת פרק, ציטוט, ציר זמן, שמות, פתיחה, סיום, קיר ברכות ומסך שחור.</>, guide: 'slides' },
    { target: 'stage', title: 'התצוגה המקדימה', body: <>השקופית הנבחרת בדיוק כפי שתיראה בטלוויזיה, כולל האנימציה. לחיצה על תמונה קובעת את <b>נקודת המוקד</b> (סביבה מתבצעים הזום והתנועה). שכבות עיצוב גוררים ישירות כאן.</>, guide: 'photo' },
    { target: 'add-tools', title: 'כלי העיצוב', body: <>הוספת <b>טקסט</b> (שישה סגנונות), <b>סמל</b> (80 אייקונים ו־70 אימוג׳י), <b>צורה</b> (מסגרת, פס, מלבן, עיגול) ו<b>תמונה</b> קטנה. לכל שכבה אנימציית כניסה, לולאה ויציאה.</>, guide: 'design' },
    { target: 'preview-tools', title: 'שוליים ואנימציה', body: <>„שוליים” מציג את שולי הבטיחות של הטלוויזיה (טקסט מחוץ להם עלול להיחתך). „נגן שוב” מריץ את האנימציה מההתחלה; „נגן מכאן” פותח את חלון המצגת מהשקופית הזאת.</>, guide: 'photo' },
    { target: 'inspector', title: 'המפקח', body: <>כל ההגדרות של מה שנבחר: שקופית, פרק, או שכבה. ההגדרות מחולקות לקבוצות שנפתחות ונסגרות בלחיצה על הכותרת; כשקבוצה סגורה רואים סיכום קצר שלה. את רוחב הפאנל (וגם של הספרייה) משנים בגרירת הקצה. לשקופית תמונה: כיתוב, שנה, תנועת מצלמה, משך, מעבר, התקדמות, הערות למציג, מראה, מסגרת, סגנון כיתוב, שכבות וערכת צבעים.</>, guide: 'photo' },
    { target: 'checks-tab', title: 'בדיקות', body: <>לשונית במפקח עם רשימת אזהרות שמתעדכנת כל הזמן (המספר עליה הוא כמות הבעיות): פרק בלי מוזיקה, תמונה בלי כיתוב, קובץ חסר, תמונה שחוזרת פעמיים, ברכות שעדיין לא במצגת. לחיצה על אזהרה קופצת אליה.</>, guide: 'safety' },
    { target: 'theme', title: 'ערכת צבעים', body: <>אחת־עשרה ערכות: רקעים, טקסט, מתכת, גופנים עבריים, גרעין וקונפטי. בוחרים כאן לכל המצגת; במפקח אפשר לדרוס לפרק או לשקופית. במצגת עצמה <kbd>T</kbd> מחליף ערכה חי. כפתור הירח / השמש שליד מחליף את הממשק עצמו בין בהיר לכהה (המצגת לא משתנה).</>, guide: 'themes' },
    { target: 'auto', title: 'יצירה אוטומטית', body: <>אשף בארבעה שלבים שבונה מצגת שלמה מספריית התמונות: פרקים לפי תקופות ואירועים, בלי תמונות חוזרות, עם קולאז׳ים, ברכות ומוזיקה. אפשר להחליף הכול, להוסיף פרקים או למלא פרק אחד.</>, guide: 'auto' },
    { target: 'versions', title: 'שמירה וגרסאות', body: <>כל שינוי נשמר מעצמו (הנקודה למעלה). „גרסאות” מציג את 300 השמירות האחרונות וגרסאות עם שם שנשמרות לתמיד; שחזור הוא עצמו גרסה חדשה, כך ששום דבר לא הולך לאיבוד.</>, guide: 'safety' },
    { target: 'play', title: 'הצגה', body: <>„נגן מצגת” פותח את חלון המצגת (מעבירים אותו לטלוויזיה). „מציג” פותח חלון עזר למסך הלפטופ: שקופית נוכחית והבאה, זמנים, הערות ושלט.</>, guide: 'show' },
    { target: 'guide', title: 'המדריך', body: <>הכפתור הזה פותח את המדריך המלא עם הדגמות חיות של כל אפקט, וגם את הסיור הזה שוב. <kbd>?</kbd> פותח את קיצורי המקלדת.</>, guide: 'start' },
  ] },
};

function rectOf(sel: string) { const el = document.querySelector<HTMLElement>(`[data-tour="${sel}"]`); if (!el) return null; const r = el.getBoundingClientRect(); if (!r.width && !r.height) return null; return { el, r }; }

export function Tour() {
  const tour = useUi(s => s.tour); const step = useUi(s => s.tourStep); const setStep = useUi(s => s.setTourStep); const stop = useUi(s => s.stopTour);
  const def = tour ? TOURS[tour] : null; const [box, setBox] = useState<DOMRect | null>(null); const [tick, setTick] = useState(0);
  const cur = def?.steps[step];
  // keep the spotlight glued to the target while layout changes
  useLayoutEffect(() => {
    if (!cur) return; const f = rectOf(cur.target); if (!f) { setBox(null); return; } setBox(f.r);
  }, [cur, tick]);
  useEffect(() => {
    if (!def) return; cur?.before?.(); const el = rectOf(cur?.target ?? '')?.el; el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    const id = setInterval(() => setTick(t => t + 1), 250); const onResize = () => setTick(t => t + 1); window.addEventListener('resize', onResize);
    return () => { clearInterval(id); window.removeEventListener('resize', onResize); };
  }, [def, cur]);
  useEffect(() => {
    if (!def) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); stop(); } else if (e.key === 'ArrowLeft' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); next(); } else if (e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); prev(); } };
    window.addEventListener('keydown', onKey, true); return () => window.removeEventListener('keydown', onKey, true);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  if (!def || !cur) return null;
  const n = def.steps.length;
  const next = () => { if (step >= n - 1) stop(); else setStep(step + 1); };
  const prev = () => setStep(Math.max(0, step - 1));
  // card placement: below the target when there is room, else above; clamped horizontally
  const pad = 8; const W = 380; const vw = window.innerWidth, vh = window.innerHeight;
  let top = 0, left = 0, arrow: 'up' | 'down' | 'none' = 'none';
  if (box) { const below = vh - (box.bottom + pad) > 260; top = below ? box.bottom + pad + 10 : Math.max(10, box.top - pad - 10 - 250); arrow = below ? 'up' : 'down'; left = Math.min(vw - W - 10, Math.max(10, box.left + box.width / 2 - W / 2)); }
  else { top = vh / 2 - 120; left = vw / 2 - W / 2; }
  return (
    <div className="tour" role="dialog" aria-label={def.title}>
      {box ? <div className="tour-spot" style={{ left: box.left - pad, top: box.top - pad, width: box.width + pad * 2, height: box.height + pad * 2 }} /> : <div className="tour-dim" />}
      <div className={`tour-card ${arrow}`} style={{ top, left, width: W }}>
        <div className="tour-h"><span className="tour-n num">{step + 1} / {n}</span><b>{cur.title}</b><button className="btn ghost icon x" onClick={stop} title="סגור (Esc)"><X /></button></div>
        <div className="tour-b">{cur.body}{!box && <div className="muted small" style={{ marginTop: 8 }}>הרכיב הזה לא מוצג כרגע (למשל כי לא נבחרה שקופית). אפשר להמשיך.</div>}</div>
        <div className="tour-f">
          {cur.guide && <button className="btn sm ghost" onClick={() => openGuide(cur.guide)}><BookOpen /> עוד במדריך</button>}
          <span className="grow" />
          <button className="btn sm" disabled={step === 0} title={step === 0 ? 'זאת התחנה הראשונה' : 'התחנה הקודמת (→)'} onClick={prev}><ChevronRight /> הקודם</button>
          <button className="btn sm primary" onClick={next}>{step >= n - 1 ? 'סיום' : 'הבא'} <ChevronLeft /></button>
        </div>
        <div className="tour-dots">{def.steps.map((_, i) => <i key={i} className={i === step ? 'on' : i < step ? 'done' : ''} onClick={() => setStep(i)} />)}</div>
      </div>
    </div>
  );
}

/** Make sure a slide is selected so the preview tools exist before a tour points at them. */
export function ensureSelection() { const st = useShow.getState(); if (!st.show) return; if (st.selection.slideIds.length) return; const c = st.show.chapters.find(x => x.slides.length); if (c) st.select(c.id, [c.slides[0].id]); }

/** First-run card in the editor: offers the full guide, the in-editor tour, or to start working. Remembered on the server (kv 'guide-seen'). */
import { BookOpen, Compass, Rocket, X } from 'lucide-react';
import { useUi } from '@/editor/ui';
import { api } from '@/api';
import { openGuide } from './bridge';
import { ensureSelection } from './Tour';

export const GUIDE_SEEN_KEY = 'guide-seen';
export function Welcome() {
  const open = useUi(s => s.welcome); const setWelcome = useUi(s => s.setWelcome); const startTour = useUi(s => s.startTour);
  if (!open) return null;
  const done = (how: string) => { setWelcome(false); void api.kvSet(GUIDE_SEEN_KEY, { at: new Date().toISOString(), how }).catch(() => {}); };
  return (
    <div className="welcome-back" onClick={() => done('dismiss')}>
      <div className="welcome" onClick={e => e.stopPropagation()} role="dialog" aria-label="ברוכים הבאים">
        <button className="btn ghost icon x" onClick={() => done('dismiss')} title="סגור"><X /></button>
        <div className="welcome-brand"><span className="mark">80</span><span>סבא יהודה</span></div>
        <h2>ברוכים הבאים לעורך המצגת</h2>
        <p className="muted">כאן בונים את מצגת יום ההולדת: תמונות, סרטוני ברכה ומוזיקה, בעריכה חופשית או ביצירה אוטומטית. איך תרצו להתחיל?</p>
        <div className="welcome-opts">
          <button className="welcome-opt" onClick={() => { done('guide'); openGuide('start'); }}><BookOpen /><b>המדריך המלא</b><span>כל היכולות עם הדגמות חיות של כל אפקט, וצעד־אחר־צעד לבניית מצגת שלמה. נפתח בחלון נפרד, ליד העורך.</span></button>
          <button className="welcome-opt" onClick={() => { done('tour'); ensureSelection(); startTour('editor'); }}><Compass /><b>סיור קצר בעורך</b><span>כשתי דקות: 15 תחנות על המסך הזה, כל אחת מסבירה חלק אחד. אפשר לצאת בכל רגע עם Esc.</span></button>
          <button className="welcome-opt" onClick={() => done('start')}><Rocket /><b>ישר לעבודה</b><span>שלוש פעולות: 1 „הוסף” בספרייה, או גררו תמונות ותיקיות לחלון. 2 „צור אוטומטית” או גררו תמונות לסטוריבורד. 3 „נגן מצגת”.</span></button>
        </div>
        <div className="muted small">אפשר לחזור לכאן תמיד: כפתור „מדריך” בסרגל העליון, או <kbd>?</kbd> לקיצורי המקלדת.</div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { useShow } from '@/store/show';
import { useLibrary } from '@/store/library';
import { runChecks } from './checkRules';

export function Checks() {
  const show = useShow(s => s.show)!; const select = useShow(s => s.select); const { assets, list } = useLibrary();
  const checks = useMemo(() => runChecks(show, assets, list), [show, assets, list]);
  const problems = checks.filter(c => c.kind !== 'ok').length;
  return (
    <>
      <div className="panel-h" style={{ borderTop: '1px solid var(--line)' }}>בדיקות <span className="count">{problems ? `${problems}` : '✓'}</span></div>
      <div className="panel-b" style={{ flex: '0 0 auto', maxHeight: 190 }}>
        <div className="checks">{checks.slice(0, 12).map((c, i) => <button key={i} className={`check ${c.kind}`} onClick={() => { if (c.slideId) select(c.chapterId ?? null, [c.slideId]); else if (c.chapterId) select(c.chapterId, []); }}>{c.kind === 'ok' ? <CheckCircle2 /> : c.kind === 'bad' ? <XCircle /> : <AlertTriangle />}<span>{c.text}</span></button>)}{checks.length > 12 && <div className="muted small">ועוד {checks.length - 12}…</div>}</div>
      </div>
    </>
  );
}

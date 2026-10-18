import { useToast } from '@/store/toast';
export function Toasts() {
  const items = useToast(s => s.items);
  return <div className="toasts" aria-live="polite">{items.map(t => <div key={t.id} className={`toast ${t.kind}`}>{t.text}</div>)}</div>;
}

import { Sun, Moon } from 'lucide-react';
import { useChrome } from '@/chrome';

/** Light / dark switch for the tool's own chrome (the show's themes are separate). */
export function ChromeToggle({ className = 'btn ghost icon tip' }: { className?: string }) {
  const theme = useChrome(s => s.theme); const toggle = useChrome(s => s.toggle);
  return <button className={className} data-tip={theme === 'light' ? 'מצב כהה לממשק' : 'מצב בהיר לממשק'} aria-label="מצב תצוגה" data-chrome-toggle onClick={toggle}>{theme === 'light' ? <Moon /> : <Sun />}</button>;
}

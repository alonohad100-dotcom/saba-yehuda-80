import { useEffect, useState } from 'react';
import { EditorPage } from './editor/EditorPage';
import { ShowPage } from './show/ShowPage';
import { PresenterPage } from './presenter/PresenterPage';
import { Toasts } from './editor/Toasts';
import { GuidePage } from './guide/GuidePage';

function route(path: string) { if (path.startsWith('/show')) return 'show'; if (path.startsWith('/presenter')) return 'presenter'; if (path.startsWith('/guide')) return 'guide'; return 'edit'; }

export function App() {
  const [r, setR] = useState(() => route(location.pathname));
  useEffect(() => { const on = () => setR(route(location.pathname)); window.addEventListener('popstate', on); return () => window.removeEventListener('popstate', on); }, []);
  return (<>
    {r === 'show' ? <ShowPage /> : r === 'presenter' ? <PresenterPage /> : r === 'guide' ? <GuidePage /> : <EditorPage />}
    <Toasts />
  </>);
}

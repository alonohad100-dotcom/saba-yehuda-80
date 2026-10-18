/**
 * Guide ↔ editor link. The guide opens in its own window; its "try it" buttons send a command over a BroadcastChannel.
 * An open editor executes it and acknowledges; if nobody answers, the guide opens the editor with the command in the URL.
 */
import { useEffect } from 'react';

export type GuideCmd =
  | { cmd: 'dialog'; id: 'ingest' | 'auto' | 'versions' | 'settings' | 'help' }
  | { cmd: 'tour'; id?: string; step?: number }
  | { cmd: 'chapter' }
  | { cmd: 'select-first' }
  | { cmd: 'show' }
  | { cmd: 'presenter' }
  | { cmd: 'focus' };

const CHANNEL = 'sy80-guide';
export const EDITOR_WINDOW = 'sy80-edit';
export const GUIDE_WINDOW = 'sy80-guide';

export function openGuide(chapter?: string) { window.open(`/guide${chapter ? '#' + chapter : ''}`, GUIDE_WINDOW); }
export function openEditor(cmd?: GuideCmd) { window.open(`/edit${cmd ? '?do=' + encodeURIComponent(JSON.stringify(cmd)) : ''}`, EDITOR_WINDOW); }

/** Send a command to the editor; open the editor with it if no editor window answers within 400 ms. */
export function guideSend(cmd: GuideCmd): Promise<'editor' | 'opened'> {
  // windows must be opened from the user's own click (popup blockers), so the guide opens the show and presenter itself
  if (cmd.cmd === 'show') { window.open('/show', 'sy80-show'); return Promise.resolve('opened'); }
  if (cmd.cmd === 'presenter') { window.open('/presenter', 'sy80-presenter'); return Promise.resolve('opened'); }
  return new Promise(resolve => {
    const id = Math.random().toString(36).slice(2); const bc = new BroadcastChannel(CHANNEL); let done = false;
    const finish = (how: 'editor' | 'opened') => { if (done) return; done = true; bc.close(); resolve(how); };
    bc.onmessage = (e) => { if (e.data?.kind === 'ack' && e.data.id === id) finish('editor'); };
    bc.postMessage({ kind: 'cmd', id, cmd });
    setTimeout(() => { if (!done) { openEditor(cmd); finish('opened'); } }, 400);
  });
}

/** Editor side: run commands from the guide (channel + `?do=` on first load) and acknowledge them. */
export function useGuideBridge(handler: (c: GuideCmd) => void) {
  useEffect(() => {
    const bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => { const m = e.data; if (m?.kind !== 'cmd') return; bc.postMessage({ kind: 'ack', id: m.id }); try { window.focus(); } catch { /* ignore */ } handler(m.cmd as GuideCmd); };
    const url = new URL(location.href); const raw = url.searchParams.get('do');
    if (raw) { url.searchParams.delete('do'); history.replaceState(null, '', url.pathname + url.search + url.hash); try { setTimeout(() => handler(JSON.parse(raw) as GuideCmd), 600); } catch { /* ignore a malformed command */ } }
    return () => bc.close();
  }, [handler]);
}

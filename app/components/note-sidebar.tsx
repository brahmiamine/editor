import Link from 'next/link'
import { useEffect, useRef } from 'react'
import type { Note } from '../lib/notes'
import type { copy, Language } from '../lib/i18n'
type Props = { notes: Note[]; active?: string; select: (id: string) => void; query: string; search: (query: string) => void; add: () => void; remove: (note: Note) => void; t: typeof copy.fr; lang: Language; setLang: (lang: Language) => void; theme: string; setTheme: (theme: string) => void; width: number; setWidth: (width: number) => void; email?: string; signOut: () => void; status: string; retry: () => void; ready: boolean }
export function NoteSidebar(p: Props) {
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus() } }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])
  const state = p.status.startsWith('Erreur') ? 'error' : p.status.endsWith('…') ? 'busy' : 'ok'
  return <aside className="sidebar"><div className="brand"><span className="mark">✳</span><span>papertrail</span><button className="icon-btn" onClick={() => p.setTheme(p.theme === 'paper' ? 'sun' : p.theme === 'sun' ? 'night' : 'paper')} aria-label={p.t.theme} title={p.t.theme}>◐</button></div>
    <label className="search"><span aria-hidden="true">⌕</span><input ref={searchInput} aria-label={p.t.search} placeholder={p.t.search} value={p.query} onChange={event => p.search(event.target.value)} /><kbd>⌘K</kbd></label>
    <div className="side-head"><span>{p.t.notes} <b>{p.notes.length}</b></span><button className="new" disabled={!p.ready} aria-label={p.t.newNote} title={p.t.newNote} onClick={p.add}>＋</button></div>
    <div className="note-list">{p.notes.filter(note => (note.title + ' ' + note.body).toLocaleLowerCase().includes(p.query.toLocaleLowerCase())).map(note => <div className="note-row" key={note.id}><button className={`note-item ${note.id === p.active ? 'selected' : ''}`} onClick={() => p.select(note.id)}><i style={{ background: note.color }} /><span><strong>{note.body.trim() ? note.title : p.t.untitled}</strong><small>{note.body.split('\n').slice(1).join(' ').trim().slice(0, 45) || p.t.start}</small></span><time>{new Date(note.updated).toLocaleDateString(p.lang, { month: 'short', day: 'numeric' })}</time></button><button className="note-delete" aria-label={p.t.delete + ' : ' + note.title} onClick={() => p.remove(note)}>⌫</button></div>)}</div>
    <div className="sidebar-bottom"><button onClick={() => p.setLang(p.lang === 'fr' ? 'en' : p.lang === 'en' ? 'ar' : 'fr')}>◎ {p.t.language} : {p.lang.toUpperCase()}</button>{p.email ? <button onClick={p.signOut}>Déconnexion : {p.email}</button> : <Link href="/auth/">Connexion</Link>}<span role="status" className={`sync ${state}`}>{p.status}</span>{state === 'error' && <button onClick={p.retry}>Réessayer</button>}</div>
    <div className="resize" role="separator" aria-label="Sidebar width" aria-orientation="vertical" aria-valuenow={p.width} aria-valuemin={180} aria-valuemax={420} tabIndex={0}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); p.setWidth(Math.max(180, Math.min(420, p.width + (event.key === 'ArrowRight' ? 10 : -10)))) } }}
      onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) p.setWidth(Math.max(180, Math.min(420, p.lang === 'ar' ? window.innerWidth - event.clientX : event.clientX))) }} />
  </aside>
}

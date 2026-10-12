import Link from 'next/link'
import { useState } from 'react'
import { DeleteNoteDialog } from './delete-note-dialog'
import type { Note } from '../lib/notes'
import type { copy, Language } from '../lib/i18n'
type Props = { notes: Note[]; active?: string; select: (id: string) => void; query: string; search: (query: string) => void; add: () => void; remove: (id: string) => void; t: typeof copy.fr; lang: Language; setLang: (lang: Language) => void; theme: string; setTheme: (theme: string) => void; width: number; setWidth: (width: number) => void; email?: string; signOut: () => void; status: string; retry: () => void; ready: boolean }
export function NoteSidebar(p: Props) {
  const [deleting, setDeleting] = useState<Note>()
  return <aside className="sidebar"><div className="brand"><span className="mark">✳</span><span>papertrail</span><button className="icon-btn" onClick={() => p.setTheme(p.theme === 'paper' ? 'sun' : p.theme === 'sun' ? 'night' : 'paper')} aria-label="Change theme">◐</button></div>
    <div className="search"><span>⌕</span><input aria-label={p.t.search} placeholder={p.t.search} value={p.query} onChange={event => p.search(event.target.value)} /></div>
    <div className="side-head"><span>{p.t.notes} <b>{p.notes.length}</b></span><button className="new" disabled={!p.ready} aria-label={p.t.newNote} onClick={p.add}>＋</button></div>
    <div className="note-list">{p.notes.filter(note => (note.title + ' ' + note.body).toLocaleLowerCase().includes(p.query.toLocaleLowerCase())).map(note => <div className="note-row" key={note.id}><button className={`note-item ${note.id === p.active ? 'selected' : ''}`} onClick={() => p.select(note.id)}><i style={{ background: note.color }} /><span><strong>{note.title}</strong><small>{note.body.replace(/\n/g, ' ').slice(0, 45) || p.t.start}</small></span><time>{new Date(note.updated).toLocaleDateString(p.lang, { month: 'short', day: 'numeric' })}</time></button><button className="note-delete" aria-label={p.t.delete + ' : ' + note.title} onClick={() => setDeleting(note)}>⌫</button></div>)}</div>
    <div className="sidebar-bottom"><button onClick={() => p.setLang(p.lang === 'fr' ? 'en' : p.lang === 'en' ? 'ar' : 'fr')}>◎ {p.t.language}: {p.lang.toUpperCase()}</button>{p.email ? <button onClick={p.signOut}>Déconnexion : {p.email}</button> : <Link href="/auth/">Connexion</Link>}<span role="status" className="sync-dot">{p.status}</span>{p.status.startsWith('Erreur') && <button onClick={p.retry}>Réessayer</button>}</div>
    <div className="resize" role="separator" aria-label="Sidebar width" aria-orientation="vertical" aria-valuenow={p.width} aria-valuemin={180} aria-valuemax={420} tabIndex={0}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); p.setWidth(Math.max(180, Math.min(420, p.width + (event.key === 'ArrowRight' ? 10 : -10)))) } }}
      onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) p.setWidth(Math.max(180, Math.min(420, p.lang === 'ar' ? window.innerWidth - event.clientX : event.clientX))) }} />
    <DeleteNoteDialog note={deleting} lang={p.lang} cancel={() => setDeleting(undefined)} confirm={p.remove} />
  </aside>
}

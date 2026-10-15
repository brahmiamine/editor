import { basePath } from '../supabase'
import { useEffect, useRef, useState } from 'react'
import { Archive, Asterisk, Languages, Pin, Plus, RotateCcw, Search, SunMoon, Trash2 } from 'lucide-react'
import type { Note, changeNote } from '../lib/notes'
import type { copy, Language } from '../lib/i18n'
import { featureCopy, lockedCopy } from '../lib/i18n'
import type { NoteFilter } from '../lib/notes'
import { NoteMenu } from './note-menu'
type Props = { notes: Note[]; active?: string; select: (id: string) => void; query: string; search: (query: string) => void; add: () => void; remove: (note: Note) => void; reorder: (ids: string[]) => void; change: (id: string, patch: Parameters<typeof changeNote>[2]) => void; userId?: string; t: typeof copy.fr; lang: Language; setLang: (lang: Language) => void; theme: string; setTheme: (theme: string) => void; width: number; setWidth: (width: number) => void; email?: string; signOut: () => void; status: string; error: string; retry: () => void; ready: boolean; filter: NoteFilter; setFilter: (value: NoteFilter) => void; restore: (id: string) => void; tools: React.ReactNode; settings: () => void }
function Highlight({ text, query }: { text: string; query: string }) {
  const index = query ? text.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1
  return index < 0 ? text : <>{text.slice(0, index)}<mark>{text.slice(index, index + query.length)}</mark>{text.slice(index + query.length)}</>
}
export function NoteSidebar(p: Props) {
  const searchInput = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchInput.current?.focus() } }
    window.addEventListener('keydown', focusSearch)
    return () => window.removeEventListener('keydown', focusSearch)
  }, [])
  const f = featureCopy[p.lang]
  const [drag, setDrag] = useState('')
  const drop = (target: string) => {
    const ids = p.notes.map(note => note.id), from = ids.indexOf(drag), to = ids.indexOf(target)
    setDrag('')
    if (from < 0 || to < 0 || from === to) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    p.reorder(ids)
  }
  const state = p.status === 'error' ? 'error' : ['loading', 'saving'].includes(p.status) ? 'busy' : 'ok'
  return <aside className="sidebar"><div className="brand"><span className="mark"><Asterisk size={22} aria-hidden="true" /></span><span>Papertrail</span><button className="icon-btn" onClick={() => p.setTheme(p.theme === 'paper' ? 'sun' : p.theme === 'sun' ? 'night' : 'paper')} aria-label={p.t.theme} title={p.t.theme}><SunMoon size={17} aria-hidden="true" /></button></div>
    <label className="search"><Search size={15} aria-hidden="true" /><input ref={searchInput} aria-label={p.t.search} placeholder={p.t.search} value={p.query} onChange={event => p.search(event.target.value)} /><kbd>⌘K</kbd></label>
    <div className="side-head"><span>{p.t.notes} <b>{p.notes.length}</b></span><button className="new" disabled={!p.ready} aria-label={p.t.newNote} title={p.t.newNote} onClick={p.add}><Plus size={18} aria-hidden="true" /></button></div>
    {p.filter === 'trash' && <p className="trash-hint">{f.trashHint}</p>}
    <div className="note-list">{p.notes.map(note => <div className={`note-row ${drag === note.id ? 'dragging' : ''}`} key={note.id} draggable={!note.trashedAt && !p.query} onDragStart={() => setDrag(note.id)} onDragEnd={() => setDrag('')} onDragOver={event => { if (drag) event.preventDefault() }} onDrop={event => { event.preventDefault(); drop(note.id) }}><button className={`note-item ${note.id === p.active ? 'selected' : ''}`} onClick={() => p.select(note.id)}><i style={{ background: note.color }} /><span><strong>{note.pinned && <Pin className="pin-mark" size={11} aria-hidden="true" />}{note.body.trim() || note.heading?.trim() ? <Highlight text={note.title} query={p.query} /> : p.t.untitled}</strong><small><Highlight text={note.body.replace(/attachment:[a-f0-9-]+/g,'').slice(0,80) || p.t.start} query={p.query} /></small></span><time>{new Date(note.updated).toLocaleDateString(p.lang, { month: 'short', day: 'numeric' })}</time></button>{note.trashedAt ? <button className="note-restore" aria-label={f.restore + ' : ' + note.title} onClick={() => p.restore(note.id)}><RotateCcw size={15} aria-hidden="true" /></button> : <NoteMenu note={note} lang={p.lang} label={note.title} userId={p.userId} change={patch => p.change(note.id, patch)} remove={() => p.remove(note)} />}</div>)}{!p.notes.length && <p className="trash-hint">{f.emptyResults}</p>}</div>
    {p.tools}
    <div className="sidebar-bottom">{([['archive', Archive, f.archive], ['trash', Trash2, f.trash]] as const).map(([value, Icon, label]) => <button key={value} aria-pressed={p.filter === value} className="filter-link" onClick={() => p.setFilter(p.filter === value ? 'all' : value)}><Icon size={14} aria-hidden="true" />{label}</button>)}<button onClick={() => p.setLang(p.lang === 'fr' ? 'en' : p.lang === 'en' ? 'ar' : 'fr')}><Languages size={14} aria-hidden="true" />{p.t.language} : {p.lang.toUpperCase()}</button>{p.email ? <><button onClick={p.settings}>{f.settings}</button><button onClick={p.signOut}>{f.logout} : {p.email}</button></> : <a href={basePath + '/auth/'}>{f.login}</a>}<span role="status" title={p.error} className={`sync ${state}`}>{p.status === 'locked' ? lockedCopy[p.lang] : f[p.status as 'loading' | 'local' | 'saving' | 'synced' | 'offline' | 'error']}</span>{(state === 'error' || p.status === 'locked') && <button onClick={p.retry}>{f.retry}</button>}</div>
    <div className="resize" role="separator" aria-label="Sidebar width" aria-orientation="vertical" aria-valuenow={p.width} aria-valuemin={180} aria-valuemax={420} tabIndex={0}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); p.setWidth(Math.max(180, Math.min(420, p.width + (event.key === 'ArrowRight' ? 10 : -10)))) } }}
      onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) p.setWidth(Math.max(180, Math.min(420, p.lang === 'ar' ? window.innerWidth - event.clientX : event.clientX))) }} />
  </aside>
}

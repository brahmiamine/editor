import { basePath } from '../supabase'
import { useEffect, useRef } from 'react'
import type { Note } from '../lib/notes'
import type { copy, Language } from '../lib/i18n'
import { featureCopy, lockedCopy } from '../lib/i18n'
import type { NoteFilter, NoteSort } from '../lib/notes'
type Props = { notes: Note[]; active?: string; select: (id: string) => void; query: string; search: (query: string) => void; add: () => void; remove: (note: Note) => void; t: typeof copy.fr; lang: Language; setLang: (lang: Language) => void; theme: string; setTheme: (theme: string) => void; width: number; setWidth: (width: number) => void; email?: string; signOut: () => void; status: string; error: string; retry: () => void; ready: boolean; filter: NoteFilter; setFilter: (value: NoteFilter) => void; sort: NoteSort; setSort: (value: NoteSort) => void; tag: string; setTag: (value: string) => void; tags: string[]; restore: (id: string) => void; tools: React.ReactNode; settings: () => void }
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
  const state = p.status === 'error' ? 'error' : ['loading', 'saving'].includes(p.status) ? 'busy' : 'ok'
  return <aside className="sidebar"><div className="brand"><span className="mark">✳</span><span>Papertrail</span><button className="icon-btn" onClick={() => p.setTheme(p.theme === 'paper' ? 'sun' : p.theme === 'sun' ? 'night' : 'paper')} aria-label={p.t.theme} title={p.t.theme}>◐</button></div>
    <label className="search"><span aria-hidden="true">⌕</span><input ref={searchInput} aria-label={p.t.search} placeholder={p.t.search} value={p.query} onChange={event => p.search(event.target.value)} /><kbd>⌘K</kbd></label>
    <nav className="note-filters" aria-label={p.t.notes}>{(['all','pinned','archive','trash'] as NoteFilter[]).map(filter => <button key={filter} aria-pressed={filter === p.filter} onClick={() => p.setFilter(filter)}>{filter === 'all' ? p.t.all : f[filter]}</button>)}</nav>
    <div className="sort-tools"><select aria-label={f.sort} value={p.sort} onChange={event => p.setSort(event.target.value as NoteSort)}>{(['updated','created','title'] as NoteSort[]).map(sort => <option key={sort} value={sort}>{f[sort]}</option>)}</select><select aria-label={f.tagFilter} value={p.tag} onChange={event => p.setTag(event.target.value)}><option value="">{f.tagFilter}</option>{p.tags.map(tag => <option key={tag}>{tag}</option>)}</select></div>
    <div className="side-head"><span>{p.t.notes} <b>{p.notes.length}</b></span><button className="new" disabled={!p.ready} aria-label={p.t.newNote} title={p.t.newNote} onClick={p.add}>＋</button></div>
    {p.filter === 'trash' && <p className="trash-hint">{f.trashHint}</p>}
    <div className="note-list">{p.notes.map(note => <div className="note-row" key={note.id}><button className={`note-item ${note.id === p.active ? 'selected' : ''}`} onClick={() => p.select(note.id)}><i style={{ background: note.color }} /><span><strong>{note.pinned && '☆ '}{note.body.trim() ? <Highlight text={note.title} query={p.query} /> : p.t.untitled}</strong><small><Highlight text={note.body.replace(/attachment:[a-f0-9-]+/g,'').slice(0,80) || p.t.start} query={p.query} /></small></span><time>{new Date(note.updated).toLocaleDateString(p.lang, { month: 'short', day: 'numeric' })}</time></button>{note.trashedAt ? <button className="note-restore" aria-label={f.restore + ' : ' + note.title} onClick={() => p.restore(note.id)}>↶</button> : <button className="note-delete" aria-label={p.t.delete + ' : ' + note.title} onClick={() => p.remove(note)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg></button>}</div>)}{!p.notes.length && <p className="trash-hint">{f.emptyResults}</p>}</div>
    {p.tools}
    <div className="sidebar-bottom"><button onClick={() => p.setLang(p.lang === 'fr' ? 'en' : p.lang === 'en' ? 'ar' : 'fr')}>◎ {p.t.language} : {p.lang.toUpperCase()}</button>{p.email ? <><button onClick={p.settings}>{f.settings}</button><button onClick={p.signOut}>{f.logout} : {p.email}</button></> : <a href={basePath + '/auth/'}>{f.login}</a>}<span role="status" title={p.error} className={`sync ${state}`}>{p.status === 'locked' ? lockedCopy[p.lang] : f[p.status as 'loading' | 'local' | 'saving' | 'synced' | 'offline' | 'error']}</span>{(state === 'error' || p.status === 'locked') && <button onClick={p.retry}>{f.retry}</button>}</div>
    <div className="resize" role="separator" aria-label="Sidebar width" aria-orientation="vertical" aria-valuenow={p.width} aria-valuemin={180} aria-valuemax={420} tabIndex={0}
      onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); p.setWidth(Math.max(180, Math.min(420, p.width + (event.key === 'ArrowRight' ? 10 : -10)))) } }}
      onPointerDown={event => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={event => { if (event.currentTarget.hasPointerCapture(event.pointerId)) p.setWidth(Math.max(180, Math.min(420, p.lang === 'ar' ? window.innerWidth - event.clientX : event.clientX))) }} />
  </aside>
}

export type NoteVersion = { body: string; at: number }
export type Note = { id: string; title: string; body: string; updated: number; color: string; created?: number; pinned?: boolean; archived?: boolean; tags?: string[]; trashedAt?: number; history?: NoteVersion[]; revision?: number; conflictOf?: string; heading?: string }
export type Notebook = { notes: Note[]; pending: string[]; deleted: string[] }
export const colors = ['#e9b949', '#e4876b', '#8ebf9b', '#8da9d1', '#b59ad9']
export const emptyNotebook = (): Notebook => ({ notes: [], pending: [], deleted: [] })
export function noteTitle(heading: string | undefined, body: string) { const own = heading?.replace(/\s+/g, ' ').trim(); return own ? Array.from(own).slice(0, 48).join('') : titleFromBody(body) }
export function titleFromBody(body: string) {
  return Array.from(body.split('\n').map(line => line.replace(/^\s*[#>*-]+\s*/, '').replace(/\*\*/g, '').trim()).find(Boolean) || '').slice(0, 48).join('') || 'Untitled note'
}
export function createNote(): Note {
  return { id: crypto.randomUUID(), body: '', title: 'Untitled note', updated: Date.now(), created: Date.now(), color: colors[Math.floor(Math.random() * colors.length)] }
}
export function ensureFirstNote(book: Notebook): Notebook {
  if (book.notes.length || book.deleted.length) return book
  const note = createNote()
  return { ...book, notes: [note], pending: [note.id] }
}
export function editNote(book: Notebook, id: string, body: string): Notebook {
  if (!book.notes.some(note => note.id === id)) return book
  const note = book.notes.find(note => note.id === id)!
  if (note.body === body) return book
  const history = note.history || []
  // ponytail: checkpoint once per 30 seconds, retain 50 versions; use a separate revisions table for long-lived history.
  const checkpoint = body === '' || !history.length || Date.now() - history[0].at >= 30000
  return changeNote(book, id, { body, title: noteTitle(note.heading, body), history: checkpoint ? [{ body: note.body, at: Date.now() }, ...history].slice(0, 50) : history })
}
export function changeNote(book: Notebook, id: string, patch: Partial<Pick<Note, 'body' | 'title' | 'history' | 'pinned' | 'archived' | 'tags' | 'trashedAt' | 'heading'>>) {
  return { ...book, notes: book.notes.map(note => note.id === id ? { ...note, ...patch, updated: Math.max(Date.now(), note.updated + 1) } : note), pending: [...new Set([...book.pending, id])] }
}
export const trashNote = (book: Notebook, id: string) => changeNote(book, id, { trashedAt: Date.now() })
export const restoreNote = (book: Notebook, id: string) => changeNote(book, id, { trashedAt: undefined })
export function expireTrash(book: Notebook, now = Date.now()) {
  return book.notes.filter(note => note.trashedAt !== undefined && now - note.trashedAt >= 30 * 86400000).reduce((current, note) => deleteNote(current, note.id), book)
}
export function deleteNote(book: Notebook, id: string): Notebook {
  return { notes: book.notes.filter(note => note.id !== id), pending: book.pending.filter(value => value !== id), deleted: [...new Set([...book.deleted, id])] }
}
export function mergeRemote(book: Notebook, remote: Note[]): Notebook {
  const notes: Note[] = book.notes.filter(note => book.pending.includes(note.id)).map(note => ({ ...note }))
  const pending = new Set(book.pending)
  for (const incoming of remote) {
    if (book.deleted.includes(incoming.id)) continue
    const index = notes.findIndex(note => note.id === incoming.id)
    if (index < 0) { notes.push(incoming); continue }
    const local = notes[index]
    if (incoming.revision !== undefined && incoming.revision !== local.revision) {
      const conflict = { ...local, id: crypto.randomUUID(), revision: undefined, conflictOf: local.id }
      notes[index] = incoming
      pending.delete(local.id)
      const metadata = (note: Note) => JSON.stringify([note.tags, note.pinned, note.archived, note.trashedAt, note.color, note.created, note.history?.map(value => [value.at,value.body])])
      if (local.body !== incoming.body || metadata(local) !== metadata(incoming)) {
        notes.push(conflict); pending.add(conflict.id)
      }
    }
  }
  // Remote hard deletion must not discard unsaved edits: they are kept as new conflict notes.
  for (const note of notes) if (pending.has(note.id) && note.revision !== undefined && !remote.some(row => row.id === note.id)) {
    pending.delete(note.id); note.conflictOf = note.id; note.id = crypto.randomUUID(); note.revision = undefined; pending.add(note.id)
  }
  return { ...book, pending: [...pending], notes: notes.sort((a, b) => b.updated - a.updated) }
}
export function parseNotebook(raw: string | null): Notebook {
  if (!raw) return emptyNotebook()
  const parsed = JSON.parse(raw)
  const source = Array.isArray(parsed) ? { notes: parsed, pending: parsed.map((note: Note) => note.id), deleted: [] } : parsed
  if (!source || !Array.isArray(source.notes) || !Array.isArray(source.pending) || !Array.isArray(source.deleted)) throw new Error('Invalid notebook')
  if (!source.pending.every((id: unknown) => typeof id === 'string') || !source.deleted.every((id: unknown) => typeof id === 'string')) throw new Error('Invalid identifiers')
  const notes = source.notes.map((note: Note) => {
    if (!note || typeof note.id !== 'string' || typeof note.body !== 'string' || !Number.isFinite(note.updated) || typeof note.color !== 'string') throw new Error('Invalid note')
    if (note.tags !== undefined && (!Array.isArray(note.tags) || !note.tags.every(tag => typeof tag === 'string' && tag.length <= 40))) throw new Error('Invalid tags')
    if (note.history !== undefined && (!Array.isArray(note.history) || !note.history.every(v => v && typeof v.body === 'string' && Number.isFinite(v.at)))) throw new Error('Invalid history')
    for (const field of ['created', 'trashedAt', 'revision'] as const) if (note[field] !== undefined && (!Number.isFinite(note[field]) || note[field]! < 0)) throw new Error('Invalid date or revision')
    if (note.heading !== undefined && (typeof note.heading !== 'string' || note.heading.length > 200)) throw new Error('Invalid title')
    for (const field of ['pinned', 'archived'] as const) if (note[field] !== undefined && typeof note[field] !== 'boolean') throw new Error('Invalid flag')
    return { ...note, id: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(note.id) ? note.id : crypto.randomUUID(), title: noteTitle(note.heading, note.body) }
  })
  return { notes, pending: notes.filter((note: Note, i: number) => source.pending.includes(source.notes[i].id)).map((note: Note) => note.id), deleted: source.deleted }
}
export function exportNote(note: Note, extension: 'txt' | 'md') {
  const heading = note.heading?.trim()
  return heading ? (extension === 'md' ? '# ' : '') + heading + '\n\n' + note.body : note.body
}
export function wordCount(body: string) { return body.trim() ? body.trim().split(/\s+/u).length : 0 }
export function formatText(body: string) {
  const result: string[] = []
  let fence = ''
  for (const line of body.replace(/\r\n?/g, '\n').split('\n')) {
    const marker = line.match(/^\s{0,3}(\x60{3,}|~{3,})/)
    if (marker) {
      if (!fence) fence = marker[1]
      else if (marker[1][0] === fence[0] && marker[1].length >= fence.length) fence = ''
      result.push(line)
    } else if (fence) result.push(line)
    else if (line.trim()) result.push(line)
    else if (result.length && result[result.length - 1] !== '') result.push('')
  }
  if (result[result.length - 1] === '' && !fence) result.pop()
  return result.join('\n')
}
export function importGuestNotes(account: Notebook, guest: Notebook): Notebook {
  const imported = guest.notes.filter(note => !account.notes.some(existing => existing.id === note.id) && !account.deleted.includes(note.id))
  return { ...account, notes: [...imported, ...account.notes], pending: [...new Set([...account.pending, ...imported.map(note => note.id)])] }
}
export type NoteFilter = 'all' | 'pinned' | 'archive' | 'trash'
export function visibleNotes(notes: Note[], filter: NoteFilter, query: string): Note[] {
  return notes.filter(note => (filter === 'trash' ? !!note.trashedAt : !note.trashedAt && (filter === 'archive' ? note.archived : !note.archived) && (filter !== 'pinned' || note.pinned)) && (note.title + ' ' + note.body).toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.updated - a.updated)
}
export function backupNotebook(book: Notebook) { return JSON.stringify({ format: 'papertrail', version: 1, exportedAt: new Date().toISOString(), notes: book.notes, pending: [], deleted: [] }, null, 2) }
export function importBackup(book: Notebook, raw: string) {
  const imported = parseNotebook(raw)
  const notes = imported.notes.map(note => ({ ...note, id: crypto.randomUUID(), revision: undefined }))
  return { ...book, notes: [...notes, ...book.notes], pending: [...new Set([...book.pending, ...notes.map(note => note.id)])] }
}
export function downloadText(text: string, name: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a'); link.href = url; link.download = name; link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export type Note = { id: string; title: string; body: string; updated: number; color: string }
export type Notebook = { notes: Note[]; pending: string[]; deleted: string[] }
export const colors = ['#e9b949', '#e4876b', '#8ebf9b', '#8da9d1', '#b59ad9']
export const emptyNotebook = (): Notebook => ({ notes: [], pending: [], deleted: [] })
export function titleFromBody(body: string) {
  return Array.from(body.split('\n').map(line => line.replace(/^\s*[#>*-]+\s*/, '').trim()).find(Boolean) || '').slice(0, 48).join('') || 'Untitled note'
}
export function createNote(): Note {
  return { id: crypto.randomUUID(), body: '', title: 'Untitled note', updated: Date.now(), color: colors[Math.floor(Math.random() * colors.length)] }
}
export function ensureFirstNote(book: Notebook): Notebook {
  if (book.notes.length || book.deleted.length) return book
  const note = createNote()
  return { ...book, notes: [note], pending: [note.id] }
}
export function editNote(book: Notebook, id: string, body: string): Notebook {
  if (!book.notes.some(note => note.id === id)) return book
  return { ...book, notes: book.notes.map(note => note.id === id ? { ...note, body, title: titleFromBody(body), updated: Math.max(Date.now(), note.updated + 1) } : note), pending: [...new Set([...book.pending, id])] }
}
export function deleteNote(book: Notebook, id: string): Notebook {
  return { notes: book.notes.filter(note => note.id !== id), pending: book.pending.filter(value => value !== id), deleted: [...new Set([...book.deleted, id])] }
}
export function mergeRemote(book: Notebook, remote: Note[]): Notebook {
  const pending = book.notes.filter(note => book.pending.includes(note.id))
  return { ...book, notes: [...pending, ...remote.filter(note => !book.deleted.includes(note.id) && !book.pending.includes(note.id))].sort((a, b) => b.updated - a.updated) }
}
export function parseNotebook(raw: string | null): Notebook {
  if (!raw) return emptyNotebook()
  const parsed = JSON.parse(raw)
  const source = Array.isArray(parsed) ? { notes: parsed, pending: parsed.map((note: Note) => note.id), deleted: [] } : parsed
  if (!source || !Array.isArray(source.notes) || !Array.isArray(source.pending) || !Array.isArray(source.deleted)) throw new Error('Invalid notebook')
  if (!source.pending.every((id: unknown) => typeof id === 'string') || !source.deleted.every((id: unknown) => typeof id === 'string')) throw new Error('Invalid identifiers')
  const notes = source.notes.map((note: Note) => {
    if (!note || typeof note.id !== 'string' || typeof note.body !== 'string' || !Number.isFinite(note.updated) || typeof note.color !== 'string') throw new Error('Invalid note')
    return { ...note, id: /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(note.id) ? note.id : crypto.randomUUID(), title: titleFromBody(note.body) }
  })
  return { notes, pending: notes.filter((note: Note, i: number) => source.pending.includes(source.notes[i].id)).map((note: Note) => note.id), deleted: source.deleted }
}
export function exportNote(note: Note, extension: 'txt' | 'md') {
  return extension === 'txt' ? note.body : note.body
}
export function wordCount(body: string) { return body.trim() ? body.trim().split(/\s+/u).length : 0 }

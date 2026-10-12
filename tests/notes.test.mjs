import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createNote, deleteNote, editNote, emptyNotebook, exportNote, mergeRemote, parseNotebook, titleFromBody, wordCount } from '../app/lib/notes.ts'

test('titles use the first nonempty line and preserve unicode', () => {
  assert.equal(titleFromBody('\n # Bonjour\nSuite'), 'Bonjour')
  assert.equal(titleFromBody('مرحبا بالعالم'), 'مرحبا بالعالم')
  assert.equal(titleFromBody(' '), 'Untitled note')
  assert.equal(Array.from(titleFromBody('🙂'.repeat(60))).length, 48)
})
test('edits address the visible note and queue autosave', () => {
  const note = createNote()
  const result = editNote({ ...emptyNotebook(), notes: [note] }, note.id, 'New content')
  assert.equal(result.notes[0].title, 'New content')
  assert.deepEqual(result.pending, [note.id])
  assert.deepEqual(editNote(result, 'missing', 'Oops'), result)
})
test('deleting the last note persists an empty notebook and its tombstone', () => {
  const note = createNote()
  const result = deleteNote({ notes: [note], pending: [note.id], deleted: [] }, note.id)
  assert.deepEqual(parseNotebook(JSON.stringify(result)), { notes: [], pending: [], deleted: [note.id] })
})
test('remote refresh preserves unsaved edits and does not resurrect deletions', () => {
  const note = createNote(), removed = createNote(), remote = createNote()
  const edited = { ...note, body: 'Local change' }
  const result = mergeRemote({ notes: [edited], pending: [note.id], deleted: [removed.id] }, [note, removed, remote])
  assert.equal(result.notes.find(n => n.id === note.id).body, 'Local change')
  assert.equal(result.notes.some(n => n.id === removed.id), false)
  assert.equal(result.notes.some(n => n.id === remote.id), true)
})
test('legacy ids migrate to UUIDs and corrupt storage is rejected', () => {
  const migrated = parseNotebook(JSON.stringify([{ id: 'welcome', body: 'Welcome', updated: 1, color: '#fff' }]))
  assert.match(migrated.notes[0].id, /^[0-9a-f-]{36}$/)
  assert.equal(migrated.pending[0], migrated.notes[0].id)
  assert.throws(() => parseNotebook('{"notes":42}'))
  assert.throws(() => parseNotebook(JSON.stringify([{ id: 'bad', body: 42 }])))
})
test('exports retain content without duplicating the automatic title', () => {
  const note = { ...createNote(), body: '# My note\n\nText' }
  assert.equal(exportNote(note, 'txt'), note.body)
  assert.equal(exportNote(note, 'md'), note.body)
  assert.equal(wordCount(' \n '), 0)
  assert.equal(wordCount('Bonjour monde\nمرحبا'), 3)
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as notes from '../app/lib/notes.ts'

// Catches lost pre-edit content, irreversible deletion, destructive import and conflict overwrites.
test('editing preserves restorable history and trash retains the complete note', () => {
  const note = { ...notes.createNote(), body: 'Original', title: 'Original' }
  const book = notes.editNote({ ...notes.emptyNotebook(), notes: [note] }, note.id, 'Changed')
  assert.equal(book.notes[0].history?.[0]?.body, 'Original')
  const trashed = notes.trashNote(book, note.id)
  assert.equal(trashed.notes[0].body, 'Changed')
  assert.ok(trashed.notes[0].trashedAt)
  assert.equal(notes.restoreNote(trashed, note.id).notes[0].trashedAt, undefined)
})
test('backup import retains metadata and never replaces an existing note', () => {
  assert.equal(typeof notes.importBackup, 'function')
  const note = { ...notes.createNote(), body: 'Keep me', pinned: true, tags: ['work'] }
  const book = { ...notes.emptyNotebook(), notes: [note] }
  const backup = notes.backupNotebook(book)
  const restored = notes.importBackup(notes.emptyNotebook(), backup)
  assert.equal(restored.notes[0].body, 'Keep me')
  assert.deepEqual(restored.notes[0].tags, ['work'])
  assert.equal(restored.notes[0].pinned, true)
  assert.equal(notes.importBackup(book, backup).notes.length, 2)
  assert.throws(() => notes.importBackup(book, '{"notes":[{"body":5}]}'))
})
test('remote conflicts keep both local and remote contents, but acknowledged edits do not conflict', () => {
  const note = { ...notes.createNote(), body: 'Local', revision: 1 }
  const remote = { ...note, body: 'Remote', revision: 2 }
  const merged = notes.mergeRemote({ ...notes.emptyNotebook(), notes: [note], pending: [note.id] }, [remote])
  assert.equal(merged.notes.length, 2)
  assert.deepEqual(new Set(merged.notes.map(n => n.body)), new Set(['Local', 'Remote']))
  assert.ok(merged.notes.find(n => n.id !== note.id).conflictOf)
  assert.equal(notes.mergeRemote(merged, [remote]).notes.length, 2)
})
test('organization filters exclude trash and archives and sort pinned notes first', () => {
  assert.equal(typeof notes.visibleNotes, 'function')
  const a = { ...notes.createNote(), body: 'Alpha', title: 'Alpha', updated: 100, tags: ['work'] }
  const b = { ...notes.createNote(), body: 'Beta', title: 'Beta', updated: 200, pinned: true }
  const c = { ...notes.createNote(), archived: true }
  const d = { ...notes.createNote(), trashedAt: Date.now() }
  assert.deepEqual(notes.visibleNotes([a, b, c, d], 'all', '').map(n => n.id), [b.id, a.id])
  assert.deepEqual(notes.visibleNotes([a, b], 'all', 'alp').map(n => n.id), [a.id])
})
test('trash expires after 30 days without discarding active or recent trashed notes', () => {
  assert.equal(typeof notes.expireTrash, 'function')
  const old = { ...notes.createNote(), trashedAt: 1 }
  const recent = { ...notes.createNote(), trashedAt: 40 * 86400000 }
  const active = notes.createNote()
  const result = notes.expireTrash({ ...notes.emptyNotebook(), notes: [old,recent,active] }, 41 * 86400000)
  assert.deepEqual(result.notes.map(note => note.id), [recent.id,active.id])
  assert.deepEqual(result.deleted, [old.id])
})
test('equal contents with different pending history retain a conflict recovery copy', () => {
  const note = { ...notes.createNote(), body:'Same content', revision:1, history:[{ body:'Restorable local version', at:10 }] }
  const remote = { ...note, revision:2, history:[] }
  const result = notes.mergeRemote({ ...notes.emptyNotebook(), notes:[note], pending:[note.id] },[remote])
  assert.equal(result.notes.length,2)
  assert.equal(result.notes.find(value => value.conflictOf)?.history[0].body,'Restorable local version')
})
test('clearing recently typed text always leaves a restorable version', () => {
  const note = notes.createNote()
  const edited = notes.editNote({ ...notes.emptyNotebook(), notes:[note] },note.id,'Important recent text')
  const cleared = notes.editNote(edited,note.id,'')
  assert.equal(cleared.notes[0].history[0].body,'Important recent text')
})

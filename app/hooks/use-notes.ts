'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { createNote, deleteNote, editNote, emptyNotebook, mergeRemote, parseNotebook, type Note, type Notebook } from '../lib/notes'

export function useNotes(userId: string | undefined, sessionReady: boolean) {
  const [book, setBook] = useState<Notebook>(emptyNotebook)
  const [loadedKey, setLoadedKey] = useState('')
  const [status, setStatus] = useState('Chargement…')
  const [retry, setRetry] = useState(0)
  const key = userId ? `papertrail-notes:${userId}` : 'papertrail-notes'
  const queue = useRef(Promise.resolve())
  const generation = useRef(0)
  useEffect(() => {
    if (!sessionReady) return
    const version = ++generation.current
    let cancelled = false
    setLoadedKey('')
    async function load() {
      try {
        let next = parseNotebook(localStorage.getItem(key))
        setBook(next); setLoadedKey(key)
        if (userId && supabase) {
          await queue.current
          const { data, error } = await supabase.from('notes').select('*').eq('user_id', userId)
          if (error) throw error
          const remote: Note[] = data.map(row => ({ id: row.id, title: row.title, body: row.body, color: row.color, updated: Date.parse(row.updated_at) }))
          if (!cancelled) setBook(current => mergeRemote(current, remote))
        }
        if (!cancelled) setStatus(userId ? 'Synchronisé' : 'Enregistré localement')
      } catch (error) { if (!cancelled) setStatus(`Erreur : ${error instanceof Error ? error.message : 'Chargement impossible'}`) }
    }
    void load()
    return () => { cancelled = true; if (generation.current === version) generation.current++ }
  }, [key, userId, sessionReady, retry])
  useEffect(() => {
    if (loadedKey !== key) return
    try { localStorage.setItem(key, JSON.stringify(book)) }
    catch { setStatus('Stockage local indisponible. Gardez cette page ouverte.'); return }
    if (!userId || !supabase) { setStatus('Enregistré localement'); return }
    if (!book.pending.length && !book.deleted.length) return
    setStatus('Enregistrement…')
    const version = generation.current
    const snapshot = book
    const client = supabase
    const timer = setTimeout(() => {
      queue.current = queue.current.catch(() => {}).then(async () => {
        if (generation.current !== version) return
        // ponytail: last-write-wins across devices; add version checks for collaborative editing.
        const rows = snapshot.notes.filter(note => snapshot.pending.includes(note.id)).map(note => ({ id: note.id, user_id: userId, title: note.title, body: note.body, color: note.color, updated_at: new Date(note.updated).toISOString() }))
        if (rows.length) { const { error } = await client.from('notes').upsert(rows); if (error) throw error }
        if (snapshot.deleted.length) { const { error } = await client.from('notes').delete().eq('user_id', userId).in('id', snapshot.deleted); if (error) throw error }
        if (generation.current !== version) return
        setBook(current => ({ ...current, pending: current.pending.filter(id => !snapshot.pending.includes(id) || current.notes.find(note => note.id === id)?.updated !== snapshot.notes.find(note => note.id === id)?.updated), deleted: current.deleted.filter(id => !snapshot.deleted.includes(id)) }))
        setStatus('Synchronisé')
      }).catch(error => { if (generation.current === version) setStatus(`Erreur : ${error.message || 'Sauvegarde impossible'}`) })
    }, 500)
    return () => clearTimeout(timer)
  }, [book, loadedKey, key, userId, retry])
  return {
    notes: loadedKey === key ? book.notes : [], status, ready: loadedKey === key,
    add: () => { const note = createNote(); setBook(current => ({ ...current, notes: [note, ...current.notes], pending: [...current.pending, note.id] })); return note.id },
    update: (id: string, body: string) => setBook(current => editNote(current, id, body)),
    remove: (id: string) => setBook(current => deleteNote(current, id)),
    retry: () => setRetry(value => value + 1)
  }
}

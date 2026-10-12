'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../supabase'
import { changeNote, createNote, editNote, emptyNotebook, ensureFirstNote, expireTrash, importBackup, importGuestNotes, mergeRemote, parseNotebook, restoreNote, trashNote, type Note, type Notebook } from '../lib/notes'
import { loadBook, readLocal, transferGuest, writeLocal } from '../lib/local-db'
import { uploadAttachments } from '../lib/attachments'

export type SyncStatus = 'loading' | 'local' | 'saving' | 'synced' | 'offline' | 'error' | 'locked'
export function useNotes(userId: string | undefined, sessionReady: boolean) {
  const [book, setBook] = useState<Notebook>(emptyNotebook)
  const [loadedKey, setLoadedKey] = useState('')
  const [status, setStatus] = useState<SyncStatus>('loading')
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const key = userId ? `papertrail-notes:${userId}` : 'papertrail-notes'
  const queue = useRef(Promise.resolve())
  const localQueue = useRef(Promise.resolve())
  const lockQueue = useRef(Promise.resolve())
  const generation = useRef(0)
  const remoteGeneration = useRef(-1)
  const savingLocal = useRef(false)
  const [writable, setWritable] = useState(false)
  const ownsLock = useRef(false)
  const loadController = useRef<AbortController | null>(null)
  const currentBook = useRef(book); currentBook.current = book
  useEffect(() => {
    if (!sessionReady) return
    const version = ++generation.current
    const controller = new AbortController()
    loadController.current = controller
    let release: (() => void) | undefined
    ownsLock.current = false; setWritable(false)
    setLoadedKey(''); setStatus('loading'); setError('')
    async function load(editable: boolean) {
      try {
        await localQueue.current
        let cached = editable ? await loadBook(key,controller.signal) : parseNotebook(JSON.stringify(await readLocal<Notebook>('books',key,controller.signal)) || localStorage.getItem(key))
        if (generation.current !== version) return
        if (userId && editable) {
          await navigator.locks.request('papertrail:papertrail-notes', { ifAvailable:true }, async guestLock => {
            if (!guestLock || controller.signal.aborted) return
            await loadBook('papertrail-notes',controller.signal)
            if (!controller.signal.aborted) cached = await transferGuest(key,controller.signal)
          })
        }
        if (generation.current !== version) return
        ownsLock.current = editable; setWritable(editable)
        setBook(editable ? userId && navigator.onLine ? expireTrash(cached) : ensureFirstNote(expireTrash(cached)) : cached)
        setLoadedKey(key); setStatus(editable ? navigator.onLine ? 'local' : 'offline' : 'locked')
      } catch (cause) { if (generation.current === version) { setStatus('error'); setError(cause instanceof Error ? cause.message : 'Storage unavailable') } }
    }
    if (!navigator.locks) void load(false)
    else lockQueue.current = lockQueue.current.catch(() => {}).then(async () => { await navigator.locks.request('papertrail:' + key, { ifAvailable:true }, async lock => {
      if (controller.signal.aborted) return
      await load(!!lock)
      if (lock && !controller.signal.aborted) await new Promise<void>(resolve => { release = resolve })
    }) }).catch(cause => { if (generation.current === version) { setStatus('error'); setError(cause.message) } })
    return () => { controller.abort(); void localQueue.current.catch(() => {}).finally(() => release?.()); ownsLock.current = false; if (generation.current === version) generation.current++ }
  }, [key, userId, sessionReady])
  useEffect(() => {
    const online = () => setRetry(value => value + 1)
    const offline = () => setStatus(ownsLock.current ? 'offline' : 'locked')
    const timer = setInterval(() => { if (navigator.onLine) online() }, 30000)
    window.addEventListener('online', online); window.addEventListener('offline', offline)
    return () => { clearInterval(timer); window.removeEventListener('online', online); window.removeEventListener('offline', offline) }
  }, [])
  useEffect(() => {
    const protectUnsaved = (event: BeforeUnloadEvent) => { if (savingLocal.current) { event.preventDefault(); event.returnValue = '' } }
    window.addEventListener('beforeunload', protectUnsaved)
    return () => window.removeEventListener('beforeunload', protectUnsaved)
  }, [])
  useEffect(() => {
    if (loadedKey !== key || !writable) return
    const snapshot = book, version = generation.current
    savingLocal.current = true
    setStatus('saving')
    localQueue.current = localQueue.current.catch(() => {}).then(() => writeLocal('books', key, snapshot)).then(() => {
      if (generation.current === version && currentBook.current === snapshot) {
        savingLocal.current = false
        setStatus(!navigator.onLine ? 'offline' : !userId ? 'local' : remoteGeneration.current === version && !snapshot.pending.length && !snapshot.deleted.length ? 'synced' : 'saving')
      }
    }).catch(cause => {
      if (generation.current === version) { setStatus('error'); setError(cause.message) }
      throw cause
    })
    void localQueue.current.catch(() => {})
  }, [book, loadedKey, key, userId, writable])
  useEffect(() => {
    if (loadedKey !== key || !writable) return
    const version = generation.current
    const timer = setTimeout(() => {
      queue.current = queue.current.catch(() => {}).then(async () => {
        await localQueue.current
        if (generation.current !== version) return
        if (!navigator.onLine) { setStatus('offline'); return }
        if (!userId || !supabase) { setStatus('local'); return }
        setStatus('saving'); setError('')
        const signal = loadController.current?.signal
        await navigator.locks.request('papertrail:papertrail-notes', { ifAvailable:true }, async guestLock => {
          if (!guestLock || !signal || signal.aborted || generation.current !== version) return
          const guest = await loadBook('papertrail-notes',signal)
          if (!guest.notes.length || signal.aborted || generation.current !== version) return
          const transferred = await transferGuest(key,signal)
          if (generation.current !== version) return
          const next = importGuestNotes(currentBook.current,transferred)
          currentBook.current = next; setBook(next)
        })
        if (generation.current !== version) return
        const data = []
        for (let offset = 0; ; offset += 1000) {
          const response = await supabase.from('notes').select('*').eq('user_id', userId).order('id').range(offset, offset + 999)
          if (response.error) throw response.error
          data.push(...response.data)
          if (response.data.length < 1000) break
        }
        if (generation.current !== version) return
        remoteGeneration.current = version
        const remote: Note[] = data.map(row => ({ ...row.metadata, id: row.id, title: row.title, body: row.body, color: row.color, updated: Date.parse(row.updated_at), revision: row.revision }))
        const merged = ensureFirstNote(expireTrash(mergeRemote(currentBook.current, remote)))
        currentBook.current = merged
        setBook(merged)
        await writeLocal('books', key, merged)
        if (generation.current !== version) return
        for (const note of merged.notes.filter(value => merged.pending.includes(value.id))) {
          await uploadAttachments(note.body + '\n' + (note.history || []).map(value => value.body).join('\n'), userId)
          const { id, body, title, color, updated, revision, ...metadata } = note
          const row = { id, user_id: userId, title, body, color, updated_at: new Date(updated).toISOString(), metadata }
          const result = revision === undefined
            ? await supabase.from('notes').insert(row).select('revision').single()
            : await supabase.from('notes').update(row).eq('id', id).eq('user_id', userId).eq('revision', revision).select('revision').maybeSingle()
          if (result.error) {
            if (result.error.code === '23505') { setRetry(value => value + 1); return }
            throw result.error
          }
          if (!result.data) { setRetry(value => value + 1); return }
          if (generation.current !== version) return
          const nextRevision = result.data.revision
          setBook(current => ({ ...current, notes: current.notes.map(value => value.id === id ? { ...value, revision: nextRevision } : value), pending: current.pending.filter(value => value !== id || current.notes.find(n => n.id === id)?.updated !== updated) }))
        }
        if (merged.deleted.length) {
          for (const id of merged.deleted) {
            const remoteNote = remote.find(note => note.id === id)
            if (remoteNote?.trashedAt && Date.now() - remoteNote.trashedAt >= 30 * 86400000) {
              const { error } = await supabase.from('notes').delete().eq('id', id).eq('user_id', userId).eq('revision', remoteNote.revision)
              if (error) throw error
            }
          }
          setBook(current => ({ ...current, deleted: current.deleted.filter(id => !merged.deleted.includes(id)) }))
        }
        if (generation.current === version) setStatus(currentBook.current.pending.length || currentBook.current.deleted.length ? 'saving' : 'synced')
      }).catch(cause => { if (generation.current === version) { setStatus(navigator.onLine ? 'error' : 'offline'); setError(cause.message || 'Save failed') } })
    }, 700)
    return () => clearTimeout(timer)
  // Acknowledging a revision must not trigger a fetch loop.
  }, [book.notes.filter(note => book.pending.includes(note.id)).map(note => note.id + ':' + note.updated).join(','), book.deleted.join(','), loadedKey, key, userId, retry, writable])
  return {
    notes: loadedKey === key ? book.notes : [], book: loadedKey === key ? book : emptyNotebook(), status: status === 'synced' && userId && (book.pending.length || book.deleted.length) ? 'saving' as const : status, error, ready: loadedKey === key && writable, readOnly: !writable,
    add: () => { if (!ownsLock.current || loadedKey !== key) return ''; const note = createNote(); setBook(current => ({ ...current, notes: [note, ...current.notes], pending: [...current.pending, note.id] })); return note.id },
    update: (id: string, body: string) => { if (!ownsLock.current || loadedKey !== key || currentBook.current.notes.find(note => note.id === id)?.body === body) return; savingLocal.current = true; setStatus('saving'); setBook(current => editNote(current, id, body)) },
    change: (id: string, patch: Parameters<typeof changeNote>[2]) => { if (!ownsLock.current || loadedKey !== key) return; savingLocal.current = true; setStatus('saving'); setBook(current => changeNote(current, id, patch)) },
    remove: (id: string) => { if (ownsLock.current && loadedKey === key) setBook(current => trashNote(current, id)) },
    restore: (id: string) => { if (ownsLock.current && loadedKey === key) setBook(current => restoreNote(current, id)) },
    import: (raw: string) => { if (!ownsLock.current || loadedKey !== key) return; const validated = importBackup(emptyNotebook(), raw); setBook(current => ({ ...current, notes: [...validated.notes, ...current.notes], pending: [...new Set([...current.pending, ...validated.pending])] })) },
    retry: () => { if (loadedKey !== key || !writable) location.reload(); else { setBook(current => ({ ...current })); setRetry(value => value + 1) } },
    flush: async () => {
      if (!ownsLock.current || loadedKey !== key) return
      try { await localQueue.current.catch(() => {}); await writeLocal('books',key,currentBook.current); savingLocal.current = false }
      catch (cause) { setStatus('error'); savingLocal.current = true; throw cause }
    }
  }
}

import { emptyNotebook, importGuestNotes, parseNotebook, type Notebook } from './notes.ts'

let database: Promise<IDBDatabase> | undefined
function open() {
  return database ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('papertrail', 1)
    request.onupgradeneeded = () => { request.result.createObjectStore('books'); request.result.createObjectStore('assets') }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => { database = undefined; reject(request.error) }
    request.onblocked = () => { database = undefined; reject(new Error('Close other Papertrail tabs and retry')) }
  })
}
export async function readLocal<T>(store: 'books' | 'assets', key: string, signal?: AbortSignal): Promise<T | undefined> {
  const db = await open()
  signal?.throwIfAborted()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store), request = tx.objectStore(store).get(key)
    const abort = () => tx.abort()
    const cleanup = () => signal?.removeEventListener('abort',abort)
    signal?.addEventListener('abort',abort,{ once:true })
    request.onsuccess = () => { cleanup(); resolve(request.result) }
    request.onerror = () => { cleanup(); reject(request.error) }
    tx.onabort = () => { cleanup(); reject(tx.error || new DOMException('Cancelled','AbortError')) }
  })
}
export async function writeLocal(store: 'books' | 'assets', key: string, value: unknown, signal?: AbortSignal) {
  const db = await open()
  signal?.throwIfAborted()
  return new Promise<void>((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite')
    const abort = () => transaction.abort()
    const cleanup = () => signal?.removeEventListener('abort',abort)
    signal?.addEventListener('abort',abort,{ once:true })
    transaction.oncomplete = () => { cleanup(); resolve() }
    transaction.onabort = transaction.onerror = () => { cleanup(); reject(transaction.error || new Error('Local storage unavailable')) }
    try { transaction.objectStore(store).put(value, key) } catch (cause) { cleanup(); transaction.abort(); reject(cause) }
  })
}
export async function loadBook(key: string, signal?: AbortSignal): Promise<Notebook> {
  const saved = await readLocal<Notebook>('books', key,signal)
  signal?.throwIfAborted()
  if (saved) return parseNotebook(JSON.stringify(saved))
  const book = parseNotebook(localStorage.getItem(key))
  await writeLocal('books', key, book,signal)
  signal?.throwIfAborted()
  // The old cache remains recoverable until IndexedDB migration succeeds.
  localStorage.removeItem(key)
  return book
}
export async function deleteLocal(store: 'books' | 'assets', key: string) {
  const db = await open()
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).delete(key)
    tx.oncomplete = () => resolve(); tx.onabort = tx.onerror = () => reject(tx.error)
  })
}
export async function transferGuest(accountKey: string, signal: AbortSignal) {
  const db = await open()
  signal.throwIfAborted()
  return new Promise<Notebook>((resolve, reject) => {
    const tx = db.transaction('books', 'readwrite'), books = tx.objectStore('books')
    const account = books.get(accountKey), guest = books.get('papertrail-notes')
    let result: Notebook
    const abort = () => tx.abort()
    signal.addEventListener('abort', abort, { once:true })
    const transfer = () => {
      if (account.readyState !== 'done' || guest.readyState !== 'done') return
      if (signal.aborted) { tx.abort(); return }
      try {
        result = importGuestNotes(parseNotebook(JSON.stringify(account.result || emptyNotebook())), parseNotebook(JSON.stringify(guest.result || emptyNotebook())))
        books.put(result,accountKey); books.put(emptyNotebook(),'papertrail-notes')
      } catch { tx.abort() }
    }
    account.onsuccess = guest.onsuccess = transfer
    tx.oncomplete = () => { signal.removeEventListener('abort',abort); resolve(result) }
    tx.onabort = tx.onerror = () => { signal.removeEventListener('abort',abort); reject(tx.error || new DOMException('Cancelled','AbortError')) }
  })
}

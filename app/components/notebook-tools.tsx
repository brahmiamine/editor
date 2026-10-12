import { useRef, useState } from 'react'
import { backupNotebook, createNote, downloadText, emptyNotebook, titleFromBody, type Notebook } from '../lib/notes'
import { embedAttachments } from '../lib/attachments'
import { featureCopy, type Language } from '../lib/i18n'

export function NotebookTools({ book, userId, lang, importNotes, ready }: { book: Notebook; userId?: string; lang: Language; importNotes: (raw: string) => void; ready: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const t = featureCopy[lang]
  async function backup() {
    if (!ready) return
    setBusy(true); setMessage('')
    try { downloadText(await embedAttachments(backupNotebook(book), userId), 'papertrail-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json') }
    catch { setMessage(t.failure) } finally { setBusy(false) }
  }
  async function files(list: FileList) {
    if (!ready) return
    setBusy(true); setMessage('')
    try {
      // Validate the whole batch before changing any note.
      const batches: string[] = []
      if (Array.from(list).reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024) throw new Error('size')
      for (const file of Array.from(list)) {
        const raw = await file.text()
        if (/\.json$/i.test(file.name)) {
          const { parseNotebook } = await import('../lib/notes'); parseNotebook(raw); batches.push(raw)
        } else if (/\.(txt|md)$/i.test(file.name)) {
          const note = { ...createNote(), body: raw, title: titleFromBody(raw) }
          batches.push(JSON.stringify({ ...emptyNotebook(), notes: [note] }))
        } else throw new Error('type')
      }
      batches.forEach(importNotes); setMessage(t.importDone)
    } catch { setMessage(t.failure + ' ' + t.importHint) } finally { setBusy(false) }
  }
  return <div className="notebook-tools"><button disabled={busy || !ready} onClick={() => void backup()}>{t.backup}</button><button disabled={busy || !ready} onClick={() => fileInput.current?.click()}>{t.import}</button><input ref={fileInput} type="file" accept=".txt,.md,.json" multiple hidden onChange={event => { if (event.target.files) void files(event.target.files); event.target.value = '' }} />{message && <span role="status">{message}</span>}</div>
}

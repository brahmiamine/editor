import { useEffect, useRef, useState } from 'react'
import { featureCopy, type Language } from '../lib/i18n'
import { titleFromBody, type Note, type changeNote } from '../lib/notes'
import { ShareDialog } from './share-dialog'

export function NoteTools({ note, lang, change, update, userId }: { note: Note; lang: Language; change: (patch: Parameters<typeof changeNote>[2]) => void; update: (body: string) => void; userId?: string }) {
  const t = featureCopy[lang]
  const [history, setHistory] = useState(false)
  const [share, setShare] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { if (history) dialog.current?.showModal(); else dialog.current?.close() }, [history])
  return <div className="note-tools">
    <button aria-pressed={!!note.pinned} onClick={() => change({ pinned: !note.pinned })}>{note.pinned ? t.unpin : t.pin}</button>
    <button onClick={() => change({ archived: !note.archived })}>{note.archived ? t.unarchive : t.archiveNote}</button>
    <button onClick={() => setHistory(true)}>{t.history}</button>
    {userId && <button onClick={() => setShare(true)}>{t.share}</button>}
    <input key={note.id + ':tags'} aria-label={t.tags} placeholder={t.tags} defaultValue={(note.tags || []).join(', ')} maxLength={400} onBlur={event => { const tags = [...new Set(event.target.value.split(/[,،]/).map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 10); if (tags.join(',') !== (note.tags || []).join(',')) change({ tags }) }} />
    {note.conflictOf && <span role="status">{t.conflict}</span>}
    <dialog ref={dialog} className="insert-dialog history-dialog" aria-labelledby="history-title" onCancel={() => setHistory(false)}>
      <h2 id="history-title">{t.history}</h2>
      {!note.history?.length && <p>{t.noHistory}</p>}
      {note.history?.map((version, index) => <details key={version.at + ':' + index}><summary>{new Date(version.at).toLocaleString(lang)}</summary><pre>{version.body}</pre><button onClick={() => { change({ body: version.body, title: titleFromBody(version.body), history: [{ body: note.body, at: Date.now() }, ...(note.history || [])].slice(0,50) }); setHistory(false) }}>{t.restoreVersion}</button></details>)}
      <button autoFocus onClick={() => setHistory(false)}>{lang === 'fr' ? 'Fermer' : lang === 'ar' ? 'إغلاق' : 'Close'}</button>
    </dialog>
    <ShareDialog note={note} userId={userId} lang={lang} open={share} close={() => setShare(false)} />
  </div>
}

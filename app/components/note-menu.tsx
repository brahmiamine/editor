import { useEffect, useRef, useState } from 'react'
import { Archive, ArchiveRestore, Ellipsis, History, Pin, PinOff, Share2, Tag, Trash2 } from 'lucide-react'
import { copy, featureCopy, type Language } from '../lib/i18n'
import { titleFromBody, type Note, type changeNote } from '../lib/notes'
import { ShareDialog } from './share-dialog'

type Panel = 'history' | 'share' | undefined

function HistoryDialog({ note, lang, change, close }: { note: Note; lang: Language; change: (patch: Parameters<typeof changeNote>[2]) => void; close: () => void }) {
  const t = featureCopy[lang]
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialog.current?.showModal() }, [])
  return <dialog ref={dialog} className="insert-dialog history-dialog" aria-labelledby="history-title" onCancel={close} onClose={close}>
    <h2 id="history-title">{t.history}</h2>
    {!note.history?.length && <p>{t.noHistory}</p>}
    {note.history?.map((version, index) => <details key={version.at + ':' + index}><summary>{new Date(version.at).toLocaleString(lang)}</summary><pre>{version.body}</pre><button onClick={() => { change({ body: version.body, title: titleFromBody(version.body), history: [{ body: note.body, at: Date.now() }, ...(note.history || [])].slice(0, 50) }); close() }}>{t.restoreVersion}</button></details>)}
    <button autoFocus onClick={close}>{lang === 'fr' ? 'Fermer' : lang === 'ar' ? 'إغلاق' : 'Close'}</button>
  </dialog>
}

export function NoteMenu({ note, lang, label, userId, change, remove }: { note: Note; lang: Language; label: string; userId?: string; change: (patch: Parameters<typeof changeNote>[2]) => void; remove: () => void }) {
  const t = featureCopy[lang]
  const [open, setOpen] = useState(false)
  const [panel, setPanel] = useState<Panel>()
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const outside = (event: Event) => { if (!root.current?.contains(event.target as Node)) setOpen(false) }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    const close = () => setOpen(false)
    document.addEventListener('pointerdown', outside); document.addEventListener('keydown', key)
    window.addEventListener('resize', close); window.addEventListener('scroll', close, true)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true) }
  }, [open])
  const toggle = () => {
    const rect = trigger.current?.getBoundingClientRect()
    if (rect) setPos({ top: Math.min(rect.bottom + 4, Math.max(8, window.innerHeight - 330)), left: Math.max(8, Math.min(rect.right - 220, window.innerWidth - 228)) })
    setOpen(!open)
  }
  const act = (run: () => void) => () => { setOpen(false); run() }
  return <div className="note-menu" ref={root}>
    <button ref={trigger} className="note-more" aria-haspopup="menu" aria-expanded={open} aria-label={copy[lang].more + ' : ' + label} title={copy[lang].more} onClick={toggle}><Ellipsis size={18} aria-hidden="true" /></button>
    {open && <div className="note-menu-list" role="menu" style={{ top: pos.top, left: pos.left }}>
      <button role="menuitem" onClick={act(() => change({ pinned: !note.pinned }))}>{note.pinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}{note.pinned ? t.unpin : t.pin}</button>
      <button role="menuitem" onClick={act(() => change({ archived: !note.archived }))}>{note.archived ? <ArchiveRestore size={14} aria-hidden="true" /> : <Archive size={14} aria-hidden="true" />}{note.archived ? t.unarchive : t.archiveNote}</button>
      <button role="menuitem" onClick={act(() => setPanel('history'))}><History size={14} aria-hidden="true" />{t.history}</button>
      {userId && <button role="menuitem" onClick={act(() => setPanel('share'))}><Share2 size={14} aria-hidden="true" />{t.share}</button>}
      <label className="tag-field"><Tag size={14} aria-hidden="true" /><input key={note.id + ':tags'} aria-label={t.tags} placeholder={t.tags} defaultValue={(note.tags || []).join(', ')} maxLength={400} onBlur={event => { const tags = [...new Set(event.target.value.split(/[,،]/).map(tag => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 10); if (tags.join(',') !== (note.tags || []).join(',')) change({ tags }) }} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); setOpen(false) } }} /></label>
      <button role="menuitem" className="danger" onClick={act(remove)}><Trash2 size={14} aria-hidden="true" />{lang === 'fr' ? 'Supprimer' : lang === 'ar' ? 'حذف' : 'Delete'}</button>
    </div>}
    {panel === 'history' && <HistoryDialog note={note} lang={lang} change={change} close={() => setPanel(undefined)} />}
    {panel === 'share' && <ShareDialog note={note} userId={userId} lang={lang} open close={() => setPanel(undefined)} />}
  </div>
}

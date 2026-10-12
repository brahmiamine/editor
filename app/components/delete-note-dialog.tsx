import { useEffect, useRef } from 'react'
import type { Note } from '../lib/notes'
import type { Language } from '../lib/i18n'

const labels = {
  fr: { title: 'Supprimer cette note ?', cancel: 'Annuler', confirm: 'Supprimer' },
  en: { title: 'Delete this note?', cancel: 'Cancel', confirm: 'Delete' },
  ar: { title: 'حذف هذه الملاحظة؟', cancel: 'إلغاء', confirm: 'حذف' }
}
export function DeleteNoteDialog({ note, lang, cancel, confirm }: { note?: Note; lang: Language; cancel: () => void; confirm: (id: string) => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    if (note) dialog.current?.showModal()
    else dialog.current?.close()
  }, [note?.id])
  const t = labels[lang]
  return <dialog ref={dialog} className="delete-dialog" aria-labelledby="delete-note-title" onCancel={cancel}>
    <h2 id="delete-note-title">{t.title}</h2><p>{note?.title}</p>
    <div><button autoFocus onClick={cancel}>{t.cancel}</button><button className="confirm-delete" onClick={() => { if (note) confirm(note.id); cancel() }}>{t.confirm}</button></div>
  </dialog>
}

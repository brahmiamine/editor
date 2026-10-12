import { exportNote, wordCount, type Note } from '../lib/notes'
import type { copy } from '../lib/i18n'
type Props = { note?: Note; t: typeof copy.fr; font: number; setFont: (size: number) => void; update: (body: string) => void; remove: () => void; add: () => void }
export function NoteEditor({ note, t, font, setFont, update, remove, add }: Props) {
  function download(extension: 'txt' | 'md') {
    if (!note) return
    const url = URL.createObjectURL(new Blob([exportNote(note, extension)], { type: 'text/plain;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url; link.download = `${note.title.replace(/[<>:"/\\|?*]/g, '_') || 'note'}.${extension}`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return <section className="editor">
    <header><div className="crumb">{t.all} <span>›</span> {note?.title || t.newNote}</div><div className="actions">
      <button disabled={!note} onClick={() => download('md')} aria-label="Export Markdown">↓ .md</button>
      <button disabled={!note} onClick={() => download('txt')} aria-label="Export text">↓ .txt</button>
      <button disabled={!note} className="danger" aria-label={t.delete} onClick={remove}>⌫</button>
    </div></header>
    {note ? <><textarea className="body" aria-label={t.notes} style={{ fontSize: font }} value={note.body} onChange={event => update(event.target.value)} placeholder={t.start} />
      <footer><span>{wordCount(note.body)} {t.words} <em>·</em> {Array.from(note.body).length} {t.chars}</span>
        <span><button onClick={() => update('')}>{t.clear}</button><label>A <input aria-label="Text size" type="range" min="14" max="28" value={font} onChange={event => setFont(+event.target.value)} /></label></span>
      </footer></> : <div className="empty editor-empty"><button onClick={add}>{t.newNote}</button></div>}
  </section>
}

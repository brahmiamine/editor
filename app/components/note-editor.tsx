import { exportNote, formatText, wordCount, type Note } from '../lib/notes'
import type { copy } from '../lib/i18n'
type Props = { note?: Note; t: typeof copy.fr; font: number; setFont: (size: number) => void; update: (body: string) => void; add: () => void }
export function NoteEditor({ note, t, font, setFont, update, add }: Props) {
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
      <button disabled={!note} aria-label="Autoformat" title="Autoformat" onClick={() => { if (note) update(formatText(note.body)) }}>≡</button>
    </div></header>
    {note ? <><textarea key={note.id} autoFocus className="body" aria-label={t.notes} style={{ fontSize: font }} value={note.body} onChange={event => update(event.target.value)} placeholder={t.start} />
      <footer><span>{wordCount(note.body)} {t.words} <em>·</em> {Array.from(note.body).length} {t.chars}</span>
        <span><button onClick={() => update('')}>{t.clear}</button><label>A <input aria-label="Text size" type="number" min="14" max="48" step="1" value={font} onChange={event => { const size = event.target.valueAsNumber; if (Number.isFinite(size)) setFont(Math.max(14, Math.min(48, size))) }} /></label></span>
      </footer></> : <div className="empty editor-empty"><button onClick={add}>{t.newNote}</button></div>}
  </section>
}

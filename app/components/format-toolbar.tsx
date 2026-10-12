import { useState } from 'react'
import type { copy } from '../lib/i18n'

export function FormatToolbar({ t, tidy }: { t: typeof copy.fr; tidy: () => void }) {
  const [open, setOpen] = useState(false)
  // Keep the text selection in the editor while a toolbar button is pressed.
  const keep = (event: React.MouseEvent) => event.preventDefault()
  const run = (command: string, value?: string) => { setOpen(false); document.execCommand(command, false, value) }
  const headings: [string, string][] = [['<p>', t.paragraph], ['<h1>', t.h1], ['<h2>', t.h2], ['<h3>', t.h3]]
  return <div className="toolbar" role="toolbar" aria-label={t.richMode}>
    <div className="menu-wrap">
      <button className="heading-btn" onMouseDown={keep} onClick={() => setOpen(value => !value)} aria-haspopup="menu" aria-expanded={open}>{t.headings} <span aria-hidden="true">⌄</span></button>
      {open && <div className="heading-menu" role="menu">{headings.map(([tag, label]) => <button key={tag} role="menuitem" onMouseDown={keep} onClick={() => run('formatBlock', tag)}>{label}</button>)}</div>}
    </div>
    <i className="sep" />
    <button onMouseDown={keep} onClick={() => run('bold')} aria-label={t.bold} title={t.bold}><b>B</b></button>
    <button onMouseDown={keep} onClick={() => run('italic')} aria-label={t.italic} title={t.italic}><em>I</em></button>
    <button onMouseDown={keep} onClick={() => run('underline')} aria-label={t.underline} title={t.underline}><u>U</u></button>
    <button onMouseDown={keep} onClick={tidy} aria-label={t.tidy} title={t.tidy}>¶</button>
    <button onMouseDown={keep} onClick={() => run('insertUnorderedList')} aria-label={t.bullets} title={t.bullets}>☰</button>
    <button onMouseDown={keep} onClick={() => run('insertOrderedList')} aria-label={t.numbers} title={t.numbers}>1.</button>
    <button onMouseDown={keep} onClick={() => run('undo')} aria-label={t.undo} title={t.undo}>↶</button>
    <button onMouseDown={keep} onClick={() => run('redo')} aria-label={t.redo} title={t.redo}>↷</button>
  </div>
}

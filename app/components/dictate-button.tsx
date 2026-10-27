import { useEffect, useRef, useState } from 'react'
import { Mic } from 'lucide-react'
import { editorCopy, type Language } from '../lib/i18n'

// Web Speech API n'est pas dans lib.dom.d.ts
type Recognition = { lang: string; continuous: boolean; interimResults: boolean; onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null; start(): void; stop(): void; abort(): void }
type Ctor = new () => Recognition
const api = () => (window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition

export function DictateButton({ lang, editor, disabled }: { lang: Language; editor: React.RefObject<HTMLElement | null>; disabled: boolean }) {
  const [SR, setSR] = useState<Ctor | undefined>()
  const [listening, setListening] = useState(false)
  const rec = useRef<Recognition | null>(null)
  useEffect(() => { setSR(() => api()); return () => rec.current?.abort() }, [])
  if (!SR) return null
  const label = listening ? editorCopy[lang].micStop : editorCopy[lang].mic
  function toggle() {
    if (rec.current) { rec.current.stop(); return }
    const r = new SR!()
    r.lang = { fr: 'fr-FR', en: 'en-US', ar: 'ar-SA' }[lang]
    r.continuous = true
    r.interimResults = true
    let pending = ''
    // retire le texte provisoire déjà écrit pour le remplacer par la version affinée
    const dropPending = (root: HTMLElement) => {
      if (!pending) return
      if (root instanceof HTMLTextAreaElement) root.setSelectionRange(root.selectionStart - pending.length, root.selectionStart)
      else for (let n = Array.from(pending).length; n--;) (window.getSelection() as Selection & { modify(a: string, d: string, g: string): void }).modify('extend', 'backward', 'character') // ponytail: curseur déplacé pendant l'écoute = texte provisoire mal retiré
      document.execCommand('delete')
      pending = ''
    }
    r.onresult = event => {
      const root = editor.current
      if (!root) return
      let final = '', interim = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript
        if (event.results[i].isFinal) final += text.trim() + ' '; else interim += text
      }
      root.focus()
      dropPending(root)
      if (final) document.execCommand('insertText', false, final)
      if (interim) { document.execCommand('insertText', false, interim); pending = interim }
    }
    r.onend = r.onerror = () => { rec.current = null; setListening(false) }
    rec.current = r; setListening(true)
    r.start()
  }
  return <button className={listening ? 'dictating' : undefined} disabled={disabled} aria-pressed={listening} aria-label={label} title={label} onMouseDown={e => e.preventDefault()} onClick={toggle}>{listening ? <span className="wave" aria-hidden="true"><i /><i /><i /><i /></span> : <Mic size={16} aria-hidden="true" />}</button>
}

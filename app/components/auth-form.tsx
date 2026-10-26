'use client'
import { Asterisk } from 'lucide-react'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { apiUrl, auth, basePath, cachedSession } from '../api'
import { copy, emailDisabledCopy, featureCopy, type Language } from '../lib/i18n'

type Mode = 'login' | 'signup' | 'magic' | 'reset' | 'update'
const modes: Mode[] = ['login','signup','magic','reset','update']

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)
  const [theme, setTheme] = useState('paper')
  const [lang, setLang] = useState<Language>('fr')
  const [emailEnabled, setEmailEnabled] = useState(false)
  const t = featureCopy[lang]
  const titles = { login: t.login, signup: t.signup, magic: t.magic, reset: t.reset, update: t.password }
  const buttons = { ...titles, update: t.savePassword }

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('papertrail-preferences') || '{}')
      if (['paper', 'night', 'sun'].includes(saved.theme)) setTheme(saved.theme)
      if (['fr', 'en', 'ar'].includes(saved.lang)) setLang(saved.lang)
    } catch {}
    const requested = new URLSearchParams(location.search).get('mode')
    if (requested && modes.includes(requested as Mode)) setMode(requested as Mode)
    if (!apiUrl) return
    void auth.config().then(config => setEmailEnabled(config.emailEnabled)).catch(() => {})
    // E-mailed links carry a single-use token in the fragment, which never reaches a server log.
    const link = /^#auth=(magic|recovery):([\w-]+)$/.exec(location.hash)
    if (link) {
      const type = link[1] as 'magic' | 'recovery'
      history.replaceState(null, '', `${basePath}/auth/${type === 'recovery' ? '?mode=update' : ''}`)
      if (type === 'recovery') setMode('update')
      void auth.verify(type, link[2]).then(() => { if (type === 'recovery') setRecoveryReady(true); else location.replace(`${basePath}/notes/`) }).catch(() => setError(t.failure))
    } else if (cachedSession()) {
      if (requested === 'update') setRecoveryReady(true)
      else location.replace(`${basePath}/notes/`)
    }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(''); setMessage('')
    if (!apiUrl) { setError(t.notConfigured); return }
    if ((mode === 'magic' || mode === 'reset') && !emailEnabled) { setError(emailDisabledCopy[lang]); return }
    if (mode === 'update' && (!recoveryReady || password !== confirmation)) {
      setError(!recoveryReady ? t.openReset : t.mismatch)
      return
    }
    setBusy(true)
    try {
      if (mode === 'signup') await auth.signUp(email, password)
      else if (mode === 'magic') await auth.magicLink(email)
      else if (mode === 'reset') await auth.recover(email)
      else if (mode === 'update') await auth.updatePassword(password)
      else await auth.signIn(email, password)
      if (mode === 'login' || mode === 'signup' || mode === 'update') { location.replace(`${basePath}/notes/`); return }
      setMessage(mode === 'magic' ? t.magicMessage : t.resetMessage)
      setPassword('')
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
      setError(code === 'rate_limited' ? t.rateLimit : code === 'email_disabled' ? emailDisabledCopy[lang] : t.failure)
    }
    finally { setBusy(false) }
  }

  return <main className={`auth-page ${theme}`} dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang}><div className="auth-card">
    <select aria-label={copy[lang].language} value={lang} onChange={event => { const next = event.target.value as Language; setLang(next); try { const saved = JSON.parse(localStorage.getItem('papertrail-preferences') || '{}'); localStorage.setItem('papertrail-preferences', JSON.stringify({ ...saved, lang: next })) } catch {} }}><option value="fr">Français</option><option value="en">English</option><option value="ar">العربية</option></select>
    <Link className="auth-brand" href="/"><span className="mark"><Asterisk size={24} aria-hidden="true" /></span> Papertrail</Link>
    <h1>{titles[mode]}</h1><p className="auth-intro">{t.authIntro}</p>
    <form onSubmit={submit}>
      {mode !== 'update' && <input aria-label={t.email} type="email" autoComplete="email" placeholder={t.email} value={email} onChange={e => setEmail(e.target.value)} required />}
      {(mode === 'login' || mode === 'signup' || mode === 'update') && <input aria-label={mode === 'update' ? t.password : t.authPassword} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'update' ? t.password : t.authPassword} minLength={mode === 'login' ? undefined : 8} value={password} onChange={e => setPassword(e.target.value)} required />}
      {mode === 'update' && <input aria-label={t.confirmPassword} type="password" autoComplete="new-password" placeholder={t.confirmPassword} minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} required />}
      <button className="auth-submit" disabled={busy || (mode === 'update' && !recoveryReady)}>{busy ? t.busy : buttons[mode]}</button>
    </form>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {message && <div className="auth-message" role="status">{message}</div>}
    {mode === 'update' && !recoveryReady && <p role="status">{t.openReset}</p>}
    <nav className="auth-links" aria-label={t.login}>
      {mode === 'login' ? <><a href="?mode=signup">{t.signup}</a>{emailEnabled && <><a href="?mode=magic">{t.magic}</a><a href="?mode=reset">{t.reset}</a></>}</> : <><a href="?mode=login">{t.backLogin}</a>{mode === 'signup' && emailEnabled && <a href="?mode=magic">{t.magic}</a>}</>}
    </nav>
  </div></main>
}

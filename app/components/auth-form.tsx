'use client'
import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { basePath, supabase } from '../supabase'

type Mode = 'login' | 'signup' | 'magic' | 'reset' | 'update'
const titles = { login: 'Bon retour.', signup: 'Créer un compte.', magic: 'Connexion sans mot de passe.', reset: 'Mot de passe oublié ?', update: 'Choisir un nouveau mot de passe.' }
const buttons = { login: 'Se connecter', signup: 'Créer mon compte', magic: 'Envoyer le lien magique', reset: 'Envoyer le lien', update: 'Enregistrer le mot de passe' }

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [recoveryReady, setRecoveryReady] = useState(false)

  useEffect(() => {
    const requested = new URLSearchParams(location.search).get('mode')
    if (requested && Object.hasOwn(titles, requested)) setMode(requested as Mode)
    const hash = new URLSearchParams(location.hash.slice(1))
    if (hash.get('error_description')) setError(hash.get('error_description')!)
    if (!supabase) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setMode('update')
        setRecoveryReady(!!session)
        history.replaceState(null, '', `${basePath}/auth/?mode=update`)
      } else if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        if (requested === 'update') setRecoveryReady(true)
        else if (hash.get('type') !== 'recovery') location.replace(`${basePath}/`)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError(''); setMessage('')
    if (!supabase) { setError('La connexion n’est pas encore configurée. Vos notes restent disponibles localement.'); return }
    if (mode === 'update' && (!recoveryReady || password !== confirmation)) {
      setError(!recoveryReady ? 'Ouvrez le lien de réinitialisation reçu par email.' : 'Les mots de passe ne correspondent pas.')
      return
    }
    setBusy(true)
    try {
      const redirect = `${location.origin}${basePath}/auth/`
      const result = mode === 'signup'
        ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
        : mode === 'magic'
        ? await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
        : mode === 'reset'
        ? await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${redirect}?mode=update` })
        : mode === 'update'
        ? await supabase.auth.updateUser({ password })
        : await supabase.auth.signInWithPassword({ email, password })
      if (result.error) throw result.error
      if (mode === 'login' || mode === 'update') { location.replace(`${basePath}/`); return }
      setMessage(mode === 'signup' ? 'Si ce compte existe déjà, connectez-vous ou utilisez un lien magique. Pour un nouveau compte, consultez votre email de confirmation.' : mode === 'magic' ? 'Si votre compte existe, vous recevrez un lien de connexion.' : 'Si votre compte existe, vous recevrez un lien de réinitialisation.')
      setPassword('')
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? err.code : ''
      setError(code === 'over_email_send_rate_limit' ? 'Limite d’envoi atteinte. Patientez au moins une minute avant de demander un autre email.' : err instanceof Error ? err.message : 'Connexion impossible. Réessayez.')
    }
    finally { setBusy(false) }
  }

  return <main className="auth-page"><div className="auth-card">
    <Link className="auth-brand" href="/">✳ papertrail</Link>
    <h1>{titles[mode]}</h1><p className="auth-intro">Vos notes, disponibles partout et toujours à vous.</p>
    <form onSubmit={submit}>
      {mode !== 'update' && <input aria-label="Email" type="email" autoComplete="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} required />}
      {(mode === 'login' || mode === 'signup' || mode === 'update') && <input aria-label={mode === 'update' ? 'Nouveau mot de passe' : 'Mot de passe'} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'update' ? 'Nouveau mot de passe' : 'Mot de passe'} minLength={mode === 'login' ? undefined : 8} value={password} onChange={e => setPassword(e.target.value)} required />}
      {mode === 'update' && <input aria-label="Confirmer le mot de passe" type="password" autoComplete="new-password" placeholder="Confirmer le mot de passe" minLength={8} value={confirmation} onChange={e => setConfirmation(e.target.value)} required />}
      <button className="auth-submit" disabled={busy || (mode === 'update' && !recoveryReady)}>{busy ? 'En cours…' : buttons[mode]}</button>
    </form>
    {error && <div className="auth-error" role="alert">{error}</div>}
    {message && <div className="auth-message" role="status">{message}</div>}
    {mode === 'update' && !recoveryReady && <p role="status">Ouvrez le lien reçu par email pour continuer.</p>}
    <nav className="auth-links" aria-label="Authentification">
      {mode === 'login' ? <><a href="?mode=signup">Créer un compte</a><a href="?mode=magic">Utiliser un lien magique</a><a href="?mode=reset">Mot de passe oublié ?</a></> : <><a href="?mode=login">← Retour à la connexion</a>{mode === 'signup' && <a href="?mode=magic">Utiliser un lien magique</a>}</>}
    </nav>
  </div></main>
}

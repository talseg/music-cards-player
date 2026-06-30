import { useEffect, useState } from 'react'
import { toAuthPhase } from './auth-utils'
import type { Auth } from './spotify-auth'
import type { AuthPhase } from '../common/types'

export function useAuth(spotifyAuth: Auth) {
  const [auth, setAuth] = useState<AuthPhase>({ kind: 'checking' })
  const [user, setUser] = useState<string | null>(null)

  // The actual work is memoized inside the shared auth module (getInitAuth),
  // so the one-time OAuth code exchange runs exactly once even though
  // StrictMode invokes this effect twice in dev. Both invocations await the
  // same promise; whichever is still mounted applies the result, so the UI
  // always leaves the 'checking' state.
  useEffect(() => {
    let cancelled = false
    spotifyAuth.getInitAuth().then(result => {
      if (cancelled) return
      const { phase: nextAuth, user: nextUser } = toAuthPhase(result)
      setUser(nextUser)
      setAuth(nextAuth)
    })
    return () => { cancelled = true }
  }, [spotifyAuth])

  const handleLogin = () => {
    spotifyAuth.sdk.authenticate()
  }

  const handleReload = () => {
    window.location.reload()
  }

  const showUser =
    user !== null &&
    (auth.kind === 'ready' || (auth.kind === 'fatal' && auth.showUser))

  return {
    auth,
    setAuth,
    user,
    setUser,
    showUser,
    handleLogin,
    handleReload,
  }
}

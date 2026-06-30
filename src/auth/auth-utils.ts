import type { AuthPhase } from '../common/types'
import type { InitAuthResult } from './spotify-auth'

// Map the shared auth module's neutral result onto this app's AuthPhase model.
// The error classification itself lives in src/auth/spotify-auth.ts.
function toAuthPhase(result: InitAuthResult): { phase: AuthPhase; user: string | null } {
  if (result.ok) {
    return { phase: { kind: 'ready' }, user: result.user }
  }
  switch (result.kind) {
    case 'no-session':
      return { phase: { kind: 'login', reason: 'Please login' }, user: null }
    case 'expired':
      return { phase: { kind: 'login', reason: 'Session expired, please log in again' }, user: null }
    case 'stale-callback':
      // Partial state was cleared by the shared module; user can simply retry.
      return { phase: { kind: 'login', reason: 'Please login' }, user: null }
    case 'redirect-uri':
      return {
        phase: {
          kind: 'fatal',
          message: `Please add ${result.redirectUri} to https://developer.spotify.com/dashboard\n\n${result.message}`,
          showUser: false,
        },
        user: null,
      }
    case 'error':
      return { phase: { kind: 'fatal', message: result.message, showUser: false }, user: null }
  }
}

export default toAuthPhase

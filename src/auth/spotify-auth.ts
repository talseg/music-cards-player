// ─────────────────────────────────────────────────────────────────────────────
// SHARED AUTH MODULE — keep in sync between music-cards and music-cards-player
//
// This file is intentionally app-agnostic: all app-specific values (client id,
// scopes, cache prefix) are passed in via createAuth(config). Copy this file
// verbatim between the two projects; only the config each app passes differs.
//
// What it provides:
//   - PrefixedCache: namespaces all SDK token/verifier storage under a per-app
//     localStorage key prefix, so two apps sharing one Spotify Client ID on the
//     same origin never collide.
//   - createAuth(config): builds the SDK instance plus helpers:
//       sdk                  - the SpotifyApi instance (PKCE user authorization)
//       getInitAuth()        - memoized, exactly-once initial-auth resolution
//       clearStoredAuth()    - remove only this app's namespaced auth keys
//       hasStoredToken()     - true if this app has any namespaced auth keys
//       getRedirectUri()     - the redirect URI this app sends to Spotify
//
// Why getInitAuth is memoized at module/closure scope:
//   The OAuth token exchange (consuming the one-time ?code=... and its PKCE
//   verifier) happens inside the first SDK call, and an authorization code is
//   single-use. Under React StrictMode the mount effect runs twice, so the
//   work must run only once, with BOTH effect invocations observing the same
//   result. Memoizing the promise guarantees that: the first caller starts the
//   work, every later caller reuses the in-flight/cached promise. The caller's
//   effect applies the resolved value (guarded by its own cancel flag), so the
//   live mount always leaves its "checking" state.
// ─────────────────────────────────────────────────────────────────────────────

import {
  SpotifyApi,
  LocalStorageCachingStrategy,
  type ICachingStrategy,
  type ICachable,
} from '@spotify/web-api-ts-sdk'

// ─── Config and result types ─────────────────────────────────────────────────

export interface AuthConfig {
  clientId: string
  scopes: string[]
  /** localStorage namespace, e.g. 'music-cards:' or 'music-cards-player:' */
  cachePrefix: string
}

// Neutral result of the initial auth resolution. Each app maps this onto its
// own auth-state model.
export type InitAuthResult =
  | { ok: true; user: string }
  | { ok: false; kind: 'no-session'; message: null }
  | { ok: false; kind: 'expired'; message: string }
  | { ok: false; kind: 'redirect-uri'; message: string; redirectUri: string }
  | { ok: false; kind: 'stale-callback'; message: string }
  | { ok: false; kind: 'error'; message: string }

export interface Auth {
  sdk: SpotifyApi
  getInitAuth: () => Promise<InitAuthResult>
  clearStoredAuth: () => void
  hasStoredToken: () => boolean
  getRedirectUri: () => string
}

// ─── Error classifiers ────────────────────────────────────────────────────────

function isRedirectUriError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('redirect') && m.includes('uri')
}

// The Spotify SDK throws this on the OAuth callback when the PKCE verifier it
// stored before redirecting is missing from the cache. This is a transient
// stale-state condition (e.g. the callback landed in a fresh page/context, or
// a previous attempt left a dangling code in the URL).
function isMissingVerifierError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('verifier') && (m.includes('no ') || m.includes('not found') || m.includes('cache'))
}

// ─── Namespaced cache ─────────────────────────────────────────────────────────

// Wraps the SDK's default LocalStorageCachingStrategy, prefixing every cache
// key so this app's stored token + PKCE verifier live in their own namespace.
class PrefixedCache implements ICachingStrategy {
  private inner = new LocalStorageCachingStrategy()
  private prefix: string

  constructor(prefix: string) {
    this.prefix = prefix
  }

  private k(cacheKey: string): string {
    return `${this.prefix}${cacheKey}`
  }

  getOrCreate<T>(
    cacheKey: string,
    createFunction: () => Promise<T & ICachable & object>,
  ): Promise<T & ICachable> {
    return this.inner.getOrCreate(this.k(cacheKey), createFunction)
  }

  get<T>(cacheKey: string): Promise<(T & ICachable) | null> {
    return this.inner.get<T>(this.k(cacheKey))
  }

  setCacheItem<T>(cacheKey: string, item: T & ICachable): void {
    this.inner.setCacheItem(this.k(cacheKey), item)
  }

  remove(cacheKey: string): void {
    this.inner.remove(this.k(cacheKey))
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAuth(config: AuthConfig): Auth {
  const { clientId, scopes, cachePrefix } = config

  function getRedirectUri(): string {
    return `${window.location.origin}/callback`
  }

  const sdk = SpotifyApi.withUserAuthorization(clientId, getRedirectUri(), scopes, {
    cachingStrategy: new PrefixedCache(cachePrefix),
  })

  function hasStoredToken(): boolean {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(cachePrefix)) return true
    }
    return false
  }

  function clearStoredAuth(): void {
    const toRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith(cachePrefix)) toRemove.push(key)
    }
    toRemove.forEach(k => localStorage.removeItem(k))
  }

  // Resolve the initial auth state. Runs the one-time work; never throws —
  // every path resolves to a definite InitAuthResult.
  async function resolveInitAuth(): Promise<InitAuthResult> {
    const isCallback = window.location.search.includes('code=')
    const hadToken = hasStoredToken()

    if (!isCallback && !hadToken) {
      return { ok: false, kind: 'no-session', message: null }
    }

    try {
      const profile = await sdk.currentUser.profile()

      if (isCallback) {
        window.history.replaceState({}, '', window.location.pathname)
      }
      return { ok: true, user: profile.display_name || profile.email || 'Spotify user' }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)

      if (isRedirectUriError(message)) {
        return { ok: false, kind: 'redirect-uri', message, redirectUri: getRedirectUri() }
      }

      // Transient PKCE verifier-not-found on the callback: clear partial state
      // and strip the stale ?code=... so the user can simply retry login.
      if (isMissingVerifierError(message)) {
        clearStoredAuth()
        if (isCallback) {
          window.history.replaceState({}, '', window.location.pathname)
        }
        return { ok: false, kind: 'stale-callback', message }
      }

      // A stored token that no longer works => session expired.
      if (hadToken && !isCallback) {
        clearStoredAuth()
        return { ok: false, kind: 'expired', message }
      }

      return { ok: false, kind: 'error', message }
    }
  }

  // Memoize: the work above runs exactly once per page load.
  let initAuthPromise: Promise<InitAuthResult> | null = null

  function getInitAuth(): Promise<InitAuthResult> {
    if (!initAuthPromise) {
      initAuthPromise = resolveInitAuth()
    }
    return initAuthPromise
  }

  return { sdk, getInitAuth, clearStoredAuth, hasStoredToken, getRedirectUri }
}

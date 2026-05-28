import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import styled from 'styled-components'
import { Html5Qrcode } from 'html5-qrcode'
import { version } from '../package.json'
import { createSpotifyApi } from './spotify-auth'
import {
  initializePlayer,
  playTrack,
  pauseTrack,
  resumeTrack,
  seekToStart,
  seekTo,
  extractTrackUri,
  type SpotifyPlayer,
  type TrackInfo,
} from './spotify-player'

// When true, reveal the scanned song's name, artist and year (for debugging).
// Flip to false for the real "blind" game experience.
const IS_DEBUG = true

const SCANNER_ELEMENT_ID = 'qr-reader'

// Create SDK once at module load
const sdk = createSpotifyApi()

// Check if SDK has a cached token without triggering its auto-redirect
function hasStoredToken(): boolean {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && (key.includes('spotify-sdk') || key.includes('AuthorizationCode'))) {
      return true
    }
  }
  return false
}

// ---------------------------------------------------------------------------
// State machine
// ---------------------------------------------------------------------------
// Auth phase (gates the whole app):
//   'checking'  - verifying stored token / handling callback on mount
//   'login'     - show Login screen (carries a reason to display)
//   'ready'     - authenticated; player phase below takes over
//   'fatal'     - unrecoverable auth/credentials error (debug dump)
//
// Player phase (only meaningful once auth === 'ready'):
//   'init'         - initializing the Web Playback SDK device
//   'idle'         - no song loaded yet; only "Next Song" enabled
//   'scanning'     - camera overlay open
//   'loading'      - scan succeeded, waiting for playback to confirm
//   'playing'      - a song is loaded and playing
//   'paused'       - a song is loaded and paused
//   'playbackFailed' - soft error; offer Try again / Cancel
type AuthPhase =
  | { kind: 'checking' }
  | { kind: 'login'; reason: string }
  | { kind: 'ready' }
  | { kind: 'fatal'; message: string; showUser: boolean }

type PlayerPhase =
  | { kind: 'init' }
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'loading'; trackUri: string }
  | { kind: 'playing'; trackUri: string; info: TrackInfo }
  | { kind: 'paused'; trackUri: string; info: TrackInfo }
  | { kind: 'playbackFailed'; trackUri: string; message: string }

// ---------------------------------------------------------------------------
// Styled components
// ---------------------------------------------------------------------------
const AppWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 18px;
`

const Footer = styled.div`
  position: fixed;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
`

const VersionLabel = styled.div`
  font-size: 0.75rem;
  color: #888;
`

const HeaderLabel = styled.div`
  font-size: 1.75rem;
  color: #d41c1c;
  font-weight: 550;
`

const CreditLabel = styled.div`
  font-size: 1.2rem;
  color: #1c2ed4;
`

const UserLabel = styled.div`
  font-size: 0.75rem;
  color: #888;
`

const StatusText = styled.div`
  font-size: 0.85rem;
  color: #888;
`

const LoginReason = styled.div`
  font-size: 1rem;
  color: #333;
`

const SpotifyButton = styled.button`
  font-size: 1rem;
  padding: 12px 32px;
  border: none;
  border-radius: 24px;
  background: #1db954;
  color: white;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    background: #17a349;
  }
`

const Controls = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
`

const IconButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border: 1px solid #ccc;
  border-radius: 50%;
  background: #f5f5f5;
  cursor: pointer;
  color: #1a1a2e;

  &:hover:not(:disabled) {
    background: #e8e8e8;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  svg {
    width: 32px;
    height: 32px;
  }
`

const NextButton = styled.button`
  font-size: 1rem;
  padding: 14px 36px;
  border: none;
  border-radius: 24px;
  background: #1db954;
  color: white;
  font-weight: 600;
  cursor: pointer;

  &:hover:not(:disabled) {
    background: #17a349;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }
`

const ScannerBox = styled.div`
  width: 300px;
  max-width: 100%;
`

const SecondaryButton = styled.button`
  font-size: 0.95rem;
  padding: 10px 28px;
  border: 1px solid #ccc;
  border-radius: 24px;
  background: #f5f5f5;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
  }
`

const ErrorText = styled.div`
  color: #cc0000;
  font-size: 0.9rem;
  text-align: center;
  max-width: 400px;
  white-space: pre-wrap;
  word-break: break-word;
`

const DebugBox = styled.div`
  font-size: 0.85rem;
  color: #555;
  border: 1px dashed #aaa;
  border-radius: 8px;
  padding: 12px 20px;
  text-align: center;
  max-width: 400px;
`

const SeekBarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 280px;
  max-width: 100%;
`

const SeekSlider = styled.input`
  width: 100%;
  accent-color: #1db954;
  cursor: pointer;
`

const TimeRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #888;
`

// ---------------------------------------------------------------------------
// Icons (standard play / pause / restart glyphs)
// ---------------------------------------------------------------------------
const PlayIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M8 5v14l11-7z" />
  </svg>
)

const PauseIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
  </svg>
)

const SkipToStartIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6 6h2v12H6zM18 6l-9 6 9 6z" />
  </svg>
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Detect the Spotify "redirect URI not registered" failure so we can give a
// precise, actionable hint pointing at the dashboard.
function isRedirectUriError(message: string): boolean {
  const m = message.toLowerCase()
  return m.includes('redirect') && m.includes('uri')
}

// Format milliseconds as m:ss for the seek bar labels.
function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

function App() {
  const [auth, setAuth] = useState<AuthPhase>({ kind: 'checking' })
  const [user, setUser] = useState<string | null>(null)
  const [phase, setPhase] = useState<PlayerPhase>({ kind: 'init' })

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const playerInitStartedRef = useRef(false)

  // Seek bar: anchor holds the last position we know from the SDK plus the
  // wall-clock time we learned it, so we can interpolate the playhead between
  // SDK updates without polling. `displayPosition` is what the slider renders.
  const positionAnchorRef = useRef<{ position: number; ts: number }>({
    position: 0,
    ts: 0,
  })
  const [displayPosition, setDisplayPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  // While dragging we hold the slider value locally and suppress interpolation
  // and SDK syncing, so the thumb doesn't fight the user's finger.
  const [dragValue, setDragValue] = useState<number | null>(null)
  const dragValueRef = useRef<number | null>(null)

  // 1. Handle auth on mount
  useEffect(() => {
    async function initAuth() {
      const isCallback = window.location.search.includes('code=')
      const hadToken = hasStoredToken()

      // No callback code and no stored token => first visit, show login.
      if (!isCallback && !hadToken) {
        setAuth({ kind: 'login', reason: 'Please login' })
        return
      }

      try {
        const profile = await sdk.currentUser.profile()
        setUser(profile.display_name || profile.email)

        if (isCallback) {
          window.history.replaceState({}, '', '/')
        }
        setAuth({ kind: 'ready' })
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)

        // A stored token that no longer works => session expired, back to login.
        if (hadToken && !isCallback) {
          setAuth({ kind: 'login', reason: 'Session expired, please log in again' })
          return
        }

        // Redirect-URI mismatch is the common setup mistake: surface a precise hint.
        if (isRedirectUriError(message)) {
          const redirectUri = `${window.location.origin}/callback`
          setAuth({
            kind: 'fatal',
            message: `Please add ${redirectUri} to https://developer.spotify.com/dashboard\n\n${message}`,
            showUser: false,
          })
          return
        }

        // Any other auth-phase failure is fatal (login not established).
        setAuth({ kind: 'fatal', message, showUser: false })
      }
    }
    initAuth()
  }, [])

  // 2. Initialize player once authenticated
  useEffect(() => {
    if (auth.kind !== 'ready' || playerInitStartedRef.current) return
    playerInitStartedRef.current = true

    setPhase({ kind: 'init' })
    initializePlayer(sdk)
      .then((p) => {
        playerRef.current = p

        // Keep the position anchor and duration in sync with the SDK. This
        // fires on play/pause/seek and periodically during playback; between
        // events we interpolate locally (effect 4) for smooth motion.
        p.player.addListener('player_state_changed', (state) => {
          if (!state) return
          if (dragValueRef.current !== null) return // don't fight an active drag
          positionAnchorRef.current = { position: state.position, ts: Date.now() }
          setDisplayPosition(state.position)
          setDuration(state.duration)
        })

        setPhase({ kind: 'idle' })
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        // Player init failed but the user IS logged in => keep user shown.
        setAuth({ kind: 'fatal', message, showUser: true })
      })
  }, [auth])

  // 3. QR scanner lifecycle - runs only while in the 'scanning' phase
  useEffect(() => {
    if (phase.kind !== 'scanning') return

    const html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = html5QrCode

    html5QrCode
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const trackUri = extractTrackUri(decodedText)
          setPhase({ kind: 'loading', trackUri })
          void startPlayback(trackUri)
        },
        () => {
          // per-frame decode failure - ignore
        }
      )
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to start camera'
        setPhase({ kind: 'playbackFailed', trackUri: '', message })
      })

    return () => {
      const scanner = scannerRef.current
      if (scanner && scanner.isScanning) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
      }
      scannerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase.kind])

  // 4. Smoothly interpolate the seek bar while playing. This is render-only:
  // it advances displayPosition from the anchor using elapsed wall-clock time,
  // making no SDK or network calls. Clamped to duration at the end.
  useEffect(() => {
    if (phase.kind !== 'playing') return

    const id = setInterval(() => {
      if (dragValueRef.current !== null) return // user is scrubbing
      const anchor = positionAnchorRef.current
      const interpolated = anchor.position + (Date.now() - anchor.ts)
      setDisplayPosition((prev) => {
        const next = duration > 0 ? Math.min(interpolated, duration) : interpolated
        return next === prev ? prev : next
      })
    }, 200)

    return () => clearInterval(id)
  }, [phase.kind, duration])

  // Fire playback for a freshly-scanned (or retried) track.
  async function startPlayback(trackUri: string) {
    const player = playerRef.current
    if (!player) {
      setPhase({ kind: 'playbackFailed', trackUri, message: 'Player not ready' })
      return
    }

    try {
      // Activate audio element (helps mobile browsers allow playback).
      await player.player.activateElement()
      const info = await playTrack(sdk, player.deviceId, trackUri)
      // Reset the seek bar for the new track; the state listener will fill in
      // the real duration moments later.
      positionAnchorRef.current = { position: 0, ts: Date.now() }
      setDisplayPosition(0)
      setPhase({ kind: 'playing', trackUri, info })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Failed to play track'
      setPhase({ kind: 'playbackFailed', trackUri, message })
    }
  }

  // --- Button handlers ------------------------------------------------------
  const handleLogin = () => {
    sdk.authenticate()
  }

  const handlePlayPause = async () => {
    const player = playerRef.current
    if (!player) return

    if (phase.kind === 'playing') {
      try {
        await pauseTrack(player.player)
        setPhase({ kind: 'paused', trackUri: phase.trackUri, info: phase.info })
      } catch {
        // Leave state as-is on a transient control failure.
      }
    } else if (phase.kind === 'paused') {
      try {
        await resumeTrack(player.player)
        setPhase({ kind: 'playing', trackUri: phase.trackUri, info: phase.info })
      } catch {
        // Leave state as-is on a transient control failure.
      }
    }
  }

  const handlePlayFromStart = async () => {
    const player = playerRef.current
    if (!player) return
    if (phase.kind !== 'playing' && phase.kind !== 'paused') return

    try {
      await seekToStart(player.player)
      positionAnchorRef.current = { position: 0, ts: Date.now() }
      setDisplayPosition(0)
      setPhase({ kind: 'playing', trackUri: phase.trackUri, info: phase.info })
    } catch {
      // Leave state as-is on a transient control failure.
    }
  }

  // --- Seek bar drag handlers ----------------------------------------------
  // While dragging: track the value locally, no SDK calls. On release: seek
  // once and re-anchor so interpolation resumes from the new position.
  const handleSeekChange = (e: ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    dragValueRef.current = v
    setDragValue(v)
  }

  const handleSeekCommit = async () => {
    const v = dragValueRef.current
    dragValueRef.current = null
    setDragValue(null)
    if (v === null) return

    const player = playerRef.current
    if (!player) return

    positionAnchorRef.current = { position: v, ts: Date.now() }
    setDisplayPosition(v)
    try {
      await seekTo(player.player, v)
    } catch {
      // Leave state as-is on a transient seek failure.
    }
  }

  // "Next Song" is committal: it stops the current track and opens the scanner.
  const handleNextSong = async () => {
    const player = playerRef.current
    if (player && (phase.kind === 'playing' || phase.kind === 'paused')) {
      try {
        await pauseTrack(player.player)
      } catch {
        // ignore - we're moving on regardless
      }
    }
    setPhase({ kind: 'scanning' })
  }

  // Cancel from the scanner or loading => return to idle (no song to fall back to).
  const handleCancelToIdle = () => {
    setPhase({ kind: 'idle' })
  }

  const handleTryAgain = () => {
    if (phase.kind !== 'playbackFailed') return
    const { trackUri } = phase
    if (!trackUri) {
      // Camera/scan error with no track => reopen the scanner.
      setPhase({ kind: 'scanning' })
      return
    }
    setPhase({ kind: 'loading', trackUri })
    void startPlayback(trackUri)
  }

  const handleReload = () => {
    window.location.reload()
  }

  // --- Render ---------------------------------------------------------------
  const showUser =
    user !== null &&
    (auth.kind === 'ready' || (auth.kind === 'fatal' && auth.showUser))

  const playPauseDisabled = !(phase.kind === 'playing' || phase.kind === 'paused')
  const isPlaying = phase.kind === 'playing'
  const fromStartDisabled = playPauseDisabled

  return (
    <AppWrapper>
      <HeaderLabel>♫ My Song ♫</HeaderLabel>
      <CreditLabel>By Tal segal</CreditLabel>

      {auth.kind === 'checking' && <StatusText>Checking login...</StatusText>}

      {auth.kind === 'login' && (
        <>
          <LoginReason>{auth.reason}</LoginReason>
          <SpotifyButton onClick={handleLogin}>Login</SpotifyButton>
        </>
      )}

      {auth.kind === 'fatal' && <ErrorText>{auth.message}</ErrorText>}
      {auth.kind === 'fatal' && (
        <SecondaryButton onClick={handleReload}>Reload</SecondaryButton>
      )}

      {auth.kind === 'ready' && (
        <>
          {phase.kind === 'init' && <StatusText>Initializing player...</StatusText>}

          {phase.kind === 'scanning' && (
            <>
              <ScannerBox id={SCANNER_ELEMENT_ID} />
              <SecondaryButton onClick={handleCancelToIdle}>Cancel</SecondaryButton>
            </>
          )}

          {phase.kind === 'loading' && (
            <>
              <StatusText>Loading…</StatusText>
              <SecondaryButton onClick={handleCancelToIdle}>Cancel</SecondaryButton>
            </>
          )}

          {phase.kind === 'playbackFailed' && (
            <>
              <ErrorText>{`Couldn't play this song.\n\n${phase.message}`}</ErrorText>
              <Controls>
                <SecondaryButton onClick={handleTryAgain}>Try again</SecondaryButton>
                <SecondaryButton onClick={handleCancelToIdle}>Cancel</SecondaryButton>
              </Controls>
            </>
          )}

          {(phase.kind === 'idle' ||
            phase.kind === 'playing' ||
            phase.kind === 'paused') && (
            <>
              <Controls>
                <IconButton
                  onClick={handlePlayPause}
                  disabled={playPauseDisabled}
                  aria-label={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? <PauseIcon /> : <PlayIcon />}
                </IconButton>
                <IconButton
                  onClick={handlePlayFromStart}
                  disabled={fromStartDisabled}
                  aria-label="Play from start"
                >
                  <SkipToStartIcon />
                </IconButton>
              </Controls>

              {(phase.kind === 'playing' || phase.kind === 'paused') && (
                <SeekBarWrapper>
                  <SeekSlider
                    type="range"
                    min={0}
                    max={duration || 1}
                    value={Math.min(dragValue ?? displayPosition, duration || Infinity)}
                    onChange={handleSeekChange}
                    onMouseUp={handleSeekCommit}
                    onTouchEnd={handleSeekCommit}
                    aria-label="Seek"
                  />
                  <TimeRow>
                    <span>{formatTime(dragValue ?? displayPosition)}</span>
                    <span>{formatTime(duration)}</span>
                  </TimeRow>
                </SeekBarWrapper>
              )}

              <NextButton onClick={handleNextSong}>Next Song</NextButton>

              {IS_DEBUG &&
                (phase.kind === 'playing' || phase.kind === 'paused') && (
                  <DebugBox>
                    {phase.info.name} — {phase.info.artist}
                    {phase.info.year ? ` (${phase.info.year})` : ''}
                  </DebugBox>
                )}
            </>
          )}
        </>
      )}

      <Footer>
        <VersionLabel>project version: {version}</VersionLabel>
        {showUser && <UserLabel>Logged in as: {user}</UserLabel>}
      </Footer>
    </AppWrapper>
  )
}

export default App

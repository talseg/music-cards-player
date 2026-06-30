import { useState, useEffect, useRef } from 'react'
import type { ChangeEvent } from 'react'
import styled from 'styled-components'
import { Html5Qrcode } from 'html5-qrcode'
import { createAuth, type InitAuthResult } from './auth/spotify-auth'
import type { AuthPhase, PlayerPhase } from './common/types'
import FooterBar from './components/FooterBar'
import LoginPanel from './components/LoginPanel'
import PlaybackFailedPanel from './components/PlaybackFailedPanel'
import PlaybackControls from './components/PlaybackControls'
import QRScanner from './components/QRScanner'
import SeekBar from './components/SeekBar'
import {
  initializePlayer,
  playTrack,
  pauseTrack,
  resumeTrack,
  seekToStart,
  seekTo,
  extractTrackUri,
  type SpotifyPlayer,
} from './spotify-player'

// When true, reveal the scanned song's name, artist and year (for debugging).
// Flip to false for the real "blind" game experience.
const IS_DEBUG = false

const SCANNER_ELEMENT_ID = 'qr-reader'

// Create the auth bundle once at module load. The shared module (src/auth) is
// app-agnostic; everything app-specific about auth lives in this config.
const auth_ = createAuth({
  clientId: import.meta.env.VITE_SPOTIFY_CLIENT_ID as string,
  scopes: [
    'streaming',
    'user-read-email',
    'user-read-private',
    'user-modify-playback-state',
    'user-read-playback-state',
  ],
  cachePrefix: 'music-cards-player:',
})
const sdk = auth_.sdk

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

const HeaderLabel = styled.div`
  font-size: 1.75rem;
  color: #d41c1c;
  font-weight: 550;
`

const CreditLabel = styled.div`
  font-size: 1.2rem;
  color: #1c2ed4;
`

const StatusText = styled.div`
  font-size: 0.85rem;
  color: #888;
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
// Map the shared auth module's neutral result onto this app's AuthPhase model.
// (The error classification itself lives in src/auth/spotify-auth.ts.)
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

function App() {
  const [auth, setAuth] = useState<AuthPhase>({ kind: 'checking' })
  const [user, setUser] = useState<string | null>(null)
  const [phase, setPhase] = useState<PlayerPhase>({ kind: 'init' })

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const playerInitStartedRef = useRef(false)
  // Mirror of `phase` so the (once-registered) SDK listener can read the
  // current phase without a stale closure.
  const phaseRef = useRef<PlayerPhase>(phase)
  phaseRef.current = phase

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
  // Wall-clock time the current track started playing. Used to ignore the
  // transient paused/position-0 states the SDK emits during track start-up,
  // so they aren't mistaken for the track ending.
  const playbackStartedAtRef = useRef<number>(0)

  // 1. Handle auth on mount.
  // The actual work is memoized inside the shared auth module (getInitAuth),
  // so the one-time OAuth code exchange runs exactly once even though
  // StrictMode invokes this effect twice in dev. Both invocations await the
  // same promise; whichever is still mounted applies the result, so the UI
  // always leaves the 'checking' state.
  useEffect(() => {
    let cancelled = false
    auth_.getInitAuth().then(result => {
      if (cancelled) return
      const { phase: nextAuth, user: nextUser } = toAuthPhase(result)
      setUser(nextUser)
      setAuth(nextAuth)
    })
    return () => { cancelled = true }
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

          const current = phaseRef.current

          if (IS_DEBUG) {
            // DEBUG: log every raw event so the full settling sequence is captured
            // in the console (filter by "SEEKDBG"). Remove when diagnosis is done.
            console.log(
              'SEEKDBG evt',
              'loading=' + state.loading,
              'paused=' + state.paused,
              'pos=' + state.position,
              'dur=' + state.duration,
              'uri=' + (state.track_window?.current_track?.uri ?? '-').slice(-8),
              'phase=' + current.kind,
              '| render displayPos=' + displayPosition + ' duration=' + duration
            )
        }

          // Determine whether this event belongs to the track we are currently
          // showing. Events for other tracks (e.g. the previous track's pause
          // announcement emitted by transferPlayback when starting a new song)
          // must not touch the seek bar or trigger end-of-track detection.
          // We check linked_from as well to handle Spotify track relinking,
          // where current_track.uri is a substitute and differs from the uri
          // we requested.
          const eventUri = state.track_window?.current_track?.uri
          const linkedUri = state.track_window?.current_track?.linked_from?.uri
          const phaseUri =
            current.kind === 'playing' || current.kind === 'paused'
              ? current.trackUri
              : null
          const isOurTrack =
            phaseUri != null &&
            (eventUri === phaseUri || linkedUri === phaseUri)

          // End-of-track detection. The SDK has no clean "track ended" event;
          // at the natural end it emits a state with paused:true and position
          // reset to 0. We only act on this while we believe we're playing,
          // and only after the track has been playing a few seconds, to ignore
          // the transient paused/position-0 states emitted during start-up.
          // A manual mid-song pause keeps position > 0, so position===0 plus
          // paused is a reliable "the track finished" signal for single tracks.
          const elapsedSinceStart = Date.now() - playbackStartedAtRef.current
          const looksEnded =
            state.paused && state.position === 0 && elapsedSinceStart > 3000

          if (isOurTrack && looksEnded && current.kind === 'playing') {
            positionAnchorRef.current = { position: 0, ts: Date.now() }
            setDisplayPosition(0)
            // Ensure the playhead really is at 0 and the player is paused,
            // leaving a clean "ready to replay" state.
            p.player.seek(0).catch(() => {})
            setPhase({ kind: 'paused', trackUri: current.trackUri, info: current.info })
            return
          }

          if (isOurTrack) {
            positionAnchorRef.current = { position: state.position, ts: Date.now() }
            setDisplayPosition(state.position)
            setDuration(state.duration)
          }
        })

        setPhase({ kind: 'idle' })
      })
      .catch((e) => {
        const message = e instanceof Error ? e.message : String(e)
        // Player init failed but the user IS logged in => keep user shown.
        setAuth({ kind: 'fatal', message, showUser: true })
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      playbackStartedAtRef.current = Date.now()
      setDisplayPosition(0)
      if (IS_DEBUG) {
        console.log(
          'SEEKDBG --- NEW TRACK START ---',
          'uri=' + trackUri.slice(-8),
          '| at reset: displayPos=' + displayPosition + ' duration=' + duration
        )
      }
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

  // Logout: best-effort stop playback and release the playback device, clear
  // this app's stored auth, and return to the same screen as a fresh visit.
  const handleLogout = () => {
    const player = playerRef.current
    if (player) {
      pauseTrack(player.player).catch(() => {})
      player.player.disconnect()
      playerRef.current = null
    }
    playerInitStartedRef.current = false
    auth_.clearStoredAuth()
    setUser(null)
    setPhase({ kind: 'init' })
    setAuth({ kind: 'login', reason: 'Please login' })
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
        playbackStartedAtRef.current = Date.now()
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
      playbackStartedAtRef.current = Date.now()
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
        <LoginPanel reason={auth.reason} onLogin={handleLogin} />
      )}

      {auth.kind === 'fatal' && <ErrorText>{auth.message}</ErrorText>}
      {auth.kind === 'fatal' && (
        <SecondaryButton onClick={handleReload}>Reload</SecondaryButton>
      )}

      {auth.kind === 'ready' && (
        <>
          {phase.kind === 'init' && <StatusText>Initializing player...</StatusText>}

          {phase.kind === 'scanning' && (
            <QRScanner
              scannerElementId={SCANNER_ELEMENT_ID}
              onCancel={handleCancelToIdle}
            />
          )}

          {phase.kind === 'loading' && (
            <>
              <StatusText>Loading…</StatusText>
              <SecondaryButton onClick={handleCancelToIdle}>Cancel</SecondaryButton>
            </>
          )}

          {phase.kind === 'playbackFailed' && (
            <PlaybackFailedPanel
              message={phase.message}
              onTryAgain={handleTryAgain}
              onCancel={handleCancelToIdle}
            />
          )}

          {(phase.kind === 'idle' ||
            phase.kind === 'playing' ||
            phase.kind === 'paused') && (
            <>
              <PlaybackControls
                isPlaying={isPlaying}
                playPauseDisabled={playPauseDisabled}
                fromStartDisabled={fromStartDisabled}
                onPlayPause={handlePlayPause}
                onPlayFromStart={handlePlayFromStart}
              />

              {(phase.kind === 'playing' || phase.kind === 'paused') && (
                <SeekBar
                  duration={duration}
                  displayPosition={displayPosition}
                  dragValue={dragValue}
                  onSeekChange={handleSeekChange}
                  onSeekCommit={handleSeekCommit}
                />
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

      <FooterBar showUser={showUser} user={user} onLogout={handleLogout} />
    </AppWrapper>
  )
}

export default App

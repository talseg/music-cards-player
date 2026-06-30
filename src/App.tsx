import { useEffect, useRef } from 'react'
import styled from 'styled-components'
import { Html5Qrcode } from 'html5-qrcode'
import { createAuth } from './auth/spotify-auth'
import FooterBar from './components/FooterBar'
import LoginPanel from './components/LoginPanel'
import PlaybackFailedPanel from './components/playback/PlaybackFailedPanel'
import PlaybackControls from './components/playback/PlaybackControls'
import QRScanner from './components/QRScanner'
import SeekBar from './components/SeekBar'
import { useAuth } from './auth/useAuth'
import { usePlayback } from './components/playback/usePlayback'
import {
  extractTrackUri,
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

function App() {
  const {
    auth,
    setAuth,
    user,
    setUser,
    showUser,
    handleLogin,
    handleReload,
  } = useAuth(auth_)
  const {
    phase,
    setPhase,
    displayPosition,
    duration,
    dragValue,
    playPauseDisabled,
    isPlaying,
    fromStartDisabled,
    startPlayback,
    resetPlaybackForLogout,
    handlePlayPause,
    handlePlayFromStart,
    handleSeekChange,
    handleSeekCommit,
    handleNextSong,
  } = usePlayback({ auth, setAuth, sdk, isDebug: IS_DEBUG })

  const scannerRef = useRef<Html5Qrcode | null>(null)

  // QR scanner lifecycle - runs only while in the 'scanning' phase
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

  // --- Button handlers ------------------------------------------------------
  // Logout: best-effort stop playback and release the playback device, clear
  // this app's stored auth, and return to the same screen as a fresh visit.
  const handleLogout = () => {
    resetPlaybackForLogout()
    auth_.clearStoredAuth()
    setUser(null)
    setAuth({ kind: 'login', reason: 'Please login' })
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

  // --- Render ---------------------------------------------------------------
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

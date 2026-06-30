import styled from 'styled-components'
import { createAuth } from './auth/spotify-auth'
import FooterBar from './components/FooterBar'
import LoginPanel from './components/LoginPanel'
import PlaybackFailedPanel from './components/playback/PlaybackFailedPanel'
import PlaybackControls from './components/playback/PlaybackControls'
import QRScanner from './components/qr-scanner/QRScanner'
import SeekBar from './components/SeekBar'
import { useAuth } from './auth/useAuth'
import { usePlayback } from './components/playback/usePlayback'
import { useQRScanner } from './components/qr-scanner/useQRScanner'

// When true, reveal the scanned song's name, artist and year (for debugging).
// Flip to false for the real "blind" game experience.
const IS_DEBUG = false

const SCANNER_ELEMENT_ID = 'qr-reader'

// Create the auth bundle once at module load. The shared module (src/auth) is
// app-agnostic; everything app-specific about auth lives in this config.
const spotifyAuth = createAuth({
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
const spotifySdk = spotifyAuth.sdk

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
    showUser,
    handleLogin,
    handleLogout,
    handleReload,
  } = useAuth(spotifyAuth)
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
    handleCancelToIdle,
    handleTryAgain,
    handleSeekChange,
    handleSeekCommit,
    handleNextSong,
  } = usePlayback({ auth, setAuth, sdk: spotifySdk, isDebug: IS_DEBUG })

  useQRScanner({
    phaseKind: phase.kind,
    scannerElementId: SCANNER_ELEMENT_ID,
    setPhase,
    startPlayback,
  })

  const playerState = phase.kind;

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
          {playerState === 'init' && <StatusText>Initializing player...</StatusText>}

          {playerState === 'scanning' && (
            <QRScanner
              scannerElementId={SCANNER_ELEMENT_ID}
              onCancel={handleCancelToIdle}
            />
          )}

          {playerState === 'loading' && (
            <>
              <StatusText>Loading…</StatusText>
              <SecondaryButton onClick={handleCancelToIdle}>Cancel</SecondaryButton>
            </>
          )}

          {playerState === 'playbackFailed' && (
            <PlaybackFailedPanel
              message={phase.message}
              onTryAgain={handleTryAgain}
              onCancel={handleCancelToIdle}
            />
          )}

          {(playerState === 'idle' ||
            playerState === 'playing' ||
            playerState === 'paused') && (
            <>
              <PlaybackControls
                isPlaying={isPlaying}
                playPauseDisabled={playPauseDisabled}
                fromStartDisabled={fromStartDisabled}
                onPlayPause={handlePlayPause}
                onPlayFromStart={handlePlayFromStart}
              />

              {(playerState === 'playing' || playerState === 'paused') && (
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
                (playerState === 'playing' || playerState === 'paused') && (
                  <DebugBox>
                    {phase.info.name} — {phase.info.artist}
                    {phase.info.year ? ` (${phase.info.year})` : ''}
                  </DebugBox>
                )}
            </>
          )}
        </>
      )}

      <FooterBar
        showUser={showUser}
        user={user}
        onLogout={() => handleLogout(resetPlaybackForLogout)}
      />
    </AppWrapper>
  )
}

export default App

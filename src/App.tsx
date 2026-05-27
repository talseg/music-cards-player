import { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { Html5Qrcode } from 'html5-qrcode'
import { version } from '../package.json'
import { createSpotifyApi } from './spotify-auth'
import {
  initializePlayer,
  playTrack,
  extractTrackUri,
  type SpotifyPlayer,
  type TrackInfo,
} from './spotify-player'

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

const AppWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 18px;
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

const Button = styled.button`
  font-size: 1rem;
  padding: 12px 32px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
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

const ScannerBox = styled.div`
  width: 300px;
  max-width: 100%;
`

const NowPlayingBox = styled.div`
  font-size: 1rem;
  padding: 16px 24px;
  border: 1px solid #1db954;
  border-radius: 8px;
  background: #f0fff4;
  text-align: center;
  max-width: 400px;
`

const NowPlayingLabel = styled.div`
  font-size: 0.75rem;
  color: #1db954;
  margin-bottom: 8px;
  font-weight: 600;
  letter-spacing: 1px;
`

const SongName = styled.div`
  font-size: 1.1rem;
  font-weight: 600;
  color: #1a1a2e;
  margin-bottom: 4px;
`

const ArtistName = styled.div`
  font-size: 0.9rem;
  color: #16213e;
`

const ErrorText = styled.div`
  color: #cc0000;
  font-size: 0.9rem;
  text-align: center;
  max-width: 400px;
`

const UserLabel = styled.div`
  font-size: 0.9rem;
  color: #1db954;
  font-weight: 500;
`

const StatusText = styled.div`
  font-size: 0.85rem;
  color: #888;
`

function App() {
  const [authLoading, setAuthLoading] = useState(true)
  const [user, setUser] = useState<string | null>(null)
  const [playerLoading, setPlayerLoading] = useState(false)
  const [playerReady, setPlayerReady] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [nowPlaying, setNowPlaying] = useState<TrackInfo | null>(null)
  const [error, setError] = useState<string | null>(null)

  const scannerRef = useRef<Html5Qrcode | null>(null)
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const playerInitStartedRef = useRef(false)

  // 1. Handle auth on mount
  useEffect(() => {
    async function initAuth() {
      const isCallback = window.location.search.includes('code=')

      // If no callback code and no stored token, don't trigger SDK auto-redirect
      if (!isCallback && !hasStoredToken()) {
        setAuthLoading(false)
        return
      }

      try {
        const profile = await sdk.currentUser.profile()
        setUser(profile.display_name || profile.email)

        if (isCallback) {
          window.history.replaceState({}, '', '/')
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Authentication failed')
      } finally {
        setAuthLoading(false)
      }
    }
    initAuth()
  }, [])

  // 2. Initialize player after login
  useEffect(() => {
    if (!user || playerInitStartedRef.current) return
    playerInitStartedRef.current = true

    setPlayerLoading(true)
    initializePlayer(sdk)
      .then((p) => {
        playerRef.current = p
        setPlayerReady(true)
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to initialize player')
      })
      .finally(() => {
        setPlayerLoading(false)
      })
  }, [user])

  const handleScanResult = async (decodedText: string) => {
    const player = playerRef.current
    if (!player) {
      setError('Player not ready')
      return
    }

    try {
      // Activate audio (helps mobile browsers)
      await player.player.activateElement()

      const trackUri = extractTrackUri(decodedText)
      const info = await playTrack(sdk, player.deviceId, trackUri)
      setNowPlaying(info)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to play track')
    }
  }

  const handleLogin = () => {
    sdk.authenticate()
  }

  const handleStart = () => {
    setError(null)
    setNowPlaying(null)
    setScanning(true)
  }

  // 3. QR scanner lifecycle
  useEffect(() => {
    if (!scanning) return

    const html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = html5QrCode

    html5QrCode
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setScanning(false)
          handleScanResult(decodedText)
        },
        () => {
          // per-frame decode failure - ignore
        }
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start camera')
        setScanning(false)
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
  }, [scanning])

  return (
    <AppWrapper>
      <VersionLabel>project version: {version}</VersionLabel>
      <HeaderLabel>♫ My Song ♫</HeaderLabel>
      <CreditLabel>By Tal segal</CreditLabel>

      {authLoading && <StatusText>Checking login...</StatusText>}

      {!authLoading && !user && (
        <SpotifyButton onClick={handleLogin}>Login with Spotify</SpotifyButton>
      )}

      {user && (
        <>
          <UserLabel>Logged in as: {user}</UserLabel>

          {playerLoading && <StatusText>Initializing player...</StatusText>}

          {playerReady && (
            <Button onClick={handleStart} disabled={scanning}>
              {scanning ? 'Scanning...' : 'Start'}
            </Button>
          )}

          {scanning && <ScannerBox id={SCANNER_ELEMENT_ID} />}

          {nowPlaying && (
            <NowPlayingBox>
              <NowPlayingLabel>NOW PLAYING</NowPlayingLabel>
              <SongName>{nowPlaying.name}</SongName>
              <ArtistName>{nowPlaying.artist}</ArtistName>
            </NowPlayingBox>
          )}
        </>
      )}

      {error && <ErrorText>{error}</ErrorText>}
    </AppWrapper>
  )
}

export default App

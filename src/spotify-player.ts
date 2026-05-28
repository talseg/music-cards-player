import type { SpotifyApi } from '@spotify/web-api-ts-sdk'

const SDK_SCRIPT_URL = 'https://sdk.scdn.co/spotify-player.js'

let sdkLoadPromise: Promise<void> | null = null

function loadSdkScript(): Promise<void> {
  if (sdkLoadPromise) return sdkLoadPromise

  sdkLoadPromise = new Promise<void>((resolve, reject) => {
    if (window.Spotify) {
      resolve()
      return
    }

    window.onSpotifyWebPlaybackSDKReady = () => resolve()

    const existing = document.querySelector(`script[src="${SDK_SCRIPT_URL}"]`)
    if (existing) return

    const script = document.createElement('script')
    script.src = SDK_SCRIPT_URL
    script.async = true
    script.onerror = () => reject(new Error('Failed to load Spotify Web Playback SDK'))
    document.body.appendChild(script)
  })

  return sdkLoadPromise
}

export interface SpotifyPlayer {
  player: Spotify.Player
  deviceId: string
}

export async function initializePlayer(sdk: SpotifyApi): Promise<SpotifyPlayer> {
  await loadSdkScript()

  const player = new window.Spotify.Player({
    name: 'Music Cards Player',
    getOAuthToken: async (cb) => {
      const token = await sdk.getAccessToken()
      if (token?.access_token) {
        cb(token.access_token)
      }
    },
    volume: 0.5,
  })

  return new Promise<SpotifyPlayer>((resolve, reject) => {
    player.addListener('ready', ({ device_id }) => {
      resolve({ player, deviceId: device_id })
    })
    player.addListener('initialization_error', ({ message }) => {
      reject(new Error(`Initialization error: ${message}`))
    })
    player.addListener('authentication_error', ({ message }) => {
      reject(new Error(`Authentication error: ${message}`))
    })
    player.addListener('account_error', ({ message }) => {
      reject(new Error(`Account error (Spotify Premium required): ${message}`))
    })

    player.connect().then((success) => {
      if (!success) reject(new Error('Failed to connect player'))
    })
  })
}

export function extractTrackUri(input: string): string {
  const trimmed = input.trim()

  let trackId: string
  if (trimmed.includes('/')) {
    trackId = trimmed.split('/').pop() || trimmed
  } else if (trimmed.includes(':')) {
    trackId = trimmed.split(':').pop() || trimmed
  } else {
    trackId = trimmed
  }

  // Strip query string (e.g. ?si=xxx from Spotify share links)
  trackId = trackId.split('?')[0]

  return `spotify:track:${trackId}`
}

export interface TrackInfo {
  name: string
  artist: string
  year: string
}

export async function playTrack(
  sdk: SpotifyApi,
  deviceId: string,
  trackUri: string
): Promise<TrackInfo> {
  // Get track info first (for display)
  const trackId = trackUri.split(':').pop() as string
  const track = await sdk.tracks.get(trackId)

  // Transfer playback to our device first (handles "Restriction violated"
  // when Spotify is active on another device, e.g. desktop app).
  // Silent failure is OK - the play call below will surface any real error.
  try {
    await sdk.player.transferPlayback([deviceId], false)
  } catch {
    // ignore - may fail if no playback context exists yet, that's fine
  }

  // Start playback on our device
  await sdk.player.startResumePlayback(deviceId, undefined, [trackUri])

  return {
    name: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    year: track.album.release_date?.slice(0, 4) ?? '',
  }
}

export async function pauseTrack(player: Spotify.Player): Promise<void> {
  await player.pause()
}

export async function resumeTrack(player: Spotify.Player): Promise<void> {
  await player.resume()
}

export async function seekToStart(player: Spotify.Player): Promise<void> {
  await player.seek(0)
  await player.resume()
}

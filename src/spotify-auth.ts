import { SpotifyApi } from '@spotify/web-api-ts-sdk'

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
]

function getRedirectUri(): string {
  return `${window.location.origin}/callback`
}

export function createSpotifyApi(): SpotifyApi {
  return SpotifyApi.withUserAuthorization(CLIENT_ID, getRedirectUri(), SCOPES)
}

import type { TrackInfo } from '../spotify-player'

// Auth phase (gates the whole app):
//   'checking'  - verifying stored token / handling callback on mount
//   'login'     - show Login screen (carries a reason to display)
//   'ready'     - authenticated; player phase below takes over
//   'fatal'     - unrecoverable auth/credentials error (debug dump)
export type AuthPhase =
  | { kind: 'checking' }
  | { kind: 'login'; reason: string }
  | { kind: 'ready' }
  | { kind: 'fatal'; message: string; showUser: boolean }

// Player phase (only meaningful once auth === 'ready'):
//   'init'         - initializing the Web Playback SDK device
//   'idle'         - no song loaded yet; only "Next Song" enabled
//   'scanning'     - camera overlay open
//   'loading'      - scan succeeded, waiting for playback to confirm
//   'playing'      - a song is loaded and playing
//   'paused'       - a song is loaded and paused
//   'playbackFailed' - soft error; offer Try again / Cancel
export type PlayerPhase =
  | { kind: 'init' }
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'loading'; trackUri: string }
  | { kind: 'playing'; trackUri: string; info: TrackInfo }
  | { kind: 'paused'; trackUri: string; info: TrackInfo }
  | { kind: 'playbackFailed'; trackUri: string; message: string }

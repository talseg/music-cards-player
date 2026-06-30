import type { PlayerPhase } from '../../common/types'

const MIN_PLAYBACK_MS_BEFORE_END_DETECTION = 3000

function getPlayablePhaseTrackUri(phase: PlayerPhase): string | null {
  if (phase.kind !== 'playing' && phase.kind !== 'paused') return null
  return phase.trackUri
}

export function isStateForCurrentTrack(
  state: Spotify.PlaybackState,
  phase: PlayerPhase
): boolean {
  const phaseTrackUri = getPlayablePhaseTrackUri(phase)
  if (phaseTrackUri === null) return false

  const currentTrack = state.track_window.current_track
  return (
    currentTrack.uri === phaseTrackUri ||
    currentTrack.linked_from?.uri === phaseTrackUri
  )
}

export function isLikelyTrackEnd(
  state: Spotify.PlaybackState,
  elapsedSincePlaybackStartMs: number
): boolean {
  return (
    state.paused &&
    state.position === 0 &&
    elapsedSincePlaybackStartMs > MIN_PLAYBACK_MS_BEFORE_END_DETECTION
  )
}

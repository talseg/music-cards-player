import { useEffect, useRef, useState } from 'react'
import type { ChangeEvent, Dispatch, SetStateAction } from 'react'
import type { SpotifyApi } from '@spotify/web-api-ts-sdk'
import type { AuthPhase, PlayerPhase } from '../common/types'
import {
  initializePlayer,
  pauseTrack,
  playTrack,
  resumeTrack,
  seekTo,
  seekToStart,
  type SpotifyPlayer,
} from '../spotify-player'

interface UsePlaybackArgs {
  auth: AuthPhase
  setAuth: Dispatch<SetStateAction<AuthPhase>>
  sdk: SpotifyApi
  isDebug: boolean
}

export function usePlayback({ auth, setAuth, sdk, isDebug }: UsePlaybackArgs) {
  const [phase, setPhase] = useState<PlayerPhase>({ kind: 'init' })
  const playerRef = useRef<SpotifyPlayer | null>(null)
  const playerInitStartedRef = useRef(false)
  // Mirror of `phase` so the (once-registered) SDK listener can read the
  // current phase without a stale closure.
  const phaseRef = useRef<PlayerPhase>(phase)
  useEffect(() => {
    phaseRef.current = phase
  }, [phase])

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

  // Initialize player once authenticated.
  useEffect(() => {
    if (auth.kind !== 'ready' || playerInitStartedRef.current) return
    playerInitStartedRef.current = true

    setPhase({ kind: 'init' })
    initializePlayer(sdk)
      .then((p) => {
        playerRef.current = p

        // Keep the position anchor and duration in sync with the SDK. This
        // fires on play/pause/seek and periodically during playback; between
        // events we interpolate locally for smooth motion.
        p.player.addListener('player_state_changed', (state) => {
          if (!state) return
          if (dragValueRef.current !== null) return // don't fight an active drag

          const current = phaseRef.current

          if (isDebug) {
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

  // Smoothly interpolate the seek bar while playing. This is render-only:
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
      if (isDebug) {
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

  function resetPlaybackForLogout() {
    const player = playerRef.current
    if (player) {
      pauseTrack(player.player).catch(() => {})
      player.player.disconnect()
      playerRef.current = null
    }
    playerInitStartedRef.current = false
    setPhase({ kind: 'init' })
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

  const playPauseDisabled = !(phase.kind === 'playing' || phase.kind === 'paused')
  const isPlaying = phase.kind === 'playing'
  const fromStartDisabled = playPauseDisabled

  return {
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
  }
}

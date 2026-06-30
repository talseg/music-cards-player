import styled from 'styled-components'

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

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
    </svg>
  )
}

function SkipToStartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M6 6h2v12H6zM18 6l-9 6 9 6z" />
    </svg>
  )
}

interface PlaybackControlsProps {
  isPlaying: boolean
  playPauseDisabled: boolean
  fromStartDisabled: boolean
  onPlayPause: () => void
  onPlayFromStart: () => void
}

function PlaybackControls({
  isPlaying,
  playPauseDisabled,
  fromStartDisabled,
  onPlayPause,
  onPlayFromStart,
}: PlaybackControlsProps) {
  return (
    <Controls>
      <IconButton
        onClick={onPlayPause}
        disabled={playPauseDisabled}
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </IconButton>
      <IconButton
        onClick={onPlayFromStart}
        disabled={fromStartDisabled}
        aria-label="Play from start"
      >
        <SkipToStartIcon />
      </IconButton>
    </Controls>
  )
}

export default PlaybackControls

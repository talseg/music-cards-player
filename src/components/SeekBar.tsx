import type { ChangeEvent } from 'react'
import styled from 'styled-components'

const SeekBarWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
  width: 280px;
  max-width: 100%;
`

const SeekSlider = styled.input`
  width: 100%;
  accent-color: #1db954;
  cursor: pointer;
`

const TimeRow = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.75rem;
  color: #888;
`

// Format milliseconds as m:ss for the seek bar labels.
function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

interface SeekBarProps {
  duration: number
  displayPosition: number
  dragValue: number | null
  onSeekChange: (e: ChangeEvent<HTMLInputElement>) => void
  onSeekCommit: () => void
}

function SeekBar({
  duration,
  displayPosition,
  dragValue,
  onSeekChange,
  onSeekCommit,
}: SeekBarProps) {
  const displayedPosition = dragValue ?? displayPosition

  return (
    <SeekBarWrapper>
      <SeekSlider
        type="range"
        min={0}
        max={duration || 1}
        value={Math.min(displayedPosition, duration || Infinity)}
        onChange={onSeekChange}
        onMouseUp={onSeekCommit}
        onTouchEnd={onSeekCommit}
        aria-label="Seek"
      />
      <TimeRow>
        <span>{formatTime(displayedPosition)}</span>
        <span>{formatTime(duration)}</span>
      </TimeRow>
    </SeekBarWrapper>
  )
}

export default SeekBar

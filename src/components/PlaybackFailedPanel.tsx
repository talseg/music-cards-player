import styled from 'styled-components'

const Controls = styled.div`
  display: flex;
  gap: 16px;
  align-items: center;
`

const ErrorText = styled.div`
  color: #cc0000;
  font-size: 0.9rem;
  text-align: center;
  max-width: 400px;
  white-space: pre-wrap;
  word-break: break-word;
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

interface PlaybackFailedPanelProps {
  message: string
  onTryAgain: () => void
  onCancel: () => void
}

function PlaybackFailedPanel({
  message,
  onTryAgain,
  onCancel,
}: PlaybackFailedPanelProps) {
  return (
    <>
      <ErrorText>{`Couldn't play this song.\n\n${message}`}</ErrorText>
      <Controls>
        <SecondaryButton onClick={onTryAgain}>Try again</SecondaryButton>
        <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
      </Controls>
    </>
  )
}

export default PlaybackFailedPanel

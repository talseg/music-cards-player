import styled from 'styled-components'

const LoginReason = styled.div`
  font-size: 1rem;
  color: #333;
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

interface LoginPanelProps {
  reason: string
  onLogin: () => void
}

function LoginPanel({ reason, onLogin }: LoginPanelProps) {
  return (
    <>
      <LoginReason>{reason}</LoginReason>
      <SpotifyButton onClick={onLogin}>Login</SpotifyButton>
    </>
  )
}

export default LoginPanel

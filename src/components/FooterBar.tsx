import styled from 'styled-components'
import { version } from '../../package.json'

const Footer = styled.div`
  position: fixed;
  left: 12px;
  bottom: 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
`

const VersionLabel = styled.div`
  font-size: 0.90rem;
  color: #888;
`

const UserLabel = styled.div`
  font-size: 0.90rem;
  color: #888;
`

const LogoutLink = styled.button`
  background: none;
  border: none;
  padding: 0;
  font-size: 0.90rem;
  color: #888;
  text-decoration: underline;
  cursor: pointer;

  &:hover {
    color: #555;
  }
`

type FooterBarProps = {
  showUser: boolean
  user: string | null
  onLogout: () => void
}

function FooterBar({ showUser, user, onLogout }: FooterBarProps) {
  return (
    <Footer>
      <VersionLabel>project version: {version}</VersionLabel>
      {showUser && (
        <UserLabel>
          Logged in as: {user}{' '}
          <LogoutLink onClick={onLogout}>logout</LogoutLink>
        </UserLabel>
      )}
    </Footer>
  )
}

export default FooterBar

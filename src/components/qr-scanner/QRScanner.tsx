import styled from 'styled-components'

const ScannerBox = styled.div`
  width: 300px;
  max-width: 100%;
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

interface QRScannerProps {
  scannerElementId: string
  onCancel: () => void
}

function QRScanner({ scannerElementId, onCancel }: QRScannerProps) {
  return (
    <>
      <ScannerBox id={scannerElementId} />
      <SecondaryButton onClick={onCancel}>Cancel</SecondaryButton>
    </>
  )
}

export default QRScanner

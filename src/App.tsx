import { useState, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { Html5Qrcode } from 'html5-qrcode'
import { version } from '../package.json'

const SCANNER_ELEMENT_ID = 'qr-reader'

const AppWrapper = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px;
  gap: 18px;
`

const VersionLabel = styled.div`
  font-size: 0.75rem;
  color: #888;
`

const HeaderLabel = styled.div`
  font-size: 1.75rem;
  color: #d41c1c;
  font-weight: 550;
`
const CreditLabel = styled.div`
  font-size: 1.2rem;
  color: #1c2ed4;
`

const Button = styled.button`
  font-size: 1rem;
  padding: 12px 32px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #f5f5f5;
  cursor: pointer;

  &:hover {
    background: #e8e8e8;
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }
`

const ScannerBox = styled.div`
  width: 300px;
  max-width: 100%;
`

const ResultBox = styled.div`
  font-size: 1rem;
  padding: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  word-break: break-all;
  max-width: 400px;
  text-align: center;
`

const ResultLabel = styled.div`
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 8px;
`

const ErrorText = styled.div`
  color: #cc0000;
  font-size: 0.9rem;
`

function App() {
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    if (!scanning) return

    const html5QrCode = new Html5Qrcode(SCANNER_ELEMENT_ID)
    scannerRef.current = html5QrCode

    html5QrCode
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          setResult(decodedText)
          setScanning(false)
        },
        () => {
          // per-frame decode failure - ignore
        }
      )
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Failed to start camera')
        setScanning(false)
      })

    return () => {
      const scanner = scannerRef.current
      if (scanner && scanner.isScanning) {
        scanner
          .stop()
          .then(() => scanner.clear())
          .catch(() => {})
      }
      scannerRef.current = null
    }
  }, [scanning])

  const handleStart = () => {
    setResult(null)
    setError(null)
    setScanning(true)
  }

  return (
    <AppWrapper>
      <VersionLabel>project version: {version}</VersionLabel>
      <HeaderLabel>♫ My Song ♫</HeaderLabel>
      <CreditLabel>By Tal segal</CreditLabel>

      <Button onClick={handleStart} disabled={scanning}>
        {scanning ? 'Scanning...' : 'Start'}
      </Button>

      {scanning && <ScannerBox id={SCANNER_ELEMENT_ID} />}

      {error && <ErrorText>{error}</ErrorText>}

      {result && (
        <ResultBox>
          <ResultLabel>Scanned QR:</ResultLabel>
          {result}
        </ResultBox>
      )}
    </AppWrapper>
  )
}

export default App

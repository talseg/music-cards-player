import { useEffect, useRef } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Html5Qrcode } from 'html5-qrcode'
import type { PlayerPhase } from '../../common/types'
import { extractTrackUri } from '../../spotify-player'

interface UseQRScannerArgs {
  phaseKind: PlayerPhase['kind']
  scannerElementId: string
  setPhase: Dispatch<SetStateAction<PlayerPhase>>
  startPlayback: (trackUri: string) => void | Promise<void>
}

export function useQRScanner({
  phaseKind,
  scannerElementId,
  setPhase,
  startPlayback,
}: UseQRScannerArgs): void {
  const scannerRef = useRef<Html5Qrcode | null>(null)

  useEffect(() => {
    if (phaseKind !== 'scanning') return

    const html5QrCode = new Html5Qrcode(scannerElementId)
    scannerRef.current = html5QrCode

    html5QrCode
      .start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          const trackUri = extractTrackUri(decodedText)
          setPhase({ kind: 'loading', trackUri })
          void startPlayback(trackUri)
        },
        () => {
          // per-frame decode failure - ignore
        }
      )
      .catch((err) => {
        const message = err instanceof Error ? err.message : 'Failed to start camera'
        setPhase({ kind: 'playbackFailed', trackUri: '', message })
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phaseKind])

}

import { useEffect, useRef, useState } from 'react';

// One scan = one carton: decodes exactly once, stops the camera itself
// immediately (doesn't keep scanning in a loop), then hands the decoded
// text to the caller — the caller decides what to do with it (submit,
// close the camera view, etc). Same proven camera logic as ScanStockIn.jsx
// (rear camera, continuous autofocus, QR-only, fast retry, torch toggle),
// pulled out here so both places don't have to duplicate ~80 lines of
// zxing setup and the several real bugs that were fixed in it along the way.
export default function CameraScanner({ onScan, onError, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
        import('@zxing/browser'),
        import('@zxing/library'),
      ]);
      const hints = new Map();
      hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
      const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
      const onResult = (result) => {
        if (result && !cancelled) {
          const text = result.getText();
          // Stop immediately on the first successful decode — this is what
          // makes "one scan = one carton" true; without this the loop would
          // keep firing onResult for the same still-visible QR on every
          // subsequent frame.
          controlsRef.current?.stop();
          controlsRef.current = null;
          onScan(text);
        }
      };
      try {
        controlsRef.current = await reader.decodeFromConstraints(
          { video: { facingMode: { ideal: 'environment' }, advanced: [{ focusMode: 'continuous' }] } },
          videoRef.current,
          onResult
        );
        if (cancelled) { controlsRef.current?.stop(); return; }
        const track = videoRef.current.srcObject?.getVideoTracks?.()[0];
        setTorchSupported(!!track?.getCapabilities?.().torch);
      } catch (err) {
        if (!cancelled) onError?.('Could not access camera — ' + err.message);
      }
    })();
    return () => { cancelled = true; controlsRef.current?.stop(); };
  }, [onScan, onError]);

  async function toggleTorch() {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((t) => !t);
    } catch {
      onError?.('Flashlight not available on this device');
    }
  }

  return (
    <div style={{ position: 'relative', marginTop: 8 }}>
      {/* playsInline + muted + autoPlay are required on iOS Safari — without
          them the browser either refuses to show the feed inline or takes
          it fullscreen, and the decode loop never sees a usable frame. */}
      <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', display: 'block', borderRadius: 8 }} />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: '55%', aspectRatio: '1 / 1', border: '2px solid rgba(255,255,255,0.85)', borderRadius: 8, boxShadow: '0 0 0 999px rgba(0,0,0,0.35)' }} />
      </div>
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11.5, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        Point the camera at the QR code
      </div>
      {torchSupported && (
        <button
          type="button" onClick={toggleTorch}
          style={{ position: 'absolute', top: 10, right: 10, border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: torchOn ? 'var(--red)' : 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          {torchOn ? '🔦 Flash on' : '🔦 Flash off'}
        </button>
      )}
      {onClose && (
        <button
          type="button" onClick={onClose}
          style={{ position: 'absolute', top: 10, left: 10, border: 'none', borderRadius: 20, padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: 'rgba(0,0,0,0.55)', color: '#fff' }}
        >
          ✕ Close
        </button>
      )}
    </div>
  );
}

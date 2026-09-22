import { useEffect, useRef, useState } from 'react';

// Continuous scanning: the camera stays open across multiple scans (doesn't
// close after every single one) — the intended flow is "scan carton 1, see
// the result, scan carton 2, see the result..." without reopening the
// camera each time. `onScan` is awaited: the moment a QR decodes, detection
// PAUSES (ignoring further frames, not stopping the camera) while the
// caller's check runs, a "Checking…" overlay shows so it's clear why
// nothing's happening for that instant, then detection resumes automatically
// once onScan resolves — whether it succeeded or the caller showed an error.
// The caller decides when to actually stop the camera (e.g. once a row's
// target count is fully reached) by unmounting this component or calling
// onClose — this component never decides to close itself after a scan.
// Same proven camera setup as before (rear camera, continuous autofocus,
// QR-only, fast retry, torch toggle) — pulled out here so nothing else
// duplicates the ~80 lines of zxing setup and the several real bugs fixed
// in it along the way.
export default function CameraScanner({ onScan, onError, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const pausedRef = useRef(false); // true while a scan's check is in flight — ignore frames until it resolves
  const [checking, setChecking] = useState(false);
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
        if (!result || cancelled || pausedRef.current) return;
        pausedRef.current = true;
        setChecking(true);
        const text = result.getText();
        // onScan may or may not return a promise — Promise.resolve() handles
        // both so this works whether the caller's handler is async or not.
        Promise.resolve(onScan(text)).finally(() => {
          if (!cancelled) { pausedRef.current = false; setChecking(false); }
        });
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
    // Camera only actually stops when this component unmounts (the caller
    // hides it, e.g. once a row's target count is fully met) or on this
    // effect's own cleanup — never automatically after a single scan.
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
      {checking && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 700 }}>
          Checking…
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11.5, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
        {checking ? 'Hold still…' : 'Point the camera at the QR code'}
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

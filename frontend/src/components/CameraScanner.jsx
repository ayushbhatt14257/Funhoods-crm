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
//
// onScan/onError are read via refs, NOT put in the setup effect's
// dependency array. The caller (e.g. CustomerPoolView) re-renders after
// every single scan, which recreates these as fresh inline functions each
// time — if the effect depended on them directly, the camera would tear
// down and reopen the whole video stream after every scan (losing any
// torch state, causing exactly the flakiness this was built to avoid).
// Refs let the effect run its setup exactly once per mount regardless of
// how often the parent re-renders.
export default function CameraScanner({ onScan, onError, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const pausedRef = useRef(false); // true while a scan's check is in flight — ignore frames until it resolves
  const onScanRef = useRef(onScan);
  const onErrorRef = useRef(onError);
  onScanRef.current = onScan;
  onErrorRef.current = onError;
  const [checking, setChecking] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);

  // iOS Safari does not support controlling the camera flash from a web
  // page at all — this is an Apple platform restriction, not a bug, and no
  // amount of getUserMedia/applyConstraints code can work around it. Some
  // iOS versions still report a torch "capability" that then silently does
  // nothing when toggled, which is worse than not offering the button at
  // all — so it's hidden outright on iOS rather than shown broken.
  const isIOS = typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

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
        Promise.resolve(onScanRef.current(text)).finally(() => {
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
        setTorchSupported(!isIOS && !!track?.getCapabilities?.().torch);
      } catch (err) {
        if (!cancelled) onErrorRef.current?.('Could not access camera — ' + err.message);
      }
    })();
    // Camera only actually stops when this component unmounts (the caller
    // hides it, e.g. once a row's target count is fully met) or on this
    // effect's own cleanup — never automatically after a single scan, and
    // never as a side effect of the parent re-rendering (empty deps below —
    // this must run exactly once per mount, see the note above).
    return () => { cancelled = true; controlsRef.current?.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggleTorch() {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((t) => !t);
    } catch {
      onErrorRef.current?.('Flashlight not available on this device');
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

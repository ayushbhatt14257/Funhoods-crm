import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { barcodeApi } from './barcodeApi';

// A hardware barcode scanner gun works by "typing" the decoded value into
// whatever's focused, ideally followed by an Enter keystroke — which would
// submit this form automatically, just like a very fast keyboard. In
// practice not every scanner (or every out-of-box config) sends that
// trailing Enter, so we can't rely on it alone.
//
// Instead, every keystroke into the input is timestamped. A scanner "types"
// an entire code in a handful of milliseconds — far faster than any human
// can physically type — so if the average gap between the last several
// keystrokes is under SCAN_SPEED_MS, this is almost certainly a scan, and
// we auto-submit the moment typing pauses, with no Enter required at all.
// Genuine manual typing (much slower gaps) is left alone and still needs
// Enter or the Look up button, so it's never accidentally submitted early.
const SCAN_SPEED_MS = 30; // ms between keystrokes — real typing is 80ms+
const AUTO_SUBMIT_DEBOUNCE_MS = 120; // pause length that means "scan finished"

// Camera scanning is a separate, opt-in mode (button-triggered) since it
// needs camera permission and a ~500KB library — loaded lazily so it never
// costs anything for people only using a scanner gun.
export default function ScanStockIn() {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(null); // looked-up carton awaiting confirm
  const [looking, setLooking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [recent, setRecent] = useState([]); // last few successful scans this session
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null); // returned by decodeFromConstraints — this is what actually stops a scan
  const keyTimesRef = useRef([]); // recent keystroke timestamps, for scan-speed detection
  const autoTimerRef = useRef(null); // debounce timer for the auto-submit-on-pause check
  const lookingRef = useRef(false); // synchronous mirror of `looking`, so a queued auto-submit never double-fires while a lookup is already in flight
  const pendingRef = useRef(null); // synchronous mirror of `pending` — same reason
  const lastSubmittedRef = useRef(''); // the exact code string a lookup has already been fired for (auto OR Enter/click) — stops the debounce timer from re-firing a second, stale lookup for a scan that's already been handled

  // Refocus whenever the box becomes usable again — not just when the
  // confirm popup opens/closes (`pending`), but also right after a lookup
  // finishes with an error (`looking` going back to false, e.g. the "already
  // scanned" case). The input is disabled while looking/pending, and a
  // browser doesn't restore focus on its own once a disabled field becomes
  // enabled again — without this, an error scan left the box dead until you
  // clicked back into it, breaking the whole point of scan-without-clicking.
  useEffect(() => { if (!looking && !pending) inputRef.current?.focus(); }, [pending, looking]);
  useEffect(() => { pendingRef.current = pending; }, [pending]);

  // Clean up any pending debounce timer on unmount so it never fires (and
  // calls lookup/setState) after this screen's been navigated away from.
  useEffect(() => () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); }, []);

  function onCodeKeyDown() {
    keyTimesRef.current.push(performance.now());
    if (keyTimesRef.current.length > 24) keyTimesRef.current.shift(); // only need a recent window, not the whole history
  }

  function onCodeChange(e) {
    const val = e.target.value;
    setCode(val);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => maybeAutoSubmit(val), AUTO_SUBMIT_DEBOUNCE_MS);
  }

  function maybeAutoSubmit(val) {
    const trimmed = val.trim();
    const times = keyTimesRef.current;
    // Skip if: too short/too few keystrokes to judge speed from; a lookup is
    // already in flight; a result is already showing (the scanner's own
    // Enter already handled this exact scan — the debounce timer firing
    // afterward for the same value would otherwise re-run a stale lookup,
    // which is what caused the popup-then-error mixup); or this exact code
    // string already had a lookup fired for it (covers the case where Enter
    // fired first, already resolved, and this timer is just a late echo).
    if (trimmed.length < 4 || times.length < 4 || lookingRef.current || pendingRef.current || trimmed === lastSubmittedRef.current) return;
    const recentTimes = times.slice(-trimmed.length);
    let totalGap = 0, gaps = 0;
    for (let i = 1; i < recentTimes.length; i++) { totalGap += recentTimes[i] - recentTimes[i - 1]; gaps++; }
    const avgGap = gaps ? totalGap / gaps : Infinity;
    if (avgGap <= SCAN_SPEED_MS) {
      keyTimesRef.current = [];
      lookup(val);
    }
    // Slower than that = real typing; leave it for Enter / the Look up button.
  }

  // Clears the scan box AND everything tracking "this scan's already been
  // handled" — keystroke timings, and the last-submitted code string. Using
  // this everywhere the box gets cleared (instead of a bare setCode(''))
  // means a genuinely NEW scan of the same code (e.g. testing that a
  // duplicate gets rejected) is free to trigger a fresh lookup, while a
  // stale debounce echo of the scan JUST handled still can't.
  function resetScan() {
    setCode('');
    keyTimesRef.current = [];
    lastSubmittedRef.current = '';
  }

  async function lookup(rawCode) {
    const scanned = rawCode.trim();
    if (!scanned || lookingRef.current) return;
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; } // this scan is being handled now — don't let a stale debounce fire again for it later
    lastSubmittedRef.current = scanned;
    lookingRef.current = true;
    setLooking(true);
    try {
      const res = await barcodeApi.lookup(scanned);
      if (res.alreadyStocked) {
        showToast(`Already scanned on ${new Date(res.usedAt).toLocaleString('en-IN')} by ${res.usedBy}`, 'err');
        resetScan();
        return;
      }
      setPending(res);
    } catch (err) {
      showToast(err.message, 'err');
      resetScan();
    } finally {
      lookingRef.current = false;
      setLooking(false);
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    lookup(code);
  }

  async function confirmStockIn() {
    setConfirming(true);
    try {
      const res = await barcodeApi.confirm(pending.code);
      showToast(res.message, 'g');
      setRecent((r) => [{ ...pending, at: new Date() }, ...r].slice(0, 8));
      setPending(null);
      resetScan();
    } catch (err) {
      showToast(err.message, 'err');
      setPending(null);
      resetScan();
    } finally {
      setConfirming(false);
    }
  }

  async function startCamera() {
    setCameraOn(true);
    const [{ BrowserMultiFormatReader }, { DecodeHintType, BarcodeFormat }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    // Restricting to QR_CODE (the only format we print now) means every
    // frame only has to be checked against one symbology instead of all of
    // them (barcodes, PDF417, DataMatrix...) — keeps the fast lock-on speed
    // that mattered when this was CODE128, now pointed at the new format.
    const hints = new Map();
    hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE]);
    // The other big chunk: the library's default is to wait 500ms after
    // EVERY failed attempt before trying again — so if the first frame
    // isn't perfectly sharp/aligned, that's already half a second gone
    // before it even retries. Dropping this to 80ms makes it retry fast
    // enough that a decent alignment reads almost the instant it's steady.
    const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 80 });
    readerRef.current = reader;
    const onResult = (result) => {
      if (result) {
        stopCamera();
        lookup(result.getText());
      }
    };
    try {
      // decodeFromVideoDevice(undefined, ...) leaves the browser to pick any
      // camera — on phones that's often the front (selfie) camera, which is
      // why scanning never worked on mobile: it was looking at the user's
      // face, not the carton. Ask explicitly for the rear camera instead.
      // "ideal" (not "exact") so this still works on a laptop with only one
      // (front) camera instead of hard-failing. focusMode: continuous nudges
      // phones that support it to keep refocusing as you move the carton
      // into position, instead of staying locked on whatever it first saw —
      // unsupported browsers just ignore this constraint rather than failing.
      //
      // decodeFromConstraints resolves an IScannerControls object once the
      // stream is live — THIS, not reader.reset(), is what actually stops a
      // scan in this version of the library (see stopCamera below).
      controlsRef.current = await reader.decodeFromConstraints(
        { video: { facingMode: { ideal: 'environment' }, advanced: [{ focusMode: 'continuous' }] } },
        videoRef.current,
        onResult
      );
      // Torch (flashlight) control only works on the actual camera hardware
      // track — iPhone Safari doesn't expose this capability to web pages at
      // all (an Apple platform restriction, not something fixable here), so
      // this button only appears when the browser actually reports support.
      const track = videoRef.current.srcObject?.getVideoTracks?.()[0];
      setTorchSupported(!!track?.getCapabilities?.().torch);
    } catch (err) {
      showToast('Could not access camera — ' + err.message, 'err');
      setCameraOn(false);
    }
  }

  // reader.reset() does not exist on this library's BrowserMultiFormatReader
  // (@zxing/browser 0.2.1) — calling it threw every time a scan succeeded,
  // which silently aborted the callback before lookup() ever ran. That's why
  // the camera would close but the confirm popup never appeared. The scan
  // controls object returned by decodeFromConstraints is the real way to stop.
  function stopCamera() {
    controlsRef.current?.stop();
    controlsRef.current = null;
    setCameraOn(false);
    setTorchOn(false);
    setTorchSupported(false);
  }

  async function toggleTorch() {
    const track = videoRef.current?.srcObject?.getVideoTracks?.()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: !torchOn }] });
      setTorchOn((t) => !t);
    } catch (err) {
      showToast('Flashlight not available on this device', 'err');
    }
  }

  useEffect(() => () => controlsRef.current?.stop(), []); // stop the camera if we navigate away mid-scan

  return (
    <div>
      <div className="ph"><div className="eyebrow">Warehouse</div><h2>Stock In — Scan Carton</h2>
        <p>Scan a carton's barcode (scanner gun or phone camera) to add its pieces to stock — it looks up automatically the instant you scan, no click needed.</p></div>

      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={onSubmit}>
          <div className="fg">
            <label>Scan or type code</label>
            <input
              ref={inputRef}
              value={code}
              onChange={onCodeChange}
              onKeyDown={onCodeKeyDown}
              placeholder="Point scanner here and scan…"
              autoFocus
              disabled={looking || !!pending}
            />
          </div>
          <div className="btnrow">
            <button className="btn" disabled={looking || !!pending}>{looking ? 'Looking up…' : 'Look up'}</button>
            {!cameraOn ? (
              <button type="button" className="btn o" onClick={startCamera}>📷 Use camera instead</button>
            ) : (
              <button type="button" className="btn o rd" onClick={stopCamera}>Stop camera</button>
            )}
          </div>
        </form>

        {cameraOn && (
          // playsInline + muted + autoPlay are required on iOS Safari — without
          // them the browser either refuses to show the feed inline or takes
          // it fullscreen, and the decode loop never sees a usable frame.
          <div style={{ position: 'relative', marginTop: 12 }}>
            <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', display: 'block', borderRadius: 8 }} />
            {/* Purely visual guide — a box to frame the QR code in. QR doesn't
                need careful axis alignment like the old barcode did (that's
                the point of switching formats), so this is just a rough
                square framing box now, not a precise alignment line. */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: '55%', aspectRatio: '1 / 1', position: 'relative',
                border: '2px solid rgba(255,255,255,0.85)', borderRadius: 8,
                boxShadow: '0 0 0 999px rgba(0,0,0,0.35)',
              }} />
            </div>
            <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 11.5, fontWeight: 600, textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
              Point the camera at the QR code
            </div>
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                style={{
                  position: 'absolute', top: 10, right: 10, border: 'none', borderRadius: 20,
                  padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  background: torchOn ? 'var(--red)' : 'rgba(0,0,0,0.55)', color: '#fff',
                }}
              >
                {torchOn ? '🔦 Flash on' : '🔦 Flash off'}
              </button>
            )}
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <div className="card" style={{ maxWidth: 480, marginTop: 14 }}>
          <h3 style={{ marginTop: 0 }}>This session</h3>
          {recent.map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderTop: i > 0 ? '1px solid var(--line)' : 'none' }}>
              <span>{r.productName}</span>
              <span style={{ color: 'var(--green)', fontWeight: 600 }}>+{r.qty} pcs</span>
            </div>
          ))}
        </div>
      )}

      {pending && (
        <div className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div className="card" style={{ maxWidth: 360, textAlign: 'center' }}>
            {pending.photo ? (
              <img src={pending.photo} alt="" style={{ width: 120, height: 120, objectFit: 'cover', borderRadius: 8, margin: '0 auto 12px' }} />
            ) : (
              <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
            )}
            <h2 style={{ margin: '0 0 4px' }}>{pending.qty} pcs</h2>
            <div style={{ fontWeight: 600, marginBottom: 2 }}>{pending.productName}</div>
            <div className="mono muted" style={{ fontSize: 11, marginBottom: 16 }}>{pending.code}</div>
            <div className="btnrow" style={{ justifyContent: 'center' }}>
              <button className="btn g" disabled={confirming} onClick={confirmStockIn}>{confirming ? 'Adding…' : `✓ Add ${pending.qty} to stock`}</button>
              <button className="btn o" disabled={confirming} onClick={() => { setPending(null); resetScan(); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

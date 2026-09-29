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

// --- Batch scanning ---
// Instead of a popup-per-scan that has to be confirmed one carton at a
// time, every scan is looked up and dropped straight into a running,
// numbered list — including a code that's already been stocked in, or one
// that's already sitting in THIS list — so nothing silently disappears.
// Only once you're done scanning do you click one button to add everything
// that's actually addable, all at once. An already-used or already-listed
// code stays visible with a reason, but is never itself added again.
let nextRowId = 1;
function makeRowId() { return nextRowId++; }

// Camera scanning is a separate, opt-in mode (button-triggered) since it
// needs camera permission and a ~500KB library — loaded lazily so it never
// costs anything for people only using a scanner gun.
export default function ScanStockIn() {
  const { showToast } = useToast();
  const [code, setCode] = useState('');
  const [queue, setQueue] = useState([]); // this batch's scanned rows, in scan order — see "Batch scanning" above
  const [looking, setLooking] = useState(false); // a single lookup in flight
  const [confirmingAll, setConfirmingAll] = useState(false); // the bulk "add all" in flight
  const [cameraOn, setCameraOn] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [recent, setRecent] = useState([]); // last few successfully-added cartons this session (across every batch confirmed)
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null); // returned by decodeFromConstraints — this is what actually stops a scan
  const keyTimesRef = useRef([]); // recent keystroke timestamps, for scan-speed detection
  const autoTimerRef = useRef(null); // debounce timer for the auto-submit-on-pause check
  const lookingRef = useRef(false); // synchronous mirror of `looking`, so a queued auto-submit never double-fires while a lookup is already in flight
  const lastSubmittedRef = useRef(''); // the exact code string a lookup has already been fired for (auto OR Enter/click) — stops the debounce timer from re-firing a second, stale lookup for a scan that's already been handled
  const queueCodesRef = useRef(new Set()); // codes already in `queue` (synchronous, so two scans arriving a few ms apart can't both slip past the in-list-duplicate check before either has committed its state update)
  // The outer whose box is currently "open" in this scanning session — the
  // one you scan an outer's own inner labels against. A label physically
  // stuck on the wrong box still carries its TRUE parent in the database
  // (fixed the instant it was generated), so comparing every scanned
  // inner's real parentCode against this is what catches a mix-up, however
  // it happened — a full swap, a half swap, doesn't matter, every inner is
  // checked on its own. null when no outer with inner children is "open".
  const activeOuterRef = useRef(null);

  // Refocus whenever the box becomes usable again — a lookup finishing (incl.
  // an error) or the bulk confirm finishing. The input is disabled while
  // either is in flight, and a browser doesn't restore focus on its own once
  // a disabled field becomes enabled again — without this, scanning would
  // stall until you clicked back into the box.
  useEffect(() => { if (!looking && !confirmingAll) inputRef.current?.focus(); }, [looking, confirmingAll]);

  // Clean up any pending debounce timer on unmount so it never fires (and
  // calls scanCode/setState) after this screen's been navigated away from.
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
    // already in flight; or this exact code string already had a lookup
    // fired for it (covers the case where Enter fired first, already
    // resolved, and this timer is just a late echo for the same scan).
    if (trimmed.length < 4 || times.length < 4 || lookingRef.current || trimmed === lastSubmittedRef.current) return;
    const recentTimes = times.slice(-trimmed.length);
    let totalGap = 0, gaps = 0;
    for (let i = 1; i < recentTimes.length; i++) { totalGap += recentTimes[i] - recentTimes[i - 1]; gaps++; }
    const avgGap = gaps ? totalGap / gaps : Infinity;
    if (avgGap <= SCAN_SPEED_MS) {
      keyTimesRef.current = [];
      scanCode(val);
    }
    // Slower than that = real typing; leave it for Enter / the Look up button.
  }

  // Clears the scan box AND everything tracking "this scan's already been
  // handled" — keystroke timings, and the last-submitted code string — so
  // the very next scan (even of the same code, e.g. testing a duplicate) is
  // free to trigger a fresh lookup, while a stale debounce echo of the scan
  // JUST handled still can't.
  function resetScan() {
    setCode('');
    keyTimesRef.current = [];
    lastSubmittedRef.current = '';
  }

  function addRow(row) {
    setQueue((q) => [...q, { id: makeRowId(), ...row }]);
  }

  async function scanCode(rawCode) {
    const scanned = rawCode.trim();
    if (!scanned || lookingRef.current) return;
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; } // this scan is being handled now — don't let a stale debounce fire again for it later
    lastSubmittedRef.current = scanned;

    // Already sitting in this batch (scanned twice before you've clicked
    // "Add all") — show it again so the repeat scan isn't silently ignored,
    // but don't hit the API a second time or create a second addable row.
    if (queueCodesRef.current.has(scanned)) {
      addRow({ code: scanned, status: 'dup-in-list', message: 'Already in this list' });
      resetScan();
      return;
    }

    lookingRef.current = true;
    setLooking(true);
    try {
      const res = await barcodeApi.lookup(scanned);
      const kind = res.kind || 'outer';
      if (res.alreadyStocked) {
        queueCodesRef.current.add(scanned);
        addRow({
          code: scanned, status: 'already-stocked', productName: res.productName, qty: res.qty, photo: res.photo,
          message: `Already scanned on ${new Date(res.usedAt).toLocaleString('en-IN')} by ${res.usedBy}`,
        });
      } else if (kind === 'outer') {
        // Scanning a new outer switches which "box" is currently open — if
        // the one before it still has inner children unscanned, that's not
        // blocked (sequence isn't mandatory, see resetScan/queue notes), but
        // it IS worth a heads-up, since the mismatch check below only
        // protects the outer that's actively "open".
        const prev = activeOuterRef.current;
        if (prev) {
          const prevRow = queue.find((r) => r.code === prev);
          if (prevRow && prevRow.gotten < prevRow.expected) {
            showToast(`Carton ${prev} was left incomplete (${prevRow.gotten}/${prevRow.expected} inner) — now scanning ${scanned}.`, 'err');
          }
        }
        activeOuterRef.current = res.innerTotal > 0 ? scanned : null;
        queueCodesRef.current.add(scanned);
        addRow({ code: scanned, status: 'ready', kind: 'outer', productName: res.productName, qty: res.qty, photo: res.photo, expected: res.innerTotal || 0, gotten: 0 });
      } else {
        // An inner — verified against whichever outer is currently "open",
        // using its TRUE parentCode from the database, never which box it
        // physically happened to be found in.
        const active = activeOuterRef.current;
        if (active && res.parentCode === active) {
          // 'verified' on purpose, NOT 'ready' — an inner still physically
          // sealed inside its outer isn't separate stock yet (its pcs are
          // already counted in the outer's own qty), so it's never
          // confirmed/added on its own here — only checked that it truly
          // belongs to the outer just scanned. Scanning it into stock for
          // real happens later, whenever this carton is actually opened.
          queueCodesRef.current.add(scanned);
          addRow({ code: scanned, status: 'verified', kind: 'inner', parentCode: res.parentCode, productName: res.productName, qty: res.qty, photo: res.photo });
          setQueue((q) => q.map((r) => (r.code === active ? { ...r, gotten: r.gotten + 1 } : r)));
        } else {
          queueCodesRef.current.add(scanned);
          addRow({
            code: scanned, status: 'wrong-carton', kind: 'inner', parentCode: res.parentCode, productName: res.productName, qty: res.qty, photo: res.photo,
            message: active ? `Belongs to carton ${res.parentCode}, not ${active} — check the box` : `Belongs to carton ${res.parentCode} — scan that outer first`,
          });
        }
      }
    } catch (err) {
      // Not recognised / network error etc. — NOT added to queueCodesRef, so
      // a mistyped or misread code can be corrected and rescanned freely.
      addRow({ code: scanned, status: 'error', message: err.message });
    } finally {
      lookingRef.current = false;
      setLooking(false);
      resetScan();
    }
  }

  function onSubmit(e) {
    e.preventDefault();
    scanCode(code);
  }

  function removeRow(id) {
    setQueue((q) => {
      const row = q.find((r) => r.id === id);
      if (row) {
        queueCodesRef.current.delete(row.code); // freed up so it can be rescanned if this was a mistaken entry
        if (activeOuterRef.current === row.code) activeOuterRef.current = null; // its "open box" context goes with it
      }
      return q.filter((r) => r.id !== id);
    });
  }

  function clearQueue() {
    setQueue([]);
    queueCodesRef.current = new Set();
    activeOuterRef.current = null;
  }

  // Confirms every 'ready' row, one at a time (matches how each carton is
  // its own transactional stock-in on the backend). Successfully-added rows
  // are cleared from the visible list once done (they're now in "This
  // session" below); anything that failed during confirm (e.g. a genuine
  // race with someone else stocking the same carton in the last few
  // seconds) stays in the list as an error row instead of vanishing.
  async function confirmAll() {
    const readyRows = queue.filter((r) => r.status === 'ready');
    if (!readyRows.length || confirmingAll) return;
    setConfirmingAll(true);
    const results = [];
    for (const row of readyRows) {
      try {
        await barcodeApi.confirm(row.code);
        results.push({ ...row, status: 'added' });
      } catch (err) {
        results.push({ ...row, status: 'error', message: err.message });
        queueCodesRef.current.delete(row.code);
      }
    }
    const byId = new Map(results.map((r) => [r.id, r]));
    const addedOuterCodes = new Set(results.filter((r) => r.status === 'added').map((r) => r.code));
    setQueue((q) => q
      .map((r) => byId.get(r.id) || r)
      .filter((r) => {
        if (r.status === 'added') return false; // cleared — now in "This session" below
        // A verified inner's job here was purely to confirm it belongs to
        // the outer that just got confirmed — once that outer's done, this
        // row has nothing further to do (it was never separately added, its
        // pcs are already inside the outer's own qty), so it clears too.
        if (r.status === 'verified' && addedOuterCodes.has(r.parentCode)) return false;
        return true;
      })
    );

    const added = results.filter((r) => r.status === 'added');
    const failed = results.length - added.length;
    if (added.length) {
      setRecent((r) => [...added.map((a) => ({ ...a, at: new Date() })).reverse(), ...r].slice(0, 20));
    }
    const addedPcs = added.reduce((s, r) => s + r.qty, 0);
    showToast(
      `${added.length} carton${added.length === 1 ? '' : 's'} added to stock (${addedPcs} pcs)${failed ? `, ${failed} failed — see list` : ''}`,
      failed ? 'err' : 'g'
    );
    setConfirmingAll(false);
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
    // Camera scanning feeds the same batch queue as the gun — it does NOT
    // stop the camera or scanCode after every read, so you can keep holding
    // the camera up to carton after carton the same way you'd keep pulling
    // a gun's trigger, and everything lands in one running list either way.
    const onResult = (result) => { if (result) scanCode(result.getText()); };
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
  // which silently aborted the callback before scanCode() ever ran. The scan
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

  const readyCount = queue.filter((r) => r.status === 'ready').length;
  const readyPcs = queue.filter((r) => r.status === 'ready').reduce((s, r) => s + r.qty, 0);

  const STATUS_LABEL = {
    ready: { text: 'Ready', color: 'var(--green)' },
    verified: { text: 'Verified ✓', color: 'var(--spruce)' },
    'already-stocked': { text: 'Already scanned', color: 'var(--red)' },
    'dup-in-list': { text: 'Duplicate scan', color: 'var(--red)' },
    'wrong-carton': { text: 'Wrong carton', color: 'var(--red)' },
    error: { text: 'Not recognised', color: 'var(--red)' },
    added: { text: 'Added', color: 'var(--green)' },
  };

  return (
    <div>
      <div className="ph"><div className="eyebrow">Warehouse</div><h2>Stock In — Scan Carton</h2>
        <p>Scan cartons one after another — each lands in the list below automatically, no click needed. Once you're done, review the total and add them all to stock in one go.</p></div>

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
              disabled={looking || confirmingAll}
            />
          </div>
          <div className="btnrow">
            <button className="btn" disabled={looking || confirmingAll}>{looking ? 'Looking up…' : 'Look up'}</button>
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

      {queue.length > 0 && (
        <div className="card" style={{ maxWidth: 640, marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>This batch — {queue.length} scanned</h3>
            <button type="button" className="btn o sm" disabled={confirmingAll} onClick={clearQueue}>Clear list</button>
          </div>

          {queue.map((r, i) => {
            const label = STATUS_LABEL[r.status] || { text: r.status, color: 'var(--muted)' };
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, padding: '6px 0',
                borderTop: i > 0 ? '1px solid var(--line)' : 'none',
              }}>
                <span className="muted mono" style={{ width: 24, textAlign: 'right', flexShrink: 0 }}>{i + 1}.</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.kind === 'inner' && '↳ '}{r.productName || <span className="mono">{r.code}</span>}
                    {r.kind === 'outer' && <span className="muted" style={{ fontWeight: 400 }}> · OUTER</span>}
                  </div>
                  {r.productName && <div className="mono muted" style={{ fontSize: 10.5 }}>{r.code}</div>}
                  {/* Live progress on an outer's own inner children — updates
                      as each correctly-matched inner is scanned in, so it's
                      obvious at a glance whether this carton's group is done. */}
                  {r.kind === 'outer' && r.expected > 0 && (
                    <div className="muted" style={{ fontSize: 10.5, marginTop: 1, color: r.gotten >= r.expected ? 'var(--green)' : undefined, fontWeight: r.gotten >= r.expected ? 600 : 400 }}>
                      {r.gotten}/{r.expected} inner scanned{r.gotten >= r.expected ? ' ✓' : ''}
                    </div>
                  )}
                  {r.kind === 'inner' && r.status === 'verified' && <div className="muted" style={{ fontSize: 10.5, marginTop: 1 }}>Part of carton {r.parentCode} — pcs already counted in its outer</div>}
                  {r.message && <div className="muted" style={{ fontSize: 10.5, marginTop: 1, color: r.status === 'wrong-carton' ? 'var(--red)' : undefined, fontWeight: r.status === 'wrong-carton' ? 600 : 400 }}>{r.status === 'wrong-carton' ? '⚠ ' : ''}{r.message}</div>}
                </div>
                {r.qty != null && <span className={r.status === 'verified' ? 'muted' : undefined} style={{ flexShrink: 0 }}>{r.qty} pcs</span>}
                <span style={{ flexShrink: 0, fontWeight: 600, color: label.color, minWidth: 90, textAlign: 'right' }}>{label.text}</span>
                <button
                  type="button" className="btn o sm rd" disabled={confirmingAll}
                  onClick={() => removeRow(r.id)} title="Remove from this list" style={{ flexShrink: 0, padding: '2px 8px' }}
                >✕</button>
              </div>
            );
          })}

          <div className="btnrow" style={{ marginTop: 14, justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {readyCount > 0 ? `${readyCount} ready · ${readyPcs} pcs total` : 'Nothing ready to add yet'}
            </span>
            <button className="btn g" disabled={!readyCount || confirmingAll} onClick={confirmAll}>
              {confirmingAll ? 'Adding…' : `✓ Add ${readyCount || ''} to stock`}
            </button>
          </div>
        </div>
      )}

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
    </div>
  );
}

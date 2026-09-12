import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { barcodeApi } from './barcodeApi';

// A hardware barcode scanner gun works by "typing" the decoded value into
// whatever's focused, then sending Enter — it behaves exactly like a very
// fast keyboard. So the manual-entry input below doubles as the scanner-gun
// input with zero extra code: keep it focused, and Enter submits either way.
//
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
  const [recent, setRecent] = useState([]); // last few successful scans this session
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const readerRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [pending]);

  async function lookup(rawCode) {
    const scanned = rawCode.trim();
    if (!scanned) return;
    setLooking(true);
    try {
      const res = await barcodeApi.lookup(scanned);
      if (res.status === 'used') {
        showToast(`Already scanned on ${new Date(res.usedAt).toLocaleString('en-IN')} by ${res.usedBy}`, 'err');
        setCode('');
        return;
      }
      setPending(res);
    } catch (err) {
      showToast(err.message, 'err');
      setCode('');
    } finally {
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
      setCode('');
    } catch (err) {
      showToast(err.message, 'err');
      setPending(null);
      setCode('');
    } finally {
      setConfirming(false);
    }
  }

  async function startCamera() {
    setCameraOn(true);
    const { BrowserMultiFormatReader } = await import('@zxing/browser');
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    try {
      await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
        if (result) {
          stopCamera();
          lookup(result.getText());
        }
      });
    } catch (err) {
      showToast('Could not access camera — ' + err.message, 'err');
      setCameraOn(false);
    }
  }

  function stopCamera() {
    readerRef.current?.reset();
    setCameraOn(false);
  }

  useEffect(() => () => readerRef.current?.reset(), []); // stop the camera if we navigate away mid-scan

  return (
    <div>
      <div className="ph"><div className="eyebrow">Warehouse</div><h2>Stock In — Scan Carton</h2>
        <p>Scan a carton's barcode (scanner gun or phone camera) to add its pieces to stock.</p></div>

      <div className="card" style={{ maxWidth: 480 }}>
        <form onSubmit={onSubmit}>
          <div className="fg">
            <label>Scan or type barcode</label>
            <input
              ref={inputRef}
              value={code}
              onChange={(e) => setCode(e.target.value)}
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
          <video ref={videoRef} style={{ width: '100%', marginTop: 12, borderRadius: 8 }} />
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
              <button className="btn o" disabled={confirming} onClick={() => { setPending(null); setCode(''); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

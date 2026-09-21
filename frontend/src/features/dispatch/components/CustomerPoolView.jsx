import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { barcodeApi } from '../../inventory/barcodeApi';
import CameraScanner from '../../../components/CameraScanner';

// Quantity is whole outer/inner cartons. Checking an item defaults to
// dispatching everything currently confirmed and pending for it (the max
// below) — but that default can be LOWERED per row (e.g. only 1 of 3 outer
// cartons is actually packed and ready right now); it can never be raised
// past what's actually confirmed. Whatever isn't dispatched just stays in
// the pool for next time. Whatever doesn't divide evenly into a full carton
// also just stays in the pool.
function maxCartons(pendingPcs, cartonOuter, cartonInner) {
  if (!cartonOuter) return { outers: 0, inners: 0 };
  const outers = Math.floor(pendingPcs / cartonOuter);
  const afterOuters = pendingPcs - outers * cartonOuter;
  const inners = cartonInner ? Math.floor(afterOuters / cartonInner) : 0;
  return { outers, inners };
}

// One row's key — same product at two different rates needs to be two
// separate, independently selectable rows (they'll be separate invoice lines).
function rowKey(item) { return `${item.code}|${item.rate}`; }

// scannedCodes/onScannedCodesChange is lifted up to Dispatch.jsx (same way
// selection is) so the raw list of scanned carton codes survives up to the
// final dispatch submit — that's what actually gets locked in as
// "dispatched" once the Dispatch button is pressed, not before.
export default function CustomerPoolView({ pool, selection, onSelectionChange, scannedCodes, onScannedCodesChange }) {
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [available, setAvailable] = useState({}); // product code -> { outer, inner } in_stock counts
  const [scanRow, setScanRow] = useState(null); // rowKey currently showing its scan input
  const [scanValue, setScanValue] = useState('');
  const [scanningRow, setScanningRow] = useState(null);
  const [cameraRow, setCameraRow] = useState(null); // rowKey currently showing the camera view (mutually exclusive with typing — one or the other)
  const [splitTarget, setSplitTarget] = useState(null); // { rowKey, code } — last scanned outer, offered for splitting
  const [splitting, setSplitting] = useState(false);

  const rows = useMemo(() => {
    return (pool?.items || [])
      .filter((it) => !q || it.name.toLowerCase().includes(q.toLowerCase()) || it.code.toLowerCase().includes(q.toLowerCase()))
      .map((it) => {
        const key = rowKey(it);
        const max = maxCartons(it.pendingPcs, it.cartonOuter, it.cartonInner);
        const override = selection[key];
        const checked = !!override;
        // Clamp defensively in case the pool refreshed and max shrank since
        // this override was chosen (e.g. someone else dispatched some of it).
        const outers = checked ? Math.min(override.outers, max.outers) : max.outers;
        const inners = checked ? Math.min(override.inners, max.inners) : max.inners;
        return { item: it, key, max, outers, inners, checked };
      });
  }, [pool, q, selection]);

  // Fetched once per pool load — how many in_stock outer/inner cartons
  // actually exist for each product here, so a row with genuinely nothing
  // to scan (never QR-tracked, or all already dispatched) gets its scan
  // button disabled instead of inviting a scan that can only fail.
  useEffect(() => {
    const codes = [...new Set((pool?.items || []).map((it) => it.code))];
    if (!codes.length) { setAvailable({}); return; }
    barcodeApi.availableCounts(codes).then(setAvailable).catch(() => setAvailable({}));
  }, [pool]);

  function toggle(row) {
    if (row.checked) {
      const next = { ...selection };
      delete next[row.key];
      onSelectionChange(next);
      // Unchecking undoes this row's staging entirely — nothing was
      // actually dispatched (that only happens at the final Dispatch
      // button), so any cartons scanned into this row need to become
      // scannable again, not stay permanently "used" client-side. That
      // means both releasing the codes AND putting back the "available"
      // count each of those scans had optimistically decremented —
      // otherwise the Scan button keeps showing a stale, too-low number
      // even though those exact cartons are scannable again.
      const released = scannedCodes.filter((s) => s.ownerKey === row.key);
      if (released.length) {
        setAvailable((a) => {
          const next = { ...a, [row.item.code]: { ...a[row.item.code] } };
          released.forEach((s) => {
            next[row.item.code][s.kind] = (next[row.item.code][s.kind] || 0) + 1;
          });
          return next;
        });
      }
      onScannedCodesChange(scannedCodes.filter((s) => s.ownerKey !== row.key));
    } else {
      // Defaults to the full max — same as before this row is ever touched.
      onSelectionChange({ ...selection, [row.key]: { outers: row.max.outers, inners: row.max.inners } });
    }
  }

  function setOuters(row, value) {
    const outers = Math.max(0, Math.min(row.max.outers, Math.floor(+value) || 0));
    onSelectionChange({ ...selection, [row.key]: { outers, inners: row.inners } });
  }
  function setInners(row, value) {
    const inners = Math.max(0, Math.min(row.max.inners, Math.floor(+value) || 0));
    onSelectionChange({ ...selection, [row.key]: { outers: row.outers, inners } });
  }

  function openScan(row) { setScanRow(row.key); setScanValue(''); setCameraRow(null); }
  function closeScan() { setScanRow(null); setScanValue(''); setCameraRow(null); }

  // Scanning increments THIS row's outer/inner count by one (capped at max,
  // same rule typing a number already follows) — it's an alternative input
  // method for the same field, never a separate mechanism. Passing this
  // row's product code to the backend means a carton scanned for the wrong
  // product gets rejected with a precise "that's X, not Y" message, rather
  // than silently applying to whichever row happened to match.
  // Takes the code directly (not read from state) so it works identically
  // whether it came from the typed input's submit or the camera's onScan —
  // one scan (by either method) is always exactly one carton, handled here once.
  // scannedCodes entries carry an ownerKey (this row) so unchecking the row
  // later can release exactly these codes back to being scannable, without
  // touching anything scanned into a different row.
  async function submitScan(row, code) {
    if (!code) return;
    if (scannedCodes.some((s) => s.code === code)) { showToast('Already scanned into this dispatch', 'err'); return; }
    setScanningRow(row.key);
    try {
      const res = await barcodeApi.forDispatch(code, pool.dealer.code, { product: row.item.code });
      const current = selection[row.key] || { outers: 0, inners: 0 };
      if (res.kind === 'outer') {
        if (current.outers >= row.max.outers) { showToast(`Already at the max outer count for ${row.item.name}`, 'err'); return; }
        onSelectionChange({ ...selection, [row.key]: { outers: current.outers + 1, inners: current.inners } });
        setSplitTarget({ rowKey: row.key, code: res.code });
      } else {
        if (current.inners >= row.max.inners) { showToast(`Already at the max inner count for ${row.item.name}`, 'err'); return; }
        onSelectionChange({ ...selection, [row.key]: { outers: current.outers, inners: current.inners + 1 } });
      }
      onScannedCodesChange([...scannedCodes, { code: res.code, ownerKey: row.key, kind: res.kind }]);
      // Available count just dropped by one for this product/kind — reflect
      // it immediately rather than waiting for a full pool reload.
      setAvailable((a) => ({ ...a, [row.item.code]: { ...a[row.item.code], [res.kind]: Math.max(0, (a[row.item.code]?.[res.kind] || 0) - 1) } }));
      showToast(`Scanned ${res.code} — ${res.productName}`, 'g');
      if (res.fifoNote) showToast(res.fifoNote, 'y'); // guidance only, never blocks
      closeScan();
    } catch (err) { showToast(err.message, 'err'); }
    finally { setScanningRow(null); }
  }

  async function splitCarton() {
    if (!splitTarget) return;
    setSplitting(true);
    try {
      const res = await barcodeApi.split(splitTarget.code);
      showToast(res.message, 'g');
      setSplitTarget(null);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSplitting(false); }
  }

  const grandTotal = rows.reduce((sum, r) => {
    if (!r.checked) return sum;
    const pcs = r.outers * r.item.cartonOuter + r.inners * r.item.cartonInner;
    const gross = r.item.rate + (r.item.rate * r.item.gstPct) / 100;
    return sum + gross * pcs;
  }, 0);
  const anySelected = rows.some((r) => r.checked);
  const activeScanRow = rows.find((r) => r.key === scanRow) || null; // the one row (of many) currently showing the fixed scan sheet — see below

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Confirmed items — {pool.dealer.name}</h3>
        <input placeholder="Search item" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
      </div>

      {!rows.length ? (
        <div className="empty">No confirmed, undispatched items for this customer right now.</div>
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead>
              <tr>
                <th></th><th></th><th>Code</th>
                <th style={{ position: 'sticky', left: 0, background: 'var(--paper-d)', zIndex: 2, boxShadow: '2px 0 6px rgba(0,0,0,0.08)' }}>Product</th>
                <th>Last updated</th>
                <th>Outer</th><th>Inner</th><th>Rate ₹</th><th>GST %</th><th>Total ₹</th><th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pcs = r.outers * r.item.cartonOuter + r.inners * r.item.cartonInner;
                const gross = r.item.rate + (r.item.rate * r.item.gstPct) / 100;
                const lineTotal = gross * pcs;
                const avail = available[r.item.code] || { outer: 0, inner: 0 };
                const canScan = avail.outer > 0 || avail.inner > 0;
                return (
                  <tr key={r.key}>
                    <td><input type="checkbox" checked={r.checked} onChange={() => toggle(r)} /></td>
                    <td>{r.item.photo ? <img src={r.item.photo} alt="" style={{ width: 30, height: 30, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{r.item.code}</td>
                    {/* Sticky so scrolling right to reach Outer/Inner/Scan on a
                        narrow phone never loses sight of WHICH product this
                        row is — this is the actual fix for "which item am I
                        scanning" now, at the source, instead of only
                        repeating the name inside the scan sheet below. */}
                    <td style={{ position: 'sticky', left: 0, background: 'var(--white)', zIndex: 1, boxShadow: '2px 0 6px rgba(0,0,0,0.08)' }}><b>{r.item.name}</b></td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{new Date(r.item.lastConfirmedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>
                      {r.checked ? (
                        <input
                          type="number" min={0} max={r.max.outers} value={r.outers}
                          onChange={(e) => setOuters(r, e.target.value)}
                          style={{ width: 60 }}
                        />
                      ) : <b>{r.max.outers}</b>}
                      {r.item.cartonOuter > 0 && (
                        <div className="muted" style={{ fontSize: 10 }}>
                          {r.checked ? `of ${r.max.outers} · ` : ''}× {r.item.cartonOuter} pcs
                        </div>
                      )}
                    </td>
                    <td>
                      {r.checked ? (
                        <input
                          type="number" min={0} max={r.max.inners} value={r.inners}
                          onChange={(e) => setInners(r, e.target.value)}
                          style={{ width: 60 }}
                        />
                      ) : <b>{r.max.inners}</b>}
                      {r.item.cartonInner > 0 && (
                        <div className="muted" style={{ fontSize: 10 }}>
                          {r.checked ? `of ${r.max.inners} · ` : ''}× {r.item.cartonInner} pcs
                        </div>
                      )}
                    </td>
                    <td>{r.item.rate}</td>
                    <td>{r.item.gstPct}</td>
                    <td>{Math.round(lineTotal).toLocaleString('en-IN')}</td>
                    <td>
                      <button
                        type="button" className="btn o sm"
                        disabled={!canScan}
                        title={canScan ? `${avail.outer} outer / ${avail.inner} inner in stock` : 'No tracked cartons in stock for this product'}
                        onClick={() => openScan(r)}
                      >
                        📷 {canScan ? `Scan (${avail.outer + avail.inner} in stock)` : 'No stock to scan'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {scannedCodes.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{scannedCodes.length} carton(s) scanned so far in this dispatch.</div>
      )}

      {anySelected && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 15, fontWeight: 700 }}>
          Grand Total: ₹{Math.round(grandTotal).toLocaleString('en-IN')}
        </div>
      )}

      {/* Fixed bottom sheet, not an inline table row — this is the whole
          fix for the mobile layout problem: a wide table row that expands
          inline scrolls out of view (or off to the side on a narrow phone
          screen) the moment you scroll or the camera opens, so it's easy to
          lose track of which product you're even scanning for. Anchoring
          this to the bottom of the viewport means it never moves, and the
          product name/code stays visible at the top of it at all times.
          Backdrop + rounded top corners + a drag-handle bar so it reads as
          a proper sheet rather than a flat bar glued to the screen edge. */}
      {activeScanRow && (
        <>
          <div onClick={closeScan} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 999 }} />
          <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 1000, background: 'var(--paper)', borderRadius: '16px 16px 0 0', boxShadow: '0 -8px 24px rgba(0,0,0,0.2)', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 0' }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'var(--line)' }} />
            </div>
            <div style={{ padding: '10px 16px 16px', maxWidth: 560, margin: '0 auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>Scanning for</div>
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{activeScanRow.item.name} <span className="mono muted" style={{ fontSize: 11, fontWeight: 400 }}>{activeScanRow.item.code}</span></div>
                </div>
                <button type="button" className="btn o sm" onClick={closeScan}>✕ Close</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); submitScan(activeScanRow, scanValue.trim()); }} className="btnrow" style={{ flexWrap: 'wrap' }}>
                <input
                  autoFocus placeholder={`Type a carton code for ${activeScanRow.item.name}`}
                  value={scanValue} onChange={(e) => setScanValue(e.target.value)}
                  style={{ minWidth: 220, flex: 1 }}
                />
                <button type="submit" className="btn sm" disabled={scanningRow === activeScanRow.key}>{scanningRow === activeScanRow.key ? 'Checking…' : 'Add scan'}</button>
                {cameraRow === activeScanRow.key ? (
                  <button type="button" className="btn o sm rd" onClick={() => setCameraRow(null)}>Stop camera</button>
                ) : (
                  <button type="button" className="btn o sm" onClick={() => setCameraRow(activeScanRow.key)}>📷 Open camera</button>
                )}
                {splitTarget?.rowKey === activeScanRow.key && (
                  <button type="button" className="btn o sm" disabled={splitting} onClick={splitCarton}>
                    {splitting ? 'Splitting…' : `✂️ Split ${splitTarget.code} into inners`}
                  </button>
                )}
              </form>
              {cameraRow === activeScanRow.key && (
                <CameraScanner
                  onScan={(code) => { setCameraRow(null); submitScan(activeScanRow, code); }}
                  onError={(msg) => { showToast(msg, 'err'); setCameraRow(null); }}
                  onClose={() => setCameraRow(null)}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

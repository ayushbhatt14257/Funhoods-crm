import { useEffect, useMemo, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { barcodeApi } from '../../inventory/barcodeApi';
import CameraScanner from '../../../components/CameraScanner';

// Quantity is whole outer/inner cartons — never loose pieces sold from
// inside a carton. Two different helpers below serve two different jobs:
//
// defaultSplit() is only a DISPLAY suggestion for a row nobody has touched
// yet — "as many outers as possible, remainder as inners" — shown as the
// bold default before the row is checked.
//
// roomFor() is the REAL ceiling used everywhere quantity is actually
// entered or scanned. Outer and inner share ONE pcs budget (the order's
// pending pcs), not two independent fixed caps — so the max for one kind
// is always computed from how many pcs the OTHER kind currently accounts
// for. This is what makes it possible to fulfil an order using whichever
// mix of outer/inner cartons the warehouse actually has on the shelf (e.g.
// an order that divides evenly into 1 outer can equally be fulfilled by 4
// inners, or partly one and partly the other) — while still only ever
// allowing WHOLE cartons: the moment the remaining pcs can't fit one more
// full unit of a kind, that kind's room drops to exactly 0.
function defaultSplit(pendingPcs, cartonOuter, cartonInner) {
  if (!cartonOuter) return { outers: 0, inners: 0 };
  const outers = Math.floor(pendingPcs / cartonOuter);
  const afterOuters = pendingPcs - outers * cartonOuter;
  const inners = cartonInner ? Math.floor(afterOuters / cartonInner) : 0;
  return { outers, inners };
}
// Same outer-first idea as defaultSplit, but capped by what's actually in
// stock at each step — the plain outer-first default above assumes
// unlimited outers exist, so a product with 0 outer but real inner stock
// (e.g. an order for 1 outer's worth of pcs, only inners on the shelf)
// would default to "1 outer, 0 inner" — an impossible selection that then
// ate the ENTIRE pcs budget in roomFor()'s shared-budget math, leaving 0
// room for inner too, even though inner stock genuinely covers the order.
// This picks as many outers as the order needs AND are actually
// available, then fills whatever's left with inner, also capped by inner
// availability — so the very first thing shown is always something
// genuinely selectable, never a dead end.
function stockAwareDefault(pendingPcs, cartonOuter, cartonInner, avail) {
  if (!cartonOuter) return { outers: 0, inners: cartonInner ? Math.min(Math.floor(pendingPcs / cartonInner), avail.inner) : 0 };
  const idealOuters = Math.floor(pendingPcs / cartonOuter);
  const outers = Math.min(idealOuters, avail.outer);
  const afterOuters = pendingPcs - outers * cartonOuter;
  const inners = cartonInner ? Math.min(Math.floor(afterOuters / cartonInner), avail.inner) : 0;
  return { outers, inners };
}
function roomFor(pendingPcs, cartonOuter, cartonInner, currentOuters, currentInners) {
  const outers = cartonOuter ? Math.max(0, Math.floor((pendingPcs - currentInners * cartonInner) / cartonOuter)) : 0;
  const inners = cartonInner ? Math.max(0, Math.floor((pendingPcs - currentOuters * cartonOuter) / cartonInner)) : 0;
  return { outers, inners };
}

// Outer and inner are two different pcs-per-unit and are never blended into
// one merged number in the UI — this formats whichever kind(s) actually
// have stock as separate counts, e.g. "2 inner" or "1 outer, 3 inner",
// never a single combined figure like "3 in stock".
function availLabel(avail) {
  const parts = [];
  if (avail.outer > 0) parts.push(`${avail.outer} outer`);
  if (avail.inner > 0) parts.push(`${avail.inner} inner`);
  return parts.length ? parts.join(', ') : '0';
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
        const override = selection[key];
        const checked = !!override;
        const avail = available[it.code] || { outer: 0, inner: 0 };
        const canScan = avail.outer > 0 || avail.inner > 0;
        // Stock-aware from the start (see stockAwareDefault above) — shown
        // as the bold default before this row is checked, AND used as the
        // actual selection the moment it IS checked, so ticking the box
        // never lands on an impossible combination that then blocks out
        // the other kind entirely.
        const suggested = stockAwareDefault(it.pendingPcs, it.cartonOuter, it.cartonInner, avail);
        // The real, shared-pcs-budget ceiling given whatever is currently
        // selected — recalculates every render, so it's never possible to
        // exceed pendingPcs regardless of which mix of outer/inner got you
        // there, and clamps defensively if the pool refreshed and
        // pendingPcs shrank since this override was chosen.
        const currentOuters = checked ? override.outers : 0;
        const currentInners = checked ? override.inners : 0;
        const pcsMax = roomFor(it.pendingPcs, it.cartonOuter, it.cartonInner, currentOuters, currentInners);
        // Manual typing has no scan behind it to verify a carton actually
        // exists, so it's additionally capped by the real physical count
        // (avail) on top of the order's own pcs budget — never possible to
        // manually type more than what's genuinely in stock, even without
        // scanning each one. Scanning itself is separately, independently
        // safe regardless of this cap (forDispatch always checks the real
        // carton server-side).
        const max = { outers: Math.min(pcsMax.outers, avail.outer), inners: Math.min(pcsMax.inners, avail.inner) };
        const outers = checked ? Math.min(currentOuters, max.outers) : Math.min(suggested.outers, max.outers);
        const inners = checked ? Math.min(currentInners, max.inners) : Math.min(suggested.inners, max.inners);
        return { item: it, key, max, suggested, outers, inners, checked, avail, canScan };
      });
  }, [pool, q, selection, available]);

  // Fetched once per pool load — how many in_stock outer/inner cartons
  // actually exist for each product here, so a row with genuinely nothing
  // to scan (never QR-tracked, or all already dispatched) gets its scan
  // button and checkbox both disabled instead of inviting a selection that
  // can only fail or overshoot real stock.
  useEffect(() => {
    const codes = [...new Set((pool?.items || []).map((it) => it.code))];
    if (!codes.length) { setAvailable({}); return; }
    barcodeApi.availableCounts(codes).then(setAvailable).catch(() => setAvailable({}));
  }, [pool]);

  // Checking the box stages a manual selection (defaulting to the
  // outer-first suggested split, capped at real physical stock — see
  // `max` above) — this is the manual, no-scan-required path. Scanning is
  // still available separately (the Scan button) and simply adds to
  // whatever this row's current outers/inners already are, same as before;
  // the two aren't mutually exclusive. Unchecking releases the selection —
  // and, if any of it came from real scans, releases those specific
  // cartons back to available too.
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
      onSelectionChange({ ...selection, [row.key]: { outers: row.suggested.outers, inners: row.suggested.inners } });
    }
  }

  // Manual typed-quantity overrides — bounded by `row.max`, which already
  // factors in both the order's own pcs budget AND real physical stock
  // (see the rows useMemo above), so typing can never exceed what's
  // genuinely available even without an actual scan.
  function setOuters(row, value) {
    const outers = Math.max(0, Math.min(row.max.outers, Math.floor(+value) || 0));
    onSelectionChange({ ...selection, [row.key]: { outers, inners: row.inners } });
  }
  function setInners(row, value) {
    const inners = Math.max(0, Math.min(row.max.inners, Math.floor(+value) || 0));
    onSelectionChange({ ...selection, [row.key]: { outers: row.outers, inners } });
  }

  // Opens the scan sheet for this row. This used to also release every
  // carton already scanned into the row back to "available" and uncheck the
  // row outright — a deliberate "always start fresh" reset — but that meant
  // clicking Scan a SECOND time on a row you'd already scanned some into
  // (e.g. scanning 2 inners, closing the sheet, then reopening it to scan a
  // 3rd) silently threw away the earlier scans: the row would flip back to
  // unchecked/0 the instant the sheet reopened, and whatever you scanned
  // next became the ONLY thing recorded, not an addition to what was there.
  // Reopening the sheet on progress already made should resume it, not
  // discard it — the sheet already shows "X / Y pcs scanned" from
  // activeRowScans and lets you remove entries one at a time, so there's
  // nothing left for a destructive reset to protect against.
  function openScan(row) {
    setScanRow(row.key);
    setScanValue('');
    setCameraRow(null);
  }
  function closeScan() { setScanRow(null); setScanValue(''); setCameraRow(null); }

  // Undoes exactly one scanned carton: drops the row's count by one (of
  // whichever kind that carton was), puts it back as available, and
  // removes it from the scanned list — the mirror image of a successful scan.
  function removeScannedEntry(row, entry) {
    onScannedCodesChange(scannedCodes.filter((s) => s !== entry));
    setAvailable((a) => ({ ...a, [row.item.code]: { ...a[row.item.code], [entry.kind]: (a[row.item.code]?.[entry.kind] || 0) + 1 } }));
    const current = selection[row.key] || { outers: 0, inners: 0 };
    const outers = entry.kind === 'outer' ? Math.max(0, current.outers - 1) : current.outers;
    const inners = entry.kind === 'inner' ? Math.max(0, current.inners - 1) : current.inners;
    if (outers === 0 && inners === 0) {
      // Back to nothing scanned — uncheck entirely rather than leaving a
      // {outers:0, inners:0} override, which would show as checked-but-
      // sending-nothing (the exact confusing state fixed once already).
      const next = { ...selection };
      delete next[row.key];
      onSelectionChange(next);
    } else {
      onSelectionChange({ ...selection, [row.key]: { outers, inners } });
    }
  }

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
      let nextOuters = current.outers, nextInners = current.inners;
      if (res.kind === 'outer') {
        if (current.outers >= row.max.outers) {
          // This exact outer doesn't fit what's left — but it might if
          // split into inners, so offer that right here instead of just
          // refusing. Whether it's ACTUALLY splittable (a whole outer
          // carton, not itself an inner) is checked server-side when the
          // split button is used.
          showToast(`This outer is too big for what's left on ${row.item.name} — split it into inners instead.`, 'err');
          setSplitTarget({ rowKey: row.key, code: res.code });
          return;
        }
        nextOuters = current.outers + 1;
        setSplitTarget({ rowKey: row.key, code: res.code });
      } else {
        if (current.inners >= row.max.inners) { showToast(`Already at the max inner count for ${row.item.name}`, 'err'); return; }
        nextInners = current.inners + 1;
      }
      onSelectionChange({ ...selection, [row.key]: { outers: nextOuters, inners: nextInners } });
      onScannedCodesChange([...scannedCodes, { code: res.code, ownerKey: row.key, kind: res.kind }]);
      // Available count just dropped by one for this product/kind — reflect
      // it immediately rather than waiting for a full pool reload.
      setAvailable((a) => ({ ...a, [row.item.code]: { ...a[row.item.code], [res.kind]: Math.max(0, (a[row.item.code]?.[res.kind] || 0) - 1) } }));
      showToast(`Scanned ${res.code} — ${res.productName}`, 'g');
      // FIFO guidance from the backend (res.fifoNote) is deliberately not
      // surfaced here anymore — it was a non-blocking suggestion, but it
      // showed up too often to be useful in practice and just added noise.
      // Auto-close ONLY the camera once this row's full pending pcs is
      // reached — the sheet itself stays open (closed manually), but
      // there's no more scanning left to do for this row, so the camera
      // stops itself rather than sitting there uselessly running. Checked
      // in pcs, not outer/inner counts, since either kind (or a mix) can
      // complete the order now — an outer/inner-count check would be wrong
      // as soon as the two share one budget instead of each having a fixed target.
      const nextPcs = nextOuters * row.item.cartonOuter + nextInners * row.item.cartonInner;
      if (nextPcs >= row.item.pendingPcs) {
        setCameraRow((c) => (c === row.key ? null : c));
      }
    } catch (err) { showToast(err.message, 'err'); }
    finally { setScanningRow(null); }
  }

  async function splitCarton() {
    if (!splitTarget) return;
    // Permanent and one-way — confirm explicitly, since this button sits
    // right next to Add scan/Stop camera and an accidental tap previously
    // split a carton nobody meant to split.
    if (!confirm(`Split ${splitTarget.code} into inner cartons? This cannot be undone.`)) return;
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
  const activeRowScans = activeScanRow ? scannedCodes.filter((s) => s.ownerKey === activeScanRow.key) : []; // this row's scanned cartons, each individually removable in the sheet

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
                const avail = r.avail;
                const canScan = r.canScan;
                return (
                  <tr key={r.key}>
                    <td>
                      {/* A real, native checkbox — clickable whenever this
                          product has QR stock available, disabled
                          otherwise. Checking it stages a manual selection
                          (no scan required) capped at real physical stock
                          (row.max already factors this in); the Scan
                          button below is still there too, for whoever
                          prefers to scan instead — the two aren't
                          mutually exclusive, scanning just adds to
                          whatever count is already staged. */}
                      <input
                        type="checkbox"
                        checked={r.checked}
                        disabled={!canScan}
                        onChange={() => toggle(r)}
                        title={!canScan ? 'No QR stock available for this product' : r.checked ? 'Uncheck to clear this row' : 'Check to select this row'}
                      />
                    </td>
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
                      ) : <b>{r.suggested.outers}</b>}
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
                      ) : <b>{r.suggested.inners}</b>}
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
                        {/* Outer and inner are never blended into one merged
                            number here — shown as separate counts, only
                            including whichever kind actually has stock. */}
                        📷 {canScan ? `Scan (${availLabel(avail)} in stock)` : 'No stock to scan'}
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
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--spruce)', marginTop: 2 }}>
                    {activeRowScans.reduce((sum, s) => sum + (s.kind === 'outer' ? activeScanRow.item.cartonOuter : activeScanRow.item.cartonInner), 0)} / {activeScanRow.item.pendingPcs} pcs scanned
                  </div>
                </div>
                <button type="button" className="btn o sm" onClick={closeScan}>✕ Close</button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); submitScan(activeScanRow, scanValue.trim()); }} className="btnrow" style={{ flexWrap: 'wrap' }}>
                <input
                  autoFocus placeholder={`Type a carton code for ${activeScanRow.item.name}`}
                  value={scanValue} onChange={(e) => setScanValue(e.target.value)}
                  disabled={cameraRow === activeScanRow.key}
                  style={{ minWidth: 220, flex: 1 }}
                />
                <button type="submit" className="btn sm" disabled={scanningRow === activeScanRow.key || cameraRow === activeScanRow.key}>{scanningRow === activeScanRow.key ? 'Checking…' : 'Add scan'}</button>
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
                <div style={{ maxWidth: 300, margin: '0 auto' }}>
                  <CameraScanner
                    onScan={(code) => submitScan(activeScanRow, code)}
                    onError={(msg) => { showToast(msg, 'err'); setCameraRow(null); }}
                    onClose={() => setCameraRow(null)}
                  />
                </div>
              )}
              {/* Every carton scanned into THIS row, each individually
                  removable — a fixed-height scrollable box so the sheet
                  itself never grows taller as more get scanned. */}
              {activeRowScans.length > 0 && (
                <div style={{ marginTop: 10, maxHeight: 110, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
                  {activeRowScans.map((entry, i) => (
                    <div
                      key={entry.code}
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: i < activeRowScans.length - 1 ? '1px solid var(--line)' : 'none' }}
                    >
                      <span className="mono" style={{ fontSize: 12 }}>{entry.code} <span className="muted" style={{ fontSize: 10 }}>({entry.kind})</span></span>
                      <button type="button" className="btn o sm rd" onClick={() => removeScannedEntry(activeScanRow, entry)}>✕ Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

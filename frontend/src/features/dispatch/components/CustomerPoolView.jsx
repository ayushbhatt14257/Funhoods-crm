import { useEffect, useMemo, useRef, useState } from 'react';
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

// Same scan-speed heuristic as Stock In's ScanStockIn.jsx — a hardware
// scanner "types" a whole code in a handful of milliseconds, far faster
// than anyone can type by hand, so once the average gap between the last
// several keystrokes drops under SCAN_SPEED_MS this is almost certainly a
// finished scan and gets auto-submitted the moment typing pauses, with no
// Enter or button click needed. Genuine manual typing (slower gaps) is
// left alone and still needs Enter / the Add scan button.
const SCAN_SPEED_MS = 30;
const AUTO_SUBMIT_DEBOUNCE_MS = 120;

// scannedCodes/onScannedCodesChange is lifted up to Dispatch.jsx (same way
// selection is) so the raw list of scanned carton codes survives up to the
// final dispatch submit — that's what actually gets locked in as
// "dispatched" once the Dispatch button is pressed, not before.
export default function CustomerPoolView({ pool, selection, onSelectionChange, scannedCodes, onScannedCodesChange }) {
  const { showToast } = useToast();
  const [q, setQ] = useState('');
  const [available, setAvailable] = useState({}); // product code -> { outer, inner } in_stock counts

  // ONE continuous scan box for the whole party — replaces the old
  // per-row "open a scanner for this line" flow. Any carton scanned here
  // (outer or inner, any product in the order) is looked up without a
  // product filter and auto-matched against whichever pending row it
  // belongs to; the manual checkbox/typed-qty path below is untouched and
  // still available as a fallback for stock the scan system doesn't know about.
  const [globalScanValue, setGlobalScanValue] = useState('');
  const [globalCameraOn, setGlobalCameraOn] = useState(false);
  const [scanLog, setScanLog] = useState([]); // most-recent-first feed of every scan attempt, matched or not
  // Which row a successful scan just landed on — briefly highlighted and
  // scrolled into view, so on a long confirmed-items list (dozens of rows,
  // this order's own row often well below the fold) it's obvious at a
  // glance which product just got ticked off without hunting for it.
  const [flashRowKey, setFlashRowKey] = useState(null);
  const flashTimerRef = useRef(null);
  const rowElsRef = useRef({}); // rowKey -> <tr> DOM node, set via ref callback below

  // Fast-scan queueing — same pattern as Stock In's ScanStockIn.jsx: never
  // block/disable the input while a lookup is in flight (a scanner gun's
  // next keystrokes would otherwise be silently dropped), just push every
  // scan into a queue and drain it one at a time so lookups never race.
  const pendingScansRef = useRef([]);
  const processingRef = useRef(false);
  const [pendingCount, setPendingCount] = useState(0);
  const lastSubmittedRef = useRef('');
  const keyTimesRef = useRef([]); // recent keystroke timestamps, for scan-speed detection
  const autoTimerRef = useRef(null); // debounce timer for the auto-submit-on-pause check
  const rowsRef = useRef([]); // kept in sync below — processQueue reads the latest rows without needing them in its closure
  const selectionRef = useRef(selection);
  const scannedCodesRef = useRef(scannedCodes);
  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => { scannedCodesRef.current = scannedCodes; }, [scannedCodes]);
  // Clean up any pending debounce timer on unmount so it never fires after
  // this screen's been navigated away from.
  useEffect(() => () => { if (autoTimerRef.current) clearTimeout(autoTimerRef.current); }, []);
  useEffect(() => () => { if (flashTimerRef.current) clearTimeout(flashTimerRef.current); }, []);

  // Scrolls the matched row into view and briefly highlights it. Search
  // (q) must never hide a row a scan just matched — if the current search
  // text would filter it out, clear the search so the row (and the
  // highlight) actually appear.
  function flashRow(key) {
    const row = rowsRef.current.find((r) => r.key === key); // rowsRef holds allRows (unfiltered)
    if (row) {
      const needle = q.toLowerCase();
      const matchesSearch = !q || row.item.name.toLowerCase().includes(needle) || row.item.code.toLowerCase().includes(needle);
      if (!matchesSearch) setQ('');
    }
    setFlashRowKey(key);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashRowKey((k) => (k === key ? null : k)), 1800);
    // Deferred to the next tick so the row is guaranteed to already be in
    // the DOM (React commits the checkbox/qty update from this same scan,
    // and any search-clearing re-render above, before this runs).
    setTimeout(() => {
      rowElsRef.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 0);
  }

  // allRows = every pending row regardless of the search box — this is
  // what the global scan box matches a scanned carton against, since
  // typing something into search shouldn't make a row un-scannable.
  // rows (below) is the filtered, on-screen subset for the table itself.
  const allRows = useMemo(() => {
    return (pool?.items || [])
      .map((it) => {
        const key = rowKey(it);
        const override = selection[key];
        const checked = !!override;
        const avail = available[it.code] || { outer: 0, inner: 0 };
        // The scan button (a real physical carton must exist to be found by
        // its code) still needs the real tracked count — that's canScanPhysical.
        const canScanPhysical = avail.outer > 0 || avail.inner > 0;
        // The checkbox/manual-quantity path, on the other hand, is NOT
        // gated on tracked stock right now — the carton-tracking counts are
        // known to be unreliable/incomplete while stock is being migrated
        // onto the scan system, even though the warehouse physically has
        // stock of most things. So any row with a real order behind it can
        // be selected and dispatched manually (typing outer/inner), without
        // waiting for that stock to be scanned in first. Scanning itself is
        // untouched — it still only works against real, tracked cartons.
        const canSelect = it.pendingPcs > 0 && (it.cartonOuter > 0 || it.cartonInner > 0);
        // Bold default before the row is checked: since manual selection no
        // longer depends on tracked stock, show the real ordered split
        // (outer-first, unlimited) rather than a stock-capped guess that
        // would read as "0" for anything not yet scanned in.
        const suggested = defaultSplit(it.pendingPcs, it.cartonOuter, it.cartonInner);
        // The dealer's actual ordered split, WITHOUT the stock cap —
        // separate from `suggested` above on purpose. `suggested` (and the
        // bold Outer/Inner numbers it feeds) answers "how much CAN I
        // dispatch right now", which is legitimately 0 when there's no
        // stock — but that made a genuinely-ordered, just out-of-stock
        // product look identical to one that was never ordered at all.
        // `ordered` always shows the real booked quantity regardless of
        // what's on the shelf, so "No stock to scan" reads as a stock
        // problem, not as "nothing was ordered".
        const ordered = defaultSplit(it.pendingPcs, it.cartonOuter, it.cartonInner);
        // The real, shared-pcs-budget ceiling given whatever is currently
        // selected — recalculates every render, so it's never possible to
        // exceed pendingPcs regardless of which mix of outer/inner got you
        // there, and clamps defensively if the pool refreshed and
        // pendingPcs shrank since this override was chosen.
        const currentOuters = checked ? override.outers : 0;
        const currentInners = checked ? override.inners : 0;
        const pcsMax = roomFor(it.pendingPcs, it.cartonOuter, it.cartonInner, currentOuters, currentInners);
        // Manual typing is capped only by the order's own pcs budget for
        // now, NOT by tracked physical stock (see canSelect above) — the
        // warehouse has real stock the scan system doesn't know about yet.
        // A scan is still separately, independently safe regardless of this
        // (forDispatch always checks the real carton server-side), so
        // nothing here weakens scan-based dispatch.
        const max = pcsMax;
        const outers = checked ? Math.min(currentOuters, max.outers) : Math.min(suggested.outers, max.outers);
        const inners = checked ? Math.min(currentInners, max.inners) : Math.min(suggested.inners, max.inners);
        return { item: it, key, max, suggested, ordered, outers, inners, checked, avail, canScanPhysical, canSelect };
      });
  }, [pool, selection, available]);
  const rows = useMemo(() => {
    if (!q) return allRows;
    const needle = q.toLowerCase();
    return allRows.filter((r) => r.item.name.toLowerCase().includes(needle) || r.item.code.toLowerCase().includes(needle));
  }, [allRows, q]);
  useEffect(() => { rowsRef.current = allRows; }, [allRows]);

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

  // Undoes exactly one scanned carton: drops the row's count by one (of
  // whichever kind that carton was), puts it back as available, and
  // removes it from the scanned list — the mirror image of a successful scan.
  function removeScannedEntry(entry) {
    onScannedCodesChange(scannedCodes.filter((s) => s !== entry));
    setAvailable((a) => ({ ...a, [entry.productCode]: { ...a[entry.productCode], [entry.kind]: (a[entry.productCode]?.[entry.kind] || 0) + 1 } }));
    const current = selection[entry.ownerKey] || { outers: 0, inners: 0 };
    const outers = entry.kind === 'outer' ? Math.max(0, current.outers - 1) : current.outers;
    const inners = entry.kind === 'inner' ? Math.max(0, current.inners - 1) : current.inners;
    if (outers === 0 && inners === 0) {
      // Back to nothing scanned — uncheck entirely rather than leaving a
      // {outers:0, inners:0} override, which would show as checked-but-
      // sending-nothing (the exact confusing state fixed once already).
      const next = { ...selection };
      delete next[entry.ownerKey];
      onSelectionChange(next);
    } else {
      onSelectionChange({ ...selection, [entry.ownerKey]: { outers, inners } });
    }
  }

  function pushLog(entry) {
    setScanLog((log) => [{ id: `${Date.now()}-${Math.random()}`, ...entry }, ...log].slice(0, 60));
  }

  // Auto-matches a looked-up carton to the one pending row it belongs to.
  // A product can appear as more than one row (two different negotiated
  // rates), so ties are broken FIFO — whichever row's order was confirmed
  // earliest gets first claim — and a row that's already at its shared
  // outer/inner budget (room 0 for this carton's kind) is skipped in favor
  // of one that still has room, rather than blocking the scan on a
  // technicality the dispatcher can't see from the carton itself.
  function matchRow(productCode, kind) {
    const candidates = rowsRef.current
      .filter((r) => r.item.code === productCode)
      .sort((a, b) => new Date(a.item.lastConfirmedAt) - new Date(b.item.lastConfirmedAt));
    if (!candidates.length) return null;
    const withRoom = candidates.find((r) => {
      const current = selectionRef.current[r.key] || { outers: 0, inners: 0 };
      return kind === 'outer' ? current.outers < r.max.outers : current.inners < r.max.inners;
    });
    return withRoom || candidates[0];
  }

  // The actual per-scan work, run one at a time by processQueue below.
  // Mirrors the old per-row submitScan, but the row is auto-matched from
  // the carton's own product instead of being passed in, and every
  // outcome (matched, wrong product, duplicate, overscan, box-opened) is
  // appended to the running scan log rather than a one-off toast, since
  // several scans can land faster than a toast can be read.
  async function processOneScan(code) {
    if (scannedCodesRef.current.some((s) => s.code === code)) {
      pushLog({ code, status: 'err', message: 'Already scanned into this dispatch' });
      return;
    }
    let res;
    try {
      res = await barcodeApi.forDispatch(code, pool.dealer.code);
    } catch (err) {
      pushLog({ code, status: 'err', message: err.message });
      return;
    }
    const row = matchRow(res.product, res.kind);
    if (!row) {
      pushLog({ code, status: 'err', message: `${res.productName} isn't part of this party's pending order (or is already fully covered).` });
      return;
    }
    const current = selectionRef.current[row.key] || { outers: 0, inners: 0 };
    let nextOuters = current.outers, nextInners = current.inners;
    if (res.kind === 'outer') {
      if (current.outers >= row.max.outers) {
        // This exact outer doesn't fit what's left on this order — simply
        // rejected, nothing more to do with it here (no split offered —
        // splitting a sealed outer just to force-fit it isn't something
        // this flow does anymore; scan an inner instead, or use the manual
        // checkbox/typed-qty fallback below).
        pushLog({ code, status: 'err', message: `${row.item.name} — this outer doesn't fit what's left on the order.`, productName: res.productName });
        return;
      }
      nextOuters = current.outers + 1;
    } else {
      if (current.inners >= row.max.inners) {
        pushLog({ code, status: 'err', message: `Already at the max inner count for ${row.item.name}`, productName: res.productName });
        return;
      }
      nextInners = current.inners + 1;
    }
    onSelectionChange({ ...selectionRef.current, [row.key]: { outers: nextOuters, inners: nextInners } });
    onScannedCodesChange([...scannedCodesRef.current, { code: res.code, ownerKey: row.key, kind: res.kind, productCode: row.item.code }]);
    setAvailable((a) => ({ ...a, [row.item.code]: { ...a[row.item.code], [res.kind]: Math.max(0, (a[row.item.code]?.[res.kind] || 0) - 1) } }));
    // The cascade (opening a sealed outer to fulfil a partial inner order)
    // is a real thing that happens server-side when needed, but it's an
    // implementation detail, not something the dispatcher needs to parse —
    // every successful scan reads the same plain way regardless of whether
    // it triggered one, so the log never sounds like stock is appearing
    // from nowhere right after a dispatch.
    const nextPcs = nextOuters * row.item.cartonOuter + nextInners * row.item.cartonInner;
    pushLog({ code, status: 'ok', message: `${row.item.name} — ${nextPcs}/${row.item.pendingPcs} pcs now staged`, productName: res.productName });
    flashRow(row.key);
  }

  function onGlobalScanKeyDown() {
    keyTimesRef.current.push(performance.now());
    if (keyTimesRef.current.length > 24) keyTimesRef.current.shift();
  }
  function onGlobalScanChange(e) {
    const val = e.target.value;
    setGlobalScanValue(val);
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current);
    autoTimerRef.current = setTimeout(() => maybeAutoSubmit(val), AUTO_SUBMIT_DEBOUNCE_MS);
  }
  // Same heuristic as ScanStockIn.jsx: if the last several keystrokes came
  // in far faster than anyone can type by hand, this is a finished scan —
  // submit it the moment typing pauses, with no Enter or click needed.
  function maybeAutoSubmit(val) {
    const trimmed = val.trim();
    const times = keyTimesRef.current;
    if (trimmed.length < 4 || times.length < 4 || trimmed === lastSubmittedRef.current) return;
    const recentTimes = times.slice(-trimmed.length);
    let totalGap = 0, gaps = 0;
    for (let i = 1; i < recentTimes.length; i++) { totalGap += recentTimes[i] - recentTimes[i - 1]; gaps++; }
    const avgGap = gaps ? totalGap / gaps : Infinity;
    if (avgGap <= SCAN_SPEED_MS) {
      keyTimesRef.current = [];
      scanCode(val);
    }
    // Slower than that = real typing; leave it for Enter / the Add scan button.
  }

  function scanCode(rawCode) {
    const scanned = String(rawCode || '').trim();
    if (!scanned) return;
    if (autoTimerRef.current) { clearTimeout(autoTimerRef.current); autoTimerRef.current = null; }
    lastSubmittedRef.current = scanned;
    setTimeout(() => { if (lastSubmittedRef.current === scanned) lastSubmittedRef.current = ''; }, 0);
    setGlobalScanValue('');
    keyTimesRef.current = [];
    pendingScansRef.current.push(scanned);
    setPendingCount(pendingScansRef.current.length);
    if (!processingRef.current) processQueue();
  }
  async function processQueue() {
    processingRef.current = true;
    while (pendingScansRef.current.length) {
      const next = pendingScansRef.current[0];
      await processOneScan(next);
      pendingScansRef.current.shift();
      setPendingCount(pendingScansRef.current.length);
    }
    processingRef.current = false;
  }

  const grandTotal = rows.reduce((sum, r) => {
    if (!r.checked) return sum;
    const pcs = r.outers * r.item.cartonOuter + r.inners * r.item.cartonInner;
    const gross = r.item.rate + (r.item.rate * r.item.gstPct) / 100;
    return sum + gross * pcs;
  }, 0);
  const anySelected = rows.some((r) => r.checked);
  // scannedCodes is shared with GiftingStep (gift scans use ownerKey
  // `gift:<id>`, never a real rowKey) — this view only owns/displays the
  // entries it actually scanned in, against a real pending row.
  const rowKeySet = new Set(allRows.map((r) => r.key));
  const rowScannedCodes = scannedCodes.filter((s) => rowKeySet.has(s.ownerKey));

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Confirmed items — {pool.dealer.name}</h3>
        <input placeholder="Search item" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
      </div>

      {/* ONE continuous scan box for the whole party — scan any carton
          (outer or inner, any product on this order) and it's auto-matched
          against the row it belongs to below. No per-row scanner to open. */}
      <div style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 12, marginBottom: 14, background: 'var(--paper-d)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>📷 Scan cartons for this dispatch</div>
          {pendingCount > 0 && <div className="muted" style={{ fontSize: 12 }}>Looking up… {pendingCount} more queued</div>}
        </div>
        {/* No submit button needed for a real scan — every scan lands and
            processes itself the instant the scanner gun finishes "typing"
            it (see maybeAutoSubmit). Enter/the Add scan button stay as the
            fallback for someone typing a code in by hand. */}
        <form onSubmit={(e) => { e.preventDefault(); scanCode(globalScanValue); }} className="btnrow" style={{ flexWrap: 'wrap' }}>
          <input
            autoFocus placeholder="Scan or type any carton code — any product on this order"
            value={globalScanValue} onChange={onGlobalScanChange} onKeyDown={onGlobalScanKeyDown}
            disabled={globalCameraOn}
            style={{ minWidth: 240, flex: 1 }}
          />
          <button type="submit" className="btn sm" disabled={globalCameraOn}>Add scan</button>
          {globalCameraOn ? (
            <button type="button" className="btn o sm rd" onClick={() => setGlobalCameraOn(false)}>Stop camera</button>
          ) : (
            <button type="button" className="btn o sm" onClick={() => setGlobalCameraOn(true)}>📷 Open camera</button>
          )}
        </form>
        {globalCameraOn && (
          <div style={{ maxWidth: 300, margin: '10px auto 0' }}>
            <CameraScanner
              onScan={(code) => scanCode(code)}
              onError={(msg) => { showToast(msg, 'err'); setGlobalCameraOn(false); }}
              onClose={() => setGlobalCameraOn(false)}
            />
          </div>
        )}
        {scanLog.length > 0 && (
          <div style={{ marginTop: 10, maxHeight: 160, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--white)' }}>
            {scanLog.map((entry, i) => (
              <div
                key={entry.id}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderBottom: i < scanLog.length - 1 ? '1px solid var(--line)' : 'none',
                  background: entry.status === 'err' ? 'rgba(220,50,50,0.06)' : 'transparent',
                }}
              >
                <span style={{ fontSize: 12 }}>
                  <span className="mono">{entry.code}</span>{' '}
                  {entry.status === 'err' ? '✕' : '✓'} {entry.message}
                </span>
              </div>
            ))}
          </div>
        )}
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
                const canScan = r.canScanPhysical;
                return (
                  <tr
                    key={r.key}
                    ref={(el) => { if (el) rowElsRef.current[r.key] = el; else delete rowElsRef.current[r.key]; }}
                    style={r.key === flashRowKey ? { background: 'rgba(240,200,60,0.35)', transition: 'background 0.3s' } : undefined}
                  >
                    <td>
                      {/* A real, native checkbox — clickable whenever this
                          product has a real order behind it, regardless of
                          tracked stock (see canSelect above; the barcode
                          stock counts are unreliable while stock is being
                          migrated onto scanning). Checking it stages a
                          manual selection (no scan required), capped only
                          by the order's own pcs budget (row.max). The Scan
                          button below still requires a real tracked carton
                          — the two aren't mutually exclusive, scanning just
                          adds to whatever count is already staged. */}
                      <input
                        type="checkbox"
                        checked={r.checked}
                        disabled={!r.canSelect}
                        onChange={() => toggle(r)}
                        title={!r.canSelect ? 'Nothing ordered for this product' : r.checked ? 'Uncheck to clear this row' : 'Check to select this row'}
                      />
                    </td>
                    <td>{r.item.photo ? <img src={r.item.photo} alt="" style={{ width: 30, height: 30, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{r.item.code}</td>
                    {/* Sticky so scrolling right to reach Outer/Inner/Scan on a
                        narrow phone never loses sight of WHICH product this
                        row is — this is the actual fix for "which item am I
                        scanning" now, at the source, instead of only
                        repeating the name inside the scan sheet below. */}
                    <td style={{ position: 'sticky', left: 0, background: 'var(--white)', zIndex: 1, boxShadow: '2px 0 6px rgba(0,0,0,0.08)' }}>
                      <b>{r.item.name}</b>
                      {/* The dealer's real booked quantity, independent of stock — so a
                          product genuinely ordered but out of stock doesn't look like it
                          was never ordered at all (both used to show a plain 0). */}
                      {(r.ordered.outers > 0 || r.ordered.inners > 0) && (
                        <div className="muted" style={{ fontSize: 10.5, marginTop: 2 }}>
                          Ordered: {r.ordered.outers > 0 && `${r.ordered.outers} outer`}
                          {r.ordered.outers > 0 && r.ordered.inners > 0 && ', '}
                          {r.ordered.inners > 0 && `${r.ordered.inners} inner`}
                        </div>
                      )}
                    </td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{new Date(r.item.lastConfirmedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>
                      {r.checked ? (
                        <input
                          type="number" min={0} max={r.max.outers} value={r.outers}
                          onChange={(e) => setOuters(r, e.target.value)}
                          style={{ width: 60 }}
                        />
                      ) : (
                        // Suggested now always equals the real ordered split
                        // (see defaultSplit above) since manual selection is
                        // no longer stock-capped — just show it plainly.
                        <b>{r.suggested.outers}</b>
                      )}
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
                      ) : (
                        <b>{r.suggested.inners}</b>
                      )}
                      {r.item.cartonInner > 0 && (
                        <div className="muted" style={{ fontSize: 10 }}>
                          {r.checked ? `of ${r.max.inners} · ` : ''}× {r.item.cartonInner} pcs
                        </div>
                      )}
                    </td>
                    <td>{r.item.rate}</td>
                    <td>{r.item.gstPct}</td>
                    <td>{Math.round(lineTotal).toLocaleString('en-IN')}</td>
                    <td className="muted" style={{ fontSize: 11 }}>
                      {/* Purely informational now — scanning happens in the
                          one global box above, not per row. Outer/inner are
                          never blended into one merged number here. */}
                      {canScan ? `${availLabel(avail)} in stock` : 'No tracked stock'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Every carton scanned into a pending ROW so far (gift scans are a
          separate list, owned and shown by GiftingStep below — scannedCodes
          is shared state, but only row-owned entries are ours to remove
          here), each individually removable — the global-box equivalent of
          the old per-row "scanned into this row" list. */}
      {rowScannedCodes.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 4 }}>{rowScannedCodes.length} carton(s) scanned into this dispatch:</div>
          <div style={{ maxHeight: 140, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8 }}>
            {rowScannedCodes.map((entry, i) => (
              <div
                key={entry.code}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px', borderBottom: i < rowScannedCodes.length - 1 ? '1px solid var(--line)' : 'none' }}
              >
                <span className="mono" style={{ fontSize: 12 }}>{entry.code} <span className="muted" style={{ fontSize: 10 }}>({entry.kind} · {entry.productCode})</span></span>
                <button type="button" className="btn o sm rd" onClick={() => removeScannedEntry(entry)}>✕ Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {anySelected && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 15, fontWeight: 700 }}>
          Grand Total: ₹{Math.round(grandTotal).toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
}

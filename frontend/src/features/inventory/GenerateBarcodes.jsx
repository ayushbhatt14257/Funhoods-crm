import { Fragment, useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import ProductPickerModal from '../pi/components/ProductPickerModal';
import { barcodeApi } from './barcodeApi';

// admin/masterAdmin only. qrcode is loaded lazily (dynamic import) so it
// doesn't sit in the main app bundle for everyone who never opens this screen.
//
// Mirrors the backend's EVER_STOCKED/NOT_STOCKED groupings (barcodeController.js)
// — 'used' was the only "stocked in" status before the outward-scanning
// lifecycle existed; a freshly-scanned carton is now 'in_stock', and one
// that's since moved on is 'dispatched' or 'split'. Checking only
// `status === 'used'` here (a leftover from before that change) meant a
// perfectly correctly-scanned carton showed as "Unscanned" — the aggregate
// counts elsewhere on this page were already fixed, just not these three
// spots that inspect individual cartons directly.
function everStockedIn(status) { return status === 'in_stock' || status === 'used' || status === 'dispatched' || status === 'split'; }
// Per-status badge — 'split' used to fall under the generic "Scanned" label
// (via everStockedIn above) same as an ordinary in-stock/dispatched carton,
// which is exactly what made a split outer indistinguishable from its own
// inner children in the batch detail table. This gives it its own label and
// color so the parent row reads as "Split" and the table below can tell
// parents and children apart at a glance.
function statusBadge(status) {
  if (status === 'split') return { label: 'Split', cls: 'p' };
  if (status === 'dispatched') return { label: 'Dispatched', cls: 'r' };
  if (everStockedIn(status)) return { label: 'Scanned', cls: 'g' };
  return { label: 'Unscanned', cls: 'y' };
}
//
// PRINT LAYOUT NOTES (for whoever tunes this next time the label stock changes):
// Straight landscape slip, 100mm wide x 70mm tall, one per page, no rotation
// needed — the roll feeds this shape directly. Content top to bottom: product
// name, product code, quantity, QR code, then the readable carton code. All
// the tunable numbers live in the CSS custom properties at the top of the
// <style> block below. Print a test sheet after any change.
//
// QR over barcode: switched from a CODE128 barcode to a QR code because a
// phone camera locks onto a QR's finder pattern almost instantly from any
// angle, where a 1D barcode needs careful axis alignment — that's the actual
// fix for "takes forever to scan". High error correction (see below) also
// means a QR keeps scanning even if part of it is dirty, smudged, or torn,
// which a barcode (zero error correction) cannot do at all — worth having
// given cartons will pick up wear over time in the warehouse.
export default function GenerateBarcodes() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [tab, setTab] = useState('generate'); // 'generate' | 'track'

  // --- Generate tab ---
  const [products, setProducts] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [product, setProduct] = useState(null);
  const [cartonCount, setCartonCount] = useState(50);
  const [qtyOverride, setQtyOverride] = useState('');
  const [batch, setBatch] = useState(null); // { batchId, product, qty, cartons }
  const [generating, setGenerating] = useState(false);
  const [recentBatches, setRecentBatches] = useState(null); // null = loading
  const [recentLimit, setRecentLimit] = useState(10);
  const [recentHasMore, setRecentHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [deletingBatch, setDeletingBatch] = useState(null); // batchId currently being deleted

  // --- Track tab ---
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [trackProduct, setTrackProduct] = useState(null);
  const [trackData, setTrackData] = useState(null); // { product, summary, batches }
  const [trackLoading, setTrackLoading] = useState(false);
  const [openBatch, setOpenBatch] = useState(null); // batchId currently expanded
  const [openBatchDetail, setOpenBatchDetail] = useState(null); // full carton list for openBatch
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFilter, setDetailFilter] = useState('all'); // 'all' | 'used' | 'unused'
  const [codeSearch, setCodeSearch] = useState('');
  const [codeSearchResults, setCodeSearchResults] = useState(null); // array of matches, or null before a search runs
  const [codeSearchSelected, setCodeSearchSelected] = useState(null); // one picked from codeSearchResults (or auto-picked if only 1)
  const [codeSearchLoading, setCodeSearchLoading] = useState(false);
  const [highlightBatch, setHighlightBatch] = useState(null); // batchId to visually flash after jumping to it
  const batchRowRefs = useRef(new Map()); // batchId -> <tr> element, so a search result can scroll straight to its row
  const [fixingInnerQty, setFixingInnerQty] = useState(false);

  useEffect(() => { api.get('/products').then(setProducts); }, []);
  useEffect(() => { loadRecentBatches(); }, []);

  function loadRecentBatches(limit = 10) {
    barcodeApi.getRecentBatches(limit).then((rows) => {
      setRecentBatches(rows);
      setRecentLimit(limit);
      setRecentHasMore(rows.length >= limit); // heuristic: got a full page, there's likely more
    }).catch(() => setRecentBatches([]));
  }

  function loadMoreBatches() {
    const next = recentLimit + 10;
    setLoadingMore(true);
    barcodeApi.getRecentBatches(next)
      .then((rows) => { setRecentBatches(rows); setRecentLimit(next); setRecentHasMore(rows.length >= next); })
      .catch((err) => showToast(err.message, 'err'))
      .finally(() => setLoadingMore(false));
  }

  // masterAdmin only. Only succeeds server-side if every carton in the
  // batch is still unused (a genuine "generated by mistake" cleanup) — the
  // backend refuses if any have been scanned in or dispatched, since that
  // would silently destroy real stock/dispatch history rather than just
  // undo a mistaken batch.
  async function deleteBatchRow(b) {
    if (!confirm(`Delete this batch of ${b.cartons} QR code(s) for ${b.productName}? Any already scanned-in stock will be reversed automatically. Refused if any have already been dispatched to a customer. Cannot be undone.`)) return;
    setDeletingBatch(b.batchId);
    try {
      const res = await barcodeApi.deleteBatch(b.batchId);
      showToast(res.message, 'g');
      loadRecentBatches(recentLimit);
      if (trackProduct) loadTrack(trackProduct); // Track tab shows its own separate batch list for this product
      if (openBatch === b.batchId) { setOpenBatch(null); setOpenBatchDetail(null); }
    } catch (err) { showToast(err.message, 'err'); }
    finally { setDeletingBatch(null); }
  }

  // Finds cartons by a PARTIAL code fragment — this used to require the
  // FULL exact code (a plain findOne), which meant a fragment like
  // "D510F9" (e.g. read off a worn label, or just the memorable tail of a
  // split child's code) never matched anything. Now does a substring search
  // (backend: searchCartons), scoped to the already-picked product when
  // there is one — both to match what the person almost always wants and
  // to keep a short fragment from colliding across unrelated products.
  async function searchByCode(e) {
    e.preventDefault();
    const code = codeSearch.trim();
    if (!code) return;
    setCodeSearchLoading(true);
    setCodeSearchResults(null);
    setCodeSearchSelected(null);
    try {
      const res = await barcodeApi.search(code, { product: trackProduct?.code });
      setCodeSearchResults(res);
      // Only one match — skip the picklist and go straight to the detail card.
      if (res.length === 1) setCodeSearchSelected(res[0]);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setCodeSearchLoading(false); }
  }

  async function reprintSearchResult() {
    if (!codeSearchSelected) return;
    setBatch({
      product: { name: codeSearchSelected.productName, code: codeSearchSelected.product },
      qty: codeSearchSelected.qty,
      cartons: [{ code: codeSearchSelected.code, qty: codeSearchSelected.qty, createdAt: codeSearchSelected.createdAt }],
    });
  }


  // ready. Re-runs whenever a new batch comes in. Nothing here is ever shown
  // on screen (see .silent-print below) — every generate/reprint goes
  // straight to the print dialog the moment the QR codes finish drawing;
  // printing any earlier would print blank/undrawn canvases.
  useEffect(() => {
    if (!batch) return;
    (async () => {
      const QRCode = (await import('qrcode')).default;
      batch.cartons.forEach((c) => {
        const canvas = document.getElementById(`qr-${c.code}`);
        // errorCorrectionLevel 'H' (~30% of the code can be damaged/dirty and
        // it still scans) — the whole point of moving to QR was resilience
        // against exactly that, so this is intentionally the highest level
        // rather than the library's 'M' default.
        if (canvas) {
          QRCode.toCanvas(canvas, c.code, { errorCorrectionLevel: 'H', width: 400, margin: 1 });
          // qrcode's canvas renderer sets canvas.style.width/height inline to
          // match the "width" option above (400px) — inline styles always
          // beat an external stylesheet rule no matter how specific, so this
          // silently overrode .label-qr's 34mm and made the QR balloon to
          // fill the whole label. Clearing it here lets .label-qr's CSS size
          // take over for display, while the canvas keeps its sharp 400px
          // internal resolution for print.
          canvas.style.width = '';
          canvas.style.height = '';
        }
      });
      printLabels();
    })();
  }, [batch]);

  async function generate() {
    if (!product) return showToast('Pick a product', 'err');
    if (!cartonCount || cartonCount < 1) return showToast('Enter how many cartons', 'err');
    setGenerating(true);
    try {
      const res = await barcodeApi.generateBatch(product.code, +cartonCount, qtyOverride ? +qtyOverride : undefined);
      setBatch(res);
      showToast(`Generated ${res.cartons.length} barcodes — printing…`, 'g');
      loadRecentBatches(recentLimit); // so the new batch shows up in the history right away, keeping however many rows were already loaded
    } catch (err) { showToast(err.message, 'err'); }
    finally { setGenerating(false); }
  }

  // Renders off-screen always (see .silent-print) — nothing here is ever
  // shown in the app itself, generate/reprint both go straight to the
  // browser's print dialog with no visible preview first.
  function printLabels() { window.print(); }

  // --- Track tab logic ---
  async function loadTrack(p) {
    setTrackProduct(p);
    setShowTrackPicker(false);
    setOpenBatch(null);
    setOpenBatchDetail(null);
    setTrackData(null);
    setTrackLoading(true);
    try {
      const res = await barcodeApi.getByProduct(p.code);
      setTrackData(res);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setTrackLoading(false); }
  }

  async function toggleBatch(batchId) {
    if (openBatch === batchId) { setOpenBatch(null); setOpenBatchDetail(null); return; }
    setOpenBatch(batchId);
    setOpenBatchDetail(null);
    setDetailFilter('all');
    setDetailLoading(true);
    try {
      const res = await barcodeApi.getBatch(batchId);
      setOpenBatchDetail(res);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setDetailLoading(false); }
  }

  // Opens a specific batch (always open, never toggles closed — unlike
  // toggleBatch above, which a fresh "jump here" click shouldn't accidentally
  // collapse), scrolls its row into view, and briefly flashes it so it's
  // obvious which row the search result actually landed on.
  async function openBatchAndScroll(batchId) {
    if (openBatch !== batchId) {
      setOpenBatch(batchId);
      setOpenBatchDetail(null);
      setDetailFilter('all');
      setDetailLoading(true);
      try {
        const res = await barcodeApi.getBatch(batchId);
        setOpenBatchDetail(res);
      } catch (err) { showToast(err.message, 'err'); }
      finally { setDetailLoading(false); }
    }
    setHighlightBatch(batchId);
    setTimeout(() => setHighlightBatch(null), 1800);
    // Deferred so it runs after the newly-expanded detail row has actually
    // been added to the DOM — scrolling on the same tick can land short.
    setTimeout(() => {
      batchRowRefs.current.get(batchId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  }

  // A search result belongs to a specific product's batch — if the Track
  // tab isn't already showing that product (or nothing's picked yet), switch
  // to it first, then jump straight to the batch and scroll/highlight it.
  async function goToSearchResultBatch(carton) {
    if (!carton.batchId) return;
    if (!trackProduct || trackProduct.code !== carton.product) {
      await loadTrack({ code: carton.product, name: carton.productName });
    }
    openBatchAndScroll(carton.batchId);
  }

  // One-time correction for inner cartons split before a product's Inner
  // Carton Pcs field was fixed — see fixInnerQty on the backend for why this
  // can't just happen automatically when the product is edited: the wrong
  // qty is already permanently stamped on every carton split under the old
  // value, and correcting the product record only affects FUTURE splits.
  async function runFixInnerQty() {
    if (!confirm('Correct the stored pcs on every in-stock inner carton to match its product\'s current Inner Carton Pcs? This only touches in-stock cartons (never dispatched ones) and is safe to run again.')) return;
    setFixingInnerQty(true);
    try {
      const res = await barcodeApi.fixInnerQty();
      showToast(res.message, 'g');
      if (trackProduct) loadTrack(trackProduct); // refresh so any corrected batch reflects immediately
    } catch (err) { showToast(err.message, 'err'); }
    finally { setFixingInnerQty(false); }
  }

  // Reprint an already-generated batch — no preview, no tab switch: the
  // print dialog fires on its own once the QR codes are drawn (see the
  // effect above). Whatever tab you're on (Track, most likely) stays exactly
  // as it is — the only visible thing that happens is the print dialog opening.
  function reprintBatch() {
    if (!openBatchDetail) return;
    setBatch(openBatchDetail);
  }

  // Reprint just ONE carton's label — same flow, just a single-item batch
  // built on the fly from whatever product/batch context is already on screen.
  function reprintSingleCarton(carton) {
    if (!openBatchDetail) return;
    setBatch({ ...openBatchDetail, cartons: [carton] });
  }

  // Reprint every inner child of one split parent together, in a single
  // print job/dialog — e.g. both SP-01-4263E7-78 and SP-01-4263E7-A0 at
  // once, instead of hitting Reprint on each one separately.
  function reprintChildren(children) {
    if (!openBatchDetail || !children.length) return;
    setBatch({ ...openBatchDetail, cartons: children });
  }

  // Every top-level (non-inner) carton currently marked 'split' — used both
  // by the Split filter tab and to decide, per parent row, which cartons are
  // its own children (kind==='inner' && parentCode===this code).
  const splitParentCodes = openBatchDetail
    ? new Set(openBatchDetail.cartons.filter((c) => c.status === 'split').map((c) => c.code))
    : new Set();

  const filteredCartons = openBatchDetail
    ? openBatchDetail.cartons.filter((c) => {
        if (detailFilter === 'all') return true;
        // Split view: show every split parent plus its own inner children,
        // regardless of whether those children have since been scanned/
        // dispatched — this tab is about the split relationship, not status.
        if (detailFilter === 'split') return c.status === 'split' || splitParentCodes.has(c.parentCode);
        return (detailFilter === 'used') === everStockedIn(c.status);
      })
    : [];

  // Shared between Recent Batches (Generate tab) and Track tab's per-product
  // batch list — same expand-in-place row, same reprint actions, so a batch
  // can be reprinted right from Recent Batches without going to Track first.
  function renderBatchDetailRow(batchId, colSpan) {
    if (openBatch !== batchId) return null;
    return (
      <tr>
        <td colSpan={colSpan} style={{ background: 'var(--paper-d)' }}>
          {detailLoading ? (
            <div className="empty">Loading cartons…</div>
          ) : openBatchDetail && (
            <div style={{ padding: '10px 4px' }}>
              <div className="btnrow" style={{ marginBottom: 10 }}>
                <button className={detailFilter === 'all' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('all')}>All ({openBatchDetail.cartons.length})</button>
                <button className={detailFilter === 'unused' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('unused')}>Unscanned ({openBatchDetail.cartons.filter((c) => !everStockedIn(c.status)).length})</button>
                <button className={detailFilter === 'used' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('used')}>Scanned ({openBatchDetail.cartons.filter((c) => everStockedIn(c.status)).length})</button>
                <button className={detailFilter === 'split' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('split')}>Split ({splitParentCodes.size})</button>
                <button className="btn o sm" style={{ marginLeft: 'auto' }} onClick={reprintBatch}>🖨️ Reprint this batch</button>
              </div>
              <table className="dt">
                <thead><tr><th>Carton code</th><th>Status</th><th>Scanned by</th><th>Scanned at</th><th></th></tr></thead>
                <tbody>
                  {/* Split parents and their inner children used to render as flat,
                      unrelated-looking sibling rows in whatever order the API returned
                      them — nothing tied SP-01-4263E7's row to SP-01-4263E7-78/-A0 below
                      it. Instead: render top-level cartons (kind !== 'inner', i.e. no
                      parentCode) in order, and immediately after any 'split' parent,
                      nest its own children indented right underneath it, so the
                      parent -> children relationship is visible instead of implied. */}
                  {filteredCartons.filter((c) => c.kind !== 'inner').map((parent) => {
                    const pBadge = statusBadge(parent.status);
                    const children = parent.status === 'split'
                      ? filteredCartons.filter((c) => c.kind === 'inner' && c.parentCode === parent.code)
                      : [];
                    return (
                      <Fragment key={parent.code}>
                        <tr>
                          <td className="mono" style={{ fontSize: 11 }}>{parent.code}</td>
                          <td><span className={`badge ${pBadge.cls}`}>{pBadge.label}</span></td>
                          <td>{parent.usedBy || '—'}</td>
                          <td>{parent.usedAt ? new Date(parent.usedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                            {/* The split itself is a separate event from the original
                                stock-in scan above it — usedAt never changes when a
                                carton is split, so without this the table only ever
                                showed the OLD scan time and never said when the split
                                actually happened. */}
                            {parent.status === 'split' && parent.splitAt && (
                              <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                                Split {new Date(parent.splitAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{parent.splitBy ? ` by ${parent.splitBy}` : ''}
                              </div>
                            )}
                          </td>
                          <td>{parent.status !== 'split' ? (
                            <button className="btn o sm" onClick={() => reprintSingleCarton(parent)}>🖨️ Reprint</button>
                          ) : children.length > 0 && (
                            <button className="btn o sm" onClick={() => reprintChildren(children)}>🖨️ Reprint all {children.length} inners</button>
                          )}</td>
                        </tr>
                        {children.map((child) => {
                          const cBadge = statusBadge(child.status);
                          return (
                            <tr key={child.code} style={{ background: 'var(--paper)' }}>
                              <td className="mono" style={{ fontSize: 11, paddingLeft: 28, borderLeft: '2px solid var(--line)' }}>↳ {child.code}</td>
                              <td><span className={`badge ${cBadge.cls}`}>{cBadge.label}</span></td>
                              <td>{child.usedBy || '—'}</td>
                              <td>{child.usedAt ? new Date(child.usedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}
                                {child.splitAt && (
                                  <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>
                                    Split {new Date(child.splitAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}{child.splitBy ? ` by ${child.splitBy}` : ''}
                                  </div>
                                )}
                              </td>
                              <td><button className="btn o sm" onClick={() => reprintSingleCarton(child)}>🖨️ Reprint</button></td>
                            </tr>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  {!filteredCartons.length && <tr><td colSpan={5}><div className="empty">No cartons in this filter</div></td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </td>
      </tr>
    );
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Stock-in setup</div><h2>Generate Barcodes</h2>
        <p>Each carton gets its own unique, one-time-use barcode — scanning it twice by mistake is blocked automatically. Print and stick one on every carton before it leaves the production floor.</p></div>

      <div className="btnrow no-print" style={{ marginBottom: 14 }}>
        <button className={tab === 'generate' ? 'btn sm' : 'btn o sm'} onClick={() => setTab('generate')}>🏷️ Generate</button>
        <button className={tab === 'track' ? 'btn sm' : 'btn o sm'} onClick={() => setTab('track')}>📊 Track</button>
      </div>

      {batch && (
        // #print-area is the app-wide convention (see theme.css / Letterhead.jsx) —
        // the global print stylesheet hides everything on the page EXCEPT this,
        // so without this wrapper the printed sheet comes out completely blank
        // regardless of what's inside .label-sheet.
        // "silent-print" moves this off-screen (never display:none — that
        // would stop it printing too) so nothing here is ever visible in the
        // app — generate and reprint both go straight to the print dialog
        // with no on-screen preview, from whichever tab you're on.
        <div id="print-area" className="silent-print">
          <div className="label-sheet">
            {batch.cartons.map((c) => (
              <div className="label" key={c.code}>
                <div className="label-name">{batch.product.name}</div>
                <div className="label-meta"><b>{batch.product.code}</b> · {batch.qty} pcs</div>
                <canvas id={`qr-${c.code}`} className="label-qr"></canvas>
                <div className="label-footer">{c.code} · {new Date(c.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'generate' && (
        <>
          <div className="card no-print" style={{ maxWidth: 480 }}>
            <div className="fg">
              <label>Product</label>
              {product ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px' }}>
                  <span><b>{product.name}</b> <span className="mono muted" style={{ fontSize: 10 }}>{product.code}</span></span>
                  <button className="btn o sm" onClick={() => setShowPicker(true)}>Change</button>
                </div>
              ) : (
                <button className="btn o" onClick={() => setShowPicker(true)}>+ Pick product</button>
              )}
            </div>
            <div className="row2">
              <div className="fg"><label>How many cartons?</label><input type="number" value={cartonCount} onChange={(e) => setCartonCount(e.target.value)} /></div>
              <div className="fg">
                <label>Pcs per carton {product && <span className="muted" style={{ fontWeight: 400, fontSize: 10.5 }}>(default {product.cartonOuter})</span>}</label>
                <input type="number" placeholder={product ? String(product.cartonOuter) : ''} value={qtyOverride} onChange={(e) => setQtyOverride(e.target.value)} />
              </div>
            </div>
            <button className="btn" disabled={generating} onClick={generate}>{generating ? 'Generating…' : 'Generate batch'}</button>
          </div>

          {recentBatches !== null && (
            <div className="card no-print" style={{ marginTop: 16 }}>
              <h3 style={{ marginTop: 0 }}>Recent batches</h3>
              {!recentBatches.length ? (
                <div className="empty">No batches generated yet.</div>
              ) : (
                <div className="tblwrap">
                  <table className="dt">
                    <thead><tr><th></th><th>Product</th><th>Cartons</th><th>Pcs/carton</th><th>Scanned</th><th>Unscanned</th><th>Generated</th><th>By</th><th></th></tr></thead>
                    <tbody>
                      {recentBatches.map((b) => (
                        <Fragment key={b.batchId}>
                          <tr>
                            <td>{b.photo ? <img src={b.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                            <td>
                              <b
                                style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--spruce)' }}
                                onClick={() => { setTab('track'); loadTrack({ code: b.product, name: b.productName, photo: b.photo }); }}
                                title="View this product's batch history"
                              >
                                {b.productName}
                              </b>{' '}
                              <span className="mono muted" style={{ fontSize: 10 }}>{b.product}</span>
                            </td>
                            <td>{b.cartons}</td>
                            <td>{b.qty}</td>
                            <td style={{ color: 'var(--green)', fontWeight: 600 }}>{b.used}</td>
                            <td style={{ color: b.unused ? 'var(--red)' : 'inherit', fontWeight: b.unused ? 600 : 400 }}>{b.unused}</td>
                            <td>{new Date(b.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                            <td>{b.createdBy || '—'}</td>
                            <td>
                              <div className="btnrow">
                                <button className="btn o sm" onClick={() => toggleBatch(b.batchId)}>{openBatch === b.batchId ? 'Hide' : 'View'}</button>
                                {user.role === 'masterAdmin' && (
                                  <button className="btn o sm rd" disabled={deletingBatch === b.batchId} onClick={() => deleteBatchRow(b)}>
                                    {deletingBatch === b.batchId ? 'Deleting…' : '🗑️ Delete'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                          {renderBatchDetailRow(b.batchId, 9)}
                        </Fragment>
                      ))}
                    </tbody>
                  </table>
                  {recentHasMore && (
                    <div className="btnrow" style={{ marginTop: 10, justifyContent: 'center' }}>
                      <button className="btn o sm" disabled={loadingMore} onClick={loadMoreBatches}>{loadingMore ? 'Loading…' : 'Load 10 more'}</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {showPicker && (
            <ProductPickerModal products={products} onPick={(p) => { setProduct(p); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
          )}
        </>
      )}

      {tab === 'track' && (
        <div className="no-print">
          {user.role === 'masterAdmin' && (
            <div className="card" style={{ maxWidth: 560, background: 'var(--paper-d)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <b style={{ fontSize: 13 }}>🛠 Fix inner carton quantities</b>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>One-time correction for inner cartons split before a product's Inner Carton Pcs was fixed (e.g. SP-01). Only touches in-stock cartons — safe to run more than once.</div>
                </div>
                <button className="btn o sm" disabled={fixingInnerQty} onClick={runFixInnerQty}>{fixingInnerQty ? 'Fixing…' : 'Run fix'}</button>
              </div>
            </div>
          )}
          <div className="card" style={{ maxWidth: 560 }}>
            <div className="fg">
              <label>Product</label>
              {trackProduct ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px' }}>
                  <span><b>{trackProduct.name}</b> <span className="mono muted" style={{ fontSize: 10 }}>{trackProduct.code}</span></span>
                  <button className="btn o sm" onClick={() => setShowTrackPicker(true)}>Change</button>
                </div>
              ) : (
                <button className="btn o" onClick={() => setShowTrackPicker(true)}>+ Pick product</button>
              )}
            </div>
          </div>

          {/* Finds cartons by a PARTIAL code fragment (e.g. just "D510F9") —
              scoped to the picked product above when there is one, so a short
              fragment doesn't collide across unrelated products. */}
          <div className="card" style={{ maxWidth: 560, marginTop: 12 }}>
            <div className="fg"><label>Or find a carton by code (full or partial)</label>
              <form onSubmit={searchByCode} className="btnrow">
                <input placeholder="e.g. D510F9 or PL001-5C5D5F-D9" value={codeSearch} onChange={(e) => setCodeSearch(e.target.value)} style={{ flex: 1 }} />
                <button type="submit" className="btn sm" disabled={codeSearchLoading}>{codeSearchLoading ? 'Searching…' : 'Search'}</button>
              </form>
              {trackProduct && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Searching within {trackProduct.name} only — Change the product above to search all products.</div>}
            </div>

            {/* More than one match and none picked yet — show a pickable list. */}
            {codeSearchResults && codeSearchResults.length > 1 && !codeSearchSelected && (
              <div style={{ marginTop: 8 }}>
                <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>{codeSearchResults.length} matches — pick one:</div>
                {codeSearchResults.map((r) => (
                  <div key={r.code} onClick={() => setCodeSearchSelected(r)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', marginBottom: 6, cursor: 'pointer' }}>
                    <span className="mono" style={{ fontSize: 12 }}>{r.code}</span>
                    <span className="muted" style={{ fontSize: 11 }}>{r.productName} · {r.qty} pcs · {r.status}</span>
                  </div>
                ))}
              </div>
            )}
            {codeSearchResults && !codeSearchResults.length && (
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>No carton codes match "{codeSearch}"{trackProduct ? ` for ${trackProduct.name}` : ''}.</div>
            )}

            {codeSearchSelected && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', marginTop: 8 }}>
                <div>
                  <div><b>{codeSearchSelected.code}</b> <span className="mono muted" style={{ fontSize: 11 }}>{codeSearchSelected.productName} · {codeSearchSelected.qty} pcs</span></div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    Status: {codeSearchSelected.status}
                    {codeSearchSelected.usedAt && ` · Scanned in ${new Date(codeSearchSelected.usedAt).toLocaleDateString('en-IN')} by ${codeSearchSelected.usedBy}`}
                    {codeSearchSelected.dispatchedAt && ` · Dispatched to ${codeSearchSelected.dispatchedTo} on invoice ${codeSearchSelected.dispatchedInvoice}`}
                  </div>
                </div>
                <div className="btnrow">
                  {codeSearchResults.length > 1 && <button className="btn o sm" onClick={() => setCodeSearchSelected(null)}>← Back to matches</button>}
                  <button className="btn o sm" onClick={() => goToSearchResultBatch(codeSearchSelected)}>📂 Go to batch</button>
                  <button className="btn o sm" onClick={reprintSearchResult}>🖨️ Reprint</button>
                </div>
              </div>
            )}
          </div>

          {trackLoading && <div className="empty">Loading…</div>}

          {trackData && !trackLoading && (
            <>
              <div className="btnrow" style={{ marginTop: 14, gap: 18, flexWrap: 'wrap' }}>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20 }}>{trackData.summary.total}</b><div className="muted" style={{ fontSize: 11 }}>Total printed</div></div>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20, color: 'var(--green)' }}>{trackData.summary.used}</b><div className="muted" style={{ fontSize: 11 }}>Scanned in</div></div>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20, color: 'var(--spruce)' }}>{trackData.summary.dispatched}</b><div className="muted" style={{ fontSize: 11 }}>Dispatched</div></div>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20, color: 'var(--red)' }}>{trackData.summary.unused}</b><div className="muted" style={{ fontSize: 11 }}>Still unscanned</div></div>
                {/* Compares what the QR tracking thinks is currently in the
                    warehouse (every 'in_stock' carton's pcs added up)
                    against what Inventory.physical actually shows. These
                    should always agree going forward — confirmScan now
                    updates both in one transaction — but a batch scanned in
                    before that fix could have desynced if the old two-step
                    write's second half ever silently failed. A mismatch
                    here is exactly that: something to check with Adjust,
                    not something this page tries to auto-correct, since
                    guessing which side is wrong could make it worse. */}
                <div className="card" style={{ padding: '10px 16px', borderColor: trackData.reconcile.diff !== 0 ? 'var(--red)' : undefined }}>
                  <b style={{ fontSize: 20, color: trackData.reconcile.diff === 0 ? 'var(--green)' : 'var(--red)' }}>
                    {trackData.reconcile.actualPhysical} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>/ {trackData.reconcile.expectedPhysical} expected</span>
                  </b>
                  <div className="muted" style={{ fontSize: 11 }}>
                    Stock check {trackData.reconcile.diff !== 0 && (
                      <span style={{ color: 'var(--red)', fontWeight: 600 }}> — off by {Math.abs(trackData.reconcile.diff)}, use Adjust to fix</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="tblwrap" style={{ marginTop: 14 }}>
                <table className="dt">
                  <thead><tr><th>Batch</th><th>Generated</th><th>By</th><th>Pcs/carton</th><th>Cartons</th><th>Scanned</th><th>Unscanned</th><th></th></tr></thead>
                  <tbody>
                    {trackData.batches.map((b) => (
                      <Fragment key={b.batchId}>
                        <tr ref={(el) => batchRowRefs.current.set(b.batchId, el)} className={highlightBatch === b.batchId ? 'row-flash' : undefined}>
                          <td className="mono" style={{ fontSize: 11 }}>{b.batchId}</td>
                          <td>{new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td>{b.createdBy}</td>
                          <td>{b.qty}</td>
                          <td>{b.total}</td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>{b.used}</td>
                          <td style={{ color: b.unused ? 'var(--red)' : 'inherit', fontWeight: b.unused ? 600 : 400 }}>{b.unused}</td>
                          <td>
                            <div className="btnrow">
                              <button className="btn o sm" onClick={() => toggleBatch(b.batchId)}>{openBatch === b.batchId ? 'Hide' : 'View cartons'}</button>
                              {user.role === 'masterAdmin' && (
                                <button className="btn o sm rd" disabled={deletingBatch === b.batchId} onClick={() => deleteBatchRow(b)}>
                                  {deletingBatch === b.batchId ? 'Deleting…' : '🗑️ Delete'}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {renderBatchDetailRow(b.batchId, 8)}
                      </Fragment>
                    ))}
                    {!trackData.batches.length && <tr><td colSpan={8}><div className="empty">No batches generated for this product yet</div></td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {showTrackPicker && (
            <ProductPickerModal products={products} onPick={loadTrack} onClose={() => setShowTrackPicker(false)} />
          )}
        </div>
      )}

      <style>{`
        .label-sheet {
          --label-w: 100mm;   /* landscape, straight — no rotation needed since the roll now feeds this way directly */
          --label-h: 70mm;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 16px;
        }
        .label {
          width: var(--label-w);
          height: var(--label-h);
          box-sizing: border-box;
          border: 1px dashed var(--line);
          padding: 14px 18px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          overflow: hidden;
        }
        .label-name { font-weight: 700; font-size: 22px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .label-meta { font-size: 14px; color: var(--muted); margin: 3px 0 8px; }
        .label-meta b { font-family: var(--mono); }
        .label-qr { width: 32mm; height: 32mm; display: block; margin: 0 auto; }
        .label-footer { font-family: var(--mono); font-size: 11px; color: var(--muted); margin-top: 6px; letter-spacing: 0.01em; }
        /* Nothing in #print-area is ever shown in the app — generate and
           reprint both render here purely so window.print() has something to
           print, then go straight to the print dialog. Off-screen (never
           display:none — that would stop it printing too), reset back to
           normal flow under print so it actually lands on the page. */
        .silent-print { position: fixed; left: -9999px; top: 0; }
        @media print {
          .silent-print { position: static; left: auto; top: auto; }
          .no-print { display: none !important; }
          /* Literal values only — Chrome does not reliably apply CSS custom
             properties (var(...)) inside @page, so this must stay hardcoded.
             100mm x 70mm, landscape, one slip per page. If the roll size
             changes, update this line AND --label-w/--label-h above together. */
          @page { size: 100mm 70mm; margin: 0; }
          /* The 16px on-screen gap between labels, AND the 16px top margin
             on .label-sheet, are both fine for the preview but break print:
             each label already fills a full page exactly (100x70mm) with
             zero page margin, so ANY extra stray height — a gap between
             labels, or a margin before the very first one — doesn't fit on
             that now-full page and spills onto its own near-blank page
             before the next real label starts. Zeroing both here is what
             makes it come out as exactly one page per label.
             SEPARATE, deeper issue on top of that: Chrome's print pagination
             of a "display:flex" container with page-break-after on its
             children is unreliable — it doesn't always account for flex
             layout correctly, which is what was still causing one stray
             blank page even after the gap/margin above were zeroed. Forcing
             plain block layout for print sidesteps that Chrome quirk
             entirely. Each .label is 100mm wide — exactly the full page
             width — so no horizontal centering is needed once it's a block
             box; the on-screen flex/align-items centering (for a screen
             wider than 100mm) is unaffected since this only applies to print. */
          .label-sheet { gap: 0; margin-top: 0; display: block; }
          .label { border: none; page-break-after: always; }
          .label:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

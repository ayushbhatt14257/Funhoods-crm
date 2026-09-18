import { Fragment, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import Modal from '../../components/Modal';
import ProductPickerModal from '../pi/components/ProductPickerModal';
import { barcodeApi } from './barcodeApi';

// admin/masterAdmin only. qrcode is loaded lazily (dynamic import) so it
// doesn't sit in the main app bundle for everyone who never opens this screen.
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
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('generate'); // 'generate' | 'track'

  // --- Generate tab ---
  const [products, setProducts] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [product, setProduct] = useState(null);
  const [cartonCount, setCartonCount] = useState(50);
  const [qtyOverride, setQtyOverride] = useState('');
  const [batch, setBatch] = useState(null); // { batchId, product, qty, cartons }
  const [generating, setGenerating] = useState(false);

  // --- Track tab ---
  const [showTrackPicker, setShowTrackPicker] = useState(false);
  const [trackProduct, setTrackProduct] = useState(null);
  const [trackData, setTrackData] = useState(null); // { product, summary, batches }
  const [trackLoading, setTrackLoading] = useState(false);
  const [openBatch, setOpenBatch] = useState(null); // batchId currently expanded
  const [openBatchDetail, setOpenBatchDetail] = useState(null); // full carton list for openBatch
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFilter, setDetailFilter] = useState('all'); // 'all' | 'used' | 'unused'
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => { api.get('/products').then(setProducts); }, []);

  // Wipes every generated code (used, unused, split) — a one-way reset for
  // clearing out test/practice batches before switching to real production
  // codes. Does NOT touch actual stock counts, only this tracking history —
  // see the backend comment on clearAll for why that's a deliberate choice.
  async function clearAllCodes() {
    setClearing(true);
    try {
      const res = await barcodeApi.clearAll();
      showToast(res.message, 'g');
      setConfirmClearOpen(false);
      setTrackData(null);
      setOpenBatch(null);
      setOpenBatchDetail(null);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setClearing(false); }
  }

  // Render each carton's QR code onto its label's <canvas> once the batch is
  // on screen. Re-runs whenever a new batch comes in.
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
    })();
  }, [batch]);

  async function generate() {
    if (!product) return showToast('Pick a product', 'err');
    if (!cartonCount || cartonCount < 1) return showToast('Enter how many cartons', 'err');
    setGenerating(true);
    try {
      const res = await barcodeApi.generateBatch(product.code, +cartonCount, qtyOverride ? +qtyOverride : undefined);
      setBatch(res);
      showToast(`Generated ${res.cartons.length} barcodes`, 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setGenerating(false); }
  }

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

  // Reprint an already-generated batch — jumps back to the Generate tab
  // with that batch's labels loaded, same print flow as a fresh batch.
  function reprintBatch() {
    if (!openBatchDetail) return;
    setBatch(openBatchDetail);
    setTab('generate');
  }

  const filteredCartons = openBatchDetail
    ? openBatchDetail.cartons.filter((c) => detailFilter === 'all' || c.status === (detailFilter === 'used' ? 'used' : 'unused'))
    : [];

  return (
    <div>
      <div className="ph"><div className="eyebrow">Stock-in setup</div><h2>Generate Barcodes</h2>
        <p>Each carton gets its own unique, one-time-use barcode — scanning it twice by mistake is blocked automatically. Print and stick one on every carton before it leaves the production floor.</p></div>

      <div className="btnrow no-print" style={{ marginBottom: 14 }}>
        <button className={tab === 'generate' ? 'btn sm' : 'btn o sm'} onClick={() => setTab('generate')}>🏷️ Generate</button>
        <button className={tab === 'track' ? 'btn sm' : 'btn o sm'} onClick={() => setTab('track')}>📊 Track</button>
      </div>

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

          {batch && (
            <>
              <div className="btnrow no-print" style={{ marginTop: 16 }}>
                <button className="btn g" onClick={printLabels}>🖨️ Print {batch.cartons.length} labels</button>
              </div>
              {/* #print-area is the app-wide convention (see theme.css / Letterhead.jsx) —
                  the global print stylesheet hides everything on the page EXCEPT this,
                  so without this wrapper the printed sheet comes out completely blank
                  regardless of what's inside .label-sheet. */}
              <div id="print-area">
                <div className="label-sheet">
                  {batch.cartons.map((c) => (
                    <div className="label" key={c.code}>
                      <div className="label-name">{batch.product.name}</div>
                      <div className="label-sku">{batch.product.code}</div>
                      <div className="label-qty">{batch.qty} pcs</div>
                      <canvas id={`qr-${c.code}`} className="label-qr"></canvas>
                      <div className="label-code">{c.code}</div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          {showPicker && (
            <ProductPickerModal products={products} onPick={(p) => { setProduct(p); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
          )}
        </>
      )}

      {tab === 'track' && (
        <div className="no-print">
          {user.role === 'masterAdmin' && (
            <div className="card" style={{ maxWidth: 560, borderColor: 'var(--red)', marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <b>Clear all generated codes</b>
                  <div className="muted" style={{ fontSize: 12 }}>Wipes every code ever generated (used, unused, split) — for clearing out test batches before real production codes. Doesn't touch actual stock counts.</div>
                </div>
                <button className="btn o sm rd" onClick={() => setConfirmClearOpen(true)}>🗑️ Clear all</button>
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

          {trackLoading && <div className="empty">Loading…</div>}

          {trackData && !trackLoading && (
            <>
              <div className="btnrow" style={{ marginTop: 14, gap: 18 }}>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20 }}>{trackData.summary.total}</b><div className="muted" style={{ fontSize: 11 }}>Total printed</div></div>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20, color: 'var(--green)' }}>{trackData.summary.used}</b><div className="muted" style={{ fontSize: 11 }}>Scanned in</div></div>
                <div className="card" style={{ padding: '10px 16px' }}><b style={{ fontSize: 20, color: 'var(--red)' }}>{trackData.summary.unused}</b><div className="muted" style={{ fontSize: 11 }}>Still unscanned</div></div>
              </div>

              <div className="tblwrap" style={{ marginTop: 14 }}>
                <table className="dt">
                  <thead><tr><th>Batch</th><th>Generated</th><th>By</th><th>Pcs/carton</th><th>Cartons</th><th>Scanned</th><th>Unscanned</th><th></th></tr></thead>
                  <tbody>
                    {trackData.batches.map((b) => (
                      <Fragment key={b.batchId}>
                        <tr>
                          <td className="mono" style={{ fontSize: 11 }}>{b.batchId}</td>
                          <td>{new Date(b.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                          <td>{b.createdBy}</td>
                          <td>{b.qty}</td>
                          <td>{b.total}</td>
                          <td style={{ color: 'var(--green)', fontWeight: 600 }}>{b.used}</td>
                          <td style={{ color: b.unused ? 'var(--red)' : 'inherit', fontWeight: b.unused ? 600 : 400 }}>{b.unused}</td>
                          <td><button className="btn o sm" onClick={() => toggleBatch(b.batchId)}>{openBatch === b.batchId ? 'Hide' : 'View cartons'}</button></td>
                        </tr>
                        {openBatch === b.batchId && (
                          <tr>
                            <td colSpan={8} style={{ background: 'var(--paper-d)' }}>
                              {detailLoading ? (
                                <div className="empty">Loading cartons…</div>
                              ) : openBatchDetail && (
                                <div style={{ padding: '10px 4px' }}>
                                  <div className="btnrow" style={{ marginBottom: 10 }}>
                                    <button className={detailFilter === 'all' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('all')}>All ({openBatchDetail.cartons.length})</button>
                                    <button className={detailFilter === 'unused' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('unused')}>Unscanned ({openBatchDetail.cartons.filter((c) => c.status === 'unused').length})</button>
                                    <button className={detailFilter === 'used' ? 'btn sm' : 'btn o sm'} onClick={() => setDetailFilter('used')}>Scanned ({openBatchDetail.cartons.filter((c) => c.status === 'used').length})</button>
                                    <button className="btn o sm" style={{ marginLeft: 'auto' }} onClick={reprintBatch}>🖨️ Reprint this batch</button>
                                  </div>
                                  <table className="dt">
                                    <thead><tr><th>Carton code</th><th>Status</th><th>Scanned by</th><th>Scanned at</th></tr></thead>
                                    <tbody>
                                      {filteredCartons.map((c) => (
                                        <tr key={c.code}>
                                          <td className="mono" style={{ fontSize: 11 }}>{c.code}</td>
                                          <td><span className={`badge ${c.status === 'used' ? 'g' : 'y'}`}>{c.status === 'used' ? 'Scanned' : 'Unscanned'}</span></td>
                                          <td>{c.usedBy || '—'}</td>
                                          <td>{c.usedAt ? new Date(c.usedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                                        </tr>
                                      ))}
                                      {!filteredCartons.length && <tr><td colSpan={4}><div className="empty">No cartons in this filter</div></td></tr>}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
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

          {confirmClearOpen && (
            <Modal title="Clear all generated codes?" onClose={() => setConfirmClearOpen(false)}>
              <p>This permanently deletes every carton code ever generated — used, unused, and split alike. It cannot be undone.</p>
              <p className="muted" style={{ fontSize: 12.5 }}>Actual stock counts are not affected — this only clears the code/label tracking history.</p>
              <div className="btnrow" style={{ marginTop: 14, justifyContent: 'flex-end' }}>
                <button className="btn o sm" onClick={() => setConfirmClearOpen(false)} disabled={clearing}>Cancel</button>
                <button className="btn rd sm" onClick={clearAllCodes} disabled={clearing}>{clearing ? 'Clearing…' : 'Yes, clear everything'}</button>
              </div>
            </Modal>
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
        .label-name { font-weight: 700; font-size: 24px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .label-sku { font-family: var(--mono); font-size: 13px; color: var(--muted); margin-bottom: 4px; }
        .label-qty { font-weight: 600; font-size: 17px; color: var(--muted); margin-bottom: 8px; }
        .label-qr { width: 34mm; height: 34mm; display: block; margin: 0 auto; }
        .label-code { font-family: var(--mono); font-size: 14px; color: var(--muted); margin-top: 6px; letter-spacing: 0.02em; }
        @media print {
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

import { Fragment, useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import ProductPickerModal from '../pi/components/ProductPickerModal';
import { barcodeApi } from './barcodeApi';

// admin/masterAdmin only. jsbarcode is loaded lazily (dynamic import) so its
// ~30KB doesn't sit in the main app bundle for everyone who never opens this screen.
//
// PRINT LAYOUT NOTES (for whoever tunes this next time the label stock changes):
// This is a different, bigger roll than the earlier 2.42x2.03in one — each
// slip here is 100mm x 75mm, printed landscape (wider than tall), one slip
// per page: product name on top, quantity below that, then the barcode with
// its readable code underneath. All the tunable numbers live in the CSS
// custom properties at the top of the <style> block below. Print a test
// sheet after any change.
export default function GenerateBarcodes() {
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

  useEffect(() => { api.get('/products').then(setProducts); }, []);

  // Render each carton's Code128 barcode into its label's <svg> once the
  // batch is on screen. Re-runs whenever a new batch comes in.
  useEffect(() => {
    if (!batch) return;
    (async () => {
      const JsBarcode = (await import('jsbarcode')).default;
      batch.cartons.forEach((c) => {
        const svg = document.getElementById(`barcode-${c.code}`);
        // 100x75mm gives a lot more room than the old 2.42x2.03in label, so
        // this can be sized up for an easier, more reliable scan.
        if (svg) JsBarcode(svg, c.code, { format: 'CODE128', displayValue: false, height: 90, width: 2.2, margin: 6 });
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
                    <div className="label-page" key={c.code}>
                      <div className="label">
                        <div className="label-name">{batch.product.name}</div>
                        <div className="label-qty">{batch.qty} pcs</div>
                        <svg id={`barcode-${c.code}`}></svg>
                        <div className="label-code">{c.code}</div>
                      </div>
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
        </div>
      )}

      <style>{`
        .label-sheet {
          --label-w: 100mm;   /* the slip's own reading orientation — unchanged from before */
          --label-h: 77mm;
          --page-w: 77mm;     /* the roll's actual fixed feed width */
          --page-h: 100mm;    /* length along the feed direction */
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 16px;
        }
        .label-page {
          width: var(--page-w);
          height: var(--page-h);
          position: relative;
          border: 1px dashed var(--line);
        }
        .label {
          width: var(--label-w);
          height: var(--label-h);
          position: absolute;
          top: 50%;
          left: 50%;
          /* The roll only has 75mm to feed across, but the slip reads
             landscape (100mm wide) — rotating 90° clockwise ("turned right")
             makes a 100x75 box's printed footprint exactly 75x100, matching
             the physical roll, while the content itself still reads landscape
             once the printed slip comes off rotated the same way. */
          transform: translate(-50%, -50%) rotate(90deg);
          box-sizing: border-box;
          padding: 14px 18px;
          text-align: center;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
          overflow: hidden;
        }
        .label-name { font-weight: 700; font-size: 26px; line-height: 1.2; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
        .label-qty { font-weight: 600; font-size: 20px; color: var(--muted); margin-bottom: 10px; }
        .label svg { width: 90%; height: auto; max-width: 90%; display: block; }
        .label-code { font-family: var(--mono); font-size: 15px; color: var(--muted); margin-top: 6px; letter-spacing: 0.02em; }
        @media print {
          .no-print { display: none !important; }
          /* Literal values only — Chrome does not reliably apply CSS custom
             properties (var(...)) inside @page, so this must stay hardcoded.
             77mm x 100mm matches the roll's fixed feed width — the landscape
             reading direction comes from the rotate(90deg) on .label above,
             not from this page size. If the roll size changes, update this
             line AND --page-w/--page-h/--label-w/--label-h above together. */
          @page { size: 77mm 100mm; margin: 0; }
          .label-page { border: none; page-break-after: always; }
          .label-page:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

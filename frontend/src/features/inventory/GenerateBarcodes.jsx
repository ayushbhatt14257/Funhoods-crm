import { Fragment, useEffect, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import ProductPickerModal from '../pi/components/ProductPickerModal';
import { barcodeApi } from './barcodeApi';

// admin/masterAdmin only. jsbarcode is loaded lazily (dynamic import) so its
// ~30KB doesn't sit in the main app bundle for everyone who never opens this screen.
//
// PRINT LAYOUT NOTES (for whoever tunes this next time the label stock changes):
// The roll prints 2 labels side by side, each roughly 50x25mm, and the
// printer's configured page size is 3in x 4.094in (that's the printer
// driver's "page", not one physical label — the roll just keeps feeding
// through that page height, a few label-rows at a time, then the driver
// advances/cuts). All the tunable numbers live in the CSS custom properties
// at the top of the <style> block below — adjust --page-w/--page-h if the
// printer's page size setting changes, or --label-h if labels come out too
// cramped/too loose vertically. Print a test sheet after any change.
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
        // The real label is 2.42in wide (confirmed from the BarTender template) —
        // comfortably roomy, so this doesn't need to be squeezed to the bare
        // minimum. A small margin here gives the scanner a proper quiet zone,
        // which the earlier zero-margin version didn't have.
        if (svg) JsBarcode(svg, c.code, { format: 'CODE128', displayValue: false, height: 45, width: 1.3, margin: 4 });
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
                      <svg id={`barcode-${c.code}`}></svg>
                      <div className="label-meta">{c.code}</div>
                      <div className="label-meta">{batch.qty} pcs</div>
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
          --label-w: 2.42in;   /* matches the actual BarTender template size on your TSC setup */
          --label-h: 2.03in;
          --label-gap: 2mm;
          display: flex;
          flex-direction: column;   /* 2 labels stack vertically per page, not side by side */
          align-items: center;      /* labels are narrower than the 3in page — center them */
          gap: var(--label-gap);
          margin-top: 16px;
        }
        .label {
          border: 1px dashed var(--line);
          border-radius: 4px;
          padding: 6px;
          text-align: center;
          width: var(--label-w);
          height: var(--label-h);
          display: flex;
          flex-direction: column;
          justify-content: center;
          overflow: hidden;
        }
        .label-name { font-weight: 700; font-size: 13px; line-height: 1.2; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .label svg { width: 100%; height: auto; max-width: 100%; display: block; }
        .label-meta { font-family: var(--mono); font-size: 10px; color: var(--muted); line-height: 1.3; }
        @media print {
          .no-print { display: none !important; }
          /* Literal values only — Chrome does not reliably apply CSS custom
             properties (var(...)) inside @page, so this must stay hardcoded.
             If your TSC page size ever changes, update both this line and
             --label-w/--label-h above together. */
          @page { size: 3in 4.094in; margin: 0; }
          .label { border: none; break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

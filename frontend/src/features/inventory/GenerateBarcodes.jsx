import { useEffect, useRef, useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { api } from '../../api/client';
import ProductPickerModal from '../pi/components/ProductPickerModal';
import { barcodeApi } from './barcodeApi';

// admin/masterAdmin only. jsbarcode is loaded lazily (dynamic import) so its
// ~30KB doesn't sit in the main app bundle for everyone who never opens this screen.
export default function GenerateBarcodes() {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [showPicker, setShowPicker] = useState(false);
  const [product, setProduct] = useState(null);
  const [cartonCount, setCartonCount] = useState(50);
  const [qtyOverride, setQtyOverride] = useState('');
  const [batch, setBatch] = useState(null); // { batchId, product, qty, cartons }
  const [generating, setGenerating] = useState(false);
  const labelsRef = useRef(null);

  useEffect(() => { api.get('/products').then(setProducts); }, []);

  // Render each carton's Code128 barcode into its label's <svg> once the
  // batch is on screen. Re-runs whenever a new batch comes in.
  useEffect(() => {
    if (!batch) return;
    (async () => {
      const JsBarcode = (await import('jsbarcode')).default;
      batch.cartons.forEach((c) => {
        const svg = document.getElementById(`barcode-${c.code}`);
        if (svg) JsBarcode(svg, c.code, { format: 'CODE128', displayValue: false, height: 40, margin: 0 });
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

  return (
    <div>
      <div className="ph"><div className="eyebrow">Stock-in setup</div><h2>Generate Barcodes</h2>
        <p>Each carton gets its own unique, one-time-use barcode — scanning it twice by mistake is blocked automatically. Print and stick one on every carton before it leaves the production floor.</p></div>

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
          <div ref={labelsRef} className="label-sheet">
            {batch.cartons.map((c) => (
              <div className="label" key={c.code}>
                <div className="label-name">{batch.product.name}</div>
                <svg id={`barcode-${c.code}`}></svg>
                <div className="label-meta">{c.code} · {batch.qty} pcs</div>
              </div>
            ))}
          </div>
        </>
      )}

      {showPicker && (
        <ProductPickerModal products={products} onPick={(p) => { setProduct(p); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
      )}

      <style>{`
        .label-sheet { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
        .label { border: 1px dashed var(--line); border-radius: 6px; padding: 8px; text-align: center; }
        .label-name { font-weight: 700; font-size: 12px; margin-bottom: 4px; }
        .label-meta { font-family: var(--mono); font-size: 9px; color: var(--muted); margin-top: 4px; }
        @media print {
          .no-print { display: none !important; }
          .label-sheet { grid-template-columns: repeat(3, 1fr); }
          .label { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}

import { useState } from 'react';
import ProductPickerModal from '../features/pi/components/ProductPickerModal';
import SampleConfirmModal from '../features/pi/components/SampleConfirmModal';

// Shared "+ Add sample" block, used from three places: PIPreview (declaring
// samples when a PI is created), the pool-dispatch screen (pre-filled from
// whatever the PI(s) being cleared already declared, plus whatever the
// dispatcher adds here), and manual (no-PI) dispatch. A sample is always a
// real catalog product (never freeform), always free — no rate, no GST, no
// amount anywhere, and (deliberately, confirmed with the business owner)
// never touches Inventory/CartonBarcode/stock and never needs approval.
//
// `samples` / `onChange(nextSamples)` is the plain array of
// {code,name,photo,pcs} the parent screen owns — this component only ever
// appends/removes/edits entries in it, same controlled-list pattern as
// everywhere else in this app (selection, scannedCodes, gifts...).
export default function SampleStep({ products, samples, onChange, title = '🧪 Samples', subtitle = 'free — never billed, no amount calculated' }) {
  const [showPicker, setShowPicker] = useState(false);
  const [confirmingProduct, setConfirmingProduct] = useState(null);

  function addSample(product, pcs) {
    const next = [...samples];
    const existingIdx = next.findIndex((s) => s.code === product.code);
    if (existingIdx >= 0) {
      next[existingIdx] = { ...next[existingIdx], pcs: next[existingIdx].pcs + pcs };
    } else {
      next.push({ code: product.code, name: product.name, photo: product.photo || '', pcs });
    }
    onChange(next);
    setConfirmingProduct(null);
    setShowPicker(false);
  }
  function removeSample(i) {
    onChange(samples.filter((_, idx) => idx !== i));
  }
  function editPcs(i, val) {
    const pcs = Math.max(0, Math.floor(+val) || 0);
    const next = [...samples];
    next[i] = { ...next[i], pcs };
    onChange(next);
  }

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{title} <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>({subtitle})</span></h3>

      <div className="btnrow" style={{ marginBottom: samples.length ? 12 : 0 }}>
        <button type="button" className="btn o sm" onClick={() => setShowPicker(true)}>+ Add sample</button>
      </div>

      {samples.length > 0 && (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th></th><th>Item</th><th>Pcs</th><th></th></tr></thead>
            <tbody>
              {samples.map((s, i) => (
                <tr key={i}>
                  <td>{s.photo ? <img src={s.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, background: 'var(--paper)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>}</td>
                  <td><b>{s.name}</b><br /><span className="mono muted" style={{ fontSize: 10 }}>{s.code}</span></td>
                  <td><input type="number" min={1} value={s.pcs} onChange={(e) => editPcs(i, e.target.value)} style={{ width: 70 }} /></td>
                  <td><button type="button" className="btn o sm rd" onClick={() => removeSample(i)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPicker && (
        <ProductPickerModal products={products} onPick={(p) => { setConfirmingProduct(p); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
      )}
      {confirmingProduct && (
        <SampleConfirmModal product={confirmingProduct} onConfirm={addSample} onClose={() => setConfirmingProduct(null)} />
      )}
    </div>
  );
}

import { useState } from 'react';
import ProductPickerModal from '../../pi/components/ProductPickerModal';
import ConfirmLineModal from '../../pi/components/ConfirmLineModal';

// Free gifts riding along on this dispatch — never billed, never part of the
// Grand Total above, but still printed on the delivery challan (as "FREE")
// and still physically leaves the warehouse for a catalog product, so it
// still reduces stock and still gets checked against physical availability
// exactly like a paid line does.
//
// Two kinds of gift:
//  - catalog: a real product picked from the same catalogue as everywhere
//    else. Worth is auto-computed as rate × qty — never typed by hand.
//  - custom: anything not in the catalogue (a tiffin, a bottle...) — just a
//    typed name and a typed worth, no stock impact since there's no SKU behind it.
export default function GiftingStep({ products, gifts, onAddCatalogGift, onAddCustomGift, onRemoveGift }) {
  const [showPicker, setShowPicker] = useState(false);
  const [confirmingProduct, setConfirmingProduct] = useState(null);
  const [customName, setCustomName] = useState('');
  const [customWorth, setCustomWorth] = useState('');

  function confirmCatalogGift(product, outers, inners, directPcs) {
    onAddCatalogGift(product, outers, inners, directPcs);
    setConfirmingProduct(null);
    setShowPicker(false);
  }

  function addCustom() {
    const name = customName.trim();
    if (!name) return;
    onAddCustomGift(name, +customWorth || 0);
    setCustomName('');
    setCustomWorth('');
  }

  const totalWorth = gifts.reduce((sum, g) => sum + (g.worth || 0), 0);

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>🎁 Gifting <span className="muted" style={{ fontWeight: 400, fontSize: 12.5 }}>(optional — free, not billed)</span></h3>

      <div className="btnrow" style={{ marginBottom: 12 }}>
        <button type="button" className="btn o sm" onClick={() => setShowPicker(true)}>+ Gift a catalog product</button>
      </div>

      <div className="row2" style={{ alignItems: 'end', marginBottom: 12 }}>
        <div className="fg"><label>Or a custom gift — name</label><input placeholder="e.g. Tiffin box, Bottle" value={customName} onChange={(e) => setCustomName(e.target.value)} /></div>
        <div className="fg"><label>Worth ₹</label><input type="number" min={0} placeholder="0" value={customWorth} onChange={(e) => setCustomWorth(e.target.value)} /></div>
      </div>
      <div className="btnrow" style={{ marginBottom: gifts.length ? 14 : 0 }}>
        <button type="button" className="btn o sm" disabled={!customName.trim()} onClick={addCustom}>+ Add custom gift</button>
      </div>

      {gifts.length > 0 && (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th></th><th>Item</th><th>Qty</th><th className="r">Worth ₹</th><th></th></tr></thead>
            <tbody>
              {gifts.map((g, i) => (
                <tr key={i}>
                  <td><span className="badge g">FREE</span></td>
                  <td><b>{g.name}</b>{g.custom && <span className="muted" style={{ fontSize: 10.5 }}> · custom gift</span>}</td>
                  <td>{g.qtyLabel || '—'}</td>
                  <td className="r">{Math.round(g.worth).toLocaleString('en-IN')}</td>
                  <td><button type="button" className="btn o sm rd" onClick={() => onRemoveGift(i)}>Remove</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8, fontSize: 13, color: 'var(--muted)' }}>
            Total gift value (not billed): ₹{Math.round(totalWorth).toLocaleString('en-IN')}
          </div>
        </div>
      )}

      {showPicker && (
        <ProductPickerModal products={products} onPick={(p) => { setConfirmingProduct(p); setShowPicker(false); }} onClose={() => setShowPicker(false)} />
      )}
      {confirmingProduct && (
        <ConfirmLineModal product={confirmingProduct} onConfirm={confirmCatalogGift} onClose={() => setConfirmingProduct(null)} />
      )}
    </div>
  );
}

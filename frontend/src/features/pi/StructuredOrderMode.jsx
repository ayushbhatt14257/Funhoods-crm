import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import PIPreview from './components/PIPreview';
import DealerPickerModal from './components/DealerPickerModal';
import ProductPickerModal from './components/ProductPickerModal';
import ConfirmLineModal from './components/ConfirmLineModal';
import { ModeInfoPanel } from './WhatsAppOrderMode';

// "Structured" order entry: pick a dealer, then add items one at a time via
// the product + carton-confirmation modals, then hand off to PIPreview to save.
export default function StructuredOrderMode() {
  const { showToast } = useToast();

  const [dealer, setDealer] = useState(null);
  const [lines, setLines] = useState([]); // {product, outers, inners, pcs}
  const [showDealerPicker, setShowDealerPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [confirmingProduct, setConfirmingProduct] = useState(null); // product object mid-confirmation
  const [dealers, setDealers] = useState([]);
  const [products, setProducts] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    api.get('/dealers').then(setDealers);
    api.get('/products').then(setProducts);
  }, []);

  function addLine(product, outers, inners, directPcs) {
    if (!outers && !inners && !directPcs) return showToast('Enter outer/inner cartons, or exact pieces', 'err');
    const pcs = directPcs ? directPcs : outers * product.cartonOuter + inners * product.cartonInner;

    const existingIdx = lines.findIndex((l) => l.product.code === product.code);
    if (existingIdx >= 0) {
      const next = [...lines];
      const ex = next[existingIdx];
      next[existingIdx] = {
        ...ex,
        outers: ex.outers + (directPcs ? 0 : outers),
        inners: ex.inners + (directPcs ? 0 : inners),
        pcs: ex.pcs + pcs,
      };
      setLines(next);
      showToast(`${product.name} was already added — quantities combined`, 'g');
    } else {
      setLines([...lines, { product, outers: directPcs ? 0 : outers, inners: directPcs ? 0 : inners, pcs }]);
    }
    setConfirmingProduct(null);
    setShowProductPicker(false);
  }
  function removeLine(i) { setLines(lines.filter((_, idx) => idx !== i)); }

  const total = lines.reduce((s, l) => s + l.pcs * l.product.rate * (1 + (l.product.gst_pct || 5) / 100), 0);

  if (showPreview) {
    return (
      <div className="grid2">
        <PIPreview
          dealer={dealer}
          initialLines={lines.map((l) => ({
            code: l.product.code, name: l.product.name, photo: l.product.photo,
            outers: l.outers, inners: l.inners, pcs: l.pcs,
            rate: l.product.rate, gstPct: l.product.gst_pct || 5,
          }))}
          onBack={() => setShowPreview(false)}
        />
        <ModeInfoPanel />
      </div>
    );
  }

  return (
    <div className="grid2">
      <div>
        <div className="card">
          <h3 style={{ marginBottom: 8 }}>Step 1 · Pick dealer + confirm firm details</h3>
          {dealer ? (
            <div className="note g" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><b>{dealer.name}</b> · {dealer.city} · {dealer.payment} · GSTIN {dealer.gstin || '—'}</div>
              <button className="btn o sm" onClick={() => setDealer(null)}>Change</button>
            </div>
          ) : (
            <div className="note y" style={{ margin: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><b>No dealer selected.</b> Pick one to start.</div>
              <button className="btn sm" onClick={() => setShowDealerPicker(true)}>+ Pick dealer</button>
            </div>
          )}
        </div>

        {dealer && (
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Step 2 · Add items (each item confirmed with photo + code + rate before adding)</h3>
            <div className="btnrow" style={{ marginTop: 0 }}>
              <button className="btn" onClick={() => setShowProductPicker(true)}>+ Add item</button>
            </div>
            {lines.length ? (
              <>
                <div className="tblwrap" style={{ marginTop: 12 }}>
                  <table className="dt">
                    <thead><tr><th>#</th><th>Item</th><th>Packing</th><th>Pcs</th><th>Rate</th><th>GST</th><th>Total ₹</th><th></th></tr></thead>
                    <tbody>
                      {lines.map((l, i) => {
                        const gp = l.product.gst_pct || 5;
                        const lineTotal = l.pcs * l.product.rate * (1 + gp / 100);
                        return (
                          <tr key={i}>
                            <td>{i + 1}</td>
                            <td>
                              {l.product.photo && <img src={l.product.photo} alt="" style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover', verticalAlign: 'middle', marginRight: 6 }} />}
                              <b>{l.product.name}</b><br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.product.code}</span>
                            </td>
                            <td>{l.outers ? `${l.outers} outer` : ''}{l.inners ? `${l.inners} inner` : ''}</td>
                            <td>{l.pcs}</td>
                            <td>{l.product.rate.toFixed(2)}</td>
                            <td>{gp}%</td>
                            <td><b>{lineTotal.toFixed(2)}</b></td>
                            <td><button className="btn o sm" onClick={() => removeLine(i)}>×</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div style={{ textAlign: 'right', marginTop: 9, fontSize: 14 }}><b>Order total (with GST): ₹{total.toFixed(2)}</b></div>
                <div className="btnrow">
                  <button className="btn g" onClick={() => setShowPreview(true)}>→ Build PI</button>
                  <button className="btn o" onClick={() => setLines([])}>Clear</button>
                </div>
              </>
            ) : (
              <div className="empty" style={{ marginTop: 14 }}>No items yet — click "+ Add item"</div>
            )}
          </div>
        )}
      </div>

      <ModeInfoPanel />

      {showDealerPicker && (
        <DealerPickerModal
          dealers={dealers}
          onPick={(d) => { setDealer(d); setShowDealerPicker(false); }}
          onClose={() => setShowDealerPicker(false)}
          onDealerCreated={(d) => setDealers((prev) => [d, ...prev])}
        />
      )}
      {showProductPicker && (
        <ProductPickerModal products={products} onPick={(p) => setConfirmingProduct(p)} onClose={() => setShowProductPicker(false)} />
      )}
      {confirmingProduct && (
        <ConfirmLineModal product={confirmingProduct} onConfirm={addLine} onClose={() => setConfirmingProduct(null)} />
      )}
    </div>
  );
}

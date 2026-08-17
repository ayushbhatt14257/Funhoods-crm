import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';
import PIPreview from '../components/PIPreview';
import { ModeInfoPanel } from './WhatsAppOrderMode';

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

  function addLine(product, outers, inners) {
    if (!outers && !inners) return showToast('Enter outer or inner qty', 'err');
    const pcs = outers * product.cartonOuter + inners * product.cartonInner;
    setLines([...lines, { product, outers, inners, pcs }]);
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
        <DealerPickerModal dealers={dealers} onPick={(d) => { setDealer(d); setShowDealerPicker(false); }} onClose={() => setShowDealerPicker(false)} />
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

function DealerPickerModal({ dealers, onPick, onClose }) {
  const [q, setQ] = useState('');
  const filtered = dealers.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.city.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Pick dealer" onClose={onClose}>
      <input placeholder="Search dealer or city" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 11 }} autoFocus />
      {filtered.length ? filtered.map((d) => (
        <div
          key={d.code}
          style={{ background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 7, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => onPick(d)}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{d.name}</div>
            <div className="mono muted" style={{ fontSize: 10.5 }}>{d.code} · {d.city} · {d.payment}</div>
          </div>
          <span className="badge">{d.slab}</span>
        </div>
      )) : <div className="empty">No dealers match</div>}
    </Modal>
  );
}

function ProductPickerModal({ products, onPick, onClose }) {
  const [q, setQ] = useState('');
  const filtered = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Pick product" onClose={onClose}>
      <input placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 11 }} autoFocus />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
        {filtered.length ? filtered.map((p) => (
          <div
            key={p.code}
            style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, cursor: 'pointer', background: 'var(--white)' }}
            onClick={() => onPick(p)}
          >
            <div style={{ aspectRatio: '1', borderRadius: 6, background: p.photo ? `url(${p.photo}) center/cover` : 'var(--paper-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 6 }}>
              {!p.photo && '📦'}
            </div>
            <div className="mono muted" style={{ fontSize: 10 }}>{p.code}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>₹{p.rate.toFixed(2)} · GST {p.gst_pct || 5}%</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Outer {p.cartonOuter} · Inner {p.cartonInner}</div>
          </div>
        )) : <div className="empty">No matches</div>}
      </div>
    </Modal>
  );
}

function ConfirmLineModal({ product: p, onConfirm, onClose }) {
  const [outers, setOuters] = useState(0);
  const [inners, setInners] = useState(0);
  return (
    <Modal title={`Confirm — ${p.name}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, marginBottom: 12 }}>
        <div style={{ aspectRatio: '1', borderRadius: 8, background: p.photo ? `url(${p.photo}) center/cover` : 'var(--paper-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
          {!p.photo && '📦'}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{p.code} · {p.size}</div>
          <div style={{ marginTop: 6, fontSize: 12.5 }}>Rate: <b>₹{p.rate.toFixed(2)}</b> · GST <b>{p.gst_pct || 5}%</b></div>
          <div style={{ fontSize: 12.5 }}>Outer: <b>{p.cartonOuter} pcs</b> · Inner: <b>{p.cartonInner} pcs</b></div>
        </div>
      </div>
      <div className="row2">
        <div className="fg"><label>How many OUTER cartons?</label><input type="number" min={0} value={outers} onChange={(e) => setOuters(+e.target.value || 0)} /></div>
        <div className="fg"><label>How many INNER cartons?</label><input type="number" min={0} value={inners} onChange={(e) => setInners(+e.target.value || 0)} /></div>
      </div>
      <div className="btnrow">
        <button className="btn g" onClick={() => onConfirm(p, outers, inners)}>Confirm &amp; add to order</button>
        <button className="btn o" onClick={onClose}>Cancel</button>
      </div>
      <div className="note b" style={{ fontSize: 12 }}><b>You are confirming this exact SKU.</b> Double-check the code before adding.</div>
    </Modal>
  );
}

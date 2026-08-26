import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Letterhead from '../components/Letterhead';
import Loading from '../components/Loading';
import { ProductPickerModal, ConfirmLineModal } from './StructuredOrderMode';

export default function PIDetail() {
  const { no } = useParams();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [pi, setPi] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState([]);
  const [editRemark, setEditRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [confirmingProduct, setConfirmingProduct] = useState(null);

  async function load() {
    const data = await api.get(`/pi/${no}`);
    setPi(data);
    const [d, s] = await Promise.all([api.get(`/dealers/${data.dealer}`), api.get('/settings')]);
    setDealer(d);
    setSettings(s);
  }
  useEffect(() => { load(); }, [no]);

  useEffect(() => {
    if (pi && searchParams.get('edit') === '1' && ['Draft', 'Sent'].includes(pi.status) && !editing) {
      startEdit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pi]);

  async function confirmPI() {
    if (actionBusy) return;
    setActionBusy(true);
    try { await api.post(`/pi/${no}/confirm`); showToast('PI confirmed · stock reserved', 'g'); await load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setActionBusy(false); }
  }
  async function cancelPI() {
    if (!window.confirm('Cancel this PI? This cannot be undone.')) return;
    if (actionBusy) return;
    setActionBusy(true);
    try { await api.post(`/pi/${no}/cancel`); showToast('PI cancelled', 'g'); await load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setActionBusy(false); }
  }

  async function startEdit() {
    setEditLines(pi.lines.map((l) => ({ code: l.code, name: l.name, photo: l.photo, pcs: l.pcs, rate: l.rate, listRate: l.listRate, gstPct: l.gstPct || 5 })));
    setEditRemark(pi.remark || '');
    if (!products.length) setProducts(await api.get('/products'));
    setEditing(true);
  }
  function editField(i, field, val) {
    const next = [...editLines];
    next[i] = { ...next[i], [field]: +val || 0 };
    setEditLines(next);
  }
  function removeEditLine(i) {
    setEditLines(editLines.filter((_, idx) => idx !== i));
  }

  // Same flow as New Order: pick a product (photo grid) -> confirm outer/inner cartons or exact pieces.
  function addConfirmedLine(product, outers, inners, directPcs) {
    if (!outers && !inners && !directPcs) return showToast('Enter outer/inner cartons, or exact pieces', 'err');
    const pcs = directPcs ? directPcs : outers * product.cartonOuter + inners * product.cartonInner;

    const existingIdx = editLines.findIndex((l) => l.code === product.code);
    if (existingIdx >= 0) {
      const next = [...editLines];
      next[existingIdx] = { ...next[existingIdx], pcs: next[existingIdx].pcs + pcs };
      setEditLines(next);
      showToast(`${product.name} was already on this PI — quantities combined`, 'g');
    } else {
      setEditLines([...editLines, {
        code: product.code, name: product.name, photo: product.photo,
        pcs, rate: product.rate, listRate: product.rate, gstPct: product.gst_pct || 5,
      }]);
    }
    setConfirmingProduct(null);
    setShowProductPicker(false);
  }

  const editTotal = editLines.reduce((s, l) => s + l.pcs * l.rate * (1 + (l.gstPct || 5) / 100), 0);

  async function saveEdit() {
    if (!editLines.length) return showToast('PI needs at least one item', 'err');
    setSaving(true);
    try {
      const updated = await api.put(`/pi/${no}`, {
        lines: editLines.map((l) => ({ code: l.code, pcs: l.pcs, rate: l.rate })),
        remark: editRemark,
      });
      setPi(updated);
      setEditing(false);
      showToast('PI updated', 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSaving(false); }
  }

  if (!pi || !dealer || !settings) return <Loading label="Loading PI…" />;
  const canConfirm = pi.status === 'Sent' && ['mhead', 'accounts', 'founder'].includes(user.role);
  const canDispatch = ['Confirmed', 'Partial Dispatched'].includes(pi.status) && ['dispatch', 'accounts', 'founder'].includes(user.role);
  const canCancel = !['Cancelled', 'Fully Dispatched'].includes(pi.status);
  const canEdit = ['Draft', 'Sent'].includes(pi.status);

  if (editing) {
    return (
      <div>
        <div className="ph"><div className="eyebrow">Editing</div><h2>{pi.no}</h2><p>{pi.dealerName}</p></div>
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th></th><th>Item</th><th>Pieces</th><th>Rate ₹</th><th>GST%</th><th>Line total ₹</th><th></th></tr></thead>
            <tbody>
              {editLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                  <td>{l.name}<br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.code}</span></td>
                  <td><input type="number" style={{ width: 90 }} value={l.pcs} onChange={(e) => editField(i, 'pcs', e.target.value)} /></td>
                  <td>
                    <input type="number" step="0.01" style={{ width: 90 }} value={l.rate} onChange={(e) => editField(i, 'rate', e.target.value)} />
                    {l.rate !== l.listRate && <div style={{ fontSize: 9, color: 'var(--orange)' }}>edited (list ₹{l.listRate})</div>}
                  </td>
                  <td>{l.gstPct}</td>
                  <td><b>{(l.pcs * l.rate * (1 + (l.gstPct || 5) / 100)).toFixed(2)}</b></td>
                  <td><button className="btn rd sm" onClick={() => removeEditLine(i)}>Delete</button></td>
                </tr>
              ))}
              {!editLines.length && <tr><td colSpan={7}><div className="empty">No items — add one below</div></td></tr>}
            </tbody>
          </table>
        </div>

        <div className="btnrow">
          <button className="btn o sm" onClick={() => setShowProductPicker(true)}>+ Add item</button>
        </div>

        <div style={{ textAlign: 'right', marginTop: 12, fontSize: 15 }}>
          <b>Grand total (with GST): ₹{editTotal.toFixed(2)}</b>
        </div>

        <div className="fg" style={{ marginTop: 12 }}>
          <label>Remark</label>
          <textarea rows={2} value={editRemark} onChange={(e) => setEditRemark(e.target.value)} />
        </div>
        <div className="note y" style={{ fontSize: 12 }}>Editing or adding rates here also notifies the founder, same as at creation time.</div>
        <div className="btnrow">
          <button className="btn g" disabled={saving} onClick={saveEdit}>Save changes</button>
          <button className="btn o" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        </div>

        {showProductPicker && (
          <ProductPickerModal products={products} onPick={(p) => setConfirmingProduct(p)} onClose={() => setShowProductPicker(false)} />
        )}
        {confirmingProduct && (
          <ConfirmLineModal product={confirmingProduct} onConfirm={addConfirmedLine} onClose={() => setConfirmingProduct(null)} />
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">PI detail</div><h2>{pi.no}</h2><p>{pi.dealerName} · <span className="badge">{pi.status}</span></p></div>

      <Letterhead
        kind="PI"
        docNo={pi.no}
        date={pi.date || pi.createdAt}
        dealer={dealer}
        lines={pi.lines}
        subtotal={pi.subtotal}
        total={pi.total}
        remark={pi.remark}
        settings={settings}
      />

      <div className="btnrow">
        {canEdit && <button className="btn o" onClick={startEdit}>Edit PI</button>}
        {canConfirm && <button className="btn g" disabled={actionBusy} onClick={confirmPI}>{actionBusy ? 'Working…' : 'Mark confirmed by customer'}</button>}
        {canDispatch && <button className="btn" onClick={() => nav(`/dispatch?pi=${pi.no}`)}>→ Book dispatch</button>}
        {canCancel && <button className="btn rd" disabled={actionBusy} onClick={cancelPI}>{actionBusy ? 'Working…' : 'Cancel PI'}</button>}
        <button className="btn o" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
      </div>
      <div className="note b" style={{ fontSize: 12, marginTop: 14 }}>Tax Invoice is generated at dispatch (actual shipped qty), not at PI stage.</div>
    </div>
  );
}

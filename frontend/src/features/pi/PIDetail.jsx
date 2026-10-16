import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { piApi } from './api';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import Letterhead from '../../components/Letterhead';
import Loading from '../../components/Loading';
import ConfirmPopup from '../../components/ConfirmPopup';
import ProductPickerModal from './components/ProductPickerModal';
import ConfirmLineModal from './components/ConfirmLineModal';
import { printAs, ddmmyyyy } from '../../utils/print';
import { piStatusDisplay } from './statusDisplay';

export default function PIDetail() {
  const { no } = useParams();
  const [searchParams] = useSearchParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  // Anyone can price below base now — see PIPreview.jsx and the backend's
  // requiresPriceApproval for the full explanation; only Master Admin's own
  // edits skip the approval queue.
  const needsApproval = user?.role !== 'masterAdmin';
  const nav = useNavigate();
  const [pi, setPi] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [settings, setSettings] = useState(null);
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState([]);
  const [editRemark, setEditRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCloseRemaining, setShowCloseRemaining] = useState(false);
  const [approvingPrice, setApprovingPrice] = useState(false);
  const [closeNote, setCloseNote] = useState('');
  const [products, setProducts] = useState([]);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [confirmingProduct, setConfirmingProduct] = useState(null);

  async function load() {
    const data = await piApi.getByNo(no);
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

  async function sendToCustomer() {
    if (actionBusy) return;
    setActionBusy(true);
    try { await piApi.setStatus(no, 'Sent'); showToast('PI sent to customer', 'g'); await load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setActionBusy(false); }
  }
  async function confirmPI() {
    if (actionBusy) return;
    setActionBusy(true);
    try { await piApi.confirm(no); showToast('PI confirmed · stock reserved', 'g'); await load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setActionBusy(false); }
  }
  async function cancelPI() {
    if (!window.confirm('Cancel this PI? This cannot be undone.')) return;
    if (actionBusy) return;
    setActionBusy(true);
    try { await piApi.cancel(no); showToast('PI cancelled', 'g'); await load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setActionBusy(false); }
  }
  async function closeRemaining() {
    if (!closeNote.trim()) return showToast('A note is required', 'err');
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await piApi.closeRemaining(no, closeNote.trim());
      showToast('Remaining quantity written off · stock released', 'g');
      setShowCloseRemaining(false);
      setCloseNote('');
      await load();
    } catch (err) { showToast(err.message, 'err'); }
    finally { setActionBusy(false); }
  }
  async function approvePricePI() {
    setApprovingPrice(true);
    try { await piApi.approvePrice(no); showToast('Price approved', 'g'); await load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setApprovingPrice(false); }
  }
  async function deletePI() {
    setActionBusy(true);
    try {
      await piApi.remove(no);
      showToast('PI deleted', 'g');
      nav('/pis');
    } catch (err) {
      showToast(err.message, 'err');
      setActionBusy(false);
      setShowDeleteConfirm(false);
    }
  }

  async function startEdit() {
    const allProducts = products.length ? products : await api.get('/products');
    if (!products.length) setProducts(allProducts);
    const byCode = {};
    allProducts.forEach((p) => { byCode[p.code] = p; });
    setEditLines(pi.lines.map((l) => {
      const p = byCode[l.code];
      const cartonOuter = p?.cartonOuter || 0;
      const cartonInner = p?.hasInner !== false ? (p?.cartonInner || 0) : 0;
      const outers = l.outers || 0;
      const inners = l.inners || 0;
      // Whatever pieces aren't accounted for by the stored outer/inner
      // cartons are loose pieces — same split the carton-aware fields below
      // let the user edit directly.
      const loosePcs = Math.max(0, l.pcs - outers * cartonOuter - inners * cartonInner);
      return {
        code: l.code, name: l.name, photo: l.photo,
        outers, inners, loosePcs, pcs: l.pcs,
        rate: l.rate, listRate: l.listRate, gstPct: l.gstPct || 5,
        cartonOuter, cartonInner,
      };
    }));
    setEditRemark(pi.remark || '');
    setEditing(true);
  }
  function editField(i, field, val) {
    const next = [...editLines];
    const line = { ...next[i] };
    if (field === 'rate') {
      // Rate edits can carry paise (e.g. 25.01).
      line.rate = +val || 0;
    } else {
      // outers / inners / loosePcs — recompute the derived total pcs.
      line[field] = +val || 0;
      line.pcs = line.outers * line.cartonOuter + line.inners * line.cartonInner + line.loosePcs;
    }
    next[i] = line;
    setEditLines(next);
  }
  function removeEditLine(i) {
    setEditLines(editLines.filter((_, idx) => idx !== i));
  }

  // Same flow as New Order: pick a product (photo grid) -> confirm outer/inner cartons or exact pieces.
  function addConfirmedLine(product, outers, inners, directPcs) {
    if (!outers && !inners && !directPcs) return showToast('Enter outer/inner cartons, or exact pieces', 'err');
    const cartonOuter = product.cartonOuter || 0;
    const cartonInner = product.hasInner !== false ? (product.cartonInner || 0) : 0;
    const pcs = directPcs ? directPcs : outers * cartonOuter + inners * cartonInner;
    const loosePcs = directPcs ? directPcs : 0;

    const existingIdx = editLines.findIndex((l) => l.code === product.code);
    if (existingIdx >= 0) {
      const next = [...editLines];
      const ex = next[existingIdx];
      next[existingIdx] = {
        ...ex,
        outers: ex.outers + outers, inners: ex.inners + inners, loosePcs: ex.loosePcs + loosePcs,
        pcs: ex.pcs + pcs,
      };
      setEditLines(next);
      showToast(`${product.name} was already on this PI — quantities combined`, 'g');
    } else {
      setEditLines([...editLines, {
        code: product.code, name: product.name, photo: product.photo,
        outers, inners, loosePcs, pcs,
        rate: product.rate, listRate: product.rate, gstPct: product.gst_pct || 5,
        cartonOuter, cartonInner,
      }]);
    }
    setConfirmingProduct(null);
    setShowProductPicker(false);
  }

  const editTotal = editLines.reduce((s, l) => s + l.pcs * l.rate * (1 + (l.gstPct || 5) / 100), 0);
  const belowFloorEditLines = needsApproval ? editLines.filter((l) => l.rate < l.listRate) : [];

  async function saveEdit() {
    if (!editLines.length) return showToast('PI needs at least one item', 'err');
    setSaving(true);
    try {
      const updated = await piApi.update(no, {
        lines: editLines.map((l) => ({ code: l.code, pcs: l.pcs, outers: l.outers, inners: l.inners, rate: l.rate })),
        remark: editRemark,
      });
      setPi(updated);
      setEditing(false);
      showToast(belowFloorEditLines.length ? 'PI updated — sent for Master Admin price approval' : 'PI updated', 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSaving(false); }
  }

  if (!pi || !dealer || !settings) return <Loading label="Loading PI…" />;
  const canSend = pi.status === 'Draft';
  const canConfirm = pi.status === 'Sent' && ['mhead', 'accounts', 'admin', 'masterAdmin'].includes(user.role);
  const canDispatch = ['Confirmed', 'Partial Dispatched'].includes(pi.status) && ['dispatch', 'accounts', 'admin', 'masterAdmin'].includes(user.role);
  const canCancel = !['Cancelled', 'Fully Dispatched', 'Closed'].includes(pi.status);
  const canCloseRemaining = pi.status === 'Partial Dispatched' && ['dispatch', 'accounts', 'admin', 'masterAdmin'].includes(user.role);
  // After confirmation, editing stays open only up to the point nothing has
  // dispatched yet, and only for whoever placed the order or Master Admin —
  // once any dispatch happens the status itself moves past 'Confirmed' and
  // this closes for everyone, no exceptions (see backend update()).
  const isCreator = pi.createdBy && user?.id && String(pi.createdBy) === String(user.id);
  const canEdit = ['Draft', 'Sent'].includes(pi.status)
    || (pi.status === 'Confirmed' && (isCreator || user.role === 'masterAdmin'));
  const canDelete = ['admin', 'masterAdmin'].includes(user.role) && pi.status === 'Draft';

  if (editing) {
    return (
      <div>
        <div className="ph"><div className="eyebrow">Editing</div><h2>{pi.no}</h2><p>{pi.dealerName}</p></div>
        {pi.status === 'Confirmed' && (
          <div className="note y" style={{ fontSize: 12, marginBottom: 10 }}>
            Editing a confirmed PI — this will be flagged as <b>"PI edited"</b> once saved.
          </div>
        )}
        <div className="tblwrap">
          <table className="dt">
            <thead>
              <tr>
                <th></th><th>Item</th>
                <th>Rate ₹ (ex-GST)</th><th>GST%</th>
                <th>Outer ctns</th><th>Inner ctns</th><th>Loose pcs</th><th>Total pcs</th>
                <th>Line total ₹</th><th></th>
              </tr>
            </thead>
            <tbody>
              {editLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                  <td>{l.name}<br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.code}</span></td>
                  <td>
                    <input
                      type="number" step="0.01" style={{ width: 90, borderColor: needsApproval && l.rate < l.listRate ? 'var(--orange)' : undefined }}
                      value={l.rate} onChange={(e) => editField(i, 'rate', e.target.value)}
                    />
                    {needsApproval && l.rate < l.listRate ? (
                      <div style={{ fontSize: 9, color: 'var(--orange)', fontWeight: 600 }}>⚠ below ₹{l.listRate} — needs Master Admin approval</div>
                    ) : l.rate !== l.listRate && (
                      <div style={{ fontSize: 9, color: 'var(--orange)' }}>edited (list ₹{l.listRate})</div>
                    )}
                  </td>
                  <td>{l.gstPct}</td>
                  <td>
                    {l.cartonOuter > 0
                      ? <input type="number" min={0} style={{ width: 64 }} value={l.outers} onChange={(e) => editField(i, 'outers', e.target.value)} />
                      : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                  </td>
                  <td>
                    {l.cartonInner > 0
                      ? <input type="number" min={0} style={{ width: 64 }} value={l.inners} onChange={(e) => editField(i, 'inners', e.target.value)} />
                      : <span className="muted" style={{ fontSize: 11 }}>—</span>}
                  </td>
                  <td><input type="number" min={0} style={{ width: 64 }} value={l.loosePcs} onChange={(e) => editField(i, 'loosePcs', e.target.value)} /></td>
                  <td><b>{l.pcs}</b></td>
                  <td><b>{(l.pcs * l.rate * (1 + (l.gstPct || 5) / 100)).toFixed(2)}</b></td>
                  <td><button className="btn rd sm" onClick={() => removeEditLine(i)}>Delete</button></td>
                </tr>
              ))}
              {!editLines.length && <tr><td colSpan={10}><div className="empty">No items — add one below</div></td></tr>}
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
        <div className="note y" style={{ fontSize: 12 }}>Editing or adding rates here also notifies the admin, same as at creation time.</div>
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
      <div className="ph">
        <div className="eyebrow">PI detail</div><h2>{pi.no}</h2>
        <p>
          {pi.dealerName} · <span className={`badge ${piStatusDisplay(pi).cls}`}>{piStatusDisplay(pi).label}</span>
          {pi.edited && (
            <span className="badge y" style={{ marginLeft: 6 }} title={`Last edited by ${pi.editedBy} on ${new Date(pi.editedAt).toLocaleString('en-IN')}`}>
              ✏️ PI edited
            </span>
          )}
        </p>
      </div>

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
        salesRep={{ name: pi.by, mobile: pi.repMobile }}
        samples={pi.samples}
      />

      <div className="card" style={{ marginTop: 10 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Dispatch status</h3>
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Item</th><th>Ordered</th><th>Dispatched</th><th>Pending</th><th></th></tr></thead>
            <tbody>
              {pi.lines.map((l, i) => {
                const pending = l.pending != null ? l.pending : l.pcs;
                const dispatched = l.pcs - pending;
                return (
                  <tr key={i}>
                    <td>{l.name}<br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.code}</span></td>
                    <td>{l.pcs}</td>
                    <td style={{ color: dispatched > 0 ? 'var(--green)' : undefined, fontWeight: dispatched > 0 ? 600 : undefined }}>{dispatched}</td>
                    <td style={{ color: pending > 0 ? 'var(--orange)' : undefined, fontWeight: pending > 0 ? 600 : undefined }}>{pending}</td>
                    <td>
                      {pending === 0
                        ? <span className="badge g">✓ Fully dispatched</span>
                        : dispatched > 0
                          ? <span className="badge y">Partially dispatched</span>
                          : <span className="badge">Not dispatched</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="btnrow">
        {canEdit && <button className="btn o" onClick={startEdit}>Edit PI</button>}
        {!canEdit && pi.status === 'Confirmed' && (
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>
            Only the user who placed this order, or Master Admin, can edit it now.
          </span>
        )}
        {canSend && <button className="btn g" disabled={actionBusy} onClick={sendToCustomer}>{actionBusy ? 'Working…' : 'Save + send to customer'}</button>}
        {canConfirm && <button className="btn g" disabled={actionBusy} onClick={confirmPI}>{actionBusy ? 'Working…' : 'Mark confirmed by customer'}</button>}
        {canDispatch && <button className="btn" onClick={() => nav(`/dispatch?dealer=${pi.dealer}`)}>→ Book dispatch</button>}
        {canCancel && <button className="btn rd" disabled={actionBusy} onClick={cancelPI}>{actionBusy ? 'Working…' : 'Cancel PI'}</button>}
        {canCloseRemaining && <button className="btn o" disabled={actionBusy} onClick={() => setShowCloseRemaining(true)}>Close remaining (write off)</button>}
        <button className="btn o" onClick={() => printAs(`${pi.dealerName} ${ddmmyyyy(pi.date || pi.createdAt)}`)}>🖨️ Print / Save PDF</button>
        {canDelete && <button className="btn rd" style={{ marginLeft: 'auto' }} onClick={() => setShowDeleteConfirm(true)}>Delete PI</button>}
      </div>
      {pi.status === 'Closed' && pi.closeNote && (
        <div className="note y" style={{ fontSize: 12.5, marginTop: 10 }}>
          <b>Closed with remaining written off</b> by {pi.closedBy} on {new Date(pi.closedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })} — "{pi.closeNote}"
        </div>
      )}
      {pi.priceApproval?.status === 'pending' && (
        <div className="note r" style={{ fontSize: 12.5, marginTop: 10 }}>
          <b>⏳ Awaiting Master Admin price approval</b> — this PI has a discounted line and can't be dispatched until a Master Admin approves it.
          {user.role === 'masterAdmin' && (
            <div className="btnrow" style={{ marginTop: 8 }}>
              <button className="btn g sm" disabled={approvingPrice} onClick={approvePricePI}>{approvingPrice ? 'Approving…' : '✓ Approve now'}</button>
            </div>
          )}
        </div>
      )}
      {pi.priceApproval?.status === 'approved' && pi.priceApproval.decidedBy && (
        <div className="note g" style={{ fontSize: 12.5, marginTop: 10 }}>
          ✅ Price approved by <b>{pi.priceApproval.decidedBy}</b> on {new Date(pi.priceApproval.decidedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </div>
      )}
      {pi.lines.some((l) => l.listRate != null && l.rate !== l.listRate) && (
        <div className="card" style={{ marginTop: 10 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Price changes on this PI</h3>
          <table className="dt">
            <thead><tr><th>Item</th><th>Original ₹</th><th>Changed ₹</th><th>Qty</th></tr></thead>
            <tbody>
              {pi.lines.filter((l) => l.listRate != null && l.rate !== l.listRate).map((l) => (
                <tr key={l.code}>
                  <td>{l.name} <span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                  <td>{l.listRate}</td>
                  <td style={{ color: l.rate < l.listRate ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{l.rate}</td>
                  <td>{l.pcs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {showDeleteConfirm && (
        <ConfirmPopup
          title="Delete this PI?"
          message={`${pi.no} (${pi.dealerName}) will be permanently deleted. This cannot be undone.`}
          confirmLabel="Delete"
          danger
          busy={actionBusy}
          onConfirm={deletePI}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
      {showCloseRemaining && (
        <ConfirmPopup
          title="Close remaining quantity?"
          message={
            `The pending quantity on ${pi.lines.filter((l) => (l.pending != null ? l.pending : l.pcs) > 0).length} line(s) will be written off and released back to free-to-sell stock. `
            + `This PI will move to "Closed" — it won't dispatch any further. This cannot be undone.`
          }
          confirmLabel={actionBusy ? 'Working…' : 'Close remaining'}
          danger
          busy={actionBusy}
          onConfirm={closeRemaining}
          onClose={() => { setShowCloseRemaining(false); setCloseNote(''); }}
        >
          <textarea
            placeholder="Reason — e.g. wrong carton size, customer cancelled 2 cartons…"
            value={closeNote}
            onChange={(e) => setCloseNote(e.target.value)}
            rows={3}
            style={{ width: '100%', marginTop: -6, marginBottom: 10 }}
          />
        </ConfirmPopup>
      )}
      <div className="note b" style={{ fontSize: 12, marginTop: 14 }}>Delivery Challan is generated at dispatch (actual shipped qty), not at PI stage.</div>
    </div>
  );
}

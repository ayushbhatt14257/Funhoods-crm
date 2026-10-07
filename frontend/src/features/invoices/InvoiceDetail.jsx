import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getToken, API_URL } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Letterhead from '../../components/Letterhead';
import Loading from '../../components/Loading';
import ConfirmPopup from '../../components/ConfirmPopup';
import { invoicesApi } from './api';
import { printAs, ddmmyyyy } from '../../utils/print';

export default function InvoiceDetail() {
  const { no } = useParams();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [inv, setInv] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [settings, setSettings] = useState(null);
  const [uploadingBuilty, setUploadingBuilty] = useState(false);
  const [confirmingPaid, setConfirmingPaid] = useState(false);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);
  const [reverting, setReverting] = useState(false);
  const [manualRows, setManualRows] = useState([]); // [{piNo, code, pcs}] — only used when the invoice has no recorded consumedFrom
  const builtyInputRef = useRef();

  async function load() {
    const data = await invoicesApi.getByNo(no);
    setInv(data);
    const [d, s] = await Promise.all([api.get(`/dealers/${data.dealer}`), api.get('/settings')]);
    setDealer(d);
    setSettings(s);
  }
  useEffect(() => { load(); }, [no]);

  async function markDelivered() {
    try { await invoicesApi.markDelivered(no); showToast('Marked delivered', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function onPickBuilty(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    setUploadingBuilty(true);
    try { await invoicesApi.uploadBuilty(no, fd); showToast('Builty uploaded', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setUploadingBuilty(false); if (builtyInputRef.current) builtyInputRef.current.value = ''; }
  }

  async function confirmMarkPaid() {
    setMarkingPaid(true);
    try { await invoicesApi.markPaid(no); showToast('Payment marked received', 'g'); setConfirmingPaid(false); load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setMarkingPaid(false); }
  }

  function addManualRow() {
    setManualRows((r) => [...r, { piNo: '', code: '', pcs: '' }]);
  }

  // Code + pcs are already known from the invoice itself — the only thing
  // a person actually needs to work out is which PI it came from. So when
  // the revert panel opens for an invoice with no auto-tracked source, one
  // row is pre-filled per paid line (code/pcs locked in), leaving just the
  // PI number to type in for each.
  function openRevert() {
    if (!inv.consumedFrom?.length) {
      setManualRows(inv.lines.map((l) => ({ piNo: '', code: l.code, name: l.name, pcs: l.pcs })));
    }
    setRevertOpen(true);
  }
  function updateManualRow(i, field, val) {
    setManualRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: val } : row)));
  }
  function removeManualRow(i) {
    setManualRows((r) => r.filter((_, idx) => idx !== i));
  }

  async function confirmRevert() {
    setReverting(true);
    try {
      const manualPiRestore = (inv.consumedFrom?.length ? [] : manualRows)
        .filter((r) => r.piNo && r.code && r.pcs)
        .map((r) => ({ piNo: r.piNo.trim(), code: r.code.trim(), pcs: Number(r.pcs) || 0 }));
      const result = await invoicesApi.revert(no, { manualPiRestore });
      showToast(result.message || 'Dispatch reverted', 'g');
      setRevertOpen(false);
      setManualRows([]);
      load();
    } catch (err) { showToast(err.message, 'err'); }
    finally { setReverting(false); }
  }

  async function downloadPackingList() {
    const res = await fetch(`${API_URL}/invoices/${no}/packing-list.xlsx`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return showToast('Export failed', 'err');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Packing_List_${no}.xlsx`;
    a.click();
  }

  if (!inv || !dealer || !settings) return <Loading label="Loading invoice…" />;

  const daysSinceDispatch = Math.floor((Date.now() - new Date(inv.dispatchDate || inv.date)) / 86400000);
  const canMarkPaid = ['accounts', 'admin'].includes(user?.role);
  const canRevert = user?.role === 'masterAdmin' && inv.status !== 'Cancelled';
  const hasAutoConsumed = !!inv.consumedFrom?.length;

  return (
    <div>
      <div className="ph"><div className="eyebrow">Invoice</div><h2>{inv.no}</h2>
        <p>
          {inv.dealerName} · Via: <b>{inv.transporter || '—'}</b> · <span className="badge">{inv.status}</span>{' '}
          {inv.status !== 'Cancelled' && (
            <span className={`badge ${daysSinceDispatch >= 30 ? 'r' : daysSinceDispatch >= 15 ? 'y' : ''}`}>
              Day {daysSinceDispatch} since dispatch
            </span>
          )}{' '}
          {inv.paymentReceived ? <span className="badge g">💰 Payment received</span> : <span className="badge y">Payment pending</span>}
        </p>
      </div>

      <Letterhead
        kind="INVOICE"
        docNo={inv.no}
        date={inv.date || inv.dispatchDate || inv.createdAt}
        dealer={dealer}
        lines={inv.lines}
        subtotal={inv.subtotal}
        transport={inv.transport || inv.freight || 0}
        freightGst={inv.freightGst || 0}
        transporter={inv.transporter}
        freightTerm={inv.freightTerm}
        total={inv.total}
        cartons={inv.cartons}
        outerCartons={inv.outerCartons}
        innerCartons={inv.innerCartons}
        salesRep={{ name: inv.by, mobile: inv.repMobile }}
        gifts={inv.gifts}
        settings={settings}
        extraHeaderRight={inv.piRef ? <div>Against PI: <b>{inv.piRef}</b></div> : <div style={{ color: 'var(--orange)' }}>Manual dispatch (no PI)</div>}
      />

      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn o" onClick={() => printAs(`${inv.dealerName} ${ddmmyyyy(inv.date || inv.dispatchDate || inv.createdAt)}`)}>🖨️ Print / Save PDF</button>
        {inv.status === 'Dispatched' && <button className="btn g" onClick={markDelivered}>Mark delivered</button>}
        {canRevert && <button className="btn r o" onClick={openRevert}>↩️ Revert dispatch</button>}
      </div>

      {inv.status === 'Cancelled' && (
        <div className="note r" style={{ marginTop: 10 }}>
          ❌ Cancelled (reverted){inv.revertedBy && <> by <b>{inv.revertedBy}</b></>}
          {inv.revertedAt && <> on {new Date(inv.revertedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
        </div>
      )}

      <h3 style={{ margin: '20px 0 10px' }}>Builty (LR receipt)</h3>
      <div className="card">
        {inv.builty?.url ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            {/\.(jpg|jpeg|png|webp)$/i.test(inv.builty.url)
              ? <img src={inv.builty.url} alt="Builty" style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6 }} />
              : <div style={{ width: 90, height: 90, borderRadius: 6, background: 'var(--paper)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30 }}>📄</div>}
            <div>
              <a href={inv.builty.url} target="_blank" rel="noreferrer" className="btn o sm">View builty</a>
            </div>
            <button className="btn o sm" disabled={uploadingBuilty} onClick={() => builtyInputRef.current?.click()} style={{ marginLeft: 'auto' }}>
              {uploadingBuilty ? 'Uploading…' : 'Replace builty'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span className="muted" style={{ fontSize: 13 }}>No builty uploaded yet for this dispatch.</span>
            <button className="btn sm" disabled={uploadingBuilty} onClick={() => builtyInputRef.current?.click()}>
              {uploadingBuilty ? 'Uploading…' : '+ Upload builty'}
            </button>
          </div>
        )}
        <input ref={builtyInputRef} type="file" accept="image/*,application/pdf" hidden onChange={onPickBuilty} />
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Payment</h3>
      <div className="card">
        {inv.paymentReceived ? (
          <div className="note g" style={{ margin: 0, fontSize: 13 }}>
            ✅ Payment received {inv.paymentReceivedBy && <>· marked by <b>{inv.paymentReceivedBy}</b></>}
            {inv.paymentReceivedAt && <> on {new Date(inv.paymentReceivedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13 }}>
              Payment not yet marked received — {daysSinceDispatch} day(s) since dispatch
              {daysSinceDispatch >= 30 && <span style={{ color: 'var(--red)', fontWeight: 600 }}> · overdue (30+ days)</span>}
            </span>
            {canMarkPaid && <button className="btn g sm" onClick={() => setConfirmingPaid(true)}>Mark payment received</button>}
          </div>
        )}
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Packing list (carton-wise)</h3>
      {inv.packing.map((c) => (
        <div className="card" key={c.no} style={{ display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 10 }}>
          <div style={{ fontWeight: 700, textAlign: 'center' }}>#{c.no}</div>
          <div>
            {c.mixed && <div style={{ fontSize: 9.5, color: 'var(--orange)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Mixed carton</div>}
            {c.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                {it.photo ? <img src={it.photo} alt="" style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }} /> : '📦'}
                <span>{it.name}</span><span className="mono muted" style={{ fontSize: 10 }}>{it.code}</span>
              </div>
            ))}
          </div>
          <div style={{ fontWeight: 700 }}>{c.items.reduce((s, it) => s + it.pcs, 0)} pcs</div>
        </div>
      ))}
      <div className="btnrow">
        <button className="btn o" onClick={downloadPackingList}>📊 Export packing list (Excel)</button>
      </div>

      {confirmingPaid && (
        <ConfirmPopup
          title="Mark payment received?"
          message={`This will mark ${inv.no} as paid. This can't be undone from here — make sure the payment has actually been received before confirming.`}
          confirmLabel="Yes, mark received"
          danger
          busy={markingPaid}
          onConfirm={confirmMarkPaid}
          onClose={() => setConfirmingPaid(false)}
        />
      )}

      {revertOpen && (
        <div className="modal-backdrop" onClick={() => setRevertOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <h3>Revert dispatch {inv.no}?</h3>
            <p style={{ fontSize: 13 }}>
              This will cancel the invoice, add every pcs (paid + free gift) back into physical stock,
              and un-dispatch every scanned carton so it can be rescanned.
            </p>

            {hasAutoConsumed ? (
              <div className="note g" style={{ fontSize: 13 }}>
                PI pending will be restored automatically from this invoice's recorded source:
                <ul style={{ margin: '6px 0 0 18px' }}>
                  {inv.consumedFrom.map((c, i) => (
                    <li key={i}>{c.piNo} · {c.code} @ ₹{c.rate} · {c.pcs} pcs</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="note y" style={{ fontSize: 13 }}>
                This invoice has no recorded PI source (it predates auto-tracking). Product and pcs are
                already filled in below from the invoice itself — just type the PI number each one came
                from (leave a row's PI number blank to skip restoring that one, e.g. if it wasn't from a PI).
                <div style={{ marginTop: 8 }}>
                  {manualRows.map((row, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ minWidth: 150, fontWeight: 600 }}>{row.name || row.code}</span>
                      <span className="mono muted" style={{ fontSize: 10, minWidth: 70 }}>{row.code}</span>
                      <span className="muted" style={{ fontSize: 12, minWidth: 60 }}>{row.pcs} pcs</span>
                      <input placeholder="PI no (e.g. PI-2610-0207)" value={row.piNo} onChange={(e) => updateManualRow(i, 'piNo', e.target.value)} style={{ width: 170 }} />
                      {manualRows.length > inv.lines.length && <button className="btn o sm" onClick={() => removeManualRow(i)}>✕</button>}
                    </div>
                  ))}
                  <button className="btn o sm" onClick={addManualRow}>+ Add another row</button>
                </div>
              </div>
            )}

            <div className="btnrow" style={{ marginTop: 14 }}>
              <button className="btn o" onClick={() => setRevertOpen(false)} disabled={reverting}>Cancel</button>
              <button className="btn r" onClick={confirmRevert} disabled={reverting}>
                {reverting ? 'Reverting…' : 'Yes, revert this dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

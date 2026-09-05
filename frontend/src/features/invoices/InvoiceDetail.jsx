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
  const canMarkPaid = ['accounts', 'founder'].includes(user?.role);

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
        freightTerm={inv.freightTerm}
        total={inv.total}
        cartons={inv.cartons}
        settings={settings}
        extraHeaderRight={inv.piRef ? <div>Against PI: <b>{inv.piRef}</b></div> : <div style={{ color: 'var(--orange)' }}>Manual dispatch (no PI)</div>}
      />

      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn o" onClick={() => printAs(`${inv.dealerName} ${ddmmyyyy(inv.date || inv.dispatchDate || inv.createdAt)}`)}>🖨️ Print / Save PDF</button>
        {inv.status === 'Dispatched' && <button className="btn g" onClick={markDelivered}>Mark delivered</button>}
      </div>

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
    </div>
  );
}

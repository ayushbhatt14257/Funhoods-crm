import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { oemApi, oemStatusCls } from './api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Loading from '../../components/Loading';
import ConfirmPopup from '../../components/ConfirmPopup';
import { printAs, ddmmyyyy } from '../../utils/print';

const NEXT = { Draft: 'Confirmed', Confirmed: 'In Production', 'In Production': 'Ready', Ready: 'Delivered' };
const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

export default function OemDetail() {
  const { no } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const { showToast } = useToast();
  const canWrite = ['accounts', 'admin', 'masterAdmin'].includes(user.role);
  const canDelete = ['admin', 'masterAdmin'].includes(user.role);
  const [o, setO] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [settings, setSettings] = useState(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // { status, danger }
  const [note, setNote] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  async function load() {
    const data = await oemApi.getByNo(no);
    setO(data);
    const [d, s] = await Promise.all([api.get(`/dealers/${data.dealer}`), api.get('/settings')]);
    setDealer(d);
    setSettings(s);
  }
  useEffect(() => { load().catch((e) => showToast(e.message, 'err')); /* eslint-disable-next-line */ }, [no]);

  async function applyStatus() {
    setBusy(true);
    try {
      await oemApi.setStatus(no, pending.status, note.trim());
      showToast(`Moved to ${pending.status}`, 'g');
      setPending(null); setNote('');
      await load();
    } catch (err) { showToast(err.message, 'err'); }
    finally { setBusy(false); }
  }
  async function del() {
    setBusy(true);
    try { await oemApi.remove(no); showToast('Deleted', 'g'); nav('/oem'); }
    catch (err) { showToast(err.message, 'err'); setBusy(false); setShowDelete(false); }
  }

  if (!o || !dealer || !settings) return <Loading label="Loading OEM order…" />;
  const s = settings;
  const next = NEXT[o.status];
  const canEdit = canWrite && ['Draft', 'Confirmed'].includes(o.status);
  const canCancel = canWrite && !['Delivered', 'Cancelled'].includes(o.status);
  const balance = o.total - (o.advance || 0);

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">OEM order</div><h2>{o.no}</h2>
        <p>{o.dealerName} · <span className={`badge ${oemStatusCls(o.status)}`}>{o.status}</span></p>
      </div>

      <div id="print-area" className="pi">
        <div className="head">
          <div className="l">
            <img src="/funhoods-logo.jpg" alt={s.company || 'Funhoods'} style={{ height: 40, marginBottom: 2 }} />
            <div style={{ fontWeight: 700, fontSize: 11, letterSpacing: '.04em', marginBottom: 4 }}>GR INDUSTRIES</div>
            <div>{s.address || '—'}</div>
            <div>Phone: {s.phone || '—'} · Email: {s.email || '—'}</div>
            <div><b>GSTIN: {s.gstin || '—'}</b></div>
            <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-d)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>OEM ORDER</div>
          </div>
          <div className="r">
            <div className="no">{o.no}</div>
            <div>Date: {fmtDate(o.date)}</div>
            {o.deliveryDate && <div>Delivery by: <b>{fmtDate(o.deliveryDate)}</b></div>}
          </div>
        </div>

        <div className="bill">
          <div>
            <h6>Bill to</h6>
            <div><b>{dealer.name}</b></div>
            <div>{dealer.addr || '—'}</div>
            <div>{dealer.city} {dealer.state || ''} {dealer.pin || ''}</div>
            {dealer.gstin ? <div>GSTIN: <b>{dealer.gstin}</b></div> : <div style={{ color: 'var(--red)' }}>GSTIN not on file</div>}
            {dealer.mobile && <div>Contact: {dealer.contact} · {dealer.mobile}</div>}
          </div>
          <div>
            <h6>Order summary</h6>
            <div>Total items: <b>{o.lines.length}</b></div>
            <div>Advance received: <b>₹{(o.advance || 0).toFixed(2)}</b></div>
            <div>Balance: <b>₹{balance.toFixed(2)}</b></div>
            {o.by && <div>Booked by: <b>{o.by}</b></div>}
          </div>
        </div>

        <table className="lines">
          <thead><tr><th>#</th><th>Product</th><th className="c">Qty</th><th className="r">Rate ₹</th><th className="r">GST %</th><th className="r">Tax</th><th className="r">Total ₹</th></tr></thead>
          <tbody>
            {o.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.no || i + 1}</td>
                <td><b>{l.name}</b>{l.spec && <><br /><span className="muted" style={{ fontSize: 10.5 }}>{l.spec}</span></>}</td>
                <td className="c"><b>{l.qty}</b> <span className="muted" style={{ fontSize: 10 }}>{l.unit}</span></td>
                <td className="r">{l.rate.toFixed(2)}</td>
                <td className="r">{l.gstPct}</td>
                <td className="r">{l.tax.toFixed(2)}</td>
                <td className="r"><b>{l.total.toFixed(2)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="totals">
          <div className="line"><span>Subtotal</span><span>₹{o.subtotal.toFixed(2)}</span></div>
          <div className="line"><span>GST</span><span>₹{o.taxTotal.toFixed(2)}</span></div>
          <div className="line grand"><span>GRAND TOTAL</span><span>₹{o.total.toFixed(2)}</span></div>
        </div>

        {(s.bankName || s.bankAccount) && (
          <div className="note" style={{ marginTop: 14, background: 'var(--paper-d)', borderLeft: 'none' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Bank details for payment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
              <div>Bank: <b>{s.bankName || '—'}</b></div>
              <div>A/C No: <b>{s.bankAccount || '—'}</b></div>
              <div>IFSC: <b>{s.bankIFSC || '—'}</b></div>
              <div>Branch: <b>{s.bankBranch || '—'}</b></div>
            </div>
          </div>
        )}
        {o.remark && <div className="note y" style={{ fontSize: 12.5, marginTop: 10 }}><b>Remark:</b> {o.remark}</div>}
        <div className="terms">This is an OEM order document. Final delivery as per agreed specifications. Please verify GST rate with your CA.</div>
      </div>

      <div className="btnrow">
        {canEdit && <button className="btn o" onClick={() => nav(`/oem/${o.no}/edit`)}>Edit order</button>}
        {canWrite && next && <button className="btn g" onClick={() => setPending({ status: next })}>→ Move to {next}</button>}
        {canCancel && <button className="btn rd" onClick={() => setPending({ status: 'Cancelled', danger: true })}>Cancel order</button>}
        <button className="btn o" onClick={() => printAs(`${o.dealerName} OEM ${ddmmyyyy(o.date)}`)}>🖨️ Print / Save PDF</button>
        {canDelete && o.status === 'Draft' && <button className="btn rd" style={{ marginLeft: 'auto' }} onClick={() => setShowDelete(true)}>Delete</button>}
      </div>

      <div className="card" style={{ marginTop: 10 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Status history</h3>
        <table className="dt">
          <thead><tr><th>When</th><th>Status</th><th>By</th><th>Note</th></tr></thead>
          <tbody>
            {[...o.history].reverse().map((h, i) => (
              <tr key={i}>
                <td className="mono muted" style={{ fontSize: 11 }}>{new Date(h.at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td><span className={`badge ${oemStatusCls(h.status)}`}>{h.status}</span></td>
                <td>{h.by}</td>
                <td>{h.note || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pending && (
        <ConfirmPopup
          title={`Move to ${pending.status}?`}
          message={pending.danger ? 'This order will be cancelled and cannot be reopened.' : `${o.no} will move from ${o.status} to ${pending.status}.`}
          confirmLabel={`Yes, ${pending.status}`}
          danger={pending.danger}
          busy={busy}
          onConfirm={applyStatus}
          onClose={() => { setPending(null); setNote(''); }}
        >
          <textarea rows={2} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} style={{ width: '100%', marginBottom: 10 }} />
        </ConfirmPopup>
      )}
      {showDelete && (
        <ConfirmPopup title="Delete this draft?" message={`${o.no} will be permanently deleted.`} confirmLabel="Delete" danger busy={busy} onConfirm={del} onClose={() => setShowDelete(false)} />
      )}
    </div>
  );
}

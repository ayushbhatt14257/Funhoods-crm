import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

const badgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Fully Dispatched' ? 'g' : s === 'Partial Dispatched' ? 'y' : '');
const invBadgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Delivered' ? 'g' : '');
const STATUSES = ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched', 'Fully Dispatched', 'Cancelled'];

export default function DealerDetail() {
  const { code } = useParams();
  const [dealer, setDealer] = useState(null);
  const [pis, setPis] = useState(null); // null = loading
  const [invoices, setInvoices] = useState(null); // null = loading
  const [status, setStatus] = useState('');
  const [pendingOnly, setPendingOnly] = useState(false);

  useEffect(() => {
    api.get(`/dealers/${code}`).then(setDealer);
  }, [code]);

  useEffect(() => {
    setPis(null);
    const params = new URLSearchParams({ dealer: code });
    if (status) params.set('status', status);
    api.get(`/pi?${params.toString()}`).then(setPis);
  }, [code, status]);

  useEffect(() => {
    setInvoices(null);
    api.get(`/invoices?dealer=${code}`).then(setInvoices);
  }, [code]);

  if (!dealer) return <Loading label="Loading dealer…" />;

  const filteredPis = (pis || []).filter((p) => !pendingOnly || ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched'].includes(p.status));
  const totalOrdered = (pis || []).reduce((s, p) => s + p.total, 0);
  const openCount = (pis || []).filter((p) => ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched'].includes(p.status)).length;
  const totalInvoiced = (invoices || []).filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.total, 0);
  const totalCartons = (invoices || []).filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + (i.cartons || 0), 0);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Dealer profile</div><h2>{dealer.name}</h2><p className="mono muted">{dealer.code}</p></div>

      <div className="card">
        <div className="row3">
          <div><label>Contact</label><div>{dealer.contact} · {dealer.mobile}</div></div>
          <div><label>City</label><div>{dealer.city}, {dealer.state} {dealer.pin}</div></div>
          <div><label>GSTIN</label><div>{dealer.gstin || '—'}</div></div>
        </div>
        <div className="row3" style={{ marginTop: 10 }}>
          <div><label>Payment terms</label><div>{dealer.payment}</div></div>
          <div><label>Type / Slab</label><div>{dealer.type} · {dealer.slab}</div></div>
          <div><label>Outstanding balance ₹</label><div style={{ color: dealer.balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 700 }}>{Math.round(dealer.balance || 0).toLocaleString('en-IN')}</div></div>
        </div>
      </div>

      <div className="stats">
        <div className="stat"><div className="n">{(pis || []).length}</div><div className="l">Total PIs</div></div>
        <div className="stat"><div className="n">{openCount}</div><div className="l">Open PIs</div></div>
        <div className="stat"><div className="n">₹{Math.round(totalOrdered).toLocaleString('en-IN')}</div><div className="l">Total ordered ₹</div></div>
        <div className="stat"><div className="n">{(invoices || []).length}</div><div className="l">Total invoices</div></div>
        <div className="stat"><div className="n">₹{Math.round(totalInvoiced).toLocaleString('en-IN')}</div><div className="l">Total dispatched ₹</div></div>
      </div>

      <div className="ph"><h3>Orders (PIs)</h3></div>
      <div className="row3" style={{ marginBottom: 14 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--sans)', textTransform: 'none', letterSpacing: 0, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={pendingOnly} onChange={(e) => setPendingOnly(e.target.checked)} /> Pending only
        </label>
      </div>

      {pis === null ? (
        <Loading label="Loading orders…" />
      ) : (
        <div className="tblwrap" style={{ marginBottom: 20 }}>
          <table className="dt">
            <thead><tr><th>PI no</th><th>Items</th><th>Total ₹</th><th>Status</th><th>Created by</th><th>Date</th></tr></thead>
            <tbody>
              {filteredPis.map((p) => (
                <tr key={p.no}>
                  <td><Link to={`/pis/${p.no}`} className="mono"><b>{p.no}</b></Link></td>
                  <td>{p.lines.length}</td>
                  <td>{Math.round(p.total).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${badgeClass(p.status)}`}>{p.status}</span></td>
                  <td>{p.by}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                </tr>
              ))}
              {!filteredPis.length && <tr><td colSpan={6}><div className="empty">No orders match</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      <div className="ph"><h3>Tax invoices / dispatches</h3><p>{totalCartons} carton(s) dispatched in total (excluding cancelled).</p></div>
      {invoices === null ? (
        <Loading label="Loading invoices…" />
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Invoice</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>PI ref</th><th>Booked by</th><th>Date</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.no}>
                  <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
                  <td>{i.cartons}</td>
                  <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${invBadgeClass(i.status)}`}>{i.status}</span></td>
                  <td>{i.manual ? <span className="badge y">Manual</span> : (i.piRef ? <Link to={`/pis/${i.piRef}`} className="mono">{i.piRef}</Link> : '—')}</td>
                  <td>{i.by}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan={7}><div className="empty">No invoices yet</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

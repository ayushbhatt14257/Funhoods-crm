import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

const badgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Delivered' ? 'g' : '');
const STATUSES = ['Dispatched', 'Delivered', 'Cancelled'];

export default function Invoices() {
  const [invoices, setInvoices] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [by, setBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);

  useEffect(() => {
    setInvoices(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (by) params.set('by', by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api.get(`/invoices?${params.toString()}`).then(setInvoices);
  }, [q, status, by, from, to]);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Goods dispatched</div><h2>Tax Invoices</h2></div>
      <div className="row4" style={{ marginBottom: 14 }}>
        <input placeholder="Search invoice or dealer" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => <option key={u._id} value={u.name}>{u.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
        </div>
      </div>

      {invoices === null ? (
        <Loading label="Loading invoices…" />
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Invoice</th><th>Dealer</th><th>Assigned to</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>PI ref</th><th>Booked by</th><th>Date</th></tr></thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.no}>
                  <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
                  <td>{i.dealerName}</td>
                  <td>{i.dealerAssignedTo || '—'}</td>
                  <td>{i.cartons}</td>
                  <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${badgeClass(i.status)}`}>{i.status}</span></td>
                  <td>{i.manual ? <span className="badge y">Manual</span> : i.piRef}</td>
                  <td>{i.by}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                </tr>
              ))}
              {!invoices.length && <tr><td colSpan={9}><div className="empty">No invoices match</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

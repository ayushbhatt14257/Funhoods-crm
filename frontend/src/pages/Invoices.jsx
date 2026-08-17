import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const badgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Delivered' ? 'g' : '');

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => { api.get(`/invoices${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setInvoices); }, [q]);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Goods dispatched</div><h2>Tax Invoices</h2></div>
      <input placeholder="Search invoice or dealer" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, marginBottom: 14 }} />
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>Invoice</th><th>Dealer</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>PI ref</th></tr></thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.no}>
                <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
                <td>{i.dealerName}</td><td>{i.cartons}</td>
                <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
                <td><span className={`badge ${badgeClass(i.status)}`}>{i.status}</span></td>
                <td>{i.manual ? <span className="badge y">Manual</span> : i.piRef}</td>
              </tr>
            ))}
            {!invoices.length && <tr><td colSpan={6}><div className="empty">No invoices yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

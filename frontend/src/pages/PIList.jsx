import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';

const badgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Fully Dispatched' ? 'g' : s === 'Partial Dispatched' ? 'y' : '');

export default function PIList() {
  const [pis, setPis] = useState([]);
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get(`/pi${q ? `?q=${encodeURIComponent(q)}` : ''}`).then(setPis);
  }, [q]);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Proforma invoices</div><h2>PI list</h2></div>
      <input placeholder="Search PI no or dealer" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, marginBottom: 14 }} />
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>PI no</th><th>Dealer</th><th>Items</th><th>Total ₹</th><th>Status</th></tr></thead>
          <tbody>
            {pis.map((p) => (
              <tr key={p.no}>
                <td><Link to={`/pis/${p.no}`} className="mono"><b>{p.no}</b></Link></td>
                <td>{p.dealerName}</td><td>{p.lines.length}</td>
                <td>{Math.round(p.total).toLocaleString('en-IN')}</td>
                <td><span className={`badge ${badgeClass(p.status)}`}>{p.status}</span></td>
              </tr>
            ))}
            {!pis.length && <tr><td colSpan={5}><div className="empty">No PIs yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

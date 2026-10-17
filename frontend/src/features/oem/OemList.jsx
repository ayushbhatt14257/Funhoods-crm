import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { oemApi, OEM_STATUSES, oemStatusCls } from './api';
import { useAuth } from '../../context/AuthContext';
import Loading from '../../components/Loading';

export default function OemList() {
  const nav = useNavigate();
  const { user } = useAuth();
  const canWrite = ['accounts', 'admin', 'masterAdmin'].includes(user.role);
  const [orders, setOrders] = useState(null);
  const [counts, setCounts] = useState(null);
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => { oemApi.counts().then(setCounts); }, []);
  useEffect(() => {
    let ignore = false;
    setOrders(null);
    const p = new URLSearchParams();
    if (status) p.set('status', status);
    if (q) p.set('q', q);
    oemApi.list(p.toString()).then((r) => { if (!ignore) setOrders(r); });
    return () => { ignore = true; };
  }, [status, q]);

  async function exportExcel() {
    setExporting(true);
    try {
      const res = await fetch(oemApi.exportUrl(status), { headers: { Authorization: `Bearer ${oemApi.token()}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `OEM_${(status || 'All').replace(/\s+/g, '-')}.xlsx`;
      a.click();
    } catch (err) { alert(err.message); }
    finally { setExporting(false); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">OEM / private label</div><h2>OEM Orders</h2></div>
      <div className="subtabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={status === '' ? 'on' : ''} onClick={() => setStatus('')}>All {counts ? `(${counts.all})` : ''}</button>
        {OEM_STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>{s}{counts ? ` (${counts[s] ?? 0})` : ''}</button>
        ))}
      </div>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <input placeholder="Search order no or customer" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 300 }} />
        {canWrite && <button className="btn g" onClick={() => nav('/oem/new')}>+ New OEM order</button>}
        <button className="btn o" onClick={exportExcel} disabled={exporting}>{exporting ? 'Exporting…' : '📊 Export Excel'}</button>
      </div>
      {orders === null ? <Loading label="Loading OEM orders…" /> : (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Order no</th><th>Customer</th><th>Items</th><th>Total ₹</th><th>Advance ₹</th><th>Delivery</th><th>Status</th><th>Created by</th><th>Date</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.no}>
                  <td><Link to={`/oem/${o.no}`} className="mono"><b>{o.no}</b></Link></td>
                  <td>{o.dealerName}</td>
                  <td>{o.lines.length}</td>
                  <td>{Math.round(o.total).toLocaleString('en-IN')}</td>
                  <td>{o.advance ? Math.round(o.advance).toLocaleString('en-IN') : '—'}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{o.deliveryDate ? new Date(o.deliveryDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—'}</td>
                  <td><span className={`badge ${oemStatusCls(o.status)}`}>{o.status}</span></td>
                  <td>{o.by}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{new Date(o.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                </tr>
              ))}
              {!orders.length && <tr><td colSpan={9}><div className="empty">No OEM orders</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

const badgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Fully Dispatched' ? 'g' : s === 'Partial Dispatched' ? 'y' : '');
const STATUSES = ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched', 'Fully Dispatched', 'Cancelled'];

export default function PIList() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [pis, setPis] = useState(null); // null = loading
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  // Pre-filled from a dashboard stat-card link, e.g. /pis?status=Sent,Confirmed,Partial%20Dispatched
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [by, setBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);
  // Unfiltered-by-status PI list (still respects search/user/date filters), fetched
  // separately so the status tabs can show a live count next to each label.
  const [allPis, setAllPis] = useState(null);
  useEffect(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (by) params.set('by', by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api.get(`/pi?${params.toString()}`).then(setAllPis);
  }, [q, by, from, to]);

  useEffect(() => {
    setPis(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (by) params.set('by', by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    api.get(`/pi?${params.toString()}`).then(setPis);
  }, [q, status, by, from, to]);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Proforma invoices</div><h2>PI list</h2></div>
      {status.includes(',') && (
        <div className="note b" style={{ fontSize: 12, marginBottom: 10 }}>
          Showing: {status.split(',').join(' + ')} · <button className="btn o sm" onClick={() => setStatus('')}>Clear filter</button>
        </div>
      )}
      <div className="subtabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        <button className={status === '' ? 'on' : ''} onClick={() => setStatus('')}>
          All {pis ? `(${pis.length})` : ''}
        </button>
        {STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
            {s}{allPis ? ` (${allPis.filter((p) => p.status === s).length})` : ''}
          </button>
        ))}
      </div>
      <div className="row4" style={{ marginBottom: 14 }}>
        <input placeholder="Search PI no or dealer" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => <option key={u._id} value={u.name}>{u.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
        </div>
      </div>

      {pis === null ? (
        <Loading label="Loading PIs…" />
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>PI no</th><th>Dealer</th><th>Assigned to</th><th>Items</th><th>Total ₹</th><th>Status</th><th>Created by</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {pis.map((p) => {
                const canEdit = ['Draft', 'Sent'].includes(p.status);
                return (
                <tr key={p.no}>
                  <td><Link to={`/pis/${p.no}`} className="mono"><b>{p.no}</b></Link></td>
                  <td>{p.dealerName}</td>
                  <td>{p.dealerAssignedTo || '—'}</td>
                  <td>{p.lines.length}</td>
                  <td>{Math.round(p.total).toLocaleString('en-IN')}</td>
                  <td><span className={`badge ${badgeClass(p.status)}`}>{p.status}</span></td>
                  <td>{p.by}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td>
                    <button
                      className={canEdit ? 'btn o sm' : 'btn o sm'}
                      disabled={!canEdit}
                      title={canEdit ? 'Edit this PI' : 'Can only edit while Draft or Sent'}
                      style={!canEdit ? { opacity: 0.4, cursor: 'not-allowed' } : undefined}
                      onClick={() => canEdit && nav(`/pis/${p.no}?edit=1`)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
                );
              })}
              {!pis.length && <tr><td colSpan={9}><div className="empty">No PIs match</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

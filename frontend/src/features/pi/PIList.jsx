import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { piApi } from './api';
import Loading from '../../components/Loading';

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
  const [view, setView] = useState('flat'); // 'flat' | 'byCustomer'
  const [openDealers, setOpenDealers] = useState({}); // dealer code -> expanded?

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
    piApi.list(params.toString()).then(setAllPis);
  }, [q, by, from, to]);

  useEffect(() => {
    setPis(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (by) params.set('by', by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    piApi.list(params.toString()).then(setPis);
  }, [q, status, by, from, to]);

  // Group the currently-filtered PI list by dealer for the "By customer" view.
  function buildCustomerGroups() {
    const groups = {}; // dealer code -> { dealerName, dealerAssignedTo, pis[] }
    (pis || []).forEach((p) => {
      if (!groups[p.dealer]) groups[p.dealer] = { code: p.dealer, name: p.dealerName, assignedTo: p.dealerAssignedTo, pis: [] };
      groups[p.dealer].pis.push(p);
    });
    return Object.values(groups)
      .map((g) => ({
        ...g,
        total: g.pis.reduce((s, p) => s + p.total, 0),
        openCount: g.pis.filter((p) => ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched'].includes(p.status)).length,
        latest: Math.max(...g.pis.map((p) => new Date(p.createdAt).getTime())),
      }))
      .sort((a, b) => b.latest - a.latest);
  }

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
          All {allPis ? `(${allPis.length})` : ''}
        </button>
        {STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
            {s}{allPis ? ` (${allPis.filter((p) => p.status === s).length})` : ''}
          </button>
        ))}
      </div>
      <div className="subtabs" style={{ marginBottom: 14 }}>
        <button className={view === 'flat' ? 'on' : ''} onClick={() => setView('flat')}>Flat list</button>
        <button className={view === 'byCustomer' ? 'on' : ''} onClick={() => setView('byCustomer')}>By customer</button>
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
      ) : view === 'flat' ? (
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
      ) : (
        (() => {
          const groups = buildCustomerGroups();
          return (
            <>
              {groups.map((g) => {
                const isOpen = !!openDealers[g.code];
                return (
                  <div className="card" key={g.code} style={{ marginBottom: 10 }}>
                    <div
                      style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
                      onClick={() => setOpenDealers((s) => ({ ...s, [g.code]: !s[g.code] }))}
                    >
                      <div>
                        <span style={{ marginRight: 6 }}>{isOpen ? '▾' : '▸'}</span>
                        <Link to={`/dealers/${g.code}`} onClick={(e) => e.stopPropagation()}><b>{g.name}</b></Link>{' '}
                        <span className="mono muted" style={{ fontSize: 10 }}>{g.code}</span>
                        {g.assignedTo && <span className="muted" style={{ fontSize: 12 }}> · {g.assignedTo}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {g.pis.length} PI{g.pis.length > 1 ? 's' : ''} · ₹{Math.round(g.total).toLocaleString('en-IN')}
                        {g.openCount > 0 && <span className="badge y" style={{ marginLeft: 8 }}>{g.openCount} open</span>}
                      </div>
                    </div>
                    {isOpen && (
                      <div className="tblwrap" style={{ marginTop: 10 }}>
                        <table className="dt">
                          <thead><tr><th>PI no</th><th>Items</th><th>Total ₹</th><th>Status</th><th>Created by</th><th>Date</th></tr></thead>
                          <tbody>
                            {g.pis.map((p) => (
                              <tr key={p.no}>
                                <td><Link to={`/pis/${p.no}`} className="mono"><b>{p.no}</b></Link></td>
                                <td>{p.lines.length}</td>
                                <td>{Math.round(p.total).toLocaleString('en-IN')}</td>
                                <td><span className={`badge ${badgeClass(p.status)}`}>{p.status}</span></td>
                                <td>{p.by}</td>
                                <td className="mono muted" style={{ fontSize: 11 }}>{new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                );
              })}
              {!groups.length && <div className="empty">No PIs match</div>}
            </>
          );
        })()
      )}
    </div>
  );
}

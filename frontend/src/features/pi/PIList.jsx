import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import { piApi } from './api';
import Loading from '../../components/Loading';
import { piStatusDisplay } from './statusDisplay';

const STATUSES = ['Draft', 'Sent', 'Confirmed', 'Partial Dispatched', 'Fully Dispatched', 'Closed', 'Cancelled'];
const PAGE_SIZES = [10, 30, 50, 100];
const PENDING_APPROVAL_TAB = '__pendingApproval__'; // not a real PI status — a separate filter dimension

export default function PIList() {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [pis, setPis] = useState(null); // null = loading
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  // Pre-filled from a dashboard stat-card link, e.g. /pis?status=Sent,Confirmed,Partial%20Dispatched
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [by, setBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState('flat'); // 'flat' | 'byCustomer'
  const [openDealers, setOpenDealers] = useState({}); // dealer code -> expanded?
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(30);

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);

  function baseParams() {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (by) params.set('by', by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return params;
  }

  // Status-tab counts — a lightweight counts-only call, not a second full fetch of every PI.
  useEffect(() => {
    piApi.getCounts(baseParams().toString()).then(setCounts);
  }, [q, by, from, to]);

  // Reset to page 1 whenever a filter changes, so you don't land on an empty page 4 of a narrowed search.
  useEffect(() => { setPage(1); }, [q, status, by, from, to, view]);

  // Flat list is paginated (fast at any PI volume); "By customer" needs the
  // full matching set to group correctly, so it fetches unpaginated — same
  // trade-off as before, just isolated to the one view that actually needs it.
  useEffect(() => {
    setPis(null);
    const params = baseParams();
    if (status === PENDING_APPROVAL_TAB) params.set('pendingApproval', '1');
    else if (status) params.set('status', status);

    if (view === 'flat') {
      params.set('page', page);
      params.set('limit', pageSize);
      piApi.list(params.toString()).then((res) => { setPis(res.items); setTotal(res.total); });
    } else {
      piApi.list(params.toString()).then((res) => { setPis(res); setTotal(res.length); });
    }
  }, [q, status, by, from, to, view, page, pageSize]);

  // Group the currently-fetched PI list by dealer for the "By customer" view.
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

  const totalPages = view === 'flat' ? Math.max(1, Math.ceil(total / pageSize)) : 1;

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
          All {counts ? `(${counts.all})` : ''}
        </button>
        {STATUSES.map((s) => (
          <button key={s} className={status === s ? 'on' : ''} onClick={() => setStatus(s)}>
            {s}{counts ? ` (${counts[s] ?? 0})` : ''}
          </button>
        ))}
        <button className={status === PENDING_APPROVAL_TAB ? 'on' : ''} onClick={() => setStatus(PENDING_APPROVAL_TAB)} style={status === PENDING_APPROVAL_TAB ? { color: '#6B2FB3' } : undefined}>
          Waiting for approval{counts ? ` (${counts.pendingApproval})` : ''}
        </button>
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
        <>
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
                    <td><span className={`badge ${piStatusDisplay(p).cls}`}>{piStatusDisplay(p).label}</span></td>
                    <td>{p.by}</td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                    <td>
                      <button
                        className="btn o sm"
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}>
              <span className="muted">Rows per page:</span>
              <select value={pageSize} onChange={(e) => setPageSize(+e.target.value)} style={{ padding: '4px 8px', fontSize: 12.5 }}>
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
              <span className="muted">
                {total === 0 ? '0 of 0' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}`}
              </span>
            </div>
            <div className="btnrow" style={{ margin: 0 }}>
              <button className="btn o sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Prev</button>
              <span className="muted" style={{ fontSize: 12.5, alignSelf: 'center' }}>Page {page} of {totalPages}</span>
              <button className="btn o sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next →</button>
            </div>
          </div>
        </>
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
                                <td><span className={`badge ${piStatusDisplay(p).cls}`}>{piStatusDisplay(p).label}</span></td>
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

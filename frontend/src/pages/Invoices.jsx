import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

const badgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Delivered' ? 'g' : '');
const piBadgeClass = (s) => (s === 'Cancelled' ? 'r' : s === 'Fully Dispatched' ? 'g' : s === 'Partial Dispatched' ? 'y' : '');
const STATUSES = ['Dispatched', 'Delivered', 'Cancelled'];

export default function Invoices() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  // Pre-filled from a dashboard stat-card link
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [by, setBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState('flat'); // 'flat' | 'byPI'
  const [pisByNo, setPisByNo] = useState(null); // loaded only when the grouped view is opened

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

  useEffect(() => {
    if (view === 'byPI' && pisByNo === null) {
      api.get('/pi').then((pis) => setPisByNo(Object.fromEntries(pis.map((p) => [p.no, p]))));
    }
  }, [view, pisByNo]);

  // Group invoices under their originating PI (partial dispatches of the same PI collapse
  // into one card), and pull the live "still pending" lines straight off that PI's own
  // pending-tracking — no need to re-derive it from invoice history.
  function buildGroups() {
    const groups = {}; // piRef -> invoices[]
    const manual = [];
    invoices.forEach((i) => {
      if (i.piRef) (groups[i.piRef] ||= []).push(i);
      else manual.push(i);
    });
    const piGroups = Object.entries(groups).map(([piRef, invs]) => ({
      piRef,
      pi: pisByNo?.[piRef] || null,
      invoices: invs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      latest: Math.max(...invs.map((i) => new Date(i.createdAt).getTime())),
      total: invs.reduce((s, i) => s + i.total, 0),
    })).sort((a, b) => b.latest - a.latest);
    return { piGroups, manual };
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Goods dispatched</div><h2>Tax Invoices</h2></div>
      {status.includes(',') && (
        <div className="note b" style={{ fontSize: 12, marginBottom: 10 }}>
          Showing: {status.split(',').join(' + ')} · <button className="btn o sm" onClick={() => setStatus('')}>Clear filter</button>
        </div>
      )}
      <div className="subtabs" style={{ marginBottom: 14 }}>
        <button className={view === 'flat' ? 'on' : ''} onClick={() => setView('flat')}>Flat list</button>
        <button className={view === 'byPI' ? 'on' : ''} onClick={() => setView('byPI')}>Group by PI</button>
      </div>
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
      ) : view === 'flat' ? (
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
      ) : pisByNo === null ? (
        <Loading label="Loading PI details…" />
      ) : (
        (() => {
          const { piGroups, manual } = buildGroups();
          return (
            <>
              {piGroups.map((g) => {
                const pendingLines = g.pi ? g.pi.lines.filter((l) => (l.pending != null ? l.pending : l.pcs) > 0) : [];
                return (
                  <div className="card" key={g.piRef} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                      <div>
                        <Link to={`/pis/${g.piRef}`} className="mono"><b>{g.piRef}</b></Link>
                        <span className="muted"> · {g.invoices[0].dealerName}</span>{' '}
                        {g.pi && <span className={`badge ${piBadgeClass(g.pi.status)}`}>{g.pi.status}</span>}
                      </div>
                      <div className="muted" style={{ fontSize: 12 }}>{g.invoices.length} invoice{g.invoices.length > 1 ? 's' : ''} · ₹{Math.round(g.total).toLocaleString('en-IN')} dispatched so far</div>
                    </div>

                    <div className="tblwrap" style={{ marginBottom: g.pi ? 10 : 0 }}>
                      <table className="dt">
                        <thead><tr><th>Invoice</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>Booked by</th><th>Date</th></tr></thead>
                        <tbody>
                          {g.invoices.map((i) => (
                            <tr key={i.no}>
                              <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
                              <td>{i.cartons}</td>
                              <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
                              <td><span className={`badge ${badgeClass(i.status)}`}>{i.status}</span></td>
                              <td>{i.by}</td>
                              <td className="mono muted" style={{ fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {!g.pi ? (
                      <div className="note" style={{ fontSize: 12 }}>PI {g.piRef} not found (may have been deleted).</div>
                    ) : pendingLines.length ? (
                      <div className="note y" style={{ fontSize: 12.5 }}>
                        <b>Still remaining on this PI:</b>
                        <table className="dt" style={{ marginTop: 6 }}>
                          <thead><tr><th>Item</th><th>Pending pcs</th></tr></thead>
                          <tbody>
                            {pendingLines.map((l) => (
                              <tr key={l.code}>
                                <td>{l.name} <span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                                <td><b>{l.pending != null ? l.pending : l.pcs}</b></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="note g" style={{ fontSize: 12.5 }}>✅ Fully dispatched — nothing remaining on this PI.</div>
                    )}
                  </div>
                );
              })}

              {manual.length > 0 && (
                <div className="card">
                  <h3 style={{ marginBottom: 10 }}>Manual dispatches (no PI)</h3>
                  <div className="tblwrap">
                    <table className="dt">
                      <thead><tr><th>Invoice</th><th>Dealer</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>Booked by</th><th>Date</th></tr></thead>
                      <tbody>
                        {manual.map((i) => (
                          <tr key={i.no}>
                            <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
                            <td>{i.dealerName}</td>
                            <td>{i.cartons}</td>
                            <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
                            <td><span className={`badge ${badgeClass(i.status)}`}>{i.status}</span></td>
                            <td>{i.by}</td>
                            <td className="mono muted" style={{ fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {!piGroups.length && !manual.length && <div className="empty">No invoices match</div>}
            </>
          );
        })()
      )}
    </div>
  );
}

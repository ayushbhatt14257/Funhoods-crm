import { useState } from 'react';
import Loading from '../../../components/Loading';

// The "pick what to dispatch" screen: Confirmed / Partially Dispatched PIs,
// either as a flat list or grouped by customer so it's obvious at a glance
// which parties have PIs fully pending vs. already partially dispatched.
export default function DispatchQueue({ readyPIs, users, onOpenPI, onOpenManual }) {
  const [filterBy, setFilterBy] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterQ, setFilterQ] = useState('');
  const [statusTab, setStatusTab] = useState('Confirmed');
  const [queueView, setQueueView] = useState('flat'); // 'flat' | 'byCustomer'
  const [openDealers, setOpenDealers] = useState({}); // dealer code -> expanded?

  return (
    <div>
      <div className="ph"><div className="eyebrow">Goods leaving the gate</div><h2>Dispatch</h2>
        <p>Pick a confirmed PI, or dispatch manually without one.</p></div>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <button className="btn o" onClick={onOpenManual}>🚚 Manual dispatch (no PI)</button>
      </div>
      <div className="subtabs" style={{ marginBottom: 14 }}>
        <button className={statusTab === 'Confirmed' ? 'on' : ''} onClick={() => setStatusTab('Confirmed')}>
          Confirmed {readyPIs ? `(${readyPIs.filter((p) => p.status === 'Confirmed').length})` : ''}
        </button>
        <button className={statusTab === 'Partial Dispatched' ? 'on' : ''} onClick={() => setStatusTab('Partial Dispatched')}>
          Partially Dispatched {readyPIs ? `(${readyPIs.filter((p) => p.status === 'Partial Dispatched').length})` : ''}
        </button>
      </div>
      <div className="subtabs" style={{ marginBottom: 14 }}>
        <button className={queueView === 'flat' ? 'on' : ''} onClick={() => setQueueView('flat')}>Flat list</button>
        <button className={queueView === 'byCustomer' ? 'on' : ''} onClick={() => setQueueView('byCustomer')}>By customer</button>
      </div>
      <div className="row3" style={{ marginBottom: 14 }}>
        <input placeholder="Search dealer or PI no" value={filterQ} onChange={(e) => setFilterQ(e.target.value)} />
        <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => <option key={u._id} value={u.name}>{u.name}</option>)}
        </select>
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="Created on or after" />
      </div>

      {readyPIs === null ? (
        <Loading label="Loading dispatch queue…" />
      ) : (
        (() => {
          const queue = readyPIs
            .filter((p) => p.status === statusTab)
            .filter((p) => !filterBy || p.by === filterBy)
            .filter((p) => !filterFrom || new Date(p.createdAt) >= new Date(filterFrom))
            .filter((p) => !filterQ || p.dealerName.toLowerCase().includes(filterQ.toLowerCase()) || p.no.toLowerCase().includes(filterQ.toLowerCase()));

          const emptyMsg = <div className="empty">No {statusTab === 'Confirmed' ? 'confirmed' : 'partially dispatched'} PIs</div>;

          if (queueView === 'flat') {
            return (
              <>
                {queue.map((p) => <QueueCard key={p.no} p={p} onOpenPI={onOpenPI} />)}
                {!queue.length && emptyMsg}
              </>
            );
          }

          // Group by dealer.
          const groups = {};
          queue.forEach((p) => {
            if (!groups[p.dealer]) groups[p.dealer] = { code: p.dealer, name: p.dealerName, pis: [] };
            groups[p.dealer].pis.push(p);
          });
          const sortedGroups = Object.values(groups)
            .map((g) => ({ ...g, total: g.pis.reduce((s, p) => s + p.total, 0), latest: Math.max(...g.pis.map((p) => new Date(p.createdAt).getTime())) }))
            .sort((a, b) => b.latest - a.latest);

          return (
            <>
              {sortedGroups.map((g) => (
                <CustomerGroupCard
                  key={g.code}
                  group={g}
                  isOpen={openDealers[g.code] !== false}
                  onToggle={() => setOpenDealers((s) => ({ ...s, [g.code]: !(s[g.code] !== false) }))}
                  onOpenPI={onOpenPI}
                />
              ))}
              {!sortedGroups.length && emptyMsg}
            </>
          );
        })()
      )}
    </div>
  );
}

function QueueCard({ p, onOpenPI }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div>
          <div style={{ fontWeight: 600 }}>{p.no} · {p.dealerName}</div>
          <div className="muted" style={{ fontSize: 12 }}>{p.lines.length} items · ₹{Math.round(p.total).toLocaleString('en-IN')} · by {p.by} · {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
          <span className={`badge ${p.status === 'Partial Dispatched' ? 'y' : 'g'}`}>{p.status}</span>
        </div>
        <button className="btn sm" onClick={() => onOpenPI(p.no)}>Book dispatch →</button>
      </div>
    </div>
  );
}

function CustomerGroupCard({ group: g, isOpen, onToggle, onOpenPI }) {
  return (
    <div className="card" style={{ marginBottom: 10 }}>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
        onClick={onToggle}
      >
        <div>
          <span style={{ marginRight: 6 }}>{isOpen ? '▾' : '▸'}</span>
          <b>{g.name}</b> <span className="mono muted" style={{ fontSize: 10 }}>{g.code}</span>
        </div>
        <div className="muted" style={{ fontSize: 12 }}>{g.pis.length} PI{g.pis.length > 1 ? 's' : ''} · ₹{Math.round(g.total).toLocaleString('en-IN')}</div>
      </div>
      {isOpen && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {g.pis.map((p) => (
            <div key={p.no} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
              <div>
                <span className="mono"><b>{p.no}</b></span>
                <span className="muted" style={{ fontSize: 12 }}> · {p.lines.length} items · ₹{Math.round(p.total).toLocaleString('en-IN')} · by {p.by} · {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>{' '}
                <span className={`badge ${p.status === 'Partial Dispatched' ? 'y' : 'g'}`}>{p.status}</span>
              </div>
              <button className="btn sm" onClick={() => onOpenPI(p.no)}>Book dispatch →</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

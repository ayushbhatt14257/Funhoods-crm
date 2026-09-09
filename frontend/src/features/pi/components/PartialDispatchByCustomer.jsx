import { useState } from 'react';
import { Link } from 'react-router-dom';

// Only meaningful for the "Partial Dispatched" tab — every other status
// still uses the plain by-customer summary. Groups by party, oldest PI
// first within each party, and each PI expands to show exactly which items
// are still owed: Order (originally ordered) / Dispatched (gone out so far)
// / Pending (what's left) — the numbers a dealer actually asks about.
export default function PartialDispatchByCustomer({ pis }) {
  const [openDealers, setOpenDealers] = useState({}); // dealer code -> expanded?
  const [openPIs, setOpenPIs] = useState({}); // PI no -> expanded?

  const groups = {};
  pis.forEach((p) => {
    if (!groups[p.dealer]) groups[p.dealer] = { code: p.dealer, name: p.dealerName, assignedTo: p.dealerAssignedTo, pis: [] };
    groups[p.dealer].pis.push(p);
  });
  const sortedGroups = Object.values(groups)
    .map((g) => ({
      ...g,
      // Oldest PI first within a party — matches "purani upar, nayi niche".
      pis: [...g.pis].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)),
      total: g.pis.reduce((s, p) => s + p.total, 0),
    }))
    .sort((a, b) => new Date(a.pis[0].createdAt) - new Date(b.pis[0].createdAt));

  return (
    <>
      {sortedGroups.map((g) => {
        const dealerOpen = openDealers[g.code] !== false; // default expanded
        return (
          <div className="card" key={g.code} style={{ marginBottom: 10 }}>
            <div
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
              onClick={() => setOpenDealers((s) => ({ ...s, [g.code]: !dealerOpen }))}
            >
              <div>
                <span style={{ marginRight: 6 }}>{dealerOpen ? '▾' : '▸'}</span>
                <Link to={`/dealers/${g.code}`} onClick={(e) => e.stopPropagation()}><b>{g.name}</b></Link>{' '}
                <span className="mono muted" style={{ fontSize: 10 }}>{g.code}</span>
                {g.assignedTo && <span className="muted" style={{ fontSize: 12 }}> · {g.assignedTo}</span>}
              </div>
              <div className="muted" style={{ fontSize: 12 }}>
                {g.pis.length} partial PI{g.pis.length > 1 ? 's' : ''} · ₹{Math.round(g.total).toLocaleString('en-IN')}
              </div>
            </div>

            {dealerOpen && (
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {g.pis.map((p) => {
                  const piOpen = !!openPIs[p.no];
                  return (
                    <div key={p.no} style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }}>
                      <div
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, cursor: 'pointer' }}
                        onClick={() => setOpenPIs((s) => ({ ...s, [p.no]: !piOpen }))}
                      >
                        <div>
                          <span style={{ marginRight: 6 }}>{piOpen ? '▾' : '▸'}</span>
                          <Link to={`/pis/${p.no}`} className="mono" onClick={(e) => e.stopPropagation()}><b>{p.no}</b></Link>
                          <span className="mono muted" style={{ fontSize: 10.5, marginLeft: 6 }}>
                            {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </span>
                        </div>
                        <span className="muted" style={{ fontSize: 12 }}>{p.lines.length} item{p.lines.length > 1 ? 's' : ''} · ₹{Math.round(p.total).toLocaleString('en-IN')}</span>
                      </div>

                      {piOpen && (
                        <div className="tblwrap" style={{ marginTop: 8 }}>
                          <table className="dt">
                            <thead><tr><th>Item</th><th>Order</th><th>Dispatched</th><th>Pending</th></tr></thead>
                            <tbody>
                              {p.lines.map((l) => {
                                const pending = l.pending != null ? l.pending : l.pcs;
                                const dispatched = l.pcs - pending;
                                return (
                                  <tr key={l.code}>
                                    <td>{l.name} <span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                                    <td>{l.pcs}</td>
                                    <td style={{ color: 'var(--green)', fontWeight: 600 }}>{dispatched}</td>
                                    <td style={{ color: pending > 0 ? 'var(--orange)' : 'var(--muted)', fontWeight: 600 }}>{pending}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {!sortedGroups.length && <div className="empty">No partially dispatched PIs match</div>}
    </>
  );
}

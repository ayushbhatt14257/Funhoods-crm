import { Link } from 'react-router-dom';
import { invoiceBadgeClass, piBadgeClass } from '../badges';

// Group invoices under their originating PI (partial dispatches of the same PI
// collapse into one card), and pull the live "still pending" lines straight
// off that PI's own pending-tracking — no need to re-derive it from invoice history.
function buildGroups(invoices, pisByNo) {
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

export default function InvoicesByPI({ invoices, pisByNo }) {
  const { piGroups, manual } = buildGroups(invoices, pisByNo);

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
                      <td><span className={`badge ${invoiceBadgeClass(i.status)}`}>{i.status}</span></td>
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
                    <td><span className={`badge ${invoiceBadgeClass(i.status)}`}>{i.status}</span></td>
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
}

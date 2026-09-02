import { useState } from 'react';
import { Link } from 'react-router-dom';
import { invoiceBadgeClass } from '../badges';

// Group invoices by dealer for the "By customer" view.
function buildCustomerGroups(invoices) {
  const groups = {}; // dealer code -> { dealerName, invoices[] }
  invoices.forEach((i) => {
    if (!groups[i.dealer]) groups[i.dealer] = { code: i.dealer, name: i.dealerName, assignedTo: i.dealerAssignedTo, invoices: [] };
    groups[i.dealer].invoices.push(i);
  });
  return Object.values(groups)
    .map((g) => ({
      ...g,
      invoices: g.invoices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      total: g.invoices.reduce((s, i) => s + i.total, 0),
      latest: Math.max(...g.invoices.map((i) => new Date(i.createdAt).getTime())),
    }))
    .sort((a, b) => b.latest - a.latest);
}

export default function InvoicesByCustomer({ invoices }) {
  const [openDealers, setOpenDealers] = useState({}); // dealer code -> expanded?
  const groups = buildCustomerGroups(invoices);

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
                {g.invoices.length} invoice{g.invoices.length > 1 ? 's' : ''} · ₹{Math.round(g.total).toLocaleString('en-IN')}
              </div>
            </div>
            {isOpen && (
              <div className="tblwrap" style={{ marginTop: 10 }}>
                <table className="dt">
                  <thead><tr><th>Invoice</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>PI ref</th><th>Booked by</th><th>Date</th></tr></thead>
                  <tbody>
                    {g.invoices.map((i) => (
                      <tr key={i.no}>
                        <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
                        <td>{i.cartons}</td>
                        <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
                        <td><span className={`badge ${invoiceBadgeClass(i.status)}`}>{i.status}</span></td>
                        <td>{i.manual ? <span className="badge y">Manual</span> : i.piRef}</td>
                        <td>{i.by}</td>
                        <td className="mono muted" style={{ fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {!groups.length && <div className="empty">No invoices match</div>}
    </>
  );
}

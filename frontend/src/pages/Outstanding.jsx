import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import Loading from '../components/Loading';

// Dealer-wise outstanding balances — GET /api/ledger/balances already excludes
// dealers with a zero balance, so this page is exactly the dealers who owe money.
export default function Outstanding() {
  const [rows, setRows] = useState(null); // null = loading
  const [q, setQ] = useState('');

  useEffect(() => {
    api.get('/ledger/balances').then((data) => setRows(data.sort((a, b) => b.balance - a.balance)));
  }, []);

  const filtered = rows
    ? rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()))
    : [];
  const total = filtered.reduce((s, r) => s + r.balance, 0);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Accounts receivable</div><h2>Outstanding balances</h2></div>
      <div className="row4" style={{ marginBottom: 14 }}>
        <input placeholder="Search dealer or code" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {rows === null ? (
        <Loading label="Loading balances…" />
      ) : (
        <>
          <div style={{ marginBottom: 10, fontSize: 14 }}>
            <b>{filtered.length}</b> dealer(s) with a balance due · Total outstanding: <b style={{ color: 'var(--red)' }}>₹{Math.round(total).toLocaleString('en-IN')}</b>
          </div>
          <div className="tblwrap">
            <table className="dt">
              <thead><tr><th>Dealer</th><th>City</th><th>Balance ₹</th><th>Oldest unpaid invoice</th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.code}>
                    <td><Link to={`/dealers/${r.code}`}><b>{r.name}</b></Link> <span className="mono muted" style={{ fontSize: 10 }}>{r.code}</span></td>
                    <td>{r.city}</td>
                    <td style={{ color: r.balance > 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{Math.round(r.balance).toLocaleString('en-IN')}</td>
                    <td className={r.oldestInvoiceAgeDays > 90 ? 'mono' : 'mono muted'} style={r.oldestInvoiceAgeDays > 90 ? { color: 'var(--red)', fontWeight: 600 } : undefined}>
                      {r.oldestInvoiceAgeDays} days
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={4}><div className="empty">No outstanding balances</div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

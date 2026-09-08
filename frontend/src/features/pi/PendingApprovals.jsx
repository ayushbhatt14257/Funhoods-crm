import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { piApi } from './api';
import { useToast } from '../../context/ToastContext';
import Loading from '../../components/Loading';

// masterAdmin-only: every PI where a admin priced a line below base rate
// and it's still awaiting sign-off. These stay pending — and blocked from
// dispatch — until manually approved here. No auto-approve/timeout.
export default function PendingApprovals() {
  const { showToast } = useToast();
  const [pis, setPis] = useState(null); // null = loading
  const [approvingNo, setApprovingNo] = useState(null);

  async function load() { setPis(await piApi.listPendingApprovals()); }
  useEffect(() => { load(); }, []);

  async function approve(no) {
    setApprovingNo(no);
    try { await piApi.approvePrice(no); showToast(`${no} approved`, 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setApprovingNo(null); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Master admin</div><h2>Price Approvals</h2>
        <p>PIs where a admin priced a line below the product's base rate. None of these can be dispatched until you approve them here.</p></div>

      {pis === null ? (
        <Loading label="Loading pending approvals…" />
      ) : pis.length ? (
        pis.map((pi) => {
          const discounted = pi.lines.filter((l) => l.rate < l.listRate);
          return (
            <div className="card" key={pi.no} style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                <div>
                  <Link to={`/pis/${pi.no}`} className="mono"><b>{pi.no}</b></Link>
                  <span className="muted"> · {pi.dealerName} · by {pi.by}</span>
                </div>
                <span className="badge y">Pending approval</span>
              </div>
              <table className="dt" style={{ marginBottom: 10 }}>
                <thead><tr><th>Item</th><th>Base ₹</th><th>Priced at ₹</th><th>Qty</th></tr></thead>
                <tbody>
                  {discounted.map((l) => (
                    <tr key={l.code}>
                      <td>{l.name} <span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                      <td>{l.listRate}</td>
                      <td style={{ color: 'var(--red)', fontWeight: 600 }}>{l.rate}</td>
                      <td>{l.pcs}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button className="btn g sm" disabled={approvingNo === pi.no} onClick={() => approve(pi.no)}>
                {approvingNo === pi.no ? 'Approving…' : '✓ Approve now'}
              </button>
            </div>
          );
        })
      ) : (
        <div className="empty">Nothing waiting on approval right now.</div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { piApi } from './api';
import { giftApprovalsApi } from '../giftApprovals/api';
import { useToast } from '../../context/ToastContext';
import Loading from '../../components/Loading';

// masterAdmin-only: every PI where a admin priced a line below base rate
// and it's still awaiting sign-off, PLUS every dispatch attempt that was
// blocked for carrying a free gift. Both stay pending — and blocked from
// dispatch — until manually approved here. No auto-approve/timeout for
// either kind.
export default function PendingApprovals() {
  const { showToast } = useToast();
  const [pis, setPis] = useState(null); // null = loading
  const [gifts, setGifts] = useState(null); // null = loading
  const [approvingNo, setApprovingNo] = useState(null);
  const [approvingGiftId, setApprovingGiftId] = useState(null);

  async function load() {
    setPis(await piApi.listPendingApprovals());
    setGifts(await giftApprovalsApi.listPending());
  }
  useEffect(() => { load(); }, []);

  async function approve(no) {
    setApprovingNo(no);
    try { await piApi.approvePrice(no); showToast(`${no} approved`, 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setApprovingNo(null); }
  }

  async function approveGift(id) {
    setApprovingGiftId(id);
    try { await giftApprovalsApi.approve(id); showToast('Gift approved — dispatch will go through on their next try', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
    finally { setApprovingGiftId(null); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Master admin</div><h2>Approvals</h2>
        <p>PIs priced below base rate, and dispatches carrying a free gift — none of these can go through until you approve them here.</p></div>

      <h3 style={{ margin: '4px 0 10px' }}>Price approvals</h3>
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
        <div className="empty">Nothing waiting on price approval right now.</div>
      )}

      <h3 style={{ margin: '24px 0 10px' }}>🎁 Gift approvals</h3>
      {gifts === null ? (
        <Loading label="Loading pending gift approvals…" />
      ) : gifts.length ? (
        gifts.map((g) => (
          <div className="card" key={g._id} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div>
                <b>{g.dealerName || g.dealer}</b>
                <span className="muted"> · requested by {g.requestedBy}</span>
              </div>
              <span className="badge y">Pending approval</span>
            </div>
            <table className="dt" style={{ marginBottom: 10 }}>
              <thead><tr><th>Gift</th><th>Qty</th><th className="r">Worth ₹</th></tr></thead>
              <tbody>
                {g.gifts.map((gl, i) => (
                  <tr key={i}>
                    <td>{gl.custom ? gl.name : gl.code}{gl.custom && <span className="muted" style={{ fontSize: 10.5 }}> · custom gift</span>}</td>
                    <td>{gl.custom ? '—' : `${gl.outers ? `${gl.outers} outer` : ''}${gl.inners ? ` ${gl.inners} inner` : ''}${gl.directPcs ? `${gl.directPcs} pcs` : ''}`}</td>
                    <td className="r">{Math.round(gl.worth || 0).toLocaleString('en-IN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="btn g sm" disabled={approvingGiftId === g._id} onClick={() => approveGift(g._id)}>
              {approvingGiftId === g._id ? 'Approving…' : '✓ Approve now'}
            </button>
          </div>
        ))
      ) : (
        <div className="empty">Nothing waiting on gift approval right now.</div>
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import Loading from '../../../components/Loading';
import Modal from '../../../components/Modal';
import { dispatchApi } from '../api';

const today = new Date().toISOString().slice(0, 10);
function daysAgo(n) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10); }

// The Dispatch page's default landing view — every party with something
// confirmed and still undispatched, so a dispatcher can see everything
// waiting without searching one customer at a time first.
export default function PendingDispatchList({ onSelectDealer }) {
  const { showToast } = useToast();
  const [parties, setParties] = useState(null); // null = loading
  const [q, setQ] = useState('');
  const [preset, setPreset] = useState('all'); // 'all' | 'today' | '7d' | '30d' | 'custom'
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [holdingDealer, setHoldingDealer] = useState(null); // party object mid-hold-reason-entry
  const [holdReason, setHoldReason] = useState('');

  function applyPreset(p) {
    setPreset(p);
    if (p === 'today') { setFrom(today); setTo(today); }
    else if (p === '7d') { setFrom(daysAgo(7)); setTo(today); }
    else if (p === '30d') { setFrom(daysAgo(30)); setTo(today); }
    else if (p === 'all') { setFrom(''); setTo(''); }
  }

  async function load() {
    setParties(null);
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    try { setParties(await dispatchApi.getPendingOverview(params.toString())); }
    catch (err) { showToast(err.message, 'err'); }
  }
  useEffect(() => { load(); }, [from, to]);

  async function submitHold() {
    if (!holdReason.trim()) return showToast('A reason is required', 'err');
    try {
      await dispatchApi.holdDealer(holdingDealer.dealer, holdReason.trim());
      showToast(`${holdingDealer.dealerName} put on hold`, 'g');
      setHoldingDealer(null); setHoldReason('');
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function unhold(party) {
    if (!confirm(`Release the hold on ${party.dealerName}?`)) return;
    try { await dispatchApi.unholdDealer(party.dealer); showToast(`${party.dealerName} released`, 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  const filtered = (parties || []).filter((p) => !q || p.dealerName.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="subtabs" style={{ marginBottom: 12 }}>
        <button className={preset === 'all' ? 'on' : ''} onClick={() => applyPreset('all')}>All</button>
        <button className={preset === 'today' ? 'on' : ''} onClick={() => applyPreset('today')}>Today</button>
        <button className={preset === '7d' ? 'on' : ''} onClick={() => applyPreset('7d')}>Last 7 days</button>
        <button className={preset === '30d' ? 'on' : ''} onClick={() => applyPreset('30d')}>Last 30 days</button>
      </div>
      <div className="row3" style={{ marginBottom: 14 }}>
        <input placeholder="Search party" value={q} onChange={(e) => setQ(e.target.value)} />
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={from} max={to || undefined} onChange={(e) => { setFrom(e.target.value); setPreset('custom'); }} title="Confirmed from" />
          <input type="date" value={to} min={from || undefined} onChange={(e) => { setTo(e.target.value); setPreset('custom'); }} title="Confirmed to" />
        </div>
      </div>

      {parties === null ? (
        <Loading label="Loading pending dispatches…" />
      ) : filtered.length ? (
        filtered.map((p) => (
          <div className="card" key={p.dealer} style={{ marginBottom: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              <div>
                <b>{p.dealerName}</b> <span className="mono muted" style={{ fontSize: 10 }}>{p.dealer}</span>
                {p.onHold && <span className="badge r" style={{ marginLeft: 8 }}>⏸ On hold — {p.holdReason}</span>}
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  Last confirmed {new Date(p.lastConfirmedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <div className="btnrow" style={{ margin: 0 }}>
                {p.onHold ? (
                  <button className="btn o sm" onClick={() => unhold(p)}>▶ Release hold</button>
                ) : (
                  <button className="btn o sm" onClick={() => setHoldingDealer(p)}>⏸ Hold order</button>
                )}
                <button className="btn sm" onClick={() => onSelectDealer(p.dealer)}>Select dispatch →</button>
              </div>
            </div>
            <div className="tblwrap">
              <table className="dt">
                <thead><tr><th>Code</th><th>Item</th><th>Qty</th></tr></thead>
                <tbody>
                  {p.items.map((it) => (
                    <tr key={`${it.code}|${it.rate}`}>
                      <td className="mono muted" style={{ fontSize: 11 }}>{it.code}</td>
                      <td>{it.name}</td>
                      <td>{it.pendingPcs} pcs</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      ) : (
        <div className="empty">Nothing pending dispatch right now.</div>
      )}

      {holdingDealer && (
        <Modal title={`Hold — ${holdingDealer.dealerName}`} onClose={() => { setHoldingDealer(null); setHoldReason(''); }}>
          <div className="fg">
            <label>Reason (required)</label>
            <textarea rows={3} placeholder="e.g. Payment pending, told by Vishal to hold" value={holdReason} onChange={(e) => setHoldReason(e.target.value)} autoFocus />
          </div>
          <div className="btnrow">
            <button className="btn rd" onClick={submitHold}>Hold this party</button>
            <button className="btn o" onClick={() => { setHoldingDealer(null); setHoldReason(''); }}>Cancel</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

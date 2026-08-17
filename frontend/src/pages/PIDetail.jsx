import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';

export default function PIDetail() {
  const { no } = useParams();
  const { showToast } = useToast();
  const { user } = useAuth();
  const nav = useNavigate();
  const [pi, setPi] = useState(null);

  async function load() { setPi(await api.get(`/pi/${no}`)); }
  useEffect(() => { load(); }, [no]);

  async function confirm() {
    try { await api.post(`/pi/${no}/confirm`); showToast('PI confirmed · stock reserved', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }
  async function cancel() {
    if (!confirm) return;
    try { await api.post(`/pi/${no}/cancel`); showToast('PI cancelled', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  if (!pi) return null;
  const canConfirm = pi.status === 'Sent' && ['mhead', 'accounts', 'founder'].includes(user.role);
  const canDispatch = ['Confirmed', 'Partial Dispatched'].includes(pi.status);
  const canCancel = !['Cancelled', 'Fully Dispatched'].includes(pi.status);

  return (
    <div>
      <div className="ph"><div className="eyebrow">PI detail</div><h2>{pi.no}</h2><p>{pi.dealerName}</p></div>
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>Item</th><th>Ordered</th><th>Pending</th><th>Total ₹</th></tr></thead>
          <tbody>
            {pi.lines.map((l, i) => (
              <tr key={i}>
                <td>{l.name}<br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.code}</span></td>
                <td>{l.pcs}</td>
                <td>{l.pending != null ? l.pending : l.pcs}</td>
                <td>{Math.round(l.total).toLocaleString('en-IN')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btnrow">
        {canConfirm && <button className="btn g" onClick={confirm}>Mark confirmed by customer</button>}
        {canDispatch && <button className="btn" onClick={() => nav(`/dispatch?pi=${pi.no}`)}>→ Book dispatch</button>}
        {canCancel && <button className="btn rd" onClick={cancel}>Cancel PI</button>}
      </div>
      <div className="note b" style={{ fontSize: 12, marginTop: 14 }}>Tax Invoice is generated at dispatch (actual shipped qty), not at PI stage.</div>
    </div>
  );
}

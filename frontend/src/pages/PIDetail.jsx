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
  const [editing, setEditing] = useState(false);
  const [editLines, setEditLines] = useState([]);
  const [editRemark, setEditRemark] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() { setPi(await api.get(`/pi/${no}`)); }
  useEffect(() => { load(); }, [no]);

  async function confirmPI() {
    try { await api.post(`/pi/${no}/confirm`); showToast('PI confirmed · stock reserved', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }
  async function cancelPI() {
    if (!window.confirm('Cancel this PI? This cannot be undone.')) return;
    try { await api.post(`/pi/${no}/cancel`); showToast('PI cancelled', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  function startEdit() {
    setEditLines(pi.lines.map((l) => ({ code: l.code, name: l.name, pcs: l.pcs, rate: l.rate, listRate: l.listRate })));
    setEditRemark(pi.remark || '');
    setEditing(true);
  }
  function editField(i, field, val) {
    const next = [...editLines];
    next[i] = { ...next[i], [field]: +val || 0 };
    setEditLines(next);
  }
  async function saveEdit() {
    setSaving(true);
    try {
      const updated = await api.put(`/pi/${no}`, {
        lines: editLines.map((l) => ({ code: l.code, pcs: l.pcs, rate: l.rate })),
        remark: editRemark,
      });
      setPi(updated);
      setEditing(false);
      showToast('PI updated', 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSaving(false); }
  }

  if (!pi) return null;
  const canConfirm = pi.status === 'Sent' && ['mhead', 'accounts', 'founder'].includes(user.role);
  const canDispatch = ['Confirmed', 'Partial Dispatched'].includes(pi.status);
  const canCancel = !['Cancelled', 'Fully Dispatched'].includes(pi.status);
  const canEdit = ['Draft', 'Sent'].includes(pi.status);

  if (editing) {
    return (
      <div>
        <div className="ph"><div className="eyebrow">Editing</div><h2>{pi.no}</h2><p>{pi.dealerName}</p></div>
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Item</th><th>Pieces</th><th>Rate ₹</th></tr></thead>
            <tbody>
              {editLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.name}<br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.code}</span></td>
                  <td><input type="number" style={{ width: 90 }} value={l.pcs} onChange={(e) => editField(i, 'pcs', e.target.value)} /></td>
                  <td>
                    <input type="number" step="0.01" style={{ width: 90 }} value={l.rate} onChange={(e) => editField(i, 'rate', e.target.value)} />
                    {l.rate !== l.listRate && <div style={{ fontSize: 9, color: 'var(--orange)' }}>edited (list ₹{l.listRate})</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="fg" style={{ marginTop: 12 }}>
          <label>Remark</label>
          <textarea rows={2} value={editRemark} onChange={(e) => setEditRemark(e.target.value)} />
        </div>
        <div className="note y" style={{ fontSize: 12 }}>Editing rates here also notifies the founder, same as at creation time.</div>
        <div className="btnrow">
          <button className="btn g" disabled={saving} onClick={saveEdit}>Save changes</button>
          <button className="btn o" disabled={saving} onClick={() => setEditing(false)}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">PI detail</div><h2>{pi.no}</h2><p>{pi.dealerName}</p></div>
      {pi.remark && <div className="note b" style={{ fontSize: 13 }}><b>Remark:</b> {pi.remark}</div>}
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
        {canEdit && <button className="btn o" onClick={startEdit}>Edit PI</button>}
        {canConfirm && <button className="btn g" onClick={confirmPI}>Mark confirmed by customer</button>}
        {canDispatch && <button className="btn" onClick={() => nav(`/dispatch?pi=${pi.no}`)}>→ Book dispatch</button>}
        {canCancel && <button className="btn rd" onClick={cancelPI}>Cancel PI</button>}
      </div>
      <div className="note b" style={{ fontSize: 12, marginTop: 14 }}>Tax Invoice is generated at dispatch (actual shipped qty), not at PI stage.</div>
    </div>
  );
}

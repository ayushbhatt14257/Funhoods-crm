import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import { piApi } from '../pi/api';

const OPEN_STATUSES = 'Sent,Confirmed,Partial Dispatched';

export default function Inventory() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [val, setVal] = useState('');
  const [openPIs, setOpenPIs] = useState(null); // lazy-loaded on first "who's waiting" click
  const [pendingFor, setPendingFor] = useState(null); // { code, name } | null

  async function load() { setRows(await api.get('/inventory')); }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()));

  async function save(code) {
    try { await api.patch(`/inventory/${code}`, { physical: +val }); showToast('Stock updated', 'g'); setEditingCode(null); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function showPendingFor(row) {
    if (openPIs === null) setOpenPIs(await piApi.list(`status=${OPEN_STATUSES}`));
    setPendingFor({ code: row.code, name: row.name });
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Physical stock</div><h2>Inventory</h2>
        <p>Physical, reserved (against confirmed PIs), and free-to-sell — always computed live. Click "Reserved" to see which customers it's waiting on.</p></div>
      <input placeholder="Search product" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, marginBottom: 14 }} />
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>Code</th><th>Product</th><th>Physical</th><th>Reserved</th><th>Free to sell</th><th>Value ₹</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.code}>
                <td className="mono">{r.code}</td><td>{r.name}</td>
                <td>{editingCode === r.code ? <input type="number" style={{ width: 90 }} value={val} onChange={(e) => setVal(e.target.value)} /> : r.physical}</td>
                <td>
                  {r.reserved > 0 ? (
                    <button className="btn o sm" onClick={() => showPendingFor(r)} title="See which customers this is reserved for">{r.reserved}</button>
                  ) : r.reserved}
                </td>
                <td style={{ color: r.free <= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{r.free}</td>
                <td>{Math.round(r.value).toLocaleString('en-IN')}</td>
                <td>
                  {editingCode === r.code
                    ? <button className="btn sm" onClick={() => save(r.code)}>Save</button>
                    : <button className="btn o sm" onClick={() => { setEditingCode(r.code); setVal(r.physical); }}>Adjust</button>}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7}><div className="empty">No stock records yet</div></td></tr>}
          </tbody>
        </table>
      </div>

      {pendingFor && (
        <PendingByProductModal
          code={pendingFor.code}
          name={pendingFor.name}
          openPIs={openPIs}
          onClose={() => setPendingFor(null)}
        />
      )}
    </div>
  );
}

function PendingByProductModal({ code, name, openPIs, onClose }) {
  if (openPIs === null) {
    return <Modal title={`Pending — ${name}`} onClose={onClose}><div className="empty">Loading…</div></Modal>;
  }

  // Group by dealer: total pending pcs for this product code, plus which PIs it's on.
  const byDealer = {};
  openPIs.forEach((p) => {
    const line = p.lines.find((l) => l.code === code);
    if (!line) return;
    const pending = line.pending != null ? line.pending : line.pcs;
    if (pending <= 0) return;
    if (!byDealer[p.dealer]) byDealer[p.dealer] = { name: p.dealerName, assignedTo: p.dealerAssignedTo, pending: 0, pis: [] };
    byDealer[p.dealer].pending += pending;
    byDealer[p.dealer].pis.push({ no: p.no, status: p.status, pending });
  });
  const rows = Object.values(byDealer).sort((a, b) => b.pending - a.pending);
  const total = rows.reduce((s, r) => s + r.pending, 0);

  return (
    <Modal title={`Pending — ${name}`} onClose={onClose}>
      {rows.length ? (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>{rows.length} customer(s) waiting on <b>{total}</b> pcs total (across open PIs).</div>
          <div className="tblwrap">
            <table className="dt">
              <thead><tr><th>Customer</th><th>Pending pcs</th><th>PI(s)</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td><b>{r.name}</b>{r.assignedTo && <div className="muted" style={{ fontSize: 11 }}>{r.assignedTo}</div>}</td>
                    <td><b>{r.pending}</b></td>
                    <td style={{ fontSize: 11.5 }}>
                      {r.pis.map((pi, j) => (
                        <span key={pi.no} className="mono">
                          {pi.no} ({pi.pending}){j < r.pis.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">Nothing pending for this product right now.</div>
      )}
    </Modal>
  );
}

import { useEffect, useState } from 'react';
import { api, API_URL, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import Loading from '../../components/Loading';
import { piApi } from '../pi/api';

const OPEN_STATUSES = 'Sent,Confirmed,Partial Dispatched';

export default function Inventory() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [tab, setTab] = useState('stock'); // 'stock' | 'production'
  const [rows, setRows] = useState(null); // null = loading
  const [q, setQ] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [val, setVal] = useState('');
  const [openPIs, setOpenPIs] = useState(null); // lazy-loaded on first "who's waiting" click
  const [pendingFor, setPendingFor] = useState(null); // { code, name } | null
  const [plan, setPlan] = useState(null); // null = not loaded yet
  const [exporting, setExporting] = useState(false);

  async function load() { setRows(await api.get('/inventory')); }
  useEffect(() => { load(); }, []);

  const filtered = (rows || []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()));

  async function save(code) {
    try { await api.patch(`/inventory/${code}`, { physical: +val }); showToast('Stock updated', 'g'); setEditingCode(null); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function showPendingFor(row) {
    if (openPIs === null) setOpenPIs(await piApi.list(`status=${OPEN_STATUSES}`));
    setPendingFor({ code: row.code, name: row.name });
  }

  async function loadPlan() {
    setPlan(null);
    setPlan(await api.get('/inventory/production-planning'));
  }

  async function downloadPlan() {
    setExporting(true);
    try {
      const res = await fetch(`${API_URL}/inventory/production-planning/export`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) return showToast('Export failed', 'err');
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `production-planning-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
    } finally { setExporting(false); }
  }

  const canSeeProductionPlanning = ['admin', 'masterAdmin'].includes(user.role);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Physical stock</div><h2>Inventory</h2>
        <p>Physical, reserved (against confirmed PIs), and free-to-sell — always computed live. Click "Reserved" to see which customers it's waiting on.</p></div>

      {canSeeProductionPlanning && (
        <div className="subtabs" style={{ marginBottom: 14 }}>
          <button className={tab === 'stock' ? 'on' : ''} onClick={() => setTab('stock')}>Stock</button>
          <button className={tab === 'production' ? 'on' : ''} onClick={() => { setTab('production'); if (plan === null) loadPlan(); }}>Production Planning</button>
        </div>
      )}

      {tab === 'stock' ? (
        <>
          <input placeholder="Search product" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, marginBottom: 14 }} />
          {rows === null ? (
            <Loading label="Loading inventory…" />
          ) : (
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
          )}
        </>
      ) : (
        <>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -8, marginBottom: 14 }}>
            Items where confirmed-order demand exceeds physical stock — how many pieces to produce to cover what's already been ordered.
          </p>
          <div className="btnrow" style={{ marginBottom: 14 }}>
            <button className="btn o sm" onClick={loadPlan}>↻ Refresh</button>
            <button className="btn sm" disabled={exporting || !plan?.length} onClick={downloadPlan}>{exporting ? 'Preparing…' : '⬇ Download Excel'}</button>
          </div>
          {plan === null ? (
            <Loading label="Calculating production needs…" />
          ) : plan.length ? (
            <div className="tblwrap">
              <table className="dt">
                <thead><tr><th>Code</th><th>Item</th><th>Physical stock</th><th>Reserved (demand)</th><th>Need to produce</th></tr></thead>
                <tbody>
                  {plan.map((r) => (
                    <tr key={r.code}>
                      <td className="mono">{r.code}</td>
                      <td>{r.name}</td>
                      <td>{r.physical}</td>
                      <td>{r.reserved}</td>
                      <td style={{ color: 'var(--red)', fontWeight: 700 }}>{r.needed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">Nothing needs producing right now — stock covers all confirmed demand.</div>
          )}
        </>
      )}

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

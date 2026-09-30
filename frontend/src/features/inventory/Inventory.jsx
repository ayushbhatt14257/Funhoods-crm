import { useEffect, useState } from 'react';
import { api, API_URL, getToken } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import Loading from '../../components/Loading';
import { piApi } from '../pi/api';
import { barcodeApi } from './barcodeApi';

// Only Confirmed (and Partial Dispatched, which is a Confirmed PI that's
// been part-shipped) actually reserve stock — see pi/controller.js's
// confirm() — a Sent PI hasn't been accepted yet and could still be
// rejected or changed, so it must never count as committed demand here.
const OPEN_STATUSES = 'Confirmed,Partial Dispatched';

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
  const [movementsFor, setMovementsFor] = useState(null); // { code, name } | null — today's/range's in vs out for one product
  const [plan, setPlan] = useState(null); // null = not loaded yet
  const [exporting, setExporting] = useState(false);
  const [showZeroConfirm, setShowZeroConfirm] = useState(false); // Danger zone — masterAdmin only, see zeroAllStock below
  const [zeroing, setZeroing] = useState(false);

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

  // Danger zone — sets EVERY product's Physical to 0 in one go, for a
  // deliberate fresh-start reset. Irreversible, so gated behind typing
  // "ZERO ALL" in the confirm modal, not just a click — see ZeroAllModal.
  async function zeroAllStock() {
    setZeroing(true);
    try {
      const res = await api.post('/inventory/zero-all');
      showToast(res.message, 'g');
      setShowZeroConfirm(false);
      load();
    } catch (err) { showToast(err.message, 'err'); }
    finally { setZeroing(false); }
  }

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
            <input placeholder="Search product" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, margin: 0 }} />
            {user.role === 'masterAdmin' && (
              <button className="btn o rd sm" onClick={() => setShowZeroConfirm(true)}>⚠ Zero all stock</button>
            )}
          </div>
          {rows === null ? (
            <Loading label="Loading inventory…" />
          ) : (
          <div className="tblwrap">
            <table className="dt">
              <thead><tr><th>Code</th><th>Product</th><th>Physical</th><th>Reserved</th><th>Free to sell</th><th>Value ₹</th><th></th></tr></thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.code}>
                    {/* Clicking the code or name opens today's (or any
                        chosen range's) in-vs-out movement for this one
                        product — computed live from actual scan events
                        (Stock In / Dispatch), not a separate tracked number. */}
                    <td
                      className="mono" style={{ cursor: 'pointer' }}
                      onClick={() => setMovementsFor({ code: r.code, name: r.name })}
                      title="Click to see today's stock-in / dispatch for this product"
                    >{r.code}</td>
                    <td
                      style={{ cursor: 'pointer' }}
                      onClick={() => setMovementsFor({ code: r.code, name: r.name })}
                      title="Click to see today's stock-in / dispatch for this product"
                    >{r.name}</td>
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
                      <td>
                        {r.reserved > 0 ? (
                          <button className="btn o sm" onClick={() => showPendingFor(r)} title="See which customers this is reserved for">{r.reserved}</button>
                        ) : r.reserved}
                      </td>
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

      {movementsFor && (
        <MovementsModal
          code={movementsFor.code}
          name={movementsFor.name}
          onClose={() => setMovementsFor(null)}
        />
      )}

      {showZeroConfirm && (
        <ZeroAllModal zeroing={zeroing} onConfirm={zeroAllStock} onClose={() => setShowZeroConfirm(false)} />
      )}
    </div>
  );
}

// Types-to-confirm gate for a one-click-away, irreversible, all-products
// action — a plain "Are you sure?" is too easy to click through by reflex
// for something this destructive.
function ZeroAllModal({ zeroing, onConfirm, onClose }) {
  const [typed, setTyped] = useState('');
  return (
    <Modal title="⚠ Zero all stock" onClose={onClose}>
      <p>This sets <b>every single product's</b> Physical stock to <b>0</b> — not just barcode-tracked ones, all of them. This cannot be undone.</p>
      <p className="muted" style={{ fontSize: 12.5 }}>Reserved (demand from open PIs) is untouched — only Physical is zeroed.</p>
      <div className="fg">
        <label>Type <b>ZERO ALL</b> to confirm</label>
        <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
      </div>
      <div className="btnrow">
        <button className="btn rd" disabled={typed !== 'ZERO ALL' || zeroing} onClick={onConfirm}>
          {zeroing ? 'Zeroing…' : 'Zero all stock'}
        </button>
        <button className="btn o" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

// YYYY-MM-DD in the BROWSER's own local day — never toISOString().slice(0,10),
// which is UTC and would silently shift "today" by the IST offset (a scan
// made after ~5:30pm IST would land on tomorrow's UTC date and disappear
// from "today"'s range near the day boundary).
function localDateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const PRESETS = {
  today: () => { const d = new Date(); return { from: localDateStr(d), to: localDateStr(d) }; },
  week: () => { const to = new Date(); const from = new Date(); from.setDate(from.getDate() - 6); return { from: localDateStr(from), to: localDateStr(to) }; },
  month: () => { const to = new Date(); const from = new Date(to.getFullYear(), to.getMonth(), 1); return { from: localDateStr(from), to: localDateStr(to) }; },
};

// Product-wise stock movement — how much of this product was scanned IN
// (Stock In) and OUT (Dispatch) in a chosen range, computed live from the
// same carton-level events the scanners already record (usedAt/dispatchedAt)
// rather than any separately-tracked daily count, so it can never drift out
// of sync with what actually happened.
function MovementsModal({ code, name, onClose }) {
  const [preset, setPreset] = useState('today');
  const [range, setRange] = useState(PRESETS.today());
  const [data, setData] = useState(null); // null = loading

  useEffect(() => {
    setData(null);
    barcodeApi.movements(code, range.from, range.to).then(setData).catch(() => setData({ error: true }));
  }, [code, range]);

  function applyPreset(p) {
    setPreset(p);
    setRange(PRESETS[p]());
  }

  const fmtTime = (iso) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  const kindLabel = (c) => (c.outer > 0 || c.inner > 0) ? [c.outer > 0 && `${c.outer} outer`, c.inner > 0 && `${c.inner} inner`].filter(Boolean).join(', ') : '0';

  return (
    <Modal title={`Stock movement — ${name}`} onClose={onClose}>
      <div className="btnrow" style={{ marginBottom: 10, flexWrap: 'wrap' }}>
        <button className={`btn sm${preset === 'today' ? '' : ' o'}`} onClick={() => applyPreset('today')}>Today</button>
        <button className={`btn sm${preset === 'week' ? '' : ' o'}`} onClick={() => applyPreset('week')}>Last 7 days</button>
        <button className={`btn sm${preset === 'month' ? '' : ' o'}`} onClick={() => applyPreset('month')}>This month</button>
        <span className="muted" style={{ fontSize: 12, alignSelf: 'center', marginLeft: 4 }}>or custom:</span>
        <input
          type="date" value={range.from} max={range.to}
          onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, from: e.target.value })); }}
          style={{ width: 140 }}
        />
        <span className="muted" style={{ alignSelf: 'center' }}>–</span>
        <input
          type="date" value={range.to} min={range.from} max={localDateStr(new Date())}
          onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, to: e.target.value })); }}
          style={{ width: 140 }}
        />
      </div>

      {data === null ? (
        <div className="empty">Loading…</div>
      ) : data.error ? (
        <div className="empty">Couldn't load movement for this product.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <div className="card" style={{ flex: 1, margin: 0, padding: 12, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>Stocked IN</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green)' }}>{data.in.pcs}</div>
              <div className="muted" style={{ fontSize: 11 }}>pcs · {kindLabel(data.in.cartons)}</div>
            </div>
            <div className="card" style={{ flex: 1, margin: 0, padding: 12, textAlign: 'center' }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.03em' }}>Dispatched OUT</div>
              <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--red)' }}>{data.out.pcs}</div>
              <div className="muted" style={{ fontSize: 11 }}>pcs · {kindLabel(data.out.cartons)}</div>
            </div>
          </div>

          {(data.in.events.length > 0 || data.out.events.length > 0) ? (
            <div className="tblwrap" style={{ maxHeight: 280, overflowY: 'auto' }}>
              <table className="dt">
                <thead><tr><th>Code</th><th>Kind</th><th>Pcs</th><th>Direction</th><th>When</th><th>Details</th></tr></thead>
                <tbody>
                  {[
                    ...data.in.events.map((e) => ({ ...e, dir: 'IN' })),
                    ...data.out.events.map((e) => ({ ...e, dir: 'OUT' })),
                  ]
                    .sort((a, b) => new Date(b.at) - new Date(a.at))
                    .map((e, i) => (
                      <tr key={`${e.dir}-${e.code}-${i}`}>
                        <td className="mono" style={{ fontSize: 11 }}>{e.code}</td>
                        <td style={{ fontSize: 11.5 }}>{e.kind}</td>
                        <td>{e.qty}</td>
                        <td style={{ color: e.dir === 'IN' ? 'var(--green)' : 'var(--red)', fontWeight: 700, fontSize: 11.5 }}>{e.dir}</td>
                        <td className="muted" style={{ fontSize: 11 }}>{fmtTime(e.at)}</td>
                        <td className="muted" style={{ fontSize: 11 }}>{e.dir === 'IN' ? (e.by || '') : (e.to ? `${e.to}${e.invoice ? ` · ${e.invoice}` : ''}` : '')}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">No stock-in or dispatch activity for this product in this range.</div>
          )}
        </>
      )}
    </Modal>
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

import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import Loading from '../components/Loading';

const TRANSPORT_MODES = ['Railway', 'Roadways / Truck', 'Safe Express', 'Delivery Courier', 'Self-pickup', 'DTDC'];

export default function Dispatch() {
  const { showToast } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const piParam = params.get('pi');

  const [mode, setMode] = useState('list'); // 'list' | 'pi' | 'manual'
  const [readyPIs, setReadyPIs] = useState(null); // null = loading
  const [dealers, setDealers] = useState([]);
  const [products, setProducts] = useState([]);
  const [filterBy, setFilterBy] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [users, setUsers] = useState([]);

  // Shared dispatch-entry state
  const [pi, setPi] = useState(null); // for PI-based
  const [manualDealer, setManualDealer] = useState('');
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [dispatchLines, setDispatchLines] = useState([]); // {code, name, pending/order qty, dispatchNow}
  const [transporter, setTransporter] = useState('');
  const [freight, setFreight] = useState(0);
  const [freightTerm, setFreightTerm] = useState('To Pay');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [vehicle, setVehicle] = useState(''); const [lr, setLr] = useState(''); const [eway, setEway] = useState(''); const [driver, setDriver] = useState('');
  const [cartonMap, setCartonMap] = useState([]);

  useEffect(() => {
    api.get('/dispatch/ready-pis').then(setReadyPIs);
    api.get('/dealers').then(setDealers);
    api.get('/products').then(setProducts);
    api.get('/users/names').then(setUsers);
  }, []);

  useEffect(() => {
    if (piParam) openFromPI(piParam);
  }, [piParam]);

  async function openFromPI(no) {
    const p = await api.get(`/pi/${no}`);
    setPi(p);
    setDispatchLines(p.lines.map((l) => {
      const pending = l.pending != null ? l.pending : l.pcs;
      return { code: l.code, name: l.name, orderedNow: pending, dispatchNow: pending };
    }));
    resetEntryFields();
    setMode('pi');
  }

  function resetEntryFields() {
    setTransporter(''); setFreight(0); setFreightTerm('To Pay'); setShowAdvanced(false);
    setVehicle(''); setLr(''); setEway(''); setDriver(''); setCartonMap([]);
  }

  function openManual() {
    setMode('manual');
    setManualDealer('');
    setPendingSuggestion(null);
    setDispatchLines([]);
    resetEntryFields();
  }

  async function onManualDealerChange(code) {
    setManualDealer(code);
    if (!code) { setPendingSuggestion(null); return; }
    const pending = await api.get(`/dispatch/pending-pi/${code}`);
    setPendingSuggestion(pending);
  }

  function addManualLine() { setDispatchLines([...dispatchLines, { code: '', dispatchNow: 0 }]); }
  function updateManualLine(i, field, val) {
    const next = [...dispatchLines];
    next[i] = { ...next[i], [field]: val };
    if (field === 'code') {
      const p = products.find((x) => x.code === val);
      next[i].name = p?.name || val;
    }
    setDispatchLines(next);
  }

  function updateDispatchQty(i, val) {
    const next = [...dispatchLines];
    const max = next[i].orderedNow ?? Infinity;
    next[i] = { ...next[i], dispatchNow: Math.min(max, Math.max(0, +val || 0)) };
    setDispatchLines(next);
  }

  // --- carton mapping ---
  const activeLines = dispatchLines.filter((l) => l.code && +l.dispatchNow > 0);
  function mappedByCode() {
    const m = {};
    cartonMap.forEach((c) => c.items.forEach((it) => { m[it.code] = (m[it.code] || 0) + it.pcs; }));
    return m;
  }
  function addCarton() {
    const no = cartonMap.length ? Math.max(...cartonMap.map((c) => c.no)) + 1 : 1;
    setCartonMap([...cartonMap, { no, items: [] }]);
  }
  function removeCarton(i) { setCartonMap(cartonMap.filter((_, idx) => idx !== i)); }
  function addItemToCarton(ci, code, pcs) {
    if (!code || pcs <= 0) return showToast('Pick item + pieces', 'err');
    const line = activeLines.find((l) => l.code === code);
    const next = [...cartonMap];
    next[ci].items.push({ code, name: line?.name || code, pcs: +pcs });
    setCartonMap(next);
  }
  function removeCartonItem(ci, ii) {
    const next = [...cartonMap];
    next[ci].items.splice(ii, 1);
    setCartonMap(next);
  }
  function autoFillCartons() {
    const mapped = mappedByCode();
    const additions = [];
    let no = cartonMap.length ? Math.max(...cartonMap.map((c) => c.no)) + 1 : 1;

    activeLines.forEach((l) => {
      const already = mapped[l.code] || 0;
      let rem = (+l.dispatchNow || 0) - already;
      if (rem <= 0) return; // already fully mapped (manually or from a previous auto-fill) — leave it alone
      const product = products.find((p) => p.code === l.code);
      const outer = product?.cartonOuter || rem;
      while (rem > 0) {
        const take = Math.min(outer, rem);
        additions.push({ no: no++, items: [{ code: l.code, name: l.name, pcs: take }] });
        rem -= take;
      }
    });

    if (!additions.length) return showToast('Everything is already mapped to a carton', 'g');
    setCartonMap([...cartonMap, ...additions]);
    showToast(`${additions.length} carton(s) added for the remaining unmapped items`, 'g');
  }

  async function submitPIDispatch() {
    if (!transporter) return showToast('Mode of transport required', 'err');
    try {
      const res = await api.post(`/dispatch/from-pi/${pi.no}`, {
        lines: dispatchLines.map((l) => ({ code: l.code, dispatchNow: l.dispatchNow })),
        transporter, vehicle, lr, eway, driver, freight, freightTerm,
        cartonMap: cartonMap.map((c) => ({ no: c.no, items: c.items })),
      });
      showToast('Dispatched · Tax Invoice raised', 'g');
      nav(`/invoices/${res.invoice.no}`);
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function submitManualDispatch() {
    if (!manualDealer) return showToast('Select a dealer', 'err');
    if (!transporter) return showToast('Mode of transport required', 'err');
    const valid = dispatchLines.filter((l) => l.code && +l.dispatchNow > 0);
    if (!valid.length) return showToast('Add at least one item with pieces', 'err');
    try {
      const res = await api.post('/dispatch/manual', {
        dealerCode: manualDealer,
        lines: valid.map((l) => ({ code: l.code, pcs: l.dispatchNow })),
        transporter, vehicle, lr, eway, driver, freight, freightTerm,
        cartonMap: cartonMap.map((c) => ({ no: c.no, items: c.items })),
      });
      showToast('Manual dispatch complete · Tax Invoice raised', 'g');
      nav(`/invoices/${res.invoice.no}`);
    } catch (err) { showToast(err.message, 'err'); }
  }

  // --- render: list mode ---
  if (mode === 'list') {
    return (
      <div>
        <div className="ph"><div className="eyebrow">Goods leaving the gate</div><h2>Dispatch</h2>
          <p>Pick a confirmed PI, or dispatch manually without one.</p></div>
        <div className="btnrow" style={{ marginBottom: 14 }}>
          <button className="btn o" onClick={openManual}>🚚 Manual dispatch (no PI)</button>
        </div>
        <div className="row2" style={{ marginBottom: 14 }}>
          <select value={filterBy} onChange={(e) => setFilterBy(e.target.value)}>
            <option value="">All users</option>
            {users.map((u) => <option key={u._id} value={u.name}>{u.name}</option>)}
          </select>
          <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} title="Created on or after" />
        </div>
        {readyPIs === null ? (
          <Loading label="Loading dispatch queue…" />
        ) : (
          <>
            {readyPIs
              .filter((p) => !filterBy || p.by === filterBy)
              .filter((p) => !filterFrom || new Date(p.createdAt) >= new Date(filterFrom))
              .map((p) => (
              <div className="card" key={p.no}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{p.no} · {p.dealerName}</div>
                    <div className="muted" style={{ fontSize: 12 }}>{p.lines.length} items · ₹{Math.round(p.total).toLocaleString('en-IN')} · by {p.by} · {new Date(p.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</div>
                    <span className={`badge ${p.status === 'Partial Dispatched' ? 'y' : 'g'}`}>{p.status}</span>
                  </div>
                  <button className="btn sm" onClick={() => openFromPI(p.no)}>Book dispatch →</button>
                </div>
              </div>
            ))}
            {!readyPIs.length && <div className="empty">No PIs pending dispatch</div>}
          </>
        )}
      </div>
    );
  }

  // --- render: PI-based or manual entry ---
  const isManual = mode === 'manual';
  const mapped = mappedByCode();

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">{isManual ? 'Manual dispatch · no PI' : `Dispatching against ${pi?.no}`}</div>
        <h2>{isManual ? 'Manual Dispatch' : pi?.dealerName}</h2>
      </div>
      <button className="btn o sm" onClick={() => setMode('list')} style={{ marginBottom: 14 }}>← Back to list</button>

      {isManual && (
        <div className="card">
          <div className="fg">
            <label>Dealer *</label>
            <select value={manualDealer} onChange={(e) => onManualDealerChange(e.target.value)}>
              <option value="">— Select dealer —</option>
              {dealers.map((d) => <option key={d.code} value={d.code}>{d.name} · {d.city}</option>)}
            </select>
          </div>
          {pendingSuggestion && (
            <div className="note y" style={{ fontSize: 12 }}>
              This dealer has a pending PI <b>{pendingSuggestion.no}</b>.{' '}
              <button className="btn sm" onClick={() => openFromPI(pendingSuggestion.no)}>Use that PI instead</button>
            </div>
          )}
          <div className="tblwrap" style={{ marginTop: 10 }}>
            <table className="dt">
              <thead><tr><th>Product</th><th>Pieces</th><th></th></tr></thead>
              <tbody>
                {dispatchLines.map((l, i) => (
                  <tr key={i}>
                    <td>
                      <select value={l.code} onChange={(e) => updateManualLine(i, 'code', e.target.value)}>
                        <option value="">— pick —</option>
                        {products.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                      </select>
                    </td>
                    <td><input type="number" style={{ width: 90 }} value={l.dispatchNow} onChange={(e) => updateManualLine(i, 'dispatchNow', +e.target.value)} /></td>
                    <td><button className="btn o sm" onClick={() => setDispatchLines(dispatchLines.filter((_, idx) => idx !== i))}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="btnrow"><button className="btn o sm" onClick={addManualLine}>+ Add item</button></div>
        </div>
      )}

      {!isManual && (
        <div className="card">
          <h3 style={{ marginBottom: 10 }}>Step 1 · Enter dispatched quantity per line</h3>
          <div className="tblwrap">
            <table className="dt">
              <thead><tr><th>Item</th><th>Pending</th><th>Dispatch now</th></tr></thead>
              <tbody>
                {dispatchLines.map((l, i) => (
                  <tr key={i}>
                    <td>{l.name}</td>
                    <td>{l.orderedNow}</td>
                    <td><input type="number" style={{ width: 90 }} min={0} max={l.orderedNow} value={l.dispatchNow} onChange={(e) => updateDispatchQty(i, e.target.value)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Step 2 · Mode of transport</h3>
        <div className="row2">
          <div className="fg">
            <label>Via / mode *</label>
            <input list="modes" value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="e.g. Railway, Safe Express" />
            <datalist id="modes">{TRANSPORT_MODES.map((m) => <option key={m} value={m} />)}</datalist>
          </div>
          <div className="fg"><label>Freight ₹</label><input type="number" value={freight} onChange={(e) => setFreight(+e.target.value)} /></div>
          <div className="fg"><label>Freight term</label>
            <select value={freightTerm} onChange={(e) => setFreightTerm(e.target.value)}>
              <option>To Pay</option><option>Paid</option>
            </select>
          </div>
        </div>
        <button className="btn o sm" onClick={() => setShowAdvanced((s) => !s)}>{showAdvanced ? 'Hide' : '+ Show'} advanced (vehicle/LR/eway)</button>
        {showAdvanced && (
          <div className="row2" style={{ marginTop: 10 }}>
            <div className="fg"><label>Vehicle no</label><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
            <div className="fg"><label>LR no</label><input value={lr} onChange={(e) => setLr(e.target.value)} /></div>
            <div className="fg"><label>Eway bill no</label><input value={eway} onChange={(e) => setEway(e.target.value)} /></div>
            <div className="fg"><label>Driver mobile</label><input value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
          </div>
        )}
      </div>

      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Step 3 · Carton mapping (for packing list)</h3>
        <div className="note b" style={{ fontSize: 12 }}>Map every dispatched piece to a carton — one product per carton, or mixed items in the same carton.</div>
        <div className="tblwrap" style={{ margin: '10px 0' }}>
          <table className="dt">
            <thead><tr><th>Item</th><th>To dispatch</th><th>Mapped</th><th>Remaining</th></tr></thead>
            <tbody>
              {activeLines.map((l) => {
                const m = mapped[l.code] || 0;
                const rem = +l.dispatchNow - m;
                return <tr key={l.code}><td>{l.name}</td><td>{l.dispatchNow}</td><td>{m}</td>
                  <td style={{ color: rem > 0 ? 'var(--orange)' : 'var(--green)', fontWeight: 600 }}>{rem}</td></tr>;
              })}
            </tbody>
          </table>
        </div>
        {cartonMap.map((c, ci) => (
          <CartonRow key={ci} carton={c} ci={ci} activeLines={activeLines} onAdd={addItemToCarton} onRemoveItem={removeCartonItem} onRemoveCarton={removeCarton} />
        ))}
        <div className="btnrow">
          <button className="btn o sm" onClick={addCarton}>+ Add carton</button>
          <button className="btn o sm" onClick={autoFillCartons}>⚡ Auto-fill (1 product/carton)</button>
        </div>
      </div>

      <div className="btnrow">
        <button className="btn g" onClick={isManual ? submitManualDispatch : submitPIDispatch}>→ Cross-check &amp; generate Tax Invoice</button>
      </div>
    </div>
  );
}

function CartonRow({ carton, ci, activeLines, onAdd, onRemoveItem, onRemoveCarton }) {
  const [selCode, setSelCode] = useState('');
  const [qty, setQty] = useState('');
  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 10, alignItems: 'start' }}>
      <div style={{ fontWeight: 700, textAlign: 'center' }}>#{carton.no}</div>
      <div>
        {carton.items.map((it, ii) => (
          <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
            <span>{it.name} <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{it.code}</span></span>
            <span>{it.pcs} pcs <button className="btn o sm" style={{ padding: '1px 7px', marginLeft: 6 }} onClick={() => onRemoveItem(ci, ii)}>×</button></span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select value={selCode} onChange={(e) => setSelCode(e.target.value)} style={{ fontSize: 11.5, padding: 5 }}>
            <option value="">— pick item —</option>
            {activeLines.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <input type="number" placeholder="pcs" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70, fontSize: 11.5, padding: 5 }} />
          <button className="btn sm" onClick={() => { onAdd(ci, selCode, +qty); setQty(''); }}>+ Add</button>
        </div>
      </div>
      <button className="btn o sm" onClick={() => onRemoveCarton(ci)}>Remove</button>
    </div>
  );
}

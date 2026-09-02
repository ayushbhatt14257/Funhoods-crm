import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { dispatchApi } from './api';
import DispatchQueue from './components/DispatchQueue';
import DispatchForm from './components/DispatchForm';

// Top-level orchestrator: owns all dispatch-entry state and the three modes
// (list / pi / manual), and delegates rendering to DispatchQueue (mode ===
// 'list') or DispatchForm (mode === 'pi' | 'manual'). No JSX of its own
// beyond picking which of those two to render.
export default function Dispatch() {
  const { showToast } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const piParam = params.get('pi');

  const [mode, setMode] = useState('list'); // 'list' | 'pi' | 'manual'
  const [readyPIs, setReadyPIs] = useState(null); // null = loading
  const [dealers, setDealers] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);

  // Shared dispatch-entry state
  const [pi, setPi] = useState(null); // for PI-based
  const [manualDealer, setManualDealer] = useState('');
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [dispatchLines, setDispatchLines] = useState([]); // {code, name, photo, orderedNow?, dispatchNow}
  const [transporter, setTransporter] = useState('');
  const [freight, setFreight] = useState(0);
  const [freightTerm, setFreightTerm] = useState('To Pay');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [vehicle, setVehicle] = useState(''); const [lr, setLr] = useState(''); const [eway, setEway] = useState(''); const [driver, setDriver] = useState('');
  const [cartonMap, setCartonMap] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    dispatchApi.getReadyPIs().then(setReadyPIs);
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
      return { code: l.code, name: l.name, photo: l.photo || '', orderedNow: pending, dispatchNow: pending };
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
    const pending = await dispatchApi.getPendingPIForDealer(code);
    setPendingSuggestion(pending);
  }

  function addManualLine() { setDispatchLines([...dispatchLines, { code: '', dispatchNow: 0 }]); }
  function updateManualLine(i, field, val) {
    const next = [...dispatchLines];
    next[i] = { ...next[i], [field]: val };
    if (field === 'code') {
      const p = products.find((x) => x.code === val);
      next[i].name = p?.name || val;
      next[i].photo = p?.photo || '';
    }
    setDispatchLines(next);
  }
  function removeManualLine(i) { setDispatchLines(dispatchLines.filter((_, idx) => idx !== i)); }

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
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await dispatchApi.dispatchFromPI(pi.no, {
        lines: dispatchLines.map((l) => ({ code: l.code, dispatchNow: l.dispatchNow })),
        transporter, vehicle, lr, eway, driver, freight, freightTerm,
        cartonMap: cartonMap.map((c) => ({ no: c.no, items: c.items })),
      });
      showToast('Dispatched · Tax Invoice raised', 'g');
      nav(`/invoices/${res.invoice.no}`);
    } catch (err) { showToast(err.message, 'err'); setSubmitting(false); }
  }

  async function submitManualDispatch() {
    if (!manualDealer) return showToast('Select a dealer', 'err');
    if (!transporter) return showToast('Mode of transport required', 'err');
    const valid = dispatchLines.filter((l) => l.code && +l.dispatchNow > 0);
    if (!valid.length) return showToast('Add at least one item with pieces', 'err');
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await dispatchApi.dispatchManual({
        dealerCode: manualDealer,
        lines: valid.map((l) => ({ code: l.code, pcs: l.dispatchNow })),
        transporter, vehicle, lr, eway, driver, freight, freightTerm,
        cartonMap: cartonMap.map((c) => ({ no: c.no, items: c.items })),
      });
      showToast('Manual dispatch complete · Tax Invoice raised', 'g');
      nav(`/invoices/${res.invoice.no}`);
    } catch (err) { showToast(err.message, 'err'); setSubmitting(false); }
  }

  if (mode === 'list') {
    return <DispatchQueue readyPIs={readyPIs} users={users} onOpenPI={openFromPI} onOpenManual={openManual} />;
  }

  const isManual = mode === 'manual';
  return (
    <DispatchForm
      isManual={isManual}
      pi={pi}
      dealers={dealers}
      products={products}
      manualDealer={manualDealer}
      onManualDealerChange={onManualDealerChange}
      pendingSuggestion={pendingSuggestion}
      onUsePendingPI={openFromPI}
      dispatchLines={dispatchLines}
      onQtyChange={updateDispatchQty}
      onManualLineChange={updateManualLine}
      onAddManualLine={addManualLine}
      onRemoveManualLine={removeManualLine}
      transportState={{ transporter, setTransporter, freight, setFreight, freightTerm, setFreightTerm, showAdvanced, setShowAdvanced, vehicle, setVehicle, lr, setLr, eway, setEway, driver, setDriver }}
      cartonState={{ activeLines, mapped: mappedByCode(), cartonMap, onAddCarton: addCarton, onAutoFill: autoFillCartons, onAddItemToCarton: addItemToCarton, onRemoveCartonItem: removeCartonItem, onRemoveCarton: removeCarton }}
      onSubmit={isManual ? submitManualDispatch : submitPIDispatch}
      submitting={submitting}
      onBack={() => setMode('list')}
    />
  );
}

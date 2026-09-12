import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import ConfirmPopup from '../../components/ConfirmPopup';
import { dispatchApi } from './api';
import DealerPickerModal from '../pi/components/DealerPickerModal';
import CustomerPoolView from './components/CustomerPoolView';
import TransportStep from './components/TransportStep';
import CartonMappingStep from './components/CartonMappingStep';
import DispatchForm from './components/DispatchForm';
import Loading from '../../components/Loading';

// Top-level orchestrator. Two modes:
//  - 'pool' (default, the new primary flow): pick a customer, see every
//    confirmed-but-undispatched item aggregated across ALL their PIs in one
//    pool, check off what's going out, dispatch.
//  - 'manual': the pre-existing no-PI dispatch flow, kept completely as-is.
// Transport + carton mapping are shared UI/state between both modes (same
// components, same behavior) since neither of those steps cares which mode
// produced the items being dispatched.
export default function Dispatch() {
  const { showToast } = useToast();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const dealerParam = params.get('dealer');

  const [mode, setMode] = useState('pool'); // 'pool' | 'manual'
  const [dealers, setDealers] = useState([]);
  const [products, setProducts] = useState([]);

  // --- pool-mode state ---
  const [showCustomerPicker, setShowCustomerPicker] = useState(!dealerParam);
  const [dealerCode, setDealerCode] = useState(dealerParam || '');
  const [pool, setPool] = useState(null); // null = loading/none picked yet
  const [selection, setSelection] = useState({}); // rowKey -> {checked, outers, inners}

  // --- manual-mode state (unchanged from before) ---
  const [manualDealer, setManualDealer] = useState('');
  const [showDealerPicker, setShowDealerPicker] = useState(false);
  const [showProductPicker, setShowProductPicker] = useState(false);
  const [confirmingProduct, setConfirmingProduct] = useState(null);
  const [pendingSuggestion, setPendingSuggestion] = useState(null);
  const [manualLines, setManualLines] = useState([]); // {code, name, photo, dispatchNow}

  // --- shared transport + carton-mapping state ---
  const [transporter, setTransporter] = useState('');
  const [freight, setFreight] = useState(0);
  const [freightTerm, setFreightTerm] = useState('To Pay');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [vehicle, setVehicle] = useState(''); const [lr, setLr] = useState(''); const [eway, setEway] = useState(''); const [driver, setDriver] = useState('');
  const [cartonMap, setCartonMap] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [shortageConfirm, setShortageConfirm] = useState(null);

  useEffect(() => {
    api.get('/dealers').then(setDealers);
    api.get('/products').then(setProducts);
  }, []);

  useEffect(() => {
    if (dealerCode) loadPool(dealerCode);
  }, [dealerCode]);

  async function loadPool(code) {
    setPool(null);
    setSelection({});
    try {
      const res = await dispatchApi.getCustomerPool(code);
      setPool(res);
    } catch (err) { showToast(err.message, 'err'); }
  }

  function pickCustomer(d) {
    setDealerCode(d.code);
    setShowCustomerPicker(false);
    resetEntryFields();
    nav(`/dispatch?dealer=${d.code}`, { replace: true });
  }

  function changeCustomer() {
    setDealerCode('');
    setPool(null);
    setSelection({});
    setShowCustomerPicker(true);
    nav('/dispatch', { replace: true });
  }

  function resetEntryFields() {
    setTransporter(''); setFreight(0); setFreightTerm('To Pay'); setShowAdvanced(false);
    setVehicle(''); setLr(''); setEway(''); setDriver(''); setCartonMap([]);
  }

  function openManual() {
    setMode('manual');
    setManualDealer('');
    setShowDealerPicker(false);
    setShowProductPicker(false);
    setConfirmingProduct(null);
    setPendingSuggestion(null);
    setManualLines([]);
    resetEntryFields();
  }

  function backToPool() {
    setMode('pool');
    resetEntryFields();
  }

  async function onManualDealerChange(code) {
    setManualDealer(code);
    setShowDealerPicker(false);
    if (!code) { setPendingSuggestion(null); return; }
    const pending = await dispatchApi.getPendingPIForDealer(code);
    setPendingSuggestion(pending);
  }

  // Same "pick product → confirm outer/inner/exact pcs" flow as New Order,
  // reused here so manual dispatch entry feels identical instead of a plain dropdown.
  function addConfirmedManualLine(product, outers, inners, directPcs) {
    if (!outers && !inners && !directPcs) return showToast('Enter outer/inner cartons, or exact pieces', 'err');
    const pcs = directPcs ? directPcs : outers * product.cartonOuter + inners * product.cartonInner;

    const existingIdx = manualLines.findIndex((l) => l.code === product.code);
    if (existingIdx >= 0) {
      const next = [...manualLines];
      next[existingIdx] = { ...next[existingIdx], dispatchNow: next[existingIdx].dispatchNow + pcs };
      setManualLines(next);
      showToast(`${product.name} was already added — quantities combined`, 'g');
    } else {
      setManualLines([...manualLines, { code: product.code, name: product.name, photo: product.photo || '', dispatchNow: pcs }]);
    }
    setConfirmingProduct(null);
    setShowProductPicker(false);
  }
  function removeManualLine(i) { setManualLines(manualLines.filter((_, idx) => idx !== i)); }

  // --- carton mapping (shared by both modes) ---
  function poolActiveLines() {
    // One entry per unique product code (summed across any rate-variant
    // rows) — cartons are physical, they don't know about invoice rates.
    const byCode = {};
    Object.entries(selection).forEach(([key, sel]) => {
      if (!sel.checked) return;
      const item = pool?.items.find((it) => `${it.code}|${it.rate}` === key);
      if (!item) return;
      const pcs = (sel.outers || 0) * item.cartonOuter + (sel.inners || 0) * item.cartonInner;
      if (pcs <= 0) return;
      if (!byCode[item.code]) byCode[item.code] = { code: item.code, name: item.name, dispatchNow: 0 };
      byCode[item.code].dispatchNow += pcs;
    });
    return Object.values(byCode);
  }
  const activeLines = mode === 'manual' ? manualLines.filter((l) => l.code && +l.dispatchNow > 0) : poolActiveLines();

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
      if (rem <= 0) return;
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

  async function submitPoolDispatch(force = false) {
    if (!transporter) return showToast('Mode of transport required', 'err');
    const lines = Object.entries(selection)
      .filter(([, sel]) => sel.checked && ((sel.outers || 0) > 0 || (sel.inners || 0) > 0))
      .map(([key, sel]) => {
        const item = pool.items.find((it) => `${it.code}|${it.rate}` === key);
        return { code: item.code, rate: item.rate, gstPct: item.gstPct, outers: sel.outers || 0, inners: sel.inners || 0 };
      });
    if (!lines.length) return showToast('Select at least one item with a whole-carton quantity', 'err');
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await dispatchApi.dispatchFromPool({
        dealerCode, lines, transporter, vehicle, lr, eway, driver, freight, freightTerm,
        cartonMap: cartonMap.map((c) => ({ no: c.no, items: c.items })),
        force,
      });
      showToast('Dispatched · Tax Invoice raised', 'g');
      nav(`/invoices/${res.invoice.no}`);
    } catch (err) {
      if (err.status === 409 && err.data?.shortages) {
        setShortageConfirm({ message: err.message, shortages: err.data.shortages, onConfirm: () => { setShortageConfirm(null); submitPoolDispatch(true); } });
        setSubmitting(false);
        return;
      }
      showToast(err.message, 'err'); setSubmitting(false);
    }
  }

  async function submitManualDispatch(force = false) {
    if (!manualDealer) return showToast('Select a dealer', 'err');
    if (!transporter) return showToast('Mode of transport required', 'err');
    const valid = manualLines.filter((l) => l.code && +l.dispatchNow > 0);
    if (!valid.length) return showToast('Add at least one item with pieces', 'err');
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await dispatchApi.dispatchManual({
        dealerCode: manualDealer,
        lines: valid.map((l) => ({ code: l.code, pcs: l.dispatchNow })),
        transporter, vehicle, lr, eway, driver, freight, freightTerm,
        cartonMap: cartonMap.map((c) => ({ no: c.no, items: c.items })),
        force,
      });
      showToast('Manual dispatch complete · Tax Invoice raised', 'g');
      nav(`/invoices/${res.invoice.no}`);
    } catch (err) {
      if (err.status === 409 && err.data?.shortages) {
        setShortageConfirm({ message: err.message, shortages: err.data.shortages, onConfirm: () => { setShortageConfirm(null); submitManualDispatch(true); } });
        setSubmitting(false);
        return;
      }
      showToast(err.message, 'err'); setSubmitting(false);
    }
  }

  const cartonState = { activeLines, mapped: mappedByCode(), cartonMap, onAddCarton: addCarton, onAutoFill: autoFillCartons, onAddItemToCarton: addItemToCarton, onRemoveCartonItem: removeCartonItem, onRemoveCarton: removeCarton };
  const transportState = { transporter, setTransporter, freight, setFreight, freightTerm, setFreightTerm, showAdvanced, setShowAdvanced, vehicle, setVehicle, lr, setLr, eway, setEway, driver, setDriver };

  const shortageModal = shortageConfirm && (
    <ConfirmPopup
      title="Not enough physical stock"
      message={shortageConfirm.message}
      confirmLabel="Dispatch anyway"
      danger
      onConfirm={shortageConfirm.onConfirm}
      onClose={() => setShortageConfirm(null)}
    >
      <table className="dt" style={{ marginTop: -6, marginBottom: 12 }}>
        <thead><tr><th>Item</th><th>Dispatching</th><th>Physically in stock</th></tr></thead>
        <tbody>
          {shortageConfirm.shortages.map((s) => (
            <tr key={s.code}>
              <td>{s.name}</td>
              <td style={{ color: 'var(--red)', fontWeight: 600 }}>{s.requested}</td>
              <td>{s.physical}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ConfirmPopup>
  );

  if (mode === 'manual') {
    const manualDealerObj = dealers.find((d) => d.code === manualDealer) || null;
    return (
      <>
        <DispatchForm
          isManual
          dealers={dealers}
          products={products}
          manualDealer={manualDealer}
          manualDealerObj={manualDealerObj}
          onManualDealerChange={onManualDealerChange}
          showDealerPicker={showDealerPicker}
          onOpenDealerPicker={() => setShowDealerPicker(true)}
          onCloseDealerPicker={() => setShowDealerPicker(false)}
          onDealerCreated={(d) => setDealers((prev) => [d, ...prev])}
          showProductPicker={showProductPicker}
          onOpenProductPicker={() => setShowProductPicker(true)}
          onCloseProductPicker={() => setShowProductPicker(false)}
          confirmingProduct={confirmingProduct}
          onPickProduct={setConfirmingProduct}
          onConfirmProduct={addConfirmedManualLine}
          onCloseConfirmProduct={() => setConfirmingProduct(null)}
          pendingSuggestion={pendingSuggestion}
          onUsePendingPI={() => { setDealerCode(manualDealer); setShowCustomerPicker(false); setMode('pool'); nav(`/dispatch?dealer=${manualDealer}`, { replace: true }); }}
          dispatchLines={manualLines}
          onRemoveManualLine={removeManualLine}
          transportState={transportState}
          cartonState={cartonState}
          onSubmit={() => submitManualDispatch()}
          submitting={submitting}
          onBack={backToPool}
        />
        {shortageModal}
      </>
    );
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Goods leaving the gate</div><h2>Dispatch</h2>
        <p>Pick a customer to see every confirmed item still owed to them, across all their orders.</p></div>

      <div className="btnrow" style={{ marginBottom: 14 }}>
        {pool && <button className="btn o sm" onClick={changeCustomer}>↺ Change customer</button>}
        <button className="btn o sm" onClick={openManual}>🚚 Manual dispatch (no PI)</button>
      </div>

      {!dealerCode ? (
        <div className="card" style={{ maxWidth: 420 }}>
          <button className="btn" onClick={() => setShowCustomerPicker(true)}>+ Search / pick customer</button>
        </div>
      ) : pool === null ? (
        <Loading label="Loading confirmed items…" />
      ) : (
        <>
          <CustomerPoolView pool={pool} selection={selection} onSelectionChange={setSelection} />
          <TransportStep {...transportState} />
          <CartonMappingStep
            activeLines={activeLines}
            mapped={mappedByCode()}
            cartonMap={cartonMap}
            onAddCarton={addCarton}
            onAutoFill={autoFillCartons}
            onAddItemToCarton={addItemToCarton}
            onRemoveCartonItem={removeCartonItem}
            onRemoveCarton={removeCarton}
          />
          <div className="btnrow">
            <button className="btn g" disabled={submitting} onClick={() => submitPoolDispatch()}>{submitting ? 'Saving…' : '→ Dispatch selected items'}</button>
          </div>
        </>
      )}

      {showCustomerPicker && (
        <DealerPickerModal
          dealers={dealers}
          onPick={pickCustomer}
          onClose={() => setShowCustomerPicker(false)}
          onDealerCreated={(d) => setDealers((prev) => [d, ...prev])}
        />
      )}
      {shortageModal}
    </div>
  );
}

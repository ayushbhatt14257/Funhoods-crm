import TransportStep from './TransportStep';
import CartonMappingStep from './CartonMappingStep';
import { PIQuantityStep, ManualLinesStep } from './LineQuantityStep';
import DispatchSlip from './DispatchSlip';
import { printAs, ddmmyyyy } from '../../../utils/print';

// Everything after "pick a PI (or go manual)": the 3-step dispatch entry
// form. All state lives in the parent (Dispatch.jsx) and is passed down —
// this component is purely presentational/orchestration, no API calls.
export default function DispatchForm({
  isManual, pi, dealers, products, manualDealer, onManualDealerChange, pendingSuggestion, onUsePendingPI,
  dispatchLines, onQtyChange, onManualLineChange, onAddManualLine, onRemoveManualLine,
  transportState, cartonState, onSubmit, submitting, onBack,
}) {
  const { activeLines, mapped, cartonMap, onAddCarton, onAutoFill, onAddItemToCarton, onRemoveCartonItem, onRemoveCarton } = cartonState;

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">{isManual ? 'Manual dispatch · no PI' : `Dispatching against ${pi?.no}`}</div>
        <h2>{isManual ? 'Manual Dispatch' : pi?.dealerName}</h2>
      </div>
      <button className="btn o sm" onClick={onBack} style={{ marginBottom: 14 }}>← Back to list</button>

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
              <button className="btn sm" onClick={() => onUsePendingPI(pendingSuggestion.no)}>Use that PI instead</button>
            </div>
          )}
          <ManualLinesStep
            dispatchLines={dispatchLines}
            products={products}
            onLineChange={onManualLineChange}
            onAddLine={onAddManualLine}
            onRemoveLine={onRemoveManualLine}
          />
        </div>
      )}

      {!isManual && (
        <PIQuantityStep dispatchLines={dispatchLines} onQtyChange={onQtyChange} onPrint={() => printAs(`${pi?.dealerName || 'Dispatch'} ${ddmmyyyy()}`)} />
      )}

      <TransportStep {...transportState} />

      <CartonMappingStep
        activeLines={activeLines}
        mapped={mapped}
        cartonMap={cartonMap}
        onAddCarton={onAddCarton}
        onAutoFill={onAutoFill}
        onAddItemToCarton={onAddItemToCarton}
        onRemoveCartonItem={onRemoveCartonItem}
        onRemoveCarton={onRemoveCarton}
      />

      <div className="btnrow">
        <button className="btn g" disabled={submitting} onClick={onSubmit}>{submitting ? 'Saving…' : '→ Cross-check & generate Tax Invoice'}</button>
      </div>

      {!isManual && <DispatchSlip pi={pi} dispatchLines={dispatchLines} transporter={transportState.transporter} />}
    </div>
  );
}

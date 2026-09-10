import TransportStep from './TransportStep';
import CartonMappingStep from './CartonMappingStep';
import { PIQuantityStep, ManualLinesStep } from './LineQuantityStep';
import DispatchSlip from './DispatchSlip';
import { printAs, ddmmyyyy } from '../../../utils/print';
import DealerPickerModal from '../../pi/components/DealerPickerModal';
import ProductPickerModal from '../../pi/components/ProductPickerModal';
import ConfirmLineModal from '../../pi/components/ConfirmLineModal';

// Everything after "pick a PI (or go manual)": the 3-step dispatch entry
// form. All state lives in the parent (Dispatch.jsx) and is passed down —
// this component is purely presentational/orchestration, no API calls.
export default function DispatchForm({
  isManual, pi, dealers, products, manualDealer, manualDealerObj, onManualDealerChange,
  showDealerPicker, onOpenDealerPicker, onCloseDealerPicker, onDealerCreated,
  showProductPicker, onOpenProductPicker, onCloseProductPicker,
  confirmingProduct, onPickProduct, onConfirmProduct, onCloseConfirmProduct,
  pendingSuggestion, onUsePendingPI,
  dispatchLines, onQtyChange, onRemoveManualLine,
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
          <label style={{ display: 'block', marginBottom: 6 }}>Dealer *</label>
          {manualDealerObj ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px' }}>
              <div>
                <b>{manualDealerObj.name}</b> <span className="muted" style={{ fontSize: 12 }}>· {manualDealerObj.city}</span>
                <div className="muted" style={{ fontSize: 11.5, marginTop: 2 }}>
                  Assigned to: {manualDealerObj.assignedTo || '— Unassigned —'}
                </div>
              </div>
              <button className="btn o sm" onClick={onOpenDealerPicker}>Change</button>
            </div>
          ) : (
            <button className="btn o" onClick={onOpenDealerPicker}>+ Pick dealer</button>
          )}

          {pendingSuggestion && (
            <div className="note y" style={{ fontSize: 12, marginTop: 10 }}>
              This dealer has a pending PI <b>{pendingSuggestion.no}</b>.{' '}
              <button className="btn sm" onClick={() => onUsePendingPI(pendingSuggestion.no)}>Use that PI instead</button>
            </div>
          )}

          <ManualLinesStep dispatchLines={dispatchLines} onRemoveLine={onRemoveManualLine} onAddItemClick={onOpenProductPicker} />
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

      {showDealerPicker && (
        <DealerPickerModal
          dealers={dealers}
          onPick={(d) => onManualDealerChange(d.code)}
          onClose={onCloseDealerPicker}
          onDealerCreated={onDealerCreated}
        />
      )}
      {showProductPicker && (
        <ProductPickerModal products={products} onPick={onPickProduct} onClose={onCloseProductPicker} />
      )}
      {confirmingProduct && (
        <ConfirmLineModal product={confirmingProduct} onConfirm={onConfirmProduct} onClose={onCloseConfirmProduct} />
      )}
    </div>
  );
}

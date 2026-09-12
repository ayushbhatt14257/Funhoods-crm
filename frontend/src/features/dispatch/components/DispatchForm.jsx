import TransportStep from './TransportStep';
import CartonMappingStep from './CartonMappingStep';
import { ManualLinesStep } from './LineQuantityStep';
import DealerPickerModal from '../../pi/components/DealerPickerModal';
import ProductPickerModal from '../../pi/components/ProductPickerModal';
import ConfirmLineModal from '../../pi/components/ConfirmLineModal';

// Manual (no-PI) dispatch entry form — kept exactly as it was before the
// customer-pool dispatch flow was introduced. This is now the only mode
// DispatchForm renders; the old PI-by-PI dispatch mode it used to also
// support has been removed entirely (see Dispatch.jsx / CustomerPoolView).
export default function DispatchForm({
  dealers, products, manualDealer, manualDealerObj, onManualDealerChange,
  showDealerPicker, onOpenDealerPicker, onCloseDealerPicker, onDealerCreated,
  showProductPicker, onOpenProductPicker, onCloseProductPicker,
  confirmingProduct, onPickProduct, onConfirmProduct, onCloseConfirmProduct,
  pendingSuggestion, onUsePendingPI,
  dispatchLines, onRemoveManualLine,
  transportState, cartonState, onSubmit, submitting, onBack,
}) {
  return (
    <div>
      <div className="ph">
        <div className="eyebrow">Manual dispatch · no PI</div>
        <h2>Manual Dispatch</h2>
      </div>
      <button className="btn o sm" onClick={onBack} style={{ marginBottom: 14 }}>← Back to Dispatch</button>

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
            <button className="btn sm" onClick={onUsePendingPI}>Use the customer-pool dispatch instead</button>
          </div>
        )}

        <ManualLinesStep dispatchLines={dispatchLines} onRemoveLine={onRemoveManualLine} onAddItemClick={onOpenProductPicker} />
      </div>

      <TransportStep {...transportState} />

      <CartonMappingStep
        activeLines={cartonState.activeLines}
        mapped={cartonState.mapped}
        cartonMap={cartonState.cartonMap}
        onAddCarton={cartonState.onAddCarton}
        onAutoFill={cartonState.onAutoFill}
        onAddItemToCarton={cartonState.onAddItemToCarton}
        onRemoveCartonItem={cartonState.onRemoveCartonItem}
        onRemoveCarton={cartonState.onRemoveCarton}
      />

      <div className="btnrow">
        <button className="btn g" disabled={submitting} onClick={onSubmit}>{submitting ? 'Saving…' : '→ Cross-check & generate Tax Invoice'}</button>
      </div>

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

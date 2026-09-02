import CartonRow from './CartonRow';

// Step 3 of the dispatch form: map every dispatched piece to a physical
// carton (for the packing list on the Tax Invoice).
export default function CartonMappingStep({ activeLines, mapped, cartonMap, onAddCarton, onAutoFill, onAddItemToCarton, onRemoveCartonItem, onRemoveCarton }) {
  return (
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
              return (
                <tr key={l.code}>
                  <td>{l.name}</td><td>{l.dispatchNow}</td><td>{m}</td>
                  <td style={{ color: rem > 0 ? 'var(--orange)' : 'var(--green)', fontWeight: 600 }}>{rem}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {cartonMap.map((c, ci) => (
        <CartonRow key={ci} carton={c} ci={ci} activeLines={activeLines} onAdd={onAddItemToCarton} onRemoveItem={onRemoveCartonItem} onRemoveCarton={onRemoveCarton} />
      ))}
      <div className="btnrow">
        <button className="btn o sm" onClick={onAddCarton}>+ Add carton</button>
        <button className="btn o sm" onClick={onAutoFill}>⚡ Auto-fill (1 product/carton)</button>
      </div>
    </div>
  );
}

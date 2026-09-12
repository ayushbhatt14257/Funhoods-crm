// Manual (no-PI) dispatch variant: shows items already added (from the same
// pick-product → confirm-quantity flow used in New Order), no free-text dropdown.
// This is the only step-component left here — the PI-based variant that
// used to live in this file was removed along with the old PI-by-PI
// dispatch flow (see Dispatch.jsx / CustomerPoolView for its replacement).
export function ManualLinesStep({ dispatchLines, onRemoveLine, onAddItemClick }) {
  return (
    <div style={{ marginTop: 14 }}>
      {dispatchLines.length > 0 && (
        <div className="tblwrap" style={{ marginBottom: 10 }}>
          <table className="dt">
            <thead><tr><th></th><th>Product</th><th>Pieces</th><th></th></tr></thead>
            <tbody>
              {dispatchLines.map((l, i) => (
                <tr key={i}>
                  <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                  <td><b>{l.name}</b> <span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                  <td>{l.dispatchNow}</td>
                  <td><button className="btn o sm" onClick={() => onRemoveLine(i)}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button className="btn o sm" onClick={onAddItemClick}>+ Add item</button>
    </div>
  );
}

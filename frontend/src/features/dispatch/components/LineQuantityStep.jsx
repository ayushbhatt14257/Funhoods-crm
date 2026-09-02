// Step 1 of the dispatch form — PI-based variant: shows pending qty per line
// (carried over from the PI) with an editable "dispatch now" and a live
// "remaining after" column, plus the print-slip trigger.
export function PIQuantityStep({ dispatchLines, onQtyChange, onPrint }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Step 1 · Enter dispatched quantity per line</h3>
        <button className="btn o sm" onClick={onPrint}>🖨️ Print remaining/dispatch slip</button>
      </div>
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th></th><th>Item</th><th>Pending</th><th>Dispatch now</th><th>Remaining after</th></tr></thead>
          <tbody>
            {dispatchLines.map((l, i) => {
              const remaining = Math.max(0, (+l.orderedNow || 0) - (+l.dispatchNow || 0));
              return (
                <tr key={i}>
                  <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, background: 'var(--paper)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>}</td>
                  <td><b>{l.name}</b><br /><span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                  <td>{l.orderedNow}</td>
                  <td><input type="number" style={{ width: 90 }} min={0} max={l.orderedNow} value={l.dispatchNow} onChange={(e) => onQtyChange(i, e.target.value)} /></td>
                  <td style={{ color: remaining > 0 ? 'var(--orange)' : 'var(--green)', fontWeight: 600 }}>{remaining}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Manual (no-PI) dispatch variant: freely pick products + pieces, no "pending" concept.
export function ManualLinesStep({ dispatchLines, products, onLineChange, onAddLine, onRemoveLine }) {
  return (
    <div className="card">
      <div className="tblwrap" style={{ marginTop: 10 }}>
        <table className="dt">
          <thead><tr><th></th><th>Product</th><th>Pieces</th><th></th></tr></thead>
          <tbody>
            {dispatchLines.map((l, i) => (
              <tr key={i}>
                <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'cover' }} /> : ''}</td>
                <td>
                  <select value={l.code} onChange={(e) => onLineChange(i, 'code', e.target.value)}>
                    <option value="">— pick —</option>
                    {products.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
                  </select>
                </td>
                <td><input type="number" style={{ width: 90 }} value={l.dispatchNow} onChange={(e) => onLineChange(i, 'dispatchNow', +e.target.value)} /></td>
                <td><button className="btn o sm" onClick={() => onRemoveLine(i)}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btnrow"><button className="btn o sm" onClick={onAddLine}>+ Add item</button></div>
    </div>
  );
}

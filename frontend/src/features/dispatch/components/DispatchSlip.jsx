// The hidden-on-screen, print-only "what's left on this PI" slip. Rendered
// into #print-area so the shared print stylesheet (theme.css) picks it up
// when the user clicks "Print remaining/dispatch slip".
export default function DispatchSlip({ pi, dispatchLines, transporter }) {
  if (!pi) return null;
  return (
    <div id="print-area" className="pi print-only">
      <div className="head">
        <div className="l">
          <img src="/funhoods-logo.jpg" alt="Funhoods" style={{ height: 40, marginBottom: 4 }} />
          <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-d)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
            DISPATCH / REMAINING SLIP
          </div>
        </div>
        <div className="r">
          <div className="no">{pi.no}</div>
          <div>Date: {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
        </div>
      </div>
      <div className="bill">
        <div>
          <h6>Dealer</h6>
          <div><b>{pi.dealerName}</b></div>
        </div>
        <div>
          <h6>Summary</h6>
          <div>Total lines: <b>{dispatchLines.length}</b></div>
          <div>Transport: <b>{transporter || '—'}</b></div>
        </div>
      </div>
      <table className="lines">
        <thead><tr><th>#</th><th style={{ width: 34 }}></th><th>Item</th><th className="r">Pending</th><th className="r">Dispatching now</th><th className="r">Remaining</th></tr></thead>
        <tbody>
          {dispatchLines.map((l, i) => {
            const remaining = Math.max(0, (+l.orderedNow || 0) - (+l.dispatchNow || 0));
            return (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, background: 'var(--paper)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>}</td>
                <td><b>{l.name}</b><br /><span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                <td className="r">{l.orderedNow}</td>
                <td className="r"><b>{l.dispatchNow}</b></td>
                <td className="r"><b>{remaining}</b></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="terms">
        Keep this slip with the remaining/pending stock for {pi.no} — {pi.dealerName}. Remaining quantity still needs to be dispatched later.
      </div>
    </div>
  );
}

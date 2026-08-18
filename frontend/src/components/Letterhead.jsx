// Renders the same letterhead format used in PIPreview, but read-only —
// for viewing an already-saved PI or Invoice. kind: 'PI' | 'INVOICE'
export default function Letterhead({ kind, docNo, date, dealer, lines, subtotal, transport, freightTerm, total, remark, settings, extraHeaderRight, cartons }) {
  if (!settings || !dealer) return null;
  const s = settings;
  const isInvoice = kind === 'INVOICE';
  const totalPieces = lines.reduce((sum, l) => sum + l.pcs, 0);

  return (
    <div id="print-area" className="pi">
      <div className="head">
        <div className="l">
          <img src="/funhoods-logo.jpg" alt={s.company || 'Funhoods'} style={{ height: 40, marginBottom: 4 }} />
          <div>{s.address || '—'}</div>
          <div>Phone: {s.phone || '—'} · Email: {s.email || '—'}</div>
          <div><b>GSTIN: {s.gstin || '—'}</b></div>
          <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-d)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>
            {isInvoice ? 'TAX INVOICE' : 'PROFORMA INVOICE'}
          </div>
        </div>
        <div className="r">
          <div className="no">{docNo}</div>
          <div>Date: {new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}</div>
          {extraHeaderRight}
        </div>
      </div>

      <div className="bill">
        <div>
          <h6>Bill to</h6>
          <div><b>{dealer.name}</b></div>
          <div>{dealer.addr || '—'}</div>
          <div>{dealer.city} {dealer.state || ''} {dealer.pin || ''}</div>
          {dealer.gstin ? <div>GSTIN: <b>{dealer.gstin}</b></div> : <div style={{ color: 'var(--red)' }}>GSTIN not on file</div>}
          {dealer.mobile && <div>Contact: {dealer.contact} · {dealer.mobile}</div>}
        </div>
        <div>
          <h6>Order summary</h6>
          <div>Payment terms: <b>{dealer.payment}</b></div>
          <div>Total items: <b>{lines.length}</b></div>
          <div>Total pieces: <b>{totalPieces}</b></div>
          {isInvoice && <div>Cartons: <b>{cartons}</b></div>}
        </div>
      </div>

      <table className="lines">
        <thead><tr><th>#</th><th style={{ width: 34 }}></th><th>Item</th>{!isInvoice && <th className="r">Packing</th>}<th className="r">Qty</th><th className="r">Rate ₹</th><th className="r">GST %</th><th className="r">Tax</th><th className="r">Gross</th><th className="r">Total ₹</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{l.no || i + 1}</td>
              <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, background: 'var(--paper)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>}</td>
              <td><b>{l.name}</b><br /><span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
              {!isInvoice && <td className="r">{l.outers ? `${l.outers} outer` : ''}{l.inners ? `${l.inners} inner` : ''}</td>}
              <td className="r">{l.pcs}</td>
              <td className="r">{l.rate.toFixed(2)}</td>
              <td className="r">{l.gstPct}</td>
              <td className="r">{l.tax.toFixed(2)}</td>
              <td className="r">{l.gross.toFixed(2)}</td>
              <td className="r"><b>{l.total.toFixed(2)}</b></td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="totals">
        <div className="line"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
        {isInvoice && <div className="line"><span>Transport {freightTerm ? `(${freightTerm})` : ''}</span><span>₹{transport.toFixed(2)}</span></div>}
        <div className="line grand"><span>GRAND TOTAL</span><span>₹{total.toFixed(2)}</span></div>
      </div>

      {(s.bankName || s.bankAccount) && (
        <div className="note" style={{ marginTop: 14, background: 'var(--paper-d)', borderLeft: 'none' }}>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Bank details for payment</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
            <div>Bank: <b>{s.bankName || '—'}</b></div>
            <div>A/C No: <b>{s.bankAccount || '—'}</b></div>
            <div>IFSC: <b>{s.bankIFSC || '—'}</b></div>
            <div>Branch: <b>{s.bankBranch || '—'}</b></div>
            {s.upiId && <div>UPI: <b>{s.upiId}</b></div>}
          </div>
        </div>
      )}

      {remark && <div className="note y" style={{ fontSize: 12.5, marginTop: 10 }}><b>Remark:</b> {remark}</div>}

      <div className="terms">
        {isInvoice
          ? 'This is a TAX INVOICE for goods dispatched. Please verify GST rate with your CA.'
          : "This is a PROFORMA — Tax Invoice will be issued at time of dispatch based on actual quantity shipped. Please verify GST rate with your CA."}
      </div>
    </div>
  );
}

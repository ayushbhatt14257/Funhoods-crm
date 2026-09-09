import { useEffect, useState } from 'react';
import Modal from '../../../components/Modal';
import Loading from '../../../components/Loading';
import { productsApi } from '../api';

const today = new Date().toISOString().slice(0, 10);
const thisMonth = today.slice(0, 7);

// masterAdmin-only: click a product's "Dispatched (all-time)" figure to see
// exactly which parties got it and how many pieces — all-time by default,
// narrowable to one exact day or one calendar month, never both at once.
export default function DispatchBreakdownModal({ product, onClose }) {
  const [mode, setMode] = useState('all'); // 'all' | 'day' | 'month'
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(thisMonth);
  const [rows, setRows] = useState(null); // null = loading

  useEffect(() => {
    setRows(null);
    const params = mode === 'day' ? `date=${date}` : mode === 'month' ? `month=${month}` : '';
    productsApi.getDispatchBreakdown(product.code, params).then(setRows);
  }, [product.code, mode, date, month]);

  const total = rows ? rows.reduce((s, r) => s + r.total, 0) : 0;

  return (
    <Modal title={`Dispatched — ${product.name}`} onClose={onClose}>
      <div className="subtabs" style={{ marginBottom: 10 }}>
        <button className={mode === 'all' ? 'on' : ''} onClick={() => setMode('all')}>All time</button>
        <button className={mode === 'day' ? 'on' : ''} onClick={() => setMode('day')}>By day</button>
        <button className={mode === 'month' ? 'on' : ''} onClick={() => setMode('month')}>By month</button>
        {mode !== 'all' && <button className="btn o sm" onClick={() => setMode('all')}>Clear filter</button>}
      </div>

      {mode === 'day' && (
        <input type="date" value={date} max={today} onChange={(e) => setDate(e.target.value)} style={{ marginBottom: 10 }} />
      )}
      {mode === 'month' && (
        <input type="month" value={month} max={thisMonth} onChange={(e) => setMonth(e.target.value)} style={{ marginBottom: 10 }} />
      )}

      {rows === null ? (
        <Loading label="Loading dispatch breakdown…" />
      ) : rows.length ? (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
            {rows.length} customer(s) · <b>{total.toLocaleString('en-IN')}</b> pcs total
            {mode === 'day' && ` on ${new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`}
            {mode === 'month' && ` in ${new Date(`${month}-01`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}`}
          </div>
          <div className="tblwrap">
            <table className="dt">
              <thead><tr><th>Customer</th><th>Pieces</th><th>Invoices</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dealer}>
                    <td><b>{r.dealerName}</b> <span className="mono muted" style={{ fontSize: 10 }}>{r.dealer}</span></td>
                    <td><b>{r.total.toLocaleString('en-IN')}</b></td>
                    <td>{r.invoiceCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="empty">No dispatches {mode === 'all' ? 'yet' : 'in this period'}.</div>
      )}
    </Modal>
  );
}

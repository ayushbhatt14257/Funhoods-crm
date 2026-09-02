import { Link } from 'react-router-dom';
import { invoiceBadgeClass } from '../badges';

export default function InvoiceFlatList({ invoices }) {
  return (
    <div className="tblwrap">
      <table className="dt">
        <thead><tr><th>Invoice</th><th>Dealer</th><th>Assigned to</th><th>Cartons</th><th>Total ₹</th><th>Status</th><th>PI ref</th><th>Booked by</th><th>Date</th></tr></thead>
        <tbody>
          {invoices.map((i) => (
            <tr key={i.no}>
              <td><Link to={`/invoices/${i.no}`} className="mono"><b>{i.no}</b></Link></td>
              <td>{i.dealerName}</td>
              <td>{i.dealerAssignedTo || '—'}</td>
              <td>{i.cartons}</td>
              <td>{Math.round(i.total).toLocaleString('en-IN')}</td>
              <td><span className={`badge ${invoiceBadgeClass(i.status)}`}>{i.status}</span></td>
              <td>{i.manual ? <span className="badge y">Manual</span> : i.piRef}</td>
              <td>{i.by}</td>
              <td className="mono muted" style={{ fontSize: 11 }}>{new Date(i.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
            </tr>
          ))}
          {!invoices.length && <tr><td colSpan={9}><div className="empty">No invoices match</div></td></tr>}
        </tbody>
      </table>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getToken, API_URL } from '../api/client';
import { useToast } from '../context/ToastContext';

export default function InvoiceDetail() {
  const { no } = useParams();
  const { showToast } = useToast();
  const [inv, setInv] = useState(null);

  async function load() { setInv(await api.get(`/invoices/${no}`)); }
  useEffect(() => { load(); }, [no]);

  async function markDelivered() {
    try { await api.patch(`/invoices/${no}/delivered`); showToast('Marked delivered', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function downloadPackingList() {
    const res = await fetch(`${API_URL}/invoices/${no}/packing-list.xlsx`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return showToast('Export failed', 'err');
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Packing_List_${no}.xlsx`;
    a.click();
  }

  if (!inv) return null;

  return (
    <div>
      <div className="ph"><div className="eyebrow">Invoice</div><h2>{inv.no}</h2>
        <p>{inv.dealerName} · Via: <b>{inv.transporter || '—'}</b></p></div>
      <div style={{ marginBottom: 14 }}>
        Total pieces: <b>{inv.lines.reduce((s, l) => s + l.pcs, 0)}</b> · Cartons: <b>{inv.cartons}</b> ·
        Total ₹: <b>{Math.round(inv.total).toLocaleString('en-IN')}</b> · Status: <span className="badge">{inv.status}</span>
      </div>
      <h3 style={{ marginBottom: 10 }}>Packing list (carton-wise)</h3>
      {inv.packing.map((c) => (
        <div className="card" key={c.no} style={{ display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 10 }}>
          <div style={{ fontWeight: 700, textAlign: 'center' }}>#{c.no}</div>
          <div>
            {c.mixed && <div style={{ fontSize: 9.5, color: 'var(--orange)', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>Mixed carton</div>}
            {c.items.map((it, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                {it.photo ? <img src={it.photo} alt="" style={{ width: 22, height: 22, borderRadius: 3, objectFit: 'cover' }} /> : '📦'}
                <span>{it.name}</span><span className="mono muted" style={{ fontSize: 10 }}>{it.code}</span>
              </div>
            ))}
          </div>
          <div style={{ fontWeight: 700 }}>{c.items.reduce((s, it) => s + it.pcs, 0)} pcs</div>
        </div>
      ))}
      <div className="btnrow">
        <button className="btn o" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
        <button className="btn o" onClick={downloadPackingList}>📊 Export packing list (Excel)</button>
        {inv.status === 'Dispatched' && <button className="btn g" onClick={markDelivered}>Mark delivered</button>}
      </div>
    </div>
  );
}

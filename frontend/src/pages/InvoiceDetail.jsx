import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api, getToken, API_URL } from '../api/client';
import { useToast } from '../context/ToastContext';
import Letterhead from '../components/Letterhead';

export default function InvoiceDetail() {
  const { no } = useParams();
  const { showToast } = useToast();
  const [inv, setInv] = useState(null);
  const [dealer, setDealer] = useState(null);
  const [settings, setSettings] = useState(null);

  async function load() {
    const data = await api.get(`/invoices/${no}`);
    setInv(data);
    const [d, s] = await Promise.all([api.get(`/dealers/${data.dealer}`), api.get('/settings')]);
    setDealer(d);
    setSettings(s);
  }
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

  if (!inv || !dealer || !settings) return null;

  return (
    <div>
      <div className="ph"><div className="eyebrow">Invoice</div><h2>{inv.no}</h2>
        <p>{inv.dealerName} · Via: <b>{inv.transporter || '—'}</b> · <span className="badge">{inv.status}</span></p></div>

      <Letterhead
        kind="INVOICE"
        docNo={inv.no}
        date={inv.date || inv.dispatchDate || inv.createdAt}
        dealer={dealer}
        lines={inv.lines}
        subtotal={inv.subtotal}
        transport={inv.transport || inv.freight || 0}
        freightTerm={inv.freightTerm}
        total={inv.total}
        cartons={inv.cartons}
        settings={settings}
        extraHeaderRight={inv.piRef ? <div>Against PI: <b>{inv.piRef}</b></div> : <div style={{ color: 'var(--orange)' }}>Manual dispatch (no PI)</div>}
      />

      <div className="btnrow" style={{ marginTop: 14 }}>
        <button className="btn o" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
        {inv.status === 'Dispatched' && <button className="btn g" onClick={markDelivered}>Mark delivered</button>}
      </div>

      <h3 style={{ margin: '20px 0 10px' }}>Packing list (carton-wise)</h3>
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
        <button className="btn o" onClick={downloadPackingList}>📊 Export packing list (Excel)</button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

export default function Inventory() {
  const { showToast } = useToast();
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState('');
  const [editingCode, setEditingCode] = useState(null);
  const [val, setVal] = useState('');

  async function load() { setRows(await api.get('/inventory')); }
  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.code.toLowerCase().includes(q.toLowerCase()));

  async function save(code) {
    try { await api.patch(`/inventory/${code}`, { physical: +val }); showToast('Stock updated', 'g'); setEditingCode(null); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Physical stock</div><h2>Inventory</h2>
        <p>Physical, reserved (against confirmed PIs), and free-to-sell — always computed live.</p></div>
      <input placeholder="Search product" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280, marginBottom: 14 }} />
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>Code</th><th>Product</th><th>Physical</th><th>Reserved</th><th>Free to sell</th><th>Value ₹</th><th></th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.code}>
                <td className="mono">{r.code}</td><td>{r.name}</td>
                <td>{editingCode === r.code ? <input type="number" style={{ width: 90 }} value={val} onChange={(e) => setVal(e.target.value)} /> : r.physical}</td>
                <td>{r.reserved}</td>
                <td style={{ color: r.free <= 0 ? 'var(--red)' : 'var(--green)', fontWeight: 600 }}>{r.free}</td>
                <td>{Math.round(r.value).toLocaleString('en-IN')}</td>
                <td>
                  {editingCode === r.code
                    ? <button className="btn sm" onClick={() => save(r.code)}>Save</button>
                    : <button className="btn o sm" onClick={() => { setEditingCode(r.code); setVal(r.physical); }}>Adjust</button>}
                </td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7}><div className="empty">No stock records yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

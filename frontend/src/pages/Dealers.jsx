import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const emptyForm = { code: '', name: '', contact: '', mobile: '', addr: '', city: '', state: '', pin: '', gstin: '', type: 'Retailer', payment: 'Advance', creditLimit: 0, slab: 'C' };

export default function Dealers() {
  const { showToast } = useToast();
  const [dealers, setDealers] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [isNew, setIsNew] = useState(false);

  async function load() {
    const data = await api.get(`/dealers${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setDealers(data);
  }
  useEffect(() => { load(); }, [q]);

  function openEdit(d) { setEditing(d); setIsNew(false); setForm({ ...emptyForm, ...d }); }
  function openNew() { setEditing({}); setIsNew(true); setForm(emptyForm); }

  async function save() {
    try {
      if (isNew) { await api.post('/dealers', form); showToast('Dealer added', 'g'); }
      else { await api.put(`/dealers/${editing.code}`, form); showToast('Dealer updated', 'g'); }
      setEditing(null); load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function remove(code) {
    if (!confirm('Delete this dealer?')) return;
    try { await api.del(`/dealers/${code}`); showToast('Dealer deleted', 'g'); setEditing(null); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Your customers</div><h2>Dealers</h2></div>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <input placeholder="Search dealer or city" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn" onClick={openNew}>+ New dealer</button>
      </div>
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>Code</th><th>Name</th><th>City</th><th>Payment</th><th>Type</th><th></th></tr></thead>
          <tbody>
            {dealers.map((d) => (
              <tr key={d.code}>
                <td className="mono">{d.code}</td><td>{d.name}</td><td>{d.city}</td>
                <td><span className="badge">{d.payment}</span></td><td>{d.type}</td>
                <td><button className="btn o sm" onClick={() => openEdit(d)}>Edit</button></td>
              </tr>
            ))}
            {!dealers.length && <tr><td colSpan={6}><div className="empty">No dealers yet</div></td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={isNew ? 'New dealer' : editing.name} onClose={() => setEditing(null)}>
          <div className="row2">
            <div className="fg"><label>Business name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="fg"><label>Party code {isNew ? '(auto if blank)' : '(locked)'}</label><input value={form.code} disabled={!isNew} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="fg"><label>Contact person</label><input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} /></div>
            <div className="fg"><label>Mobile</label><input value={form.mobile} onChange={(e) => setForm({ ...form, mobile: e.target.value })} /></div>
          </div>
          <div className="row3">
            <div className="fg"><label>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
            <div className="fg"><label>State</label><input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></div>
            <div className="fg"><label>Pin</label><input value={form.pin} onChange={(e) => setForm({ ...form, pin: e.target.value })} /></div>
          </div>
          <div className="fg"><label>Address</label><textarea value={form.addr} onChange={(e) => setForm({ ...form, addr: e.target.value })} /></div>
          <div className="row3">
            <div className="fg"><label>GSTIN</label><input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></div>
            <div className="fg"><label>Type</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>Retailer</option><option>Wholesaler</option><option>Distributor</option><option>Retail+Wholesale</option>
              </select>
            </div>
            <div className="fg"><label>Slab</label>
              <select value={form.slab} onChange={(e) => setForm({ ...form, slab: e.target.value })}>
                <option>A</option><option>B</option><option>C</option>
              </select>
            </div>
          </div>
          <div className="row2">
            <div className="fg"><label>Payment</label>
              <select value={form.payment} onChange={(e) => setForm({ ...form, payment: e.target.value })}>
                <option>Advance</option><option>Credit-15d</option><option>Credit-30d</option>
              </select>
            </div>
            <div className="fg"><label>Credit limit ₹</label><input type="number" value={form.creditLimit} onChange={(e) => setForm({ ...form, creditLimit: e.target.value })} /></div>
          </div>
          <div className="btnrow">
            <button className="btn" onClick={save}>Save</button>
            <button className="btn o" onClick={() => setEditing(null)}>Cancel</button>
            {!isNew && <button className="btn rd" style={{ marginLeft: 'auto' }} onClick={() => remove(editing.code)}>Delete</button>}
          </div>
        </Modal>
      )}
    </div>
  );
}

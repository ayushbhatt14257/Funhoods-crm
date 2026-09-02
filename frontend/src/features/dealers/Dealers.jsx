import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { dealersApi } from './api';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import NewDealerModal from './components/NewDealerModal';
import Loading from '../../components/Loading';

const emptyForm = { code: '', name: '', contact: '', mobile: '', addr: '', city: '', state: '', pin: '', gstin: '', type: 'Retailer', payment: 'Advance', creditLimit: 0, slab: 'C', assignedTo: '' };

export default function Dealers() {
  const { showToast } = useToast();
  const [dealers, setDealers] = useState(null); // null = loading
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [showNewDealer, setShowNewDealer] = useState(false);
  const [users, setUsers] = useState([]);

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);

  async function load() {
    setDealers(null);
    const data = await dealersApi.list(q);
    setDealers(data);
  }
  useEffect(() => { load(); }, [q]);

  function openEdit(d) { setEditing(d); setForm({ ...emptyForm, ...d }); }

  async function save() {
    try {
      await dealersApi.update(editing.code, form);
      showToast('Dealer updated', 'g');
      setEditing(null); load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function remove(code) {
    if (!confirm('Delete this dealer?')) return;
    try { await dealersApi.remove(code); showToast('Dealer deleted', 'g'); setEditing(null); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function uploadDoc(field, file) {
    if (!file || !editing) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const updated = await dealersApi.uploadDoc(editing.code, field, fd);
      showToast('Document uploaded', 'g');
      setEditing(updated);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Your customers</div><h2>Dealers</h2></div>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <input placeholder="Search dealer or city" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn" onClick={() => setShowNewDealer(true)}>+ New dealer</button>
      </div>
      {dealers === null ? (
        <Loading label="Loading dealers…" />
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Code</th><th>Name</th><th>City</th><th>Payment</th><th>Type</th><th>Assigned to</th><th>Docs</th><th>Created by</th><th>Date</th><th></th></tr></thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.code}>
                  <td className="mono">{d.code}</td>
                  <td><Link to={`/dealers/${d.code}`}><b>{d.name}</b></Link></td>
                  <td>{d.city}</td>
                  <td><span className="badge">{d.payment}</span></td><td>{d.type}</td>
                  <td>{d.assignedTo || '—'}</td>
                  <td>
                    {d.gstCertUrl ? <span className="badge g" style={{ marginRight: 4 }}>GST ✓</span> : <span className="badge r" style={{ marginRight: 4 }}>GST ✕</span>}
                    {d.aadharUrl ? <span className="badge g">Aadhaar ✓</span> : <span className="badge">Aadhaar —</span>}
                  </td>
                  <td>{d.createdByName || '—'}</td>
                  <td className="mono muted" style={{ fontSize: 11 }}>{new Date(d.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}</td>
                  <td><button className="btn o sm" onClick={() => openEdit(d)}>Edit</button></td>
                </tr>
              ))}
              {!dealers.length && <tr><td colSpan={10}><div className="empty">No dealers yet</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {showNewDealer && (
        <NewDealerModal onClose={() => setShowNewDealer(false)} onCreated={() => { setShowNewDealer(false); load(); }} />
      )}

      {editing && (
        <Modal title={editing.name} onClose={() => setEditing(null)}>
          <div className="row2">
            <div className="fg"><label>Business name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="fg"><label>Party code (locked)</label><input value={form.code} disabled /></div>
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

          <div className="fg">
            <label>Assigned salesperson (this party belongs to)</label>
            <select value={form.assignedTo || ''} onChange={(e) => setForm({ ...form, assignedTo: e.target.value })}>
              <option value="">— Unassigned —</option>
              {users.map((u) => <option key={u._id} value={u.name}>{u.name} ({u.role})</option>)}
            </select>
          </div>

          <div className="row2">
            <div className="fg">
              <label>GST certificate {editing.gstCertUrl ? '(replace)' : '(missing)'}</label>
              {editing.gstCertUrl && <a href={editing.gstCertUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>View current file</a>}
              <input type="file" accept=".pdf,image/*" onChange={(e) => uploadDoc('gst-cert', e.target.files[0])} />
            </div>
            <div className="fg">
              <label>Aadhaar card {editing.aadharUrl ? '(replace)' : '(optional — not on file)'}</label>
              {editing.aadharUrl && <a href={editing.aadharUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>View current file</a>}
              <input type="file" accept=".pdf,image/*" onChange={(e) => uploadDoc('aadhar', e.target.files[0])} />
            </div>
          </div>

          <div className="btnrow">
            <button className="btn" onClick={save}>Save</button>
            <button className="btn o" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn rd" style={{ marginLeft: 'auto' }} onClick={() => remove(editing.code)}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

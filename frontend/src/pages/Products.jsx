import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import Modal from '../components/Modal';

const emptyForm = { code: '', name: '', size: '', category: '', cartonOuter: '', cartonInner: '', rate: '', gst_pct: 5 };

export default function Products() {
  const { showToast } = useToast();
  const [products, setProducts] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // product object or null
  const [form, setForm] = useState(emptyForm);
  const [isNew, setIsNew] = useState(false);

  async function load() {
    const data = await api.get(`/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
    setProducts(data);
  }
  useEffect(() => { load(); }, [q]);

  function openEdit(p) {
    setEditing(p);
    setIsNew(false);
    setForm({ code: p.code, name: p.name, size: p.size, category: p.category, cartonOuter: p.cartonOuter, cartonInner: p.cartonInner, rate: p.rate, gst_pct: p.gst_pct });
  }
  function openNew() {
    setEditing({});
    setIsNew(true);
    setForm(emptyForm);
  }

  async function save() {
    try {
      const body = { ...form, cartonOuter: +form.cartonOuter, cartonInner: +form.cartonInner || undefined, rate: +form.rate, gst_pct: +form.gst_pct };
      if (isNew) {
        await api.post('/products', body);
        showToast('Product created', 'g');
      } else {
        await api.put(`/products/${editing.code}`, body);
        showToast('Product updated', 'g');
      }
      setEditing(null);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function remove(code) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await api.del(`/products/${code}`);
      showToast('Product deleted', 'g');
      setEditing(null);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function uploadPhoto(code, file) {
    const fd = new FormData();
    fd.append('photo', file);
    try {
      const updated = await api.putForm(`/products/${code}/photo`, fd);
      showToast('Photo uploaded', 'g');
      setEditing(updated);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">Everything you sell</div>
        <h2>Products</h2>
        <p>Cartons and inner cartons (half the outer) both settable.</p>
      </div>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <input placeholder="Search product name or code" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn" onClick={openNew}>+ New product</button>
      </div>
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th></th><th>Code</th><th>Name</th><th>Size</th><th>Rate ₹</th><th>GST%</th><th>Carton (O/I)</th><th></th></tr></thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.code}>
                <td>{p.photo ? <img src={p.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                <td className="mono">{p.code}</td>
                <td>{p.name}</td>
                <td>{p.size}</td>
                <td>{p.rate}</td>
                <td>{p.gst_pct}</td>
                <td>{p.cartonOuter}/{p.cartonInner}</td>
                <td><button className="btn o sm" onClick={() => openEdit(p)}>Edit</button></td>
              </tr>
            ))}
            {!products.length && <tr><td colSpan={8}><div className="empty">No products yet</div></td></tr>}
          </tbody>
        </table>
      </div>

      {editing && (
        <Modal title={isNew ? 'New product' : editing.name} onClose={() => setEditing(null)}>
          {!isNew && (
            <div className="fg">
              <label>Photo</label>
              {editing.photo && <img src={editing.photo} alt="" style={{ width: 80, height: 80, borderRadius: 8, objectFit: 'cover', marginBottom: 8 }} />}
              <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadPhoto(editing.code, e.target.files[0])} />
            </div>
          )}
          <div className="row2">
            <div className="fg"><label>Code {isNew ? '*' : '(locked)'}</label>
              <input value={form.code} disabled={!isNew} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="fg"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="row3">
            <div className="fg"><label>Size</label><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
            <div className="fg"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
            <div className="fg"><label>GST %</label>
              <select value={form.gst_pct} onChange={(e) => setForm({ ...form, gst_pct: e.target.value })}>
                <option value={5}>5</option><option value={12}>12</option><option value={18}>18</option>
              </select>
            </div>
          </div>
          <div className="row3">
            <div className="fg"><label>Rate ₹/pc</label><input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
            <div className="fg"><label>Outer carton pcs</label><input type="number" value={form.cartonOuter} onChange={(e) => setForm({ ...form, cartonOuter: e.target.value, cartonInner: Math.round(e.target.value / 2) })} /></div>
            <div className="fg"><label>Inner carton pcs</label><input type="number" value={form.cartonInner} onChange={(e) => setForm({ ...form, cartonInner: e.target.value })} /></div>
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

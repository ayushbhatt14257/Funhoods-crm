import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import Loading from '../../components/Loading';
import { productsApi } from './api';
import ProductMediaGallery from './components/ProductMediaGallery';

export default function ProductDetail() {
  const { code } = useParams();
  const nav = useNavigate();
  const { showToast } = useToast();
  const [product, setProduct] = useState(null); // null = loading
  const [form, setForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);

  async function load() {
    const p = await productsApi.getByCode(code);
    setProduct(p);
    setForm({ name: p.name, size: p.size, category: p.category, cartonOuter: p.cartonOuter, cartonInner: p.cartonInner, rate: p.rate, gst_pct: p.gst_pct });
  }
  useEffect(() => { load(); }, [code]);

  async function saveInfo() {
    setSavingInfo(true);
    try {
      const updated = await productsApi.update(code, {
        ...form, cartonOuter: +form.cartonOuter, cartonInner: +form.cartonInner, rate: +form.rate, gst_pct: +form.gst_pct,
      });
      setProduct(updated);
      showToast('Details saved', 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSavingInfo(false); }
  }

  async function deleteProduct() {
    if (!confirm(`Delete ${product.name}? This removes all its photos/video from Cloudinary too — cannot be undone.`)) return;
    try {
      await productsApi.remove(code);
      showToast('Product deleted', 'g');
      nav('/products');
    } catch (err) { showToast(err.message, 'err'); }
  }

  if (!product || !form) return <Loading label="Loading product…" />;

  return (
    <div>
      <div className="ph">
        <div className="eyebrow"><Link to="/products">← Products</Link></div>
        <h2>{product.name}</h2>
        <p className="mono muted">{product.code}</p>
      </div>

      <ProductMediaGallery product={product} onChange={setProduct} />

      {/* Basic details */}
      <div className="card">
        <h3 style={{ marginBottom: 10 }}>Details</h3>
        <div className="row2">
          <div className="fg"><label>Name</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div className="fg"><label>Size</label><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
        </div>
        <div className="row3">
          <div className="fg"><label>Category</label><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div className="fg"><label>GST %</label>
            <select value={form.gst_pct} onChange={(e) => setForm({ ...form, gst_pct: e.target.value })}>
              <option value={5}>5</option><option value={12}>12</option><option value={18}>18</option>
            </select>
          </div>
          <div className="fg"><label>Rate ₹/pc</label><input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></div>
        </div>
        <div className="row2">
          <div className="fg"><label>Outer carton pcs</label><input type="number" value={form.cartonOuter} onChange={(e) => setForm({ ...form, cartonOuter: e.target.value })} /></div>
          <div className="fg"><label>Inner carton pcs</label><input type="number" value={form.cartonInner} onChange={(e) => setForm({ ...form, cartonInner: e.target.value })} /></div>
        </div>
        <div className="btnrow">
          <button className="btn" disabled={savingInfo} onClick={saveInfo}>{savingInfo ? 'Saving…' : 'Save details'}</button>
          <button className="btn rd" style={{ marginLeft: 'auto' }} onClick={deleteProduct}>Delete product</button>
        </div>
      </div>
    </div>
  );
}

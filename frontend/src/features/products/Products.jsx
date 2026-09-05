import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';
import Loading from '../../components/Loading';
import { productsApi } from './api';
import { categoriesApi } from './categoriesApi';
import CategoryManagerModal from './components/CategoryManagerModal';

const emptyForm = { code: '', name: '', size: '', category: '', cartonOuter: '', cartonInner: '', rate: '', gst_pct: 5 };

export default function Products() {
  const { showToast } = useToast();
  const [products, setProducts] = useState(null); // null = loading
  const [categories, setCategories] = useState([]);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null); // product object or null — quick basic-field edit only
  const [form, setForm] = useState(emptyForm);
  const [isNew, setIsNew] = useState(false);
  const [managingCategories, setManagingCategories] = useState(false);

  async function load() { setProducts(await productsApi.list(q)); }
  async function loadCategories() { setCategories(await categoriesApi.list()); }
  useEffect(() => { load(); }, [q]);
  useEffect(() => { loadCategories(); }, []);

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
        await productsApi.create(body);
        showToast('Product created — add photos/video from its page', 'g');
      } else {
        await productsApi.update(editing.code, body);
        showToast('Product updated', 'g');
      }
      setEditing(null);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function remove(code) {
    if (!confirm('Delete this product? This cannot be undone.')) return;
    try {
      await productsApi.remove(code);
      showToast('Product deleted', 'g');
      setEditing(null);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function setFeatured(publicId) {
    try {
      const updated = await productsApi.setFeaturedImage(editing.code, publicId);
      setEditing(updated);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">Everything you sell</div>
        <h2>Products</h2>
        <p>Click a product to manage its photo gallery, video, and full details.</p>
      </div>
      <div className="btnrow" style={{ marginBottom: 14 }}>
        <input placeholder="Search product name or code" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 280 }} />
        <button className="btn" onClick={openNew}>+ New product</button>
      </div>
      {products === null ? (
        <Loading label="Loading products…" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(210px,1fr))', gap: 14 }}>
          {products.map((p) => (
          <div key={p.code} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <Link to={`/products/${p.code}`} style={{ display: 'block', position: 'relative' }}>
              <div style={{ aspectRatio: '1', background: p.photo ? `url(${p.photo}) center/cover` : 'var(--paper-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44 }}>
                {!p.photo && '📦'}
              </div>
              {p.images?.length > 1 && (
                <span className="badge" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none' }}>🖼 {p.images.length}</span>
              )}
              {p.video?.url && (
                <span className="badge" style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(0,0,0,.6)', color: '#fff', border: 'none' }}>▶ video</span>
              )}
            </Link>
            <div style={{ padding: 12 }}>
              <div className="mono muted" style={{ fontSize: 10.5 }}>{p.code}{p.size ? ` · ${p.size}` : ''}</div>
              <Link to={`/products/${p.code}`} style={{ fontWeight: 600, fontSize: 14.5, margin: '2px 0 6px', display: 'block', color: 'inherit' }}>{p.name}</Link>
              <div style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between' }}>
                <span>₹{p.rate}</span><span>GST {p.gst_pct}%</span>
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>Carton: {p.cartonOuter} outer / {p.cartonInner} inner</div>
              {p.category && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.category}</div>}
              <div className="btnrow" style={{ marginTop: 9 }}>
                <Link to={`/products/${p.code}`} className="btn sm" style={{ flex: 1, textAlign: 'center' }}>View / Gallery</Link>
                <button className="btn o sm" onClick={() => openEdit(p)}>Quick edit</button>
              </div>
            </div>
          </div>
          ))}
          {!products.length && <div className="empty" style={{ gridColumn: '1/-1' }}>No products yet</div>}
        </div>
      )}

      {editing && (
        <Modal title={isNew ? 'New product' : `Quick edit — ${editing.name}`} onClose={() => setEditing(null)}>
          <div className="row2">
            <div className="fg"><label>Code {isNew ? '*' : '(locked)'}</label>
              <input value={form.code} disabled={!isNew} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="fg"><label>Name *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          </div>
          <div className="row3">
            <div className="fg"><label>Size</label><input value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} /></div>
            <div className="fg"><label>Category</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                <option value="">— none —</option>
                {categories.map((c) => <option key={c._id} value={c.name}>{c.name}</option>)}
              </select>
              <button type="button" className="btn o sm" style={{ marginTop: 4, fontSize: 10.5 }} onClick={() => setManagingCategories(true)}>Manage categories</button>
            </div>
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
          {!isNew && (editing.images?.length > 0 ? (
            <div className="fg">
              <label>Cover image {editing.images.length > 1 ? '— click to change' : ''}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {editing.images.map((im) => {
                  const isFeatured = editing.featuredImage?.publicId === im.publicId;
                  return (
                    <button
                      key={im.publicId}
                      type="button"
                      onClick={() => setFeatured(im.publicId)}
                      title={isFeatured ? 'Current cover image' : 'Set as cover image'}
                      style={{ padding: 0, border: isFeatured ? '2px solid var(--spruce)' : '1px solid var(--line)', borderRadius: 6, cursor: 'pointer', position: 'relative', width: 52, height: 52, overflow: 'hidden', background: 'none' }}
                    >
                      <img src={im.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      {isFeatured && <span style={{ position: 'absolute', top: 1, right: 1, fontSize: 10, background: 'var(--spruce)', color: '#fff', borderRadius: 3, padding: '0 2px' }}>★</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : editing.photo ? (
            <div className="fg">
              <label>Current photo</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <img src={editing.photo} alt="" style={{ width: 52, height: 52, borderRadius: 6, objectFit: 'cover', border: '1px solid var(--line)' }} />
                <span className="muted" style={{ fontSize: 11.5 }}>Uploaded before the gallery feature — open "View / Gallery" to add more photos or replace it.</span>
              </div>
            </div>
          ) : (
            <div className="note b" style={{ fontSize: 12 }}>No photos uploaded yet — add some from "View / Gallery" to set a cover image.</div>
          ))}
          <div className="btnrow">
            <button className="btn" onClick={save}>Save</button>
            <button className="btn o" onClick={() => setEditing(null)}>Cancel</button>
            {!isNew && <button className="btn rd" style={{ marginLeft: 'auto' }} onClick={() => remove(editing.code)}>Delete</button>}
          </div>
        </Modal>
      )}

      {managingCategories && (
        <CategoryManagerModal
          categories={categories}
          onChange={loadCategories}
          onClose={() => setManagingCategories(false)}
        />
      )}
    </div>
  );
}

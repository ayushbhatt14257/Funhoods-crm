import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useToast } from '../../context/ToastContext';
import Loading from '../../components/Loading';
import { productsApi } from './api';

export default function ProductDetail() {
  const { code } = useParams();
  const nav = useNavigate();
  const { showToast } = useToast();
  const [product, setProduct] = useState(null); // null = loading
  const [form, setForm] = useState(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const imageInputRef = useRef();
  const videoInputRef = useRef();

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

  async function onPickImages(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const fd = new FormData();
    files.forEach((f) => fd.append('images', f));
    setUploadingImages(true);
    try {
      const updated = await productsApi.uploadImages(code, fd);
      setProduct(updated);
      showToast(`${files.length} image(s) added`, 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setUploadingImages(false); if (imageInputRef.current) imageInputRef.current.value = ''; }
  }

  async function removeImage(publicId) {
    if (!confirm('Remove this image? It will also be deleted from Cloudinary — this cannot be undone.')) return;
    try {
      const updated = await productsApi.removeImage(code, publicId);
      setProduct(updated);
      showToast('Image removed', 'g');
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function setFeatured(publicId) {
    try {
      const updated = await productsApi.setFeaturedImage(code, publicId);
      setProduct(updated);
      showToast('Featured image updated', 'g');
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function onPickVideo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('video', file);
    setUploadingVideo(true);
    try {
      const updated = await productsApi.uploadVideo(code, fd);
      setProduct(updated);
      showToast('Video uploaded', 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setUploadingVideo(false); if (videoInputRef.current) videoInputRef.current.value = ''; }
  }

  async function removeVideo() {
    if (!confirm('Remove this video? It will also be deleted from Cloudinary — this cannot be undone.')) return;
    try {
      const updated = await productsApi.removeVideo(code);
      setProduct(updated);
      showToast('Video removed', 'g');
    } catch (err) { showToast(err.message, 'err'); }
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

      {/* Gallery */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Photo gallery</h3>
          <button className="btn sm" disabled={uploadingImages} onClick={() => imageInputRef.current?.click()}>
            {uploadingImages ? 'Uploading…' : '+ Add photos'}
          </button>
          <input ref={imageInputRef} type="file" accept="image/*" multiple hidden onChange={onPickImages} />
        </div>
        {product.images?.length ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 12 }}>
            {product.images.map((im) => {
              const isFeatured = product.featuredImage?.publicId === im.publicId;
              return (
                <div key={im.publicId} style={{ position: 'relative', border: isFeatured ? '2px solid var(--spruce)' : '1px solid var(--line)', borderRadius: 8, overflow: 'hidden' }}>
                  <img src={im.url} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', display: 'block' }} />
                  {isFeatured && <span className="badge g" style={{ position: 'absolute', top: 6, left: 6 }}>★ Featured</span>}
                  <div style={{ display: 'flex', gap: 4, padding: 6, background: 'var(--white)' }}>
                    {!isFeatured && <button className="btn o sm" style={{ flex: 1, fontSize: 10.5 }} onClick={() => setFeatured(im.publicId)}>★ Set featured</button>}
                    <button className="btn o sm" style={{ fontSize: 10.5 }} onClick={() => removeImage(im.publicId)}>🗑</button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty">No photos yet — add some so it shows on PIs, dispatch, and invoices.</div>
        )}
      </div>

      {/* Video */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Product video</h3>
          <button className="btn sm" disabled={uploadingVideo} onClick={() => videoInputRef.current?.click()}>
            {uploadingVideo ? 'Uploading…' : product.video?.url ? 'Replace video' : '+ Add video'}
          </button>
          <input ref={videoInputRef} type="file" accept="video/*" hidden onChange={onPickVideo} />
        </div>
        {product.video?.url ? (
          <div>
            <video src={product.video.url} controls style={{ width: '100%', maxWidth: 480, borderRadius: 8, display: 'block', marginBottom: 8 }} />
            <button className="btn o sm" onClick={removeVideo}>🗑 Remove video</button>
          </div>
        ) : (
          <div className="empty">No video yet</div>
        )}
      </div>

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

import { useRef, useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { productsApi } from '../api';

const MAX_IMAGES = 5;

// One "+ Add media" button takes a mixed selection of photos and a video in
// a single picker (up to 5 photos + 1 video total), and renders like a
// product page on a shopping site: one big preview with a thumbnail strip
// underneath to switch between slides, video included as just another slide.
export default function ProductMediaGallery({ product, onChange }) {
  const { showToast } = useToast();
  const [uploading, setUploading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef();

  const images = product.images || [];
  const video = product.video?.url ? product.video : null;
  const slides = [...images.map((im) => ({ kind: 'image', ...im })), ...(video ? [{ kind: 'video', ...video }] : [])];
  const active = slides[Math.min(activeIndex, slides.length - 1)];

  async function onPickMedia(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const imageFiles = files.filter((f) => f.type.startsWith('image/'));
    const videoFiles = files.filter((f) => f.type.startsWith('video/'));

    const roomLeft = MAX_IMAGES - images.length;
    const imagesToUpload = imageFiles.slice(0, roomLeft);
    if (imageFiles.length > imagesToUpload.length) {
      showToast(`Only ${MAX_IMAGES} photos allowed per product — uploading ${imagesToUpload.length}, skipped the rest`, 'err');
    }
    if (videoFiles.length > 1) showToast('Only one video allowed — using the first one picked', 'err');
    const videoToUpload = videoFiles[0];

    if (!imagesToUpload.length && !videoToUpload) {
      if (inputRef.current) inputRef.current.value = '';
      return;
    }

    setUploading(true);
    try {
      let updated = product;
      if (imagesToUpload.length) {
        const fd = new FormData();
        imagesToUpload.forEach((f) => fd.append('images', f));
        updated = await productsApi.uploadImages(product.code, fd);
      }
      if (videoToUpload) {
        const fd = new FormData();
        fd.append('video', videoToUpload);
        updated = await productsApi.uploadVideo(product.code, fd);
      }
      onChange(updated);
      showToast('Media added', 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setUploading(false); if (inputRef.current) inputRef.current.value = ''; }
  }

  async function setFeatured(publicId) {
    try { onChange(await productsApi.setFeaturedImage(product.code, publicId)); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function removeActive() {
    if (!active) return;
    const label = active.kind === 'video' ? 'this video' : 'this photo';
    if (!confirm(`Remove ${label}? It will also be deleted from Cloudinary — this cannot be undone.`)) return;
    try {
      const updated = active.kind === 'video'
        ? await productsApi.removeVideo(product.code)
        : await productsApi.removeImage(product.code, active.publicId);
      onChange(updated);
      setActiveIndex(0);
    } catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Media</h3>
        <button className="btn sm" disabled={uploading || images.length >= MAX_IMAGES && video} onClick={() => inputRef.current?.click()}>
          {uploading ? 'Uploading…' : '+ Add photos / video'}
        </button>
        <input ref={inputRef} type="file" accept="image/*,video/*" multiple hidden onChange={onPickMedia} />
      </div>
      <div className="muted" style={{ fontSize: 11.5, marginBottom: 10 }}>Up to {MAX_IMAGES} photos + 1 video. {images.length}/{MAX_IMAGES} photos{video ? ' · 1 video' : ''} added.</div>

      {slides.length ? (
        <div>
          {/* Big preview */}
          <div style={{ position: 'relative', width: '100%', maxWidth: 460, aspectRatio: '1', background: 'var(--paper)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
            {active.kind === 'image' ? (
              <img src={active.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <video src={active.url} controls style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#000' }} />
            )}
            {active.kind === 'image' && product.featuredImage?.publicId === active.publicId && (
              <span className="badge g" style={{ position: 'absolute', top: 8, left: 8 }}>★ Cover image</span>
            )}
            <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
              {active.kind === 'image' && product.featuredImage?.publicId !== active.publicId && (
                <button className="btn sm" style={{ fontSize: 11 }} onClick={() => setFeatured(active.publicId)}>★ Set as cover</button>
              )}
              <button className="btn o sm" style={{ fontSize: 11, background: 'var(--white)' }} onClick={removeActive}>🗑 Remove</button>
            </div>
          </div>

          {/* Thumbnail strip */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {slides.map((s, i) => {
              const isActive = i === activeIndex;
              const isFeatured = s.kind === 'image' && product.featuredImage?.publicId === s.publicId;
              return (
                <button
                  key={s.publicId}
                  type="button"
                  onClick={() => setActiveIndex(i)}
                  style={{
                    width: 56, height: 56, padding: 0, borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                    border: isActive ? '2px solid var(--spruce)' : '1px solid var(--line)',
                    position: 'relative', background: '#000',
                  }}
                >
                  {s.kind === 'image'
                    ? <img src={s.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 18 }}>▶</div>}
                  {isFeatured && <span style={{ position: 'absolute', bottom: 1, right: 1, fontSize: 9, background: 'var(--spruce)', color: '#fff', borderRadius: 3, padding: '0 2px' }}>★</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : product.photo ? (
        <div>
          <div style={{ width: '100%', maxWidth: 460, aspectRatio: '1', background: 'var(--paper)', borderRadius: 10, overflow: 'hidden', marginBottom: 10 }}>
            <img src={product.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div className="note b" style={{ fontSize: 12 }}>This photo was uploaded before the gallery feature existed, so it isn't in the gallery below yet. Add photos above to build a proper gallery — the first one you add becomes the new cover automatically.</div>
        </div>
      ) : (
        <div className="empty">No photos or video yet — add some so it shows on PIs, dispatch, and invoices.</div>
      )}
    </div>
  );
}

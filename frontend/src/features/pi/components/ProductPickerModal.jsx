import { useState } from 'react';
import Modal from '../../../components/Modal';

export default function ProductPickerModal({ products, onPick, onClose }) {
  const [q, setQ] = useState('');
  const filtered = products.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()) || p.code.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal title="Pick product" onClose={onClose}>
      <input placeholder="Search code or name" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 11 }} autoFocus />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10, maxHeight: 420, overflowY: 'auto' }}>
        {filtered.length ? filtered.map((p) => (
          <div
            key={p.code}
            style={{ border: '1px solid var(--line)', borderRadius: 8, padding: 10, cursor: 'pointer', background: 'var(--white)' }}
            onClick={() => onPick(p)}
          >
            <div style={{ aspectRatio: '1', borderRadius: 6, background: p.photo ? `url(${p.photo}) center/cover` : 'var(--paper-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, marginBottom: 6 }}>
              {!p.photo && '📦'}
            </div>
            <div className="mono muted" style={{ fontSize: 10 }}>{p.code}</div>
            <div style={{ fontWeight: 600, fontSize: 13 }}>{p.name}</div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>₹{p.rate.toFixed(2)} · GST {p.gst_pct || 5}%</div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Outer {p.cartonOuter} · Inner {p.cartonInner}</div>
          </div>
        )) : <div className="empty">No matches</div>}
      </div>
    </Modal>
  );
}

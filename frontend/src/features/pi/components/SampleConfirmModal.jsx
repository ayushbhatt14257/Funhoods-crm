import { useState } from 'react';
import Modal from '../../../components/Modal';

// Deliberately much simpler than ConfirmLineModal — a sample is never an
// outer/inner carton split, it's just "how many pieces" of a real catalog
// product, given away free. No rate/GST shown as something to confirm (it's
// never billed), just enough detail (photo/name/code) to double-check it's
// the right SKU before adding.
export default function SampleConfirmModal({ product: p, onConfirm, onClose }) {
  const [pcs, setPcs] = useState(1);
  return (
    <Modal title={`Add sample — ${p.name}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, marginBottom: 12 }}>
        <div style={{ aspectRatio: '1', borderRadius: 8, background: p.photo ? `url(${p.photo}) center/cover` : 'var(--paper-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
          {!p.photo && '📦'}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{p.code} · {p.size}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Samples are free — never billed, no amount calculated.</div>
        </div>
      </div>
      <div className="fg"><label>How many pieces?</label><input type="number" min={1} value={pcs} onChange={(e) => setPcs(+e.target.value || 0)} /></div>
      <div className="btnrow">
        <button className="btn g" disabled={pcs <= 0} onClick={() => onConfirm(p, pcs)}>Confirm &amp; add sample</button>
        <button className="btn o" onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

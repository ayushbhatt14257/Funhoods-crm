import { useState } from 'react';
import Modal from '../../../components/Modal';

// Used from New Order, PI editing, and Dispatch gifting — onConfirm's
// signature stays (p, outers, inners, directPcs) for all three callers even
// though directPcs is now always 0, so none of them need to change.
export default function ConfirmLineModal({ product: p, onConfirm, onClose }) {
  const [outers, setOuters] = useState(0);
  const [inners, setInners] = useState(0);
  return (
    <Modal title={`Confirm — ${p.name}`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 14, marginBottom: 12 }}>
        <div style={{ aspectRatio: '1', borderRadius: 8, background: p.photo ? `url(${p.photo}) center/cover` : 'var(--paper-d)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40 }}>
          {!p.photo && '📦'}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>{p.name}</div>
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{p.code} · {p.size}</div>
          <div style={{ marginTop: 6, fontSize: 12.5 }}>Rate: <b>₹{p.rate.toFixed(2)}</b> · GST <b>{p.gst_pct || 5}%</b></div>
          <div style={{ fontSize: 12.5 }}>Outer: <b>{p.cartonOuter} pcs</b> · Inner: <b>{p.cartonInner} pcs</b></div>
        </div>
      </div>
      <div className="row2">
        <div className="fg"><label>How many OUTER cartons?</label><input type="number" min={0} value={outers} onChange={(e) => setOuters(+e.target.value || 0)} /></div>
        <div className="fg"><label>How many INNER cartons?</label><input type="number" min={0} value={inners} onChange={(e) => setInners(+e.target.value || 0)} /></div>
      </div>
      <div className="btnrow">
        <button className="btn g" onClick={() => onConfirm(p, outers, inners, 0)}>Confirm &amp; add to order</button>
        <button className="btn o" onClick={onClose}>Cancel</button>
      </div>
      <div className="note b" style={{ fontSize: 12 }}><b>You are confirming this exact SKU.</b> Double-check the code before adding.</div>
    </Modal>
  );
}

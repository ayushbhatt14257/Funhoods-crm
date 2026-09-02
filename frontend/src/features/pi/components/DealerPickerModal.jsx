import { useState } from 'react';
import Modal from '../../../components/Modal';
import NewDealerModal from '../../dealers/components/NewDealerModal';

export default function DealerPickerModal({ dealers, onPick, onClose, onDealerCreated }) {
  const [q, setQ] = useState('');
  const [showNewDealer, setShowNewDealer] = useState(false);
  const filtered = dealers.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()) || d.city.toLowerCase().includes(q.toLowerCase()));

  if (showNewDealer) {
    return (
      <NewDealerModal
        onClose={() => setShowNewDealer(false)}
        onCreated={(d) => { onDealerCreated(d); onPick(d); }}
      />
    );
  }

  return (
    <Modal title="Pick dealer" onClose={onClose}>
      <div className="btnrow" style={{ marginTop: 0, marginBottom: 11 }}>
        <button className="btn o sm" onClick={() => setShowNewDealer(true)}>+ New dealer</button>
      </div>
      <input placeholder="Search dealer or city" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 11 }} autoFocus />
      {filtered.length ? filtered.map((d) => (
        <div
          key={d.code}
          style={{ background: 'var(--white)', border: '1px solid var(--line)', borderRadius: 7, padding: '10px 12px', marginBottom: 6, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
          onClick={() => onPick(d)}
        >
          <div>
            <div style={{ fontWeight: 600 }}>{d.name}</div>
            <div className="mono muted" style={{ fontSize: 10.5 }}>{d.code} · {d.city} · {d.payment}</div>
          </div>
          <span className="badge">{d.slab}</span>
        </div>
      )) : <div className="empty">No dealers match</div>}
    </Modal>
  );
}

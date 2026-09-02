import { useState } from 'react';

export default function CartonRow({ carton, ci, activeLines, onAdd, onRemoveItem, onRemoveCarton }) {
  const [selCode, setSelCode] = useState('');
  const [qty, setQty] = useState('');
  return (
    <div className="card" style={{ display: 'grid', gridTemplateColumns: '50px 1fr auto', gap: 10, alignItems: 'start' }}>
      <div style={{ fontWeight: 700, textAlign: 'center' }}>#{carton.no}</div>
      <div>
        {carton.items.map((it, ii) => (
          <div key={ii} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '2px 0' }}>
            <span>{it.name} <span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{it.code}</span></span>
            <span>{it.pcs} pcs <button className="btn o sm" style={{ padding: '1px 7px', marginLeft: 6 }} onClick={() => onRemoveItem(ci, ii)}>×</button></span>
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <select value={selCode} onChange={(e) => setSelCode(e.target.value)} style={{ fontSize: 11.5, padding: 5 }}>
            <option value="">— pick item —</option>
            {activeLines.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}
          </select>
          <input type="number" placeholder="pcs" value={qty} onChange={(e) => setQty(e.target.value)} style={{ width: 70, fontSize: 11.5, padding: 5 }} />
          <button className="btn sm" onClick={() => { onAdd(ci, selCode, +qty); setQty(''); }}>+ Add</button>
        </div>
      </div>
      <button className="btn o sm" onClick={() => onRemoveCarton(ci)}>Remove</button>
    </div>
  );
}

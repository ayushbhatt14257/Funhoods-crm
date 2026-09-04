import { useState } from 'react';
import Modal from '../../../components/Modal';
import { categoriesApi } from '../categoriesApi';

export default function CategoryManagerModal({ categories, onChange, onClose }) {
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');

  async function add() {
    if (!name.trim()) return;
    setAdding(true);
    setError('');
    try {
      await categoriesApi.create(name.trim());
      setName('');
      onChange();
    } catch (err) { setError(err.message); }
    finally { setAdding(false); }
  }

  async function remove(cat) {
    if (!confirm(`Delete category "${cat.name}"?`)) return;
    setError('');
    try { await categoriesApi.remove(cat._id); onChange(); }
    catch (err) { setError(err.message); }
  }

  return (
    <Modal title="Manage categories" onClose={onClose}>
      <div className="btnrow" style={{ marginTop: 0 }}>
        <input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn sm" disabled={adding || !name.trim()} onClick={add}>+ Add</button>
      </div>
      {error && <div className="note r" style={{ fontSize: 12 }}>{error}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
        {categories.map((c) => (
          <div key={c._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px solid var(--line)', borderRadius: 6, padding: '6px 10px' }}>
            <span>{c.name}</span>
            <button className="btn o sm" onClick={() => remove(c)}>🗑</button>
          </div>
        ))}
        {!categories.length && <div className="empty">No categories yet</div>}
      </div>
    </Modal>
  );
}

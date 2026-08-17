import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

export default function Aliases() {
  const { showToast } = useToast();
  const [aliases, setAliases] = useState([]);
  const [products, setProducts] = useState([]);
  const [alias, setAlias] = useState('');
  const [code, setCode] = useState('');

  async function load() {
    const [a, p] = await Promise.all([api.get('/aliases'), api.get('/products')]);
    setAliases(a); setProducts(p);
    if (!code && p.length) setCode(p[0].code);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    if (!alias.trim() || !code) return showToast('Nickname and product required', 'err');
    try {
      await api.post('/aliases', { alias, code });
      showToast('Nickname added', 'g');
      setAlias('');
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function remove(id) {
    try { await api.del(`/aliases/${id}`); load(); } catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">WhatsApp order parser dictionary</div>
        <h2>SKU nicknames</h2>
        <p>Dealers write nicknames like "JCB" — map them here to the real product code. Unmapped terms get blocked at PI stage.</p>
      </div>
      <div className="card">
        <div className="row3">
          <div className="fg"><label>Nickname</label><input value={alias} onChange={(e) => setAlias(e.target.value)} placeholder="jcb" /></div>
          <div className="fg"><label>Resolves to product</label>
            <select value={code} onChange={(e) => setCode(e.target.value)}>
              {products.map((p) => <option key={p.code} value={p.code}>{p.code} · {p.name}</option>)}
            </select>
          </div>
          <div className="fg" style={{ display: 'flex', alignItems: 'flex-end' }}><button className="btn" onClick={add}>+ Add</button></div>
        </div>
      </div>
      <div className="tblwrap">
        <table className="dt">
          <thead><tr><th>Nickname</th><th>Product code</th><th></th></tr></thead>
          <tbody>
            {aliases.map((a) => (
              <tr key={a._id}><td>{a.alias}</td><td className="mono">{a.code}</td>
                <td><button className="btn o sm" onClick={() => remove(a._id)}>×</button></td></tr>
            ))}
            {!aliases.length && <tr><td colSpan={3}><div className="empty">No nicknames yet</div></td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

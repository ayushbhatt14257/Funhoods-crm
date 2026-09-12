import { useMemo, useState } from 'react';

// Quantity is always whole outer/inner cartons — never raw pieces. Given a
// pending pcs total and a product's carton sizes, this is the natural
// "how would you actually pack this" greedy breakdown, used as the default
// selected quantity (dispatch everything available is the common case).
function maxCartons(pendingPcs, cartonOuter, cartonInner) {
  if (!cartonOuter) return { outers: 0, inners: 0 };
  const outers = Math.floor(pendingPcs / cartonOuter);
  const afterOuters = pendingPcs - outers * cartonOuter;
  const inners = cartonInner ? Math.floor(afterOuters / cartonInner) : 0;
  return { outers, inners };
}

// One row's key — same product at two different rates needs to be two
// separate, independently selectable rows (they'll be separate invoice lines).
function rowKey(item) { return `${item.code}|${item.rate}`; }

export default function CustomerPoolView({ pool, selection, onSelectionChange }) {
  const [q, setQ] = useState('');

  const rows = useMemo(() => {
    return (pool?.items || [])
      .filter((it) => !q || it.name.toLowerCase().includes(q.toLowerCase()) || it.code.toLowerCase().includes(q.toLowerCase()))
      .map((it) => {
        const key = rowKey(it);
        const maxOuters = it.cartonOuter ? Math.floor(it.pendingPcs / it.cartonOuter) : 0;
        const maxInners = it.cartonInner ? Math.floor(it.pendingPcs / it.cartonInner) : 0;
        const state = selection[key] || { checked: false, ...maxCartons(it.pendingPcs, it.cartonOuter, it.cartonInner) };
        return { item: it, key, maxOuters, maxInners, ...state };
      });
  }, [pool, q, selection]);

  function setRow(key, patch) {
    onSelectionChange({ ...selection, [key]: { ...selection[key], ...patch } });
  }

  function toggle(row) {
    setRow(row.key, { checked: !row.checked, outers: row.outers, inners: row.inners });
  }

  const grandTotal = rows.reduce((sum, r) => {
    if (!r.checked) return sum;
    const pcs = r.outers * r.item.cartonOuter + r.inners * r.item.cartonInner;
    const gross = r.item.rate + (r.item.rate * r.item.gstPct) / 100;
    return sum + gross * pcs;
  }, 0);
  const anySelected = rows.some((r) => r.checked);

  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}>Confirmed items — {pool.dealer.name}</h3>
        <input placeholder="Search item" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
      </div>

      {!rows.length ? (
        <div className="empty">No confirmed, undispatched items for this customer right now.</div>
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead>
              <tr>
                <th></th><th></th><th>Code</th><th>Product</th><th>Last updated</th>
                <th>Outer</th><th>Inner</th><th>Rate ₹</th><th>GST %</th><th>Total ₹</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const pcs = r.outers * r.item.cartonOuter + r.inners * r.item.cartonInner;
                const gross = r.item.rate + (r.item.rate * r.item.gstPct) / 100;
                const lineTotal = gross * pcs;
                return (
                  <tr key={r.key}>
                    <td><input type="checkbox" checked={r.checked} onChange={() => toggle(r)} /></td>
                    <td>{r.item.photo ? <img src={r.item.photo} alt="" style={{ width: 30, height: 30, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{r.item.code}</td>
                    <td><b>{r.item.name}</b></td>
                    <td className="mono muted" style={{ fontSize: 11 }}>{new Date(r.item.lastConfirmedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>
                      <input
                        type="number" min={0} max={r.maxOuters} style={{ width: 64 }}
                        value={r.outers}
                        onChange={(e) => setRow(r.key, { outers: Math.max(0, Math.min(r.maxOuters, +e.target.value || 0)) })}
                      />
                    </td>
                    <td>
                      <input
                        type="number" min={0} max={r.maxInners} style={{ width: 64 }}
                        value={r.inners}
                        onChange={(e) => setRow(r.key, { inners: Math.max(0, Math.min(r.maxInners, +e.target.value || 0)) })}
                      />
                    </td>
                    <td>{r.item.rate}</td>
                    <td>{r.item.gstPct}</td>
                    <td>{Math.round(lineTotal).toLocaleString('en-IN')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {anySelected && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10, fontSize: 15, fontWeight: 700 }}>
          Grand Total: ₹{Math.round(grandTotal).toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
}

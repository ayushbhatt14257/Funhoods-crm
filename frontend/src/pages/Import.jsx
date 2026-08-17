import { useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

const SHEETS = [
  { key: 'products', label: 'Products', endpoint: '/import/products' },
  { key: 'dealers', label: 'Dealers', endpoint: '/import/dealers' },
  { key: 'aliases', label: 'Aliases (SKU nicknames)', endpoint: '/import/aliases' },
  { key: 'inventory', label: 'Opening Inventory', endpoint: '/import/inventory' },
];

export default function Import() {
  const { showToast } = useToast();
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState(null);

  async function upload(sheet, file) {
    if (!file) return;
    setBusy(sheet.key);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.postForm(sheet.endpoint, fd);
      setResults((r) => ({ ...r, [sheet.key]: res }));
      showToast(`${sheet.label}: ${res.imported} imported`, 'g');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setBusy(null); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">One-time or ongoing bulk updates</div><h2>Bulk Import</h2>
        <p>Upload the same Excel template file (or per-sheet export) here anytime — for initial setup and for future rate revisions or new products.</p></div>
      {SHEETS.map((sheet) => (
        <div className="card" key={sheet.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div><b>{sheet.label}</b> sheet</div>
            <input type="file" accept=".xlsx" disabled={busy === sheet.key} onChange={(e) => upload(sheet, e.target.files[0])} />
          </div>
          {results[sheet.key] && (
            <div className="note" style={{ fontSize: 12, marginTop: 10 }}>
              {results[sheet.key].imported} imported.
              {results[sheet.key].results.filter((r) => !r.ok).length > 0 && (
                <div style={{ color: 'var(--red)', marginTop: 4 }}>
                  {results[sheet.key].results.filter((r) => !r.ok).map((r, i) => <div key={i}>{r.code || r.alias}: {r.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

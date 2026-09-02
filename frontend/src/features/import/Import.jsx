import { useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';

const SHEETS = [
  { key: 'products', label: 'Products' },
  { key: 'dealers', label: 'Dealers' },
  { key: 'aliases', label: 'Aliases (SKU nicknames)' },
  { key: 'inventory', label: 'Opening Inventory' },
];

export default function Import() {
  const { showToast } = useToast();
  const [previewFor, setPreviewFor] = useState(null); // sheet key currently in preview
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [confirmedResult, setConfirmedResult] = useState({});

  async function pickFile(sheet, file) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append('file', file);
    try {
      const res = await api.postForm(`/import/${sheet.key}/preview`, fd);
      setRows(res.rows);
      setPreviewFor(sheet.key);
      setConfirmedResult((r) => ({ ...r, [sheet.key]: null }));
    } catch (err) { showToast(err.message, 'err'); }
    finally { setBusy(false); }
  }

  function editCell(i, key, val) {
    const next = [...rows];
    next[i] = { ...next[i], [key]: val };
    setRows(next);
  }
  function deleteRow(i) { setRows(rows.filter((_, idx) => idx !== i)); }

  async function confirmImport() {
    if (!rows.length) return showToast('No rows left to import', 'err');
    setBusy(true);
    try {
      const res = await api.post(`/import/${previewFor}/confirm`, { rows });
      setConfirmedResult((r) => ({ ...r, [previewFor]: res }));
      showToast(`${res.imported} imported`, 'g');
      setPreviewFor(null);
      setRows([]);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setBusy(false); }
  }

  if (previewFor) {
    const columns = rows.length ? Object.keys(rows[0]) : [];
    const sheetLabel = SHEETS.find((s) => s.key === previewFor)?.label;
    return (
      <div>
        <div className="ph">
          <div className="eyebrow">Review before saving</div>
          <h2>Preview — {sheetLabel}</h2>
          <p>{rows.length} row(s) parsed from your file. Edit any cell, delete rows you don't want, then confirm.</p>
        </div>
        <div className="tblwrap" style={{ marginBottom: 14 }}>
          <table className="dt">
            <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}<th></th></tr></thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c}>
                      <input
                        value={r[c] ?? ''}
                        onChange={(e) => editCell(i, c, e.target.value)}
                        style={{ minWidth: 90, padding: '4px 6px', fontSize: 12 }}
                      />
                    </td>
                  ))}
                  <td><button className="btn o sm" onClick={() => deleteRow(i)}>Delete</button></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={columns.length + 1}><div className="empty">All rows deleted</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="btnrow">
          <button className="btn g" disabled={busy || !rows.length} onClick={confirmImport}>Confirm upload ({rows.length} rows)</button>
          <button className="btn o" disabled={busy} onClick={() => { setPreviewFor(null); setRows([]); }}>Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">One-time or ongoing bulk updates</div><h2>Bulk Import</h2>
        <p>Upload the Excel template — you'll get a chance to review, edit, or delete rows before anything is saved.</p></div>
      {SHEETS.map((sheet) => (
        <div className="card" key={sheet.key}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div><b>{sheet.label}</b> sheet</div>
            <input type="file" accept=".xlsx" disabled={busy} onChange={(e) => pickFile(sheet, e.target.files[0])} />
          </div>
          {confirmedResult[sheet.key] && (
            <div className="note g" style={{ fontSize: 12, marginTop: 10 }}>
              {confirmedResult[sheet.key].imported} imported.
              {confirmedResult[sheet.key].results.filter((r) => !r.ok).length > 0 && (
                <div style={{ color: 'var(--red)', marginTop: 4 }}>
                  {confirmedResult[sheet.key].results.filter((r) => !r.ok).map((r, i) => <div key={i}>{r.key}: {r.error}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

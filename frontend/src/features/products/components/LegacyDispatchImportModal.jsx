import { useState } from 'react';
import Modal from '../../../components/Modal';
import { productsApi } from '../api';
import { useToast } from '../../../context/ToastContext';

// Every row starts INCLUDED only if it matched a real product — an
// unmatched row has nothing to save against, so there's no sensible
// default state for it other than excluded (the checkbox is also disabled
// for it, see the render below).
export default function LegacyDispatchImportModal({ onClose, onApplied }) {
  const { showToast } = useToast();
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState(null); // preview rows once parsed
  const [included, setIncluded] = useState({}); // row index -> bool
  const [overrides, setOverrides] = useState({}); // row index -> corrected code, for a wrong/no match
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  async function parseFile() {
    if (!file) return showToast('Choose a file first', 'err');
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await productsApi.previewLegacyDispatch(formData);
      setRows(res.rows);
      const initialIncluded = {};
      res.rows.forEach((r, i) => { initialIncluded[i] = !!r.matchedCode; });
      setIncluded(initialIncluded);
      showToast(`Matched ${res.matchedCount} of ${res.totalCount} rows.`, res.matchedCount === res.totalCount ? 'g' : 'y');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setLoading(false); }
  }

  async function apply() {
    const toApply = rows
      .map((r, i) => ({ code: (overrides[i] || r.matchedCode || '').trim().toUpperCase(), qty: r.qty, included: included[i] }))
      .filter((r) => r.included && r.code);
    if (!toApply.length) return showToast('Nothing checked to apply', 'err');
    if (!confirm(`Set the pre-CRM dispatch baseline for ${toApply.length} product(s)? This replaces any existing baseline for those products.`)) return;
    setApplying(true);
    try {
      const res = await productsApi.confirmLegacyDispatch(toApply);
      showToast(res.message, 'g');
      onApplied?.();
      onClose();
    } catch (err) { showToast(err.message, 'err'); }
    finally { setApplying(false); }
  }

  return (
    <Modal title="Import legacy (pre-CRM) dispatch data" onClose={onClose}>
        <p className="muted" style={{ fontSize: 12 }}>
          Upload the Tally "Stock Group Summary" export (or similar 2-column Particulars/Outwards report).
          Each row gets matched to a real product by its code — review and adjust below before anything is saved.
          This only ever changes the "Dispatched (all-time)" figure; it never touches current stock or invoice history.
        </p>

        {!rows && (
          <div className="btnrow">
            <input type="file" accept=".xls,.xlsx" onChange={(e) => setFile(e.target.files[0])} />
            <button className="btn sm" disabled={loading} onClick={parseFile}>{loading ? 'Reading…' : 'Read file'}</button>
          </div>
        )}

        {rows && (
          <>
            <div style={{ maxHeight: 420, overflowY: 'auto', marginTop: 12 }}>
              <table className="dt">
                <thead><tr><th></th><th>Sheet row</th><th>Qty</th><th>Matched product</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td>
                        <input
                          type="checkbox"
                          checked={!!included[i]}
                          disabled={!(overrides[i] || r.matchedCode)}
                          onChange={(e) => setIncluded({ ...included, [i]: e.target.checked })}
                        />
                      </td>
                      <td className="mono" style={{ fontSize: 11 }}>{r.text}</td>
                      <td>{r.qty}</td>
                      <td>
                        {r.matchedCode ? (
                          <span className="mono">{r.matchedCode}</span>
                        ) : (
                          <input
                            placeholder="No match — type the real code, or leave blank to skip"
                            value={overrides[i] || ''}
                            onChange={(e) => { setOverrides({ ...overrides, [i]: e.target.value }); setIncluded({ ...included, [i]: !!e.target.value }); }}
                            style={{ width: 220, fontSize: 11 }}
                          />
                        )}
                        {r.matchedCode && <span className="muted" style={{ fontSize: 11 }}> — {r.matchedName}</span>}
                        {r.currentPreCrmDispatched > 0 && (
                          <div className="muted" style={{ fontSize: 10 }}>Currently set to {r.currentPreCrmDispatched} — will be replaced</div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button className="btn o sm" onClick={() => { setRows(null); setFile(null); setIncluded({}); setOverrides({}); }}>← Start over</button>
              <button className="btn sm" disabled={applying} onClick={apply}>{applying ? 'Saving…' : `Apply ${Object.values(included).filter(Boolean).length} row(s)`}</button>
            </div>
          </>
        )}
    </Modal>
  );
}

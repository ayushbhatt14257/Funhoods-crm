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
  const [dateRangeText, setDateRangeText] = useState(null);
  const [dateRangeFound, setDateRangeFound] = useState(true);
  const [included, setIncluded] = useState({}); // row index -> bool
  const [overrides, setOverrides] = useState({}); // row index -> corrected code, for a wrong/no match
  const [baselineQty, setBaselineQty] = useState({}); // row index -> the actual number that will be saved (defaults to the calculated gap)
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
      setDateRangeText(res.dateRangeText);
      setDateRangeFound(res.dateRangeFound);
      const initialIncluded = {};
      const initialQty = {};
      res.rows.forEach((r, i) => {
        initialIncluded[i] = !!r.matchedCode;
        // Default to the calculated gap (Tally period total minus this
        // CRM's own invoices for that same period) — if the date range
        // couldn't be read from the file, there's no gap to calculate, so
        // fall back to the raw qty and let the person correct it manually.
        initialQty[i] = r.gap != null ? r.gap : r.qty;
      });
      setIncluded(initialIncluded);
      setBaselineQty(initialQty);
      showToast(`Matched ${res.matchedCount} of ${res.totalCount} rows.`, res.matchedCount === res.totalCount ? 'g' : 'y');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setLoading(false); }
  }

  async function apply() {
    const toApply = rows
      .map((r, i) => ({ code: (overrides[i] || r.matchedCode || '').trim().toUpperCase(), qty: +baselineQty[i] || 0, included: included[i] }))
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
          Each row gets matched to a real product by its code. Tally's own period usually overlaps with
          dispatches this CRM has already invoiced, so the raw Tally quantity is <b>not</b> used directly —
          instead, for each product, this reads Tally's period from the file and subtracts this CRM's own
          invoice total for that exact same period, leaving only the <b>gap</b>: real dispatches Tally saw
          that never made it into this CRM as an invoice. That gap is what gets saved as the baseline, and
          it's added on top of the live invoice total everywhere "Dispatched (all-time)" is shown — so it
          keeps growing correctly with every future dispatch instead of freezing. Review and correct the
          numbers below before anything is saved. This never touches current stock or invoice history.
        </p>

        {!rows && (
          <div className="btnrow">
            <input type="file" accept=".xls,.xlsx" onChange={(e) => setFile(e.target.files[0])} />
            <button className="btn sm" disabled={loading} onClick={parseFile}>{loading ? 'Reading…' : 'Read file'}</button>
          </div>
        )}

        {rows && (
          <>
            {dateRangeText && (
              <div className="note b" style={{ fontSize: 12, marginBottom: 8 }}>
                Tally period read from file: <b>{dateRangeText}</b>. "CRM (this period)" below is this CRM's own invoice total for that same window.
              </div>
            )}
            {!dateRangeFound && (
              <div className="note" style={{ fontSize: 12, marginBottom: 8, color: 'var(--rd)' }}>
                Couldn't find a date range in this file, so no gap could be calculated — "Baseline to save" defaults to the raw Tally qty for every row. Check each one carefully before applying, since this may double-count against invoices already in the CRM.
              </div>
            )}
            <div style={{ maxHeight: 420, overflowY: 'auto', marginTop: 12 }}>
              <table className="dt">
                <thead><tr><th></th><th>Sheet row</th><th>Tally qty</th><th>CRM (this period)</th><th>Matched product</th><th>Baseline to save</th></tr></thead>
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
                      <td className="muted">{r.crmPeriodTotal != null ? r.crmPeriodTotal : '—'}</td>
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
                      <td>
                        <input
                          type="number"
                          min={0}
                          value={baselineQty[i] ?? 0}
                          onChange={(e) => setBaselineQty({ ...baselineQty, [i]: e.target.value })}
                          style={{ width: 90, fontSize: 11 }}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="btnrow" style={{ marginTop: 12 }}>
              <button className="btn o sm" onClick={() => { setRows(null); setFile(null); setIncluded({}); setOverrides({}); setBaselineQty({}); }}>← Start over</button>
              <button className="btn sm" disabled={applying} onClick={apply}>{applying ? 'Saving…' : `Apply ${Object.values(included).filter(Boolean).length} row(s)`}</button>
            </div>
          </>
        )}
    </Modal>
  );
}

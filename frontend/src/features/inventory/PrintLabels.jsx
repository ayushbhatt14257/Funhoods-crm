import { useEffect, useState } from 'react';

// admin/masterAdmin/inward only (same roles as Generate Barcodes — see
// Layout.jsx/App.jsx). Nothing on this page touches the database at all —
// no carton records, no scanning, no tracking. It's a pure print utility
// for two kinds of plain labels staff asked for that have nothing to do
// with a specific product or barcode:
//   - Numbering: a run of labels numbered start..end (e.g. 1 to 50), one
//     number per label, for marking boxes/bins in sequence.
//   - Text: N identical labels all showing the same short text (e.g.
//     "Green"), for tagging a batch by color/category rather than a number.
//
// LABEL SIZE: half of Generate Barcodes' 100x76mm slip, cut down the
// middle — 50mm wide x 76mm tall, same height, half the width. Printed one
// label per page exactly like Generate Barcodes (same @page/page-break
// approach), just with its own smaller --label-w.
export default function PrintLabels() {
  const [tab, setTab] = useState('numbering'); // 'numbering' | 'text'

  // --- Numbering tab ---
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(50);

  // --- Text tab ---
  const [text, setText] = useState('');
  const [qty, setQty] = useState(50);

  const [labels, setLabels] = useState(null); // array of strings to print, or null

  useEffect(() => {
    if (!labels) return;
    window.print();
  }, [labels]);

  function printNumbering() {
    const start = Math.max(1, +from || 1);
    const end = Math.max(start, +to || start);
    if (end - start + 1 > 2000) return; // sane ceiling, same spirit as Generate Barcodes
    const arr = [];
    for (let n = start; n <= end; n++) arr.push(String(n));
    setLabels(arr);
  }

  function printText() {
    const t = text.trim();
    const n = Math.max(1, Math.min(2000, +qty || 0));
    if (!t || !n) return;
    setLabels(Array.from({ length: n }, () => t));
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Stock-in setup</div><h2>Print Labels</h2>
        <p>Plain print-only labels — numbered, or a repeated short text. Nothing here is saved; no scanning, no tracking, no product needed.</p></div>

      {labels && (
        <div id="print-area" className="silent-print">
          <div className="pl-sheet">
            {labels.map((val, i) => (
              <div className="pl-label" key={i}>
                <div className="pl-text">{val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="btnrow no-print" style={{ marginBottom: 14 }}>
        <button className={tab === 'numbering' ? 'btn sm' : 'btn o sm'} onClick={() => setTab('numbering')}>🔢 Numbering</button>
        <button className={tab === 'text' ? 'btn sm' : 'btn o sm'} onClick={() => setTab('text')}>🔤 Text</button>
      </div>

      {tab === 'numbering' && (
        <div className="card no-print" style={{ maxWidth: 420 }}>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>Prints one label per number, counting up — e.g. 1 to 50 prints 50 labels numbered 1, 2, 3 … 50.</p>
          <div className="row2">
            <div className="fg"><label>From</label><input type="number" min={1} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
            <div className="fg"><label>To</label><input type="number" min={1} value={to} onChange={(e) => setTo(e.target.value)} /></div>
          </div>
          <button className="btn" onClick={printNumbering}>🖨️ Print {Math.max(0, (Math.max(1, +to || 1) - Math.max(1, +from || 1) + 1))} label(s)</button>
        </div>
      )}

      {tab === 'text' && (
        <div className="card no-print" style={{ maxWidth: 420 }}>
          <p className="muted" style={{ fontSize: 12.5, marginTop: -4 }}>Prints the same text on every label — e.g. "Green" × 50 prints 50 identical "Green" labels.</p>
          <div className="fg"><label>Text</label><input placeholder="e.g. Green" value={text} onChange={(e) => setText(e.target.value)} /></div>
          <div className="fg"><label>How many?</label><input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} /></div>
          <button className="btn" disabled={!text.trim()} onClick={printText}>🖨️ Print {Math.max(0, +qty || 0)} label(s)</button>
        </div>
      )}

      <style>{`
        .pl-sheet {
          --label-w: 50mm;   /* half of Generate Barcodes' 100mm slip, cut down the middle */
          --label-h: 76mm;   /* same height as Generate Barcodes' labels */
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 16px;
          margin-top: 16px;
        }
        .pl-label {
          width: var(--label-w);
          height: var(--label-h);
          box-sizing: border-box;
          border: 1px dashed var(--line);
          display: flex;
          justify-content: center;
          align-items: center;
          overflow: hidden;
        }
        .pl-text {
          font-weight: 800;
          font-size: 40px;
          line-height: 1.15;
          text-align: center;
          word-break: break-word;
          padding: 0 6px;
          max-width: 100%;
        }
        .silent-print { position: fixed; left: -9999px; top: 0; }
        @media print {
          .silent-print { position: static; left: auto; top: auto; }
          .no-print { display: none !important; }
          /* Literal values only, same reasoning as Generate Barcodes — Chrome
             doesn't reliably read CSS custom properties inside @page. */
          @page { size: 50mm 76mm; margin: 0; }
          .pl-sheet { gap: 0; margin-top: 0; display: block; }
          .pl-label { border: none; page-break-after: always; }
          .pl-label:last-child { page-break-after: auto; }
        }
      `}</style>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import PIPreview from '../components/PIPreview';

export default function WhatsAppOrderMode() {
  const { showToast } = useToast();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [lines, setLines] = useState([]); // parsed lines, before preview
  const [showPreview, setShowPreview] = useState(false);

  async function parse() {
    if (!text.trim()) return showToast('Paste an order first', 'err');
    try {
      const result = await api.post('/pi/parse', { text });
      setParsed(result);
      const ok = result.lines.filter((l) => !l.error);
      setLines(ok.map((l) => ({
        code: l.product.code, name: l.product.name, photo: l.product.photo,
        outers: l.outers, inners: l.inners, pcs: l.pcs,
        rate: l.product.rate, gstPct: l.product.gst_pct || 5,
      })));
      setShowPreview(false);
    } catch (err) { showToast(err.message, 'err'); }
  }

  const errors = parsed ? parsed.lines.filter((l) => l.error) : [];

  if (showPreview && parsed?.dealer) {
    return (
      <div className="grid2">
        <PIPreview dealer={parsed.dealer} initialLines={lines} onBack={() => setShowPreview(false)} />
        <ModeInfoPanel />
      </div>
    );
  }

  return (
    <div className="grid2">
      <div>
        <div className="card">
          <label>Step 1 · Paste order text</label>
          <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder={"Shree Ganesh Toys Shop\nBuilder master - Inner\nRattle - Inner\nHelicopter - 1 carton"} />
          <div className="btnrow"><button className="btn" onClick={parse}>Parse this order</button></div>
        </div>

        {parsed && (
          <div className="card">
            <h3 style={{ marginBottom: 10 }}>Step 2 · Parse result</h3>
            {!parsed.dealer ? (
              <div className="note r"><b>Dealer not recognised:</b> "{parsed.dealerText}" — add this dealer first from the Dealers page.</div>
            ) : (
              <div className="note g"><b>{parsed.dealer.name}</b> · {parsed.dealer.city} · {parsed.dealer.payment}</div>
            )}

            {errors.map((l, i) => (
              <div className="note r" key={i}>✕ {l.line} — {l.error}</div>
            ))}

            {!!lines.length && (
              <div className="tblwrap" style={{ marginTop: 10 }}>
                <table className="dt">
                  <thead><tr><th>Item</th><th>Packing</th><th>Qty</th><th>Rate ₹</th><th>GST%</th></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={i}>
                        <td>{l.name}<br /><span className="mono" style={{ fontSize: 10, color: 'var(--muted)' }}>{l.code}</span></td>
                        <td>{l.outers ? `${l.outers} outer` : ''}{l.inners ? `${l.inners} inner` : ''}</td>
                        <td>{l.pcs}</td>
                        <td>{l.rate.toFixed(2)}</td>
                        <td>{l.gstPct}{l.gstPct !== 5 && <div style={{ fontSize: 9, color: 'var(--orange)' }}>non-standard</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {parsed.dealer && !!lines.length && (
              <div className="btnrow">
                <button className="btn g" onClick={() => setShowPreview(true)}>→ Continue to PI preview</button>
              </div>
            )}
          </div>
        )}
      </div>

      <ModeInfoPanel />
    </div>
  );
}

export function ModeInfoPanel() {
  return (
    <div>
      <div className="card">
        <h3 style={{ marginBottom: 8 }}>How each mode works</h3>
        <p style={{ fontSize: 13, marginBottom: 10 }}><b>Mode A · WhatsApp paste:</b> best when order arrives on WhatsApp text. Parser resolves dealer + SKUs. Ambiguous product = pick from a list.</p>
        <p style={{ fontSize: 13 }}><b>Mode B · Structured entry:</b> best at counter — pick dealer, confirm firm details, add items one-by-one with photo + code + qty confirmation per line.</p>
      </div>
      <div className="note r" style={{ fontSize: 12 }}><b>Tax:</b> per-product GST% — default 5%. Edit each product's rate in the Products screen (5/12/18). Rate is fully editable on the PI preview screen (next step), for special/negotiated pricing.</div>
    </div>
  );
}

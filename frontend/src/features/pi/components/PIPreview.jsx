import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { piApi } from '../api';

// dealer: dealer object. initialLines: [{code,name,photo,outers,inners,pcs,rate,gstPct}]
// onBack: go back to editing the order (optional)
export default function PIPreview({ dealer, initialLines, onBack }) {
  const { showToast } = useToast();
  const nav = useNavigate();
  const [settings, setSettings] = useState(null);
  const [lines, setLines] = useState([]);
  const [gstConfirmed, setGstConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [remark, setRemark] = useState('');

  useEffect(() => { api.get('/settings').then(setSettings); }, []);

  useEffect(() => {
    setLines(initialLines.map((l, i) => ({
      no: i + 1, code: l.code, name: l.name, photo: l.photo,
      outers: l.outers || 0, inners: l.inners || 0, pcs: l.pcs,
      rate: l.rate, listRate: l.rate, gstPct: l.gstPct || 5,
    })));
  }, [initialLines]);

  function editRate(i, val) {
    const next = [...lines];
    next[i] = { ...next[i], rate: +val || 0 };
    setLines(next);
  }

  const computed = lines.map((l) => {
    const tax = +((l.rate * l.gstPct) / 100).toFixed(2);
    const gross = +(l.rate + tax).toFixed(2);
    const total = +(gross * l.pcs).toFixed(2);
    return { ...l, tax, gross, total, rateEdited: l.rate !== l.listRate, belowFloor: l.rate < l.listRate };
  });
  const subtotal = computed.reduce((s, l) => s + l.total, 0);
  const grandTotal = subtotal;
  const hasNonStandardGst = lines.some((l) => l.gstPct !== 5);
  const belowFloorLines = computed.filter((l) => l.belowFloor);
  const totalPieces = lines.reduce((s, l) => s + l.pcs, 0);

  async function save(status) {
    if (belowFloorLines.length) {
      return showToast(`Rate can't be below base price for: ${belowFloorLines.map((l) => l.name).join(', ')}`, 'err');
    }
    if (hasNonStandardGst && !gstConfirmed) return showToast('Confirm GST rates before saving', 'err');
    setSaving(true);
    try {
      const pi = await piApi.create({
        dealerCode: dealer.code,
        lines: computed.map((l) => ({ code: l.code, pcs: l.pcs, outers: l.outers, inners: l.inners, rate: l.rate })),
        remark,
      });
      if (status === 'Sent') await piApi.setStatus(pi.no, 'Sent');
      showToast(`PI ${pi.no} saved`, 'g');
      nav(`/pis/${pi.no}`);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSaving(false); }
  }

  if (!settings) return null;
  const s = settings;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });

  return (
    <div className="card">
      <h3 style={{ marginBottom: 10 }}>Step 3 · PI preview</h3>
      <div id="print-area" className="pi">
        <div className="head">
          <div className="l">
            <img src="/funhoods-logo.jpg" alt={s.company || 'Funhoods'} style={{ height: 40, marginBottom: 4 }} />
            <div>{s.address || '—'}</div>
            <div>Phone: {s.phone || '—'} · Email: {s.email || '—'}</div>
            <div><b>GSTIN: {s.gstin || '—'}</b></div>
            <div style={{ marginTop: 6, fontFamily: 'var(--mono)', fontSize: 11, background: 'var(--paper-d)', padding: '3px 8px', borderRadius: 4, display: 'inline-block' }}>PROFORMA INVOICE</div>
          </div>
          <div className="r">
            <div className="no">(pending PI number)</div>
            <div>Date: {today}</div>
          </div>
        </div>

        <div className="bill">
          <div>
            <h6>Bill to</h6>
            <div><b>{dealer.name}</b></div>
            <div>{dealer.addr || '—'}</div>
            <div>{dealer.city} {dealer.state || ''} {dealer.pin || ''}</div>
            {dealer.gstin ? <div>GSTIN: <b>{dealer.gstin}</b></div> : <div style={{ color: 'var(--red)' }}>GSTIN not on file</div>}
            {dealer.mobile && <div>Contact: {dealer.contact} · {dealer.mobile}</div>}
          </div>
          <div>
            <h6>Order summary</h6>
            <div>Payment terms: <b>{dealer.payment}</b></div>
            <div>Slab: <b>{dealer.slab}</b></div>
            <div>Total items: <b>{lines.length}</b></div>
            <div>Total pieces: <b>{totalPieces}</b></div>
          </div>
        </div>

        <table className="lines">
          <thead><tr><th>#</th><th style={{ width: 34 }}></th><th>Item</th><th className="r">Packing</th><th className="r">Qty</th><th className="r">Rate ₹</th><th className="r">GST %</th><th className="r">Tax</th><th className="r">Gross</th><th className="r">Total ₹</th></tr></thead>
          <tbody>
            {computed.map((l, i) => (
              <tr key={i}>
                <td>{l.no}</td>
                <td>{l.photo ? <img src={l.photo} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: 'cover' }} /> : <div style={{ width: 28, height: 28, background: 'var(--paper)', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📦</div>}</td>
                <td><b>{l.name}</b><br /><span className="mono muted" style={{ fontSize: 10 }}>{l.code}</span></td>
                <td className="r">{l.outers ? `${l.outers} outer` : ''}{l.inners ? `${l.inners} inner` : ''}</td>
                <td className="r">{l.pcs}</td>
                <td className="r">
                  <input
                    type="number" step="0.01" min={l.listRate} value={l.rate}
                    style={{ width: 74, textAlign: 'right', padding: '5px 6px', fontSize: 12, borderColor: l.belowFloor ? 'var(--red)' : undefined }}
                    onChange={(e) => editRate(i, e.target.value)}
                  />
                  {l.belowFloor ? (
                    <div style={{ fontSize: 9, color: 'var(--red)', fontWeight: 600, marginTop: 2 }}>⚠ below base ₹{l.listRate}</div>
                  ) : l.rateEdited && (
                    <div style={{ fontSize: 9, color: 'var(--orange)', fontWeight: 600, marginTop: 2 }}>✎ edited (list ₹{l.listRate})</div>
                  )}
                </td>
                <td className="r">{l.gstPct}{l.gstPct !== 5 && <div style={{ fontSize: 9, color: 'var(--orange)', fontWeight: 600 }}>non-standard</div>}</td>
                <td className="r">{l.tax.toFixed(2)}</td>
                <td className="r">{l.gross.toFixed(2)}</td>
                <td className="r"><b>{l.total.toFixed(2)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="note b" style={{ fontSize: 12 }}>Rate column is editable per line — use this for special/negotiated discounts. Default is the Products master price; edited rates are flagged in orange.</div>
        <div className="note y" style={{ fontSize: 12 }}>Transport/freight isn't added here — it gets entered later at dispatch time, once the goods actually leave and the transporter is confirmed.</div>

        <div className="totals">
          <div className="line"><span>Subtotal</span><span>₹{subtotal.toFixed(2)}</span></div>
          <div className="line grand"><span>GRAND TOTAL</span><span>₹{grandTotal.toFixed(2)}</span></div>
        </div>

        {(s.bankName || s.bankAccount) && (
          <div className="note" style={{ marginTop: 14, background: 'var(--paper-d)', borderLeft: 'none' }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Bank details for payment</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, fontSize: 12 }}>
              <div>Bank: <b>{s.bankName || '—'}</b></div>
              <div>A/C No: <b>{s.bankAccount || '—'}</b></div>
              <div>IFSC: <b>{s.bankIFSC || '—'}</b></div>
              <div>Branch: <b>{s.bankBranch || '—'}</b></div>
              {s.upiId && <div>UPI: <b>{s.upiId}</b></div>}
            </div>
          </div>
        )}

        {remark && <div className="note y" style={{ fontSize: 12.5, marginTop: 10 }}><b>Remark:</b> {remark}</div>}

        <div className="terms">
          This is a PROFORMA — Tax Invoice will be issued at time of dispatch based on actual quantity shipped. Please verify GST rate with your CA.
        </div>
      </div>

      <div className="fg" style={{ marginTop: 12 }}>
        <label>Remark (optional — internal note, prints on PI)</label>
        <textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="e.g. Urgent delivery requested, or special packing instructions" />
      </div>

      {hasNonStandardGst && (
        <div className="note r">
          <label style={{ display: 'flex', gap: 8, textTransform: 'none', fontFamily: 'var(--sans)', fontWeight: 400, fontSize: 13, cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={gstConfirmed} onChange={(e) => setGstConfirmed(e.target.checked)} />
            <span>Some items have non-5% GST. Tick to confirm these rates are correct before saving.</span>
          </label>
        </div>
      )}

      <div className="btnrow">
        <button className="btn" disabled={saving || (hasNonStandardGst && !gstConfirmed)} onClick={() => save('Sent')}>Save + send to customer</button>
        <button className="btn o" disabled={saving} onClick={() => save('Draft')}>Save as draft</button>
        <button className="btn o" onClick={() => window.print()}>🖨️ Print / Save PDF</button>
        {onBack && <button className="btn o" style={{ marginLeft: 'auto' }} onClick={onBack}>← Back to edit</button>}
      </div>
    </div>
  );
}

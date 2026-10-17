import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../api/client';
import { oemApi } from './api';
import { useToast } from '../../context/ToastContext';
import Loading from '../../components/Loading';

const blankLine = () => ({ name: '', spec: '', qty: '', unit: 'pcs', rate: '', gstPct: 18 });

// New + edit share this screen (edit route has :no).
export default function OemForm() {
  const { no } = useParams();
  const nav = useNavigate();
  const { showToast } = useToast();
  const [dealers, setDealers] = useState(null);
  const [dealerCode, setDealerCode] = useState('');
  const [lines, setLines] = useState([blankLine()]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [advance, setAdvance] = useState('');
  const [remark, setRemark] = useState('');
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(!no);

  useEffect(() => {
    api.get('/dealers').then((d) => setDealers(d.filter((x) => x.isOEM)));
  }, []);
  useEffect(() => {
    if (!no) return;
    oemApi.getByNo(no).then((o) => {
      setDealerCode(o.dealer);
      setLines(o.lines.map((l) => ({ name: l.name, spec: l.spec, qty: l.qty, unit: l.unit, rate: l.rate, gstPct: l.gstPct })));
      setDeliveryDate(o.deliveryDate ? o.deliveryDate.slice(0, 10) : '');
      setAdvance(o.advance || '');
      setRemark(o.remark || '');
      setLoaded(true);
    }).catch((e) => showToast(e.message, 'err'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [no]);

  function setLine(i, field, val) {
    setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, [field]: val } : l)));
  }
  const calc = lines.map((l) => {
    const amount = (+l.qty || 0) * (+l.rate || 0);
    const tax = (amount * (l.gstPct === '' ? 18 : +l.gstPct)) / 100;
    return { amount, tax, total: amount + tax };
  });
  const subtotal = calc.reduce((s, c) => s + c.amount, 0);
  const taxTotal = calc.reduce((s, c) => s + c.tax, 0);
  const total = subtotal + taxTotal;

  async function save() {
    if (!dealerCode) return showToast('Pick an OEM customer', 'err');
    const filled = lines.filter((l) => l.name.trim());
    if (!filled.length) return showToast('Add at least one item', 'err');
    setSaving(true);
    try {
      const payload = { lines: filled, deliveryDate: deliveryDate || null, advance: +advance || 0, remark };
      const saved = no ? await oemApi.update(no, payload) : await oemApi.create({ ...payload, dealerCode });
      showToast(no ? 'OEM order updated' : 'OEM order created', 'g');
      nav(`/oem/${saved.no}`);
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSaving(false); }
  }

  if (!dealers || !loaded) return <Loading label="Loading…" />;

  return (
    <div>
      <div className="ph"><div className="eyebrow">OEM / private label</div><h2>{no ? `Edit ${no}` : 'New OEM order'}</h2></div>

      <div className="card">
        <div className="row2">
          <div className="fg">
            <label>OEM customer *</label>
            <select value={dealerCode} disabled={!!no} onChange={(e) => setDealerCode(e.target.value)}>
              <option value="">— select —</option>
              {dealers.map((d) => <option key={d.code} value={d.code}>{d.name} ({d.city})</option>)}
            </select>
            {!dealers.length && <div className="muted" style={{ fontSize: 11.5, marginTop: 4 }}>No OEM customers yet — tick "OEM / private-label customer" on a customer in Customers.</div>}
          </div>
          <div className="fg"><label>Delivery date</label><input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} /></div>
        </div>
      </div>

      <div className="tblwrap" style={{ marginTop: 12 }}>
        <table className="dt">
          <thead><tr><th>#</th><th>Product</th><th>Spec / notes</th><th>Qty</th><th>Unit</th><th>Rate ₹ (ex-GST)</th><th>GST %</th><th>Total ₹</th><th></th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td><input style={{ minWidth: 150 }} value={l.name} onChange={(e) => setLine(i, 'name', e.target.value)} placeholder="Product name" /></td>
                <td><input style={{ minWidth: 150 }} value={l.spec} onChange={(e) => setLine(i, 'spec', e.target.value)} placeholder="size, colour, packing…" /></td>
                <td><input type="number" min={0} style={{ width: 80 }} value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} /></td>
                <td><input style={{ width: 60 }} value={l.unit} onChange={(e) => setLine(i, 'unit', e.target.value)} /></td>
                <td><input type="number" step="0.01" min={0} style={{ width: 90 }} value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value)} /></td>
                <td><input type="number" min={0} style={{ width: 60 }} value={l.gstPct} onChange={(e) => setLine(i, 'gstPct', e.target.value)} /></td>
                <td><b>{calc[i].total.toFixed(2)}</b></td>
                <td><button className="btn rd sm" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="btnrow"><button className="btn o sm" onClick={() => setLines([...lines, blankLine()])}>+ Add item</button></div>

      <div style={{ textAlign: 'right', marginTop: 8, fontSize: 13 }}>
        Subtotal ₹{subtotal.toFixed(2)} · GST ₹{taxTotal.toFixed(2)}<br />
        <b style={{ fontSize: 15 }}>Total ₹{total.toFixed(2)}</b>
      </div>

      <div className="row2" style={{ marginTop: 12 }}>
        <div className="fg"><label>Advance received ₹ (informational)</label><input type="number" min={0} value={advance} onChange={(e) => setAdvance(e.target.value)} /></div>
        <div className="fg"><label>Remark</label><textarea rows={2} value={remark} onChange={(e) => setRemark(e.target.value)} /></div>
      </div>
      <div className="note b" style={{ fontSize: 12 }}>OEM orders are separate from PIs and the Ledger — nothing here affects stock or Outstanding.</div>
      <div className="btnrow">
        <button className="btn g" disabled={saving} onClick={save}>{saving ? 'Saving…' : no ? 'Save changes' : 'Create order'}</button>
        <button className="btn o" disabled={saving} onClick={() => nav(no ? `/oem/${no}` : '/oem')}>Cancel</button>
      </div>
    </div>
  );
}

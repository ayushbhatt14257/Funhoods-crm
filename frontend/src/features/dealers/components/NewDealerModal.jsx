import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api/client';
import { useToast } from '../../../context/ToastContext';
import { useAuth } from '../../../context/AuthContext';
import Modal from '../../../components/Modal';
import { dealersApi } from '../api';
import { INDIA_STATES } from '../indiaStates';

// onCreated(dealer) fires after the dealer is created AND any documents are uploaded.
export default function NewDealerModal({ onCreated, onClose }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '', contact: '', mobile: '', addr: '', city: '', state: '', pin: '', gstin: '',
    creditLimit: '', type: 'Retailer', assignedTo: user.role === 'field' ? user.name : '', referenceName: '',
  });
  const [users, setUsers] = useState([]);
  const [gstCertFile, setGstCertFile] = useState(null);
  const [aadharFile, setAadharFile] = useState(null);
  const [businessCardFile, setBusinessCardFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pinAutoFilled, setPinAutoFilled] = useState(false); // stops the lookup from clobbering a PIN the user typed themselves
  const lookupTimer = useRef(null);

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Once both city and state are filled in, look up the pincode (debounced,
  // so it doesn't fire on every keystroke). Never overwrites a PIN the user
  // already typed by hand — only fills it in while it's still empty or was
  // itself auto-filled.
  function onCityChange(e) {
    const city = e.target.value;
    setForm((f) => ({ ...f, city }));
    clearTimeout(lookupTimer.current);
    if (!city.trim() || !form.state) return;
    lookupTimer.current = setTimeout(async () => {
      try {
        const res = await dealersApi.pincodeLookup(city.trim(), form.state);
        if (res.pincode) {
          setForm((f) => (f.pin && !pinAutoFilled ? f : { ...f, pin: res.pincode }));
          setPinAutoFilled(true);
        }
      } catch { /* best-effort — pincode stays manually editable regardless */ }
    }, 600);
  }

  function onPinChange(e) {
    setPinAutoFilled(false); // once the user touches it directly, it's theirs
    setForm({ ...form, pin: e.target.value });
  }

  async function submit() {
    if (!form.name || !form.contact || !form.mobile || !form.addr) {
      return showToast('Business name, contact person, mobile, and address are required', 'err');
    }
    if (!form.gstin.trim()) return showToast('GSTIN is required', 'err');

    setSaving(true);
    try {
      let dealer = await dealersApi.create({
        ...form,
        creditLimit: form.creditLimit ? +form.creditLimit : 0,
      });

      if (gstCertFile) {
        const gstFd = new FormData();
        gstFd.append('file', gstCertFile);
        dealer = await dealersApi.uploadDoc(dealer.code, 'gst-cert', gstFd);
      }
      if (aadharFile) {
        const aadharFd = new FormData();
        aadharFd.append('file', aadharFile);
        dealer = await dealersApi.uploadDoc(dealer.code, 'aadhar', aadharFd);
      }
      if (businessCardFile) {
        const cardFd = new FormData();
        cardFd.append('file', businessCardFile);
        dealer = await dealersApi.uploadDoc(dealer.code, 'business-card', cardFd);
      }

      showToast(`Dealer ${dealer.code} created`, 'g');
      onCreated(dealer);
    } catch (err) {
      if (err.status === 409 && err.data?.existingDealer) {
        showToast(`Dealer already exists — selected "${err.data.existingDealer.name}" instead`, 'y');
        onCreated(err.data.existingDealer);
        return;
      }
      showToast(err.message, 'err');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New dealer" onClose={onClose}>
      <div className="row2">
        <div className="fg"><label>Business name *</label><input value={form.name} onChange={set('name')} /></div>
        <div className="fg"><label>Contact person *</label><input value={form.contact} onChange={set('contact')} /></div>
      </div>
      <div className="row2">
        <div className="fg"><label>Mobile *</label><input value={form.mobile} onChange={set('mobile')} /></div>
        <div className="fg"><label>Dealer type</label>
          <select value={form.type} onChange={set('type')}>
            <option>Retailer</option><option>Wholesaler</option><option>Distributor</option><option>Retail+Wholesale</option>
          </select>
        </div>
      </div>
      <div className="fg"><label>Address *</label><textarea value={form.addr} onChange={set('addr')} /></div>
      <div className="row3">
        <div className="fg"><label>State</label>
          <select value={form.state} onChange={set('state')}>
            <option value="">— Select state —</option>
            {INDIA_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="fg"><label>City</label><input value={form.city} onChange={onCityChange} placeholder={form.state ? '' : 'Pick a state first'} /></div>
        <div className="fg"><label>Pin {pinAutoFilled && form.pin && <span className="muted" style={{ fontWeight: 400, fontSize: 10 }}>(auto — edit if wrong)</span>}</label>
          <input value={form.pin} onChange={onPinChange} />
        </div>
      </div>
      <div className="row2">
        <div className="fg"><label>GSTIN *</label><input value={form.gstin} onChange={set('gstin')} placeholder="e.g. 23AAECG1234R1ZK" /></div>
        <div className="fg"><label>Max credit limit ₹ (optional)</label><input type="number" value={form.creditLimit} onChange={set('creditLimit')} /></div>
      </div>

      <div className="row2">
        <div className="fg">
          <label>Assigned salesperson (this party belongs to)</label>
          <select value={form.assignedTo} onChange={set('assignedTo')} disabled={user.role === 'field'}>
            <option value="">— Unassigned —</option>
            {users.map((u) => <option key={u._id} value={u.name}>{u.name} ({u.role})</option>)}
          </select>
        </div>
        <div className="fg"><label>Reference (optional)</label><input value={form.referenceName} onChange={set('referenceName')} placeholder="Who referred this dealer, if anyone" /></div>
      </div>

      <div className="row3">
        <div className="fg">
          <label>GST certificate (optional — PDF or image)</label>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setGstCertFile(e.target.files[0])} />
        </div>
        <div className="fg">
          <label>Aadhaar card (optional — PDF or image)</label>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setAadharFile(e.target.files[0])} />
        </div>
        <div className="fg">
          <label>Business card (optional — PDF or image)</label>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setBusinessCardFile(e.target.files[0])} />
        </div>
      </div>

      <div className="btnrow">
        <button className="btn" disabled={saving} onClick={submit}>{saving ? 'Creating…' : 'Create dealer'}</button>
        <button className="btn o" disabled={saving} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

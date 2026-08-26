import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';
import { useAuth } from '../context/AuthContext';
import Modal from './Modal';

// onCreated(dealer) fires after the dealer is created AND any documents are uploaded.
export default function NewDealerModal({ onCreated, onClose }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: '', contact: '', mobile: '', addr: '', city: '', state: '', pin: '', gstin: '',
    creditLimit: '', type: 'Retailer', assignedTo: user.role === 'field' ? user.name : '',
  });
  const [users, setUsers] = useState([]);
  const [gstCertFile, setGstCertFile] = useState(null);
  const [aadharFile, setAadharFile] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit() {
    if (!form.name || !form.contact || !form.mobile || !form.addr) {
      return showToast('Business name, contact person, mobile, and address are required', 'err');
    }
    if (!form.gstin.trim()) return showToast('GSTIN is required', 'err');

    setSaving(true);
    try {
      let dealer = await api.post('/dealers', {
        ...form,
        creditLimit: form.creditLimit ? +form.creditLimit : 0,
      });

      if (gstCertFile) {
        const gstFd = new FormData();
        gstFd.append('file', gstCertFile);
        dealer = await api.putForm(`/dealers/${dealer.code}/gst-cert`, gstFd);
      }
      if (aadharFile) {
        const aadharFd = new FormData();
        aadharFd.append('file', aadharFile);
        dealer = await api.putForm(`/dealers/${dealer.code}/aadhar`, aadharFd);
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
        <div className="fg"><label>City</label><input value={form.city} onChange={set('city')} /></div>
        <div className="fg"><label>State</label><input value={form.state} onChange={set('state')} /></div>
        <div className="fg"><label>Pin</label><input value={form.pin} onChange={set('pin')} /></div>
      </div>
      <div className="row2">
        <div className="fg"><label>GSTIN *</label><input value={form.gstin} onChange={set('gstin')} placeholder="e.g. 23AAECG1234R1ZK" /></div>
        <div className="fg"><label>Max credit limit ₹ (optional)</label><input type="number" value={form.creditLimit} onChange={set('creditLimit')} /></div>
      </div>

      <div className="fg">
        <label>Assigned salesperson (this party belongs to)</label>
        <select value={form.assignedTo} onChange={set('assignedTo')} disabled={user.role === 'field'}>
          <option value="">— Unassigned —</option>
          {users.map((u) => <option key={u._id} value={u.name}>{u.name} ({u.role})</option>)}
        </select>
      </div>

      <div className="row2">
        <div className="fg">
          <label>GST certificate (optional — PDF or image)</label>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setGstCertFile(e.target.files[0])} />
        </div>
        <div className="fg">
          <label>Aadhaar card (optional — PDF or image)</label>
          <input type="file" accept=".pdf,image/*" onChange={(e) => setAadharFile(e.target.files[0])} />
        </div>
      </div>

      <div className="btnrow">
        <button className="btn" disabled={saving} onClick={submit}>{saving ? 'Creating…' : 'Create dealer'}</button>
        <button className="btn o" disabled={saving} onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

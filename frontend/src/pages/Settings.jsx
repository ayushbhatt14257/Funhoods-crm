import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useToast } from '../context/ToastContext';

export default function Settings() {
  const { showToast } = useToast();
  const [form, setForm] = useState(null);

  useEffect(() => { api.get('/settings').then(setForm); }, []);

  async function save() {
    try { await api.put('/settings', form); showToast('Settings saved', 'g'); }
    catch (err) { showToast(err.message, 'err'); }
  }

  if (!form) return null;
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div>
      <div className="ph"><div className="eyebrow">Prints on every PI + Tax Invoice</div><h2>Company Settings</h2></div>
      <div className="card">
        <div className="row2">
          <div className="fg"><label>Company name</label><input value={form.company} onChange={set('company')} /></div>
          <div className="fg"><label>GSTIN</label><input value={form.gstin} onChange={set('gstin')} /></div>
        </div>
        <div className="fg"><label>Address</label><textarea value={form.address} onChange={set('address')} /></div>
        <div className="row2">
          <div className="fg"><label>Phone</label><input value={form.phone} onChange={set('phone')} /></div>
          <div className="fg"><label>Email</label><input value={form.email} onChange={set('email')} /></div>
        </div>
        <div className="row2">
          <div className="fg"><label>Bank name</label><input value={form.bankName} onChange={set('bankName')} /></div>
          <div className="fg"><label>A/C No</label><input value={form.bankAccount} onChange={set('bankAccount')} /></div>
        </div>
        <div className="row2">
          <div className="fg"><label>IFSC</label><input value={form.bankIFSC} onChange={set('bankIFSC')} /></div>
          <div className="fg"><label>Branch</label><input value={form.bankBranch} onChange={set('bankBranch')} /></div>
        </div>
        <div className="fg"><label>UPI ID</label><input value={form.upiId} onChange={set('upiId')} /></div>
        <button className="btn" onClick={save}>Save</button>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';

const ROLES = ['field', 'mhead', 'accounts', 'dispatch', 'delivery', 'admin', 'masterAdmin'];

// masterAdmin-only team management — creating users, changing roles, and
// activating/deactivating. Login is OTP-only, so there's no password to
// set or reset here; the mobile number IS the credential.
export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState(null); // null = loading
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', mobile: '', email: '', role: 'field' });

  async function load() { setUsers(await api.get('/users')); }
  useEffect(() => { load(); }, []);

  async function createUser() {
    if (!newForm.name || !newForm.mobile) return showToast('Name and mobile required', 'err');
    try {
      const res = await api.post('/users', newForm);
      showToast(`${res.name} created — they can sign in with OTP using ${res.mobile}`, 'g');
      setNewForm({ name: '', mobile: '', email: '', role: 'field' });
      setShowNew(false);
      load();
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function setRole(id, role) {
    try { await api.patch(`/users/${id}/role`, { role }); showToast('Role updated', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function toggleActive(u) {
    try { await api.patch(`/users/${u._id}/active`, { active: !u.active }); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  async function removeUser(id) {
    if (!confirm('Delete this user? They will no longer be able to log in.')) return;
    try { await api.del(`/users/${id}`); showToast('User deleted', 'g'); load(); }
    catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Team access</div><h2>Users</h2></div>

      <div className="btnrow" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => setShowNew(true)}>+ New user</button>
      </div>

      {showNew && (
        <Modal title="Create user" onClose={() => setShowNew(false)}>
          <div className="row2">
            <div className="fg"><label>Full name</label><input value={newForm.name} onChange={(e) => setNewForm({ ...newForm, name: e.target.value })} /></div>
            <div className="fg"><label>Mobile</label><input value={newForm.mobile} onChange={(e) => setNewForm({ ...newForm, mobile: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="fg"><label>Email (optional)</label><input value={newForm.email} onChange={(e) => setNewForm({ ...newForm, email: e.target.value })} /></div>
            <div className="fg"><label>Role</label>
              <select value={newForm.role} onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}>
                {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          </div>
          <div className="note b" style={{ fontSize: 12 }}>They'll sign in with OTP using this mobile number — no password needed.</div>
          <div className="btnrow">
            <button className="btn" onClick={createUser}>Create</button>
            <button className="btn o" onClick={() => setShowNew(false)}>Cancel</button>
          </div>
        </Modal>
      )}

      {users === null ? (
        <div className="empty">Loading users…</div>
      ) : (
        <div className="tblwrap">
          <table className="dt">
            <thead><tr><th>Name</th><th>Mobile</th><th>Role</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>{u.name}</td>
                  <td className="mono">{u.mobile}</td>
                  <td>
                    <select value={u.role} onChange={(e) => setRole(u._id, e.target.value)} style={{ padding: '4px 8px', fontSize: 12 }}>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td><span className={`badge ${u.active ? 'g' : 'r'}`}>{u.active ? 'Active' : 'Inactive'}</span></td>
                  <td style={{ display: 'flex', gap: 6 }}>
                    <button className="btn o sm" onClick={() => toggleActive(u)}>{u.active ? 'Deactivate' : 'Activate'}</button>
                    <button className="btn rd sm" onClick={() => removeUser(u._id)}>Delete</button>
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={5}><div className="empty">No users yet</div></td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

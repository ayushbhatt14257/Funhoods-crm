import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import Modal from '../../components/Modal';

const ROLES = ['field', 'mhead', 'accounts', 'dispatch', 'delivery', 'admin', 'masterAdmin'];

// masterAdmin-only team management — creating users, changing roles,
// activating/deactivating, and resetting passwords. Nothing here is
// self-service (that's Profile); this page is purely about managing everyone else.
export default function Users() {
  const { showToast } = useToast();
  const [users, setUsers] = useState(null); // null = loading
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', mobile: '', email: '', role: 'field' });
  const [createdCred, setCreatedCred] = useState(null); // { mobile, tempPassword } shown once
  const [resetTarget, setResetTarget] = useState(null); // user object mid-reset
  const [resetPw, setResetPw] = useState('');

  async function load() { setUsers(await api.get('/users')); }
  useEffect(() => { load(); }, []);

  async function createUser() {
    if (!newForm.name || !newForm.mobile) return showToast('Name and mobile required', 'err');
    try {
      const res = await api.post('/users', newForm);
      setCreatedCred({ mobile: res.mobile, tempPassword: res.tempPassword, name: res.name });
      setNewForm({ name: '', mobile: '', email: '', role: 'field' });
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

  async function submitReset() {
    if (resetPw.length < 6) return showToast('Password must be at least 6 characters', 'err');
    try {
      await api.patch(`/users/${resetTarget._id}/reset-password`, { newPassword: resetPw });
      showToast(`Password set for ${resetTarget.name}`, 'g');
      setResetTarget(null);
      setResetPw('');
    } catch (err) { showToast(err.message, 'err'); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Team access</div><h2>Users</h2></div>

      <div className="btnrow" style={{ marginBottom: 14 }}>
        <button className="btn" onClick={() => { setShowNew(true); setCreatedCred(null); }}>+ New user</button>
      </div>

      {showNew && (
        <Modal title="Create user" onClose={() => setShowNew(false)}>
          {createdCred ? (
            <div className="note g">
              <b>{createdCred.name}</b> created.<br />
              Mobile: <b>{createdCred.mobile}</b><br />
              Temp password: <b>{createdCred.tempPassword}</b><br />
              <span style={{ fontSize: 11 }}>Copy this now — it won't be shown again. Tell them to change it after first login.</span>
              <div className="btnrow"><button className="btn o sm" onClick={() => { setShowNew(false); setCreatedCred(null); }}>Done</button></div>
            </div>
          ) : (
            <>
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
              <div className="btnrow">
                <button className="btn" onClick={createUser}>Create</button>
                <button className="btn o" onClick={() => setShowNew(false)}>Cancel</button>
              </div>
            </>
          )}
        </Modal>
      )}

      {resetTarget && (
        <Modal title={`Reset password — ${resetTarget.name}`} onClose={() => { setResetTarget(null); setResetPw(''); }}>
          <div className="fg">
            <label>New password (min 6 chars)</label>
            <input type="text" value={resetPw} onChange={(e) => setResetPw(e.target.value)} autoFocus placeholder="Type the password to set" />
          </div>
          <div className="btnrow">
            <button className="btn" onClick={submitReset}>Set password</button>
            <button className="btn o" onClick={() => { setResetTarget(null); setResetPw(''); }}>Cancel</button>
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
                    <button className="btn o sm" onClick={() => { setResetTarget(u); setResetPw(''); }}>Reset pwd</button>
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

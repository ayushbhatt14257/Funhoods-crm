import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const ROLES = ['field', 'mhead', 'accounts', 'dispatch', 'founder'];

export default function Users() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const isFounder = user.role === 'founder';

  const [users, setUsers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [newForm, setNewForm] = useState({ name: '', mobile: '', email: '', role: 'field' });
  const [createdCred, setCreatedCred] = useState(null); // { mobile, tempPassword } shown once

  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [pwSaving, setPwSaving] = useState(false);

  async function load() {
    if (!isFounder) return;
    setUsers(await api.get('/users'));
  }
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

  async function resetPassword(id) {
    try {
      const res = await api.patch(`/users/${id}/reset-password`);
      alert(`New temporary password: ${res.tempPassword}\n\nCopy this now — it won't be shown again.`);
    } catch (err) { showToast(err.message, 'err'); }
  }

  async function changeMyPassword() {
    if (!curPw || !newPw) return showToast('Fill both fields', 'err');
    setPwSaving(true);
    try {
      await api.patch('/users/me/password', { currentPassword: curPw, newPassword: newPw });
      showToast('Password changed', 'g');
      setCurPw(''); setNewPw('');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setPwSaving(false); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Team access</div><h2>Users</h2></div>

      <div className="card" style={{ maxWidth: 420 }}>
        <h3 style={{ marginBottom: 8 }}>Change my password</h3>
        <div className="fg"><label>Current password</label><input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} /></div>
        <div className="fg"><label>New password (min 6 chars)</label><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
        <button className="btn" disabled={pwSaving} onClick={changeMyPassword}>Update password</button>
      </div>

      {isFounder && (
        <>
          <div className="btnrow" style={{ marginTop: 6, marginBottom: 14 }}>
            <button className="btn" onClick={() => { setShowNew(true); setCreatedCred(null); }}>+ New user</button>
          </div>

          {showNew && (
            <div className="card" style={{ maxWidth: 480 }}>
              <h3 style={{ marginBottom: 8 }}>Create user</h3>
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
            </div>
          )}

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
                      <button className="btn o sm" onClick={() => resetPassword(u._id)}>Reset pwd</button>
                      <button className="btn rd sm" onClick={() => removeUser(u._id)}>Delete</button>
                    </td>
                  </tr>
                ))}
                {!users.length && <tr><td colSpan={5}><div className="empty">No users yet</div></td></tr>}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

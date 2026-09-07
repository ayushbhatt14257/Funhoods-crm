import { useState } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// Every role's personal account page. Just password change for now — the
// natural home for anything else "about me" that gets added later (contact
// details, notification preferences, etc).
export default function Profile() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [saving, setSaving] = useState(false);

  async function changePassword() {
    if (!curPw || !newPw) return showToast('Fill both fields', 'err');
    setSaving(true);
    try {
      await api.patch('/users/me/password', { currentPassword: curPw, newPassword: newPw });
      showToast('Password changed', 'g');
      setCurPw(''); setNewPw('');
    } catch (err) { showToast(err.message, 'err'); }
    finally { setSaving(false); }
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">My account</div><h2>Profile</h2></div>

      <div className="card" style={{ maxWidth: 420 }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
          <div className="muted" style={{ fontSize: 12.5 }}>{user.mobile}{user.email ? ` · ${user.email}` : ''}</div>
          <span className="badge" style={{ marginTop: 4 }}>{user.role}</span>
        </div>

        <h3 style={{ marginBottom: 8 }}>Change password</h3>
        <div className="fg"><label>Current password</label><input type="password" value={curPw} onChange={(e) => setCurPw(e.target.value)} /></div>
        <div className="fg"><label>New password (min 6 chars)</label><input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></div>
        <button className="btn" disabled={saving} onClick={changePassword}>{saving ? 'Saving…' : 'Update password'}</button>
      </div>
    </div>
  );
}

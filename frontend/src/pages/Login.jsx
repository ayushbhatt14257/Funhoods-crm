import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { login } = useAuth();
  const { showToast } = useToast();
  const nav = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(identifier, password);
      nav('/');
    } catch (err) {
      showToast(err.message, 'err');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="loginwrap">
      <div className="logincard">
        <img src="/funhoods-logo.jpg" alt="Funhoods" />
        <div className="sub">CRM · ORDER · INVOICE · DISPATCH</div>
        <form onSubmit={submit}>
          <div className="fg">
            <label>Mobile or email</label>
            <input value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="9000000008" required />
          </div>
          <div className="fg">
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  );
}

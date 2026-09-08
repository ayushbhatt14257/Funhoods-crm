import { useAuth } from '../../context/AuthContext';

// Every role's personal account page. Login is OTP-only now, so there's no
// password to change here — just account info for now, with room to grow later.
export default function Profile() {
  const { user } = useAuth();

  return (
    <div>
      <div className="ph"><div className="eyebrow">My account</div><h2>Profile</h2></div>

      <div className="card" style={{ maxWidth: 420 }}>
        <div style={{ fontWeight: 600, fontSize: 15 }}>{user.name}</div>
        <div className="muted" style={{ fontSize: 12.5 }}>{user.mobile}{user.email ? ` · ${user.email}` : ''}</div>
        <span className="badge" style={{ marginTop: 4 }}>{user.role}</span>
      </div>
    </div>
  );
}

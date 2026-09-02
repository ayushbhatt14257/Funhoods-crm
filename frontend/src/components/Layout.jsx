import { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import NotificationBell from '../features/notifications/NotificationBell';

const NAV = [
  { group: 'Overview' },
  { to: '/', label: 'Dashboard', icon: '📊', roles: ['field', 'mhead', 'accounts', 'dispatch', 'founder'] },
  { group: 'Orders' },
  { to: '/new-order', label: 'New Order', icon: '✎', roles: ['field', 'mhead', 'accounts', 'founder'] },
  { to: '/pis', label: 'PIs', icon: '📋', roles: ['field', 'mhead', 'accounts', 'dispatch', 'founder'] },
  { to: '/pipeline', label: 'Pipeline', icon: '🧭', roles: ['field', 'mhead', 'accounts', 'dispatch', 'founder'] },
  { group: 'Fulfilment' },
  { to: '/dispatch', label: 'Dispatch', icon: '🚚', roles: ['dispatch', 'accounts', 'founder'] },
  { to: '/invoices', label: 'Tax Invoices', icon: '🧾', roles: ['mhead', 'accounts', 'dispatch', 'founder'] },
  { group: 'Masters' },
  { to: '/dealers', label: 'Customers', icon: '👥', roles: ['field', 'mhead', 'accounts', 'founder'] },
  { to: '/outstanding', label: 'Outstanding', icon: '💰', roles: ['mhead', 'accounts', 'founder'] },
  { to: '/products', label: 'Products', icon: '📦', roles: ['mhead', 'accounts', 'founder'] },
  { to: '/aliases', label: 'SKU nicknames', icon: '🏷️', roles: ['mhead', 'accounts', 'founder'] },
  { to: '/inventory', label: 'Inventory', icon: '📊', roles: ['field', 'mhead', 'accounts', 'dispatch', 'founder'] },
  { group: 'Setup' },
  { to: '/import', label: 'Bulk Import', icon: '⬆️', roles: ['mhead', 'accounts', 'founder'] },
  { to: '/settings', label: 'Company Settings', icon: '⚙️', roles: ['founder'] },
  { to: '/users', label: 'Users', icon: '👤', roles: ['field', 'mhead', 'accounts', 'dispatch', 'founder'] },
  { to: '/notifications', label: 'Notifications', icon: '🔔', roles: ['founder'] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Safety net: if no modal is actually open on the page, the body should never
    // be scroll-locked. Clears any leftover lock from an edge case (e.g. a modal
    // unmounting without its cleanup running) whenever the route changes.
    if (!document.querySelector('.modal')) {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.width = '';
    }
  }, [location.pathname]);

  return (
    <div className="applayout">
      <div className={`sidebackdrop ${open ? 'on' : ''}`} onClick={() => setOpen(false)} />
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand" style={{ justifyContent: 'space-between' }}>
          <span style={{ background: '#fff', borderRadius: 6, padding: '3px 7px' }}>
            <img src="/funhoods-logo.jpg" alt="Funhoods" />
          </span>
          {user.role === 'founder' && <NotificationBell />}
        </div>
        <nav className="sidenav">
          {NAV.map((item, i) =>
            item.group ? (
              <div className="group" key={i}>{item.group}</div>
            ) : item.roles.includes(user.role) ? (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) => (isActive ? 'on' : '')}
                onClick={() => setOpen(false)}
              >
                <span className="ic">{item.icon}</span> <span>{item.label}</span>
              </NavLink>
            ) : null
          )}
        </nav>
        <div className="sideuser">
          <div>
            <div className="n">{user.name}</div>
            <div className="r">{user.role}</div>
          </div>
          <button onClick={() => { logout(); nav('/login'); }}>Logout</button>
        </div>
      </aside>
      <div className="appmain">
        <div className="topbar-mobile">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ background: '#fff', borderRadius: 6, padding: '3px 7px', display: 'inline-flex' }}>
              <img src="/funhoods-logo.jpg" alt="Funhoods" style={{ height: 18 }} />
            </span>
            <span>CRM</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {user.role === 'founder' && <NotificationBell />}
            <button className="hburger" onClick={() => setOpen((o) => !o)}>☰ Menu</button>
          </div>
        </div>
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

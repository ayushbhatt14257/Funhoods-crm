import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

// Maps a notification's type to which tab it shows under.
const TABS = [
  { key: 'all', label: 'All', types: null },
  { key: 'price', label: 'Price', types: ['rate_edit'] },
  { key: 'delivery', label: 'Delivery', types: ['dispatched', 'delivered', 'dispatch_overdue'] },
  { key: 'payment', label: 'Payment Due', types: ['payment_due'] },
  { key: 'other', label: 'Other', types: ['other'] },
];

// dispatched/delivered/payment_due/dispatch_overdue notifications relate to a
// Tax Invoice; rate_edit relates to a PI. relatedKind (added alongside the new
// types) tells us which; older records without it default to PI for back-compat.
function linkFor(n) {
  if (!n.relatedNo) return null;
  const kind = n.relatedKind || (n.type === 'rate_edit' ? 'pi' : n.type === 'other' ? '' : 'invoice');
  if (kind === 'invoice') return `/invoices/${n.relatedNo}`;
  if (kind === 'pi') return `/pis/${n.relatedNo}`;
  return null;
}

const typeBadge = (t) => (
  t === 'payment_due' ? 'r' : t === 'dispatch_overdue' ? 'y' : t === 'delivered' ? 'g' : t === 'dispatched' ? 'b' : ''
);

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState('all');

  async function load() { setItems(await api.get('/notifications')); }
  useEffect(() => { load(); }, []);

  async function markAllRead() {
    await api.patch('/notifications/mark-all-read');
    load();
  }

  async function markOneRead(id) {
    await api.patch(`/notifications/${id}/read`);
    load();
  }

  const activeTab = TABS.find((t) => t.key === tab);
  const filtered = activeTab.types ? items.filter((n) => activeTab.types.includes(n.type)) : items;
  const countFor = (t) => (t.types ? items.filter((n) => t.types.includes(n.type) && !n.read).length : items.filter((n) => !n.read).length);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Alerts</div><h2>Notifications</h2>
        <p>Rate edits, dispatch &amp; delivery updates, and payment-due reminders that need your attention.</p></div>

      <div className="subtabs" style={{ marginBottom: 14, flexWrap: 'wrap' }}>
        {TABS.map((t) => {
          const c = countFor(t);
          return (
            <button key={t.key} className={tab === t.key ? 'on' : ''} onClick={() => setTab(t.key)}>
              {t.label}{c > 0 ? ` (${c})` : ''}
            </button>
          );
        })}
      </div>

      {filtered.some((i) => !i.read) && (
        <div className="btnrow" style={{ marginBottom: 14 }}><button className="btn o sm" onClick={markAllRead}>Mark all read</button></div>
      )}
      {filtered.map((n) => {
        const link = linkFor(n);
        return (
          <div key={n._id} className={`note ${n.read ? '' : 'y'}`} style={{ fontSize: 13, cursor: n.read ? 'default' : 'pointer' }} onClick={() => !n.read && markOneRead(n._id)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <div>{n.message}</div>
              {n.type !== 'other' && <span className={`badge ${typeBadge(n.type)}`} style={{ flexShrink: 0, height: 'fit-content' }}>{n.type.replace('_', ' ')}</span>}
            </div>
            <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
              {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {link && <> · <Link to={link} onClick={(e) => e.stopPropagation()}>{n.relatedNo}</Link></>}
            </div>
          </div>
        );
      })}
      {!filtered.length && <div className="empty">No notifications {tab !== 'all' ? 'in this tab' : ''}</div>}
    </div>
  );
}

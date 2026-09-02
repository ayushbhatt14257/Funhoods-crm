import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';

export default function Notifications() {
  const [items, setItems] = useState([]);

  async function load() { setItems(await api.get('/notifications')); }
  useEffect(() => { load(); }, []);

  async function markAllRead() {
    await api.patch('/notifications/mark-all-read');
    load();
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Admin alerts</div><h2>Notifications</h2>
        <p>Rate edits on PIs, dispatch overdue alerts, and other things that need your attention.</p></div>
      {items.some((i) => !i.read) && (
        <div className="btnrow" style={{ marginBottom: 14 }}><button className="btn o sm" onClick={markAllRead}>Mark all read</button></div>
      )}
      {items.map((n) => (
        <div key={n._id} className={`note ${n.read ? '' : 'y'}`} style={{ fontSize: 13 }}>
          <div>{n.message}</div>
          <div className="mono muted" style={{ fontSize: 10.5, marginTop: 4 }}>
            {new Date(n.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            {n.relatedNo && <> · <Link to={`/pis/${n.relatedNo}`}>{n.relatedNo}</Link></>}
          </div>
        </div>
      ))}
      {!items.length && <div className="empty">No notifications</div>}
    </div>
  );
}

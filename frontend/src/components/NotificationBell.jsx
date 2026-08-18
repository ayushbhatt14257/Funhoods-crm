import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function NotificationBell() {
  const [count, setCount] = useState(0);
  const nav = useNavigate();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await api.get('/notifications/unread-count');
        if (!cancelled) setCount(res.count);
      } catch {
        // ignore — non-critical background poll
      }
    }
    poll();
    const id = setInterval(poll, 30000); // check every 30s
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return (
    <button
      onClick={() => nav('/notifications')}
      title="Notifications"
      style={{
        position: 'relative', background: 'rgba(255,255,255,.15)', border: 'none',
        borderRadius: 8, width: 34, height: 34, cursor: 'pointer', fontSize: 16,
        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'inherit',
      }}
    >
      🔔
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -4, right: -4, background: 'var(--red)', color: '#fff',
          fontSize: 9.5, fontWeight: 700, borderRadius: 9, minWidth: 16, height: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px',
          fontFamily: 'var(--mono)',
        }}>
          {count > 9 ? '9+' : count}
        </span>
      )}
    </button>
  );
}

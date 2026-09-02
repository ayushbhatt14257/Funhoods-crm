import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api/client';
import Loading from '../../components/Loading';
import { invoicesApi } from './api';
import { piApi } from '../pi/api';
import InvoiceFlatList from './components/InvoiceFlatList';
import InvoicesByPI from './components/InvoicesByPI';
import InvoicesByCustomer from './components/InvoicesByCustomer';

const STATUSES = ['Dispatched', 'Delivered', 'Cancelled'];

export default function Invoices() {
  const [searchParams] = useSearchParams();
  const [invoices, setInvoices] = useState(null);
  const [users, setUsers] = useState([]);
  const [q, setQ] = useState('');
  // Pre-filled from a dashboard stat-card link
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [by, setBy] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [view, setView] = useState('flat'); // 'flat' | 'byPI' | 'byCustomer'
  const [pisByNo, setPisByNo] = useState(null); // loaded only when the grouped-by-PI view is opened

  useEffect(() => { api.get('/users/names').then(setUsers); }, []);

  useEffect(() => {
    setInvoices(null);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (status) params.set('status', status);
    if (by) params.set('by', by);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    invoicesApi.list(params.toString()).then(setInvoices);
  }, [q, status, by, from, to]);

  useEffect(() => {
    if (view === 'byPI' && pisByNo === null) {
      piApi.list().then((pis) => setPisByNo(Object.fromEntries(pis.map((p) => [p.no, p]))));
    }
  }, [view, pisByNo]);

  return (
    <div>
      <div className="ph"><div className="eyebrow">Goods dispatched</div><h2>Tax Invoices</h2></div>
      {status.includes(',') && (
        <div className="note b" style={{ fontSize: 12, marginBottom: 10 }}>
          Showing: {status.split(',').join(' + ')} · <button className="btn o sm" onClick={() => setStatus('')}>Clear filter</button>
        </div>
      )}
      <div className="subtabs" style={{ marginBottom: 14 }}>
        <button className={view === 'flat' ? 'on' : ''} onClick={() => setView('flat')}>Flat list</button>
        <button className={view === 'byPI' ? 'on' : ''} onClick={() => setView('byPI')}>Group by PI</button>
        <button className={view === 'byCustomer' ? 'on' : ''} onClick={() => setView('byCustomer')}>By customer</button>
      </div>
      <div className="row4" style={{ marginBottom: 14 }}>
        <input placeholder="Search invoice or dealer" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={by} onChange={(e) => setBy(e.target.value)}>
          <option value="">All users</option>
          {users.map((u) => <option key={u._id} value={u.name}>{u.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: 6 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} title="From date" />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} title="To date" />
        </div>
      </div>

      {invoices === null ? (
        <Loading label="Loading invoices…" />
      ) : view === 'flat' ? (
        <InvoiceFlatList invoices={invoices} />
      ) : view === 'byPI' ? (
        pisByNo === null ? <Loading label="Loading PI details…" /> : <InvoicesByPI invoices={invoices} pisByNo={pisByNo} />
      ) : (
        <InvoicesByCustomer invoices={invoices} />
      )}
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';

const STAGES = ['Draft', 'Sent', 'Confirmed', 'Invoiced (Packed)', 'Dispatched', 'Delivered', 'Paid'];

function daysAgo(dateStr) {
  return Math.floor((Date.now() - new Date(dateStr)) / 86400000);
}

// Maps a PI or Invoice into a single kanban "card" with its current stage.
// Mirrors the HTML demo's ordersByStage() logic: PI status drives Draft/Sent/Confirmed,
// Invoice status drives Invoiced/Dispatched/Delivered, and "Paid" is derived from ledger balance = 0.
function buildCards(pis, invoices, balances) {
  const cards = [];
  const balByDealer = Object.fromEntries(balances.map((b) => [b.code, b.balance]));

  pis.forEach((p) => {
    if (['Fully Dispatched', 'Cancelled'].includes(p.status)) return; // fully handled by its invoice(s) instead
    let stage = 'Draft';
    if (p.status === 'Sent') stage = 'Sent';
    else if (['Confirmed', 'Partial Dispatched'].includes(p.status)) stage = 'Confirmed';
    cards.push({
      kind: 'pi', id: p.no, dealerName: p.dealerName, val: p.total,
      when: p.updatedAt || p.createdAt, stage, age: daysAgo(p.updatedAt || p.createdAt),
    });
  });

  invoices.forEach((inv) => {
    if (inv.status === 'Cancelled') return;
    let stage = 'Dispatched';
    if (inv.status === 'Delivered') {
      const bal = balByDealer[inv.dealer];
      stage = bal !== undefined && bal <= 0 ? 'Paid' : 'Delivered';
    }
    cards.push({
      kind: 'invoice', id: inv.no, dealerName: inv.dealerName, val: inv.total,
      when: inv.updatedAt || inv.createdAt, stage, age: daysAgo(inv.updatedAt || inv.createdAt),
    });
  });

  return cards;
}

function StatSkeleton() {
  return (
    <div className="stat">
      <div className="skel" style={{ height: 22, width: '55%', marginBottom: 6 }} />
      <div className="skel" style={{ height: 11, width: '75%' }} />
    </div>
  );
}
function KanbanColSkeleton({ stage }) {
  return (
    <div className="kcol">
      <h5>{stage}<span className="n">·</span></h5>
      <div className="skel" style={{ height: 54, marginBottom: 7, borderRadius: 7 }} />
      <div className="skel" style={{ height: 54, marginBottom: 7, borderRadius: 7 }} />
    </div>
  );
}
function CardSkeleton() {
  return (
    <div className="card">
      <div className="skel" style={{ height: 15, width: '40%', marginBottom: 12 }} />
      <div className="skel" style={{ height: 11, width: '90%', marginBottom: 8 }} />
      <div className="skel" style={{ height: 11, width: '80%', marginBottom: 8 }} />
      <div className="skel" style={{ height: 11, width: '85%' }} />
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState(null);
  const [cards, setCards] = useState(null); // null = loading
  const [flags, setFlags] = useState(null);
  const [activity, setActivity] = useState(null);

  useEffect(() => {
    (async () => {
      const [pis, invoices, balances, dealers] = await Promise.all([
        api.get('/pi'), api.get('/invoices'), api.get('/ledger/balances'), api.get('/dealers'),
      ]);

      const openPIs = pis.filter((p) => ['Sent', 'Confirmed', 'Partial Dispatched'].includes(p.status));
      const openInvoices = invoices.filter((i) => !['Delivered', 'Cancelled'].includes(i.status));
      const pipeline = openPIs.reduce((s, p) => s + p.total, 0);
      const invoicedTotal = invoices.filter((i) => i.status !== 'Cancelled').reduce((s, i) => s + i.total, 0);
      const outstanding = balances.reduce((s, b) => s + b.balance, 0);

      setStats({ openPIs: openPIs.length, openInvoices: openInvoices.length, pipeline, invoicedTotal, outstanding });
      setCards(buildCards(pis, invoices, balances));

      // Founder flags — mirrors the HTML demo's three checks
      const flagList = [];
      const stalePIs = pis.filter((p) => p.status === 'Sent' && daysAgo(p.updatedAt || p.createdAt) > 3);
      if (stalePIs.length) flagList.push({ label: 'PIs sent but not confirmed >3 days', n: stalePIs.length, c: 'y' });
      const readyDispatch = pis.filter((p) => ['Confirmed', 'Partial Dispatched'].includes(p.status));
      if (readyDispatch.length) flagList.push({ label: 'PIs awaiting dispatch', n: readyDispatch.length, c: 'y' });
      const overdueDealers = balances.filter((b) => b.balance > 0 && b.oldestInvoiceAgeDays > 90);
      if (overdueDealers.length) flagList.push({ label: 'Dealers on HOLD (90+ days)', n: overdueDealers.length, c: 'r' });
      const overdueDispatch = invoices.filter((i) => i.status === 'Dispatched' && daysAgo(i.dispatchDate || i.createdAt) >= 7);
      if (overdueDispatch.length) flagList.push({ label: 'Dispatched 7+ days, not marked delivered', n: overdueDispatch.length, c: 'r' });
      setFlags(flagList);

      // Activity feed — most-recently-updated PIs and invoices, newest first (no dedicated audit log yet)
      const recent = [
        ...pis.map((p) => ({ action: `PI ${p.status}`, detail: `${p.no} · ${p.dealerName}`, who: p.by, ts: p.updatedAt || p.createdAt })),
        ...invoices.map((i) => ({ action: `Invoice ${i.status}`, detail: `${i.no} · ${i.dealerName}`, who: i.by, ts: i.updatedAt || i.createdAt })),
      ].sort((a, b) => new Date(b.ts) - new Date(a.ts)).slice(0, 7);
      setActivity(recent);
    })();
  }, []);

  function openCard(card) {
    if (card.kind === 'pi') nav(`/pis/${card.id}`);
    else nav(`/invoices/${card.id}`);
  }

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">Order Management System</div>
        <h2>Hello, {user.name.split(' ')[0]}</h2>
        <p>Every order at every stage. Click any card to open. Cards go orange after 3 days at the same stage, red after 7.</p>
      </div>

      <div className="stats">
        {stats ? (
          <>
            <div className="stat clickable" onClick={() => nav('/pis?status=Sent,Confirmed,Partial Dispatched')}>
              <div className="n">{stats.openPIs}</div><div className="l">Open PIs</div>
            </div>
            <div className="stat clickable" onClick={() => nav('/invoices?status=Dispatched')}>
              <div className="n">{stats.openInvoices}</div><div className="l">Open invoices</div>
            </div>
            <div className="stat clickable" onClick={() => nav('/pis?status=Sent,Confirmed,Partial Dispatched')}>
              <div className="n" style={{ color: 'var(--red)' }}>₹{Math.round(stats.pipeline).toLocaleString('en-IN')}</div><div className="l">Pipeline ₹</div>
            </div>
            <div className="stat clickable" onClick={() => nav('/invoices?status=Dispatched,Delivered')}>
              <div className="n">₹{Math.round(stats.invoicedTotal).toLocaleString('en-IN')}</div><div className="l">Invoiced ₹</div>
            </div>
            <div className="stat clickable" onClick={() => nav('/outstanding')}>
              <div className="n" style={{ color: stats.outstanding > 50000 ? 'var(--red)' : undefined }}>₹{Math.round(stats.outstanding).toLocaleString('en-IN')}</div><div className="l">Outstanding ₹</div>
            </div>
          </>
        ) : (
          <>{STAGES.slice(0, 5).map((s, i) => <StatSkeleton key={i} />)}</>
        )}
      </div>

      <div className="kanban">
        {cards === null
          ? STAGES.map((stage) => <KanbanColSkeleton key={stage} stage={stage} />)
          : STAGES.map((stage) => {
              const stageCards = cards.filter((c) => c.stage === stage).sort((a, b) => new Date(b.when) - new Date(a.when));
              return (
                <div className="kcol" key={stage}>
                  <h5>{stage}<span className="n">{stageCards.length}</span></h5>
                  {stageCards.slice(0, 8).map((c) => (
                    <div
                      key={c.kind + c.id}
                      className={`kcard ${c.age >= 7 ? 'hot' : c.age >= 3 ? 'warm' : ''}`}
                      onClick={() => openCard(c)}
                    >
                      <span className={`age ${c.age >= 7 ? 'late' : ''}`}>{c.age}d</span>
                      <div className="t">{c.dealerName}</div>
                      <div className="s">{c.id}</div>
                      <div className="v">₹{Math.round(c.val).toLocaleString('en-IN')}</div>
                    </div>
                  ))}
                  {!stageCards.length && <div className="empty" style={{ padding: 14, fontSize: 11 }}>—</div>}
                </div>
              );
            })}
      </div>

      <div className="grid2">
        {activity === null ? (
          <CardSkeleton />
        ) : (
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Latest activity</h3>
            {activity.length ? activity.map((a, i) => (
              <div className="activity-row" key={i}>
                <b>{a.action}</b> <span className="muted">· {a.detail}</span>
                <div className="meta">{a.who} · {new Date(a.ts).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            )) : <div className="empty">No activity yet — try New Order</div>}
          </div>
        )}
        {flags === null ? (
          <CardSkeleton />
        ) : (
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Founder flags</h3>
            {flags.length ? flags.map((f, i) => (
              <div className={`flag-row ${f.c}`} key={i}><div>{f.label}</div><div className="n">{f.n}</div></div>
            )) : <div className="empty">Everything clean</div>}
          </div>
        )}
      </div>
    </div>
  );
}

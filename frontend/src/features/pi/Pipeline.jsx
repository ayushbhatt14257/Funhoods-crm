import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { piApi } from './api';
import Loading from '../../components/Loading';

const OPEN_STATUSES = 'Sent,Confirmed,Partial Dispatched';

// The dashboard's "Pipeline ₹" / "Open PIs" cards land here: every open PI,
// grouped by dealer, with pending pieces aggregated per item across all of
// that dealer's open PIs (not just listed PI-by-PI) — so it directly answers
// "what does this party still need from us", and can be printed per dealer.
export default function Pipeline() {
  const nav = useNavigate();
  const [pis, setPis] = useState(null); // null = loading
  const [q, setQ] = useState('');

  useEffect(() => { piApi.list(`status=${OPEN_STATUSES}`).then(setPis); }, []);

  function buildGroups() {
    const groups = {}; // dealer code -> { name, assignedTo, pis[], items: {code: {name, pending}} }
    (pis || []).forEach((p) => {
      if (!groups[p.dealer]) groups[p.dealer] = { code: p.dealer, name: p.dealerName, assignedTo: p.dealerAssignedTo, pis: [], items: {} };
      const g = groups[p.dealer];
      g.pis.push(p);
      p.lines.forEach((l) => {
        const pending = l.pending != null ? l.pending : l.pcs;
        if (pending <= 0) return;
        if (!g.items[l.code]) g.items[l.code] = { code: l.code, name: l.name, photo: l.photo, pending: 0 };
        g.items[l.code].pending += pending;
      });
    });
    return Object.values(groups)
      .map((g) => ({
        ...g,
        items: Object.values(g.items).sort((a, b) => b.pending - a.pending),
        total: g.pis.reduce((s, p) => s + p.total, 0),
        latest: Math.max(...g.pis.map((p) => new Date(p.createdAt).getTime())),
      }))
      .filter((g) => !q || g.name.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.latest - a.latest);
  }

  return (
    <div>
      <div className="ph"><div className="eyebrow">Order pipeline</div><h2>Pipeline — open PIs by party</h2>
        <p>Every party with an open PI (Sent, Confirmed, or Partially Dispatched), with pending items aggregated across all their open orders.</p></div>
      <div className="row3" style={{ marginBottom: 14 }}>
        <input placeholder="Search party" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn o sm" onClick={() => nav('/pis')}>View flat PI list instead</button>
      </div>

      {pis === null ? (
        <Loading label="Loading pipeline…" />
      ) : (
        (() => {
          const groups = buildGroups();
          return (
            <>
              {groups.map((g) => <PartyPipelineCard key={g.code} group={g} />)}
              {!groups.length && <div className="empty">No open PIs {q ? 'match that search' : ''}</div>}
            </>
          );
        })()
      )}
    </div>
  );
}

function PartyPipelineCard({ group: g }) {
  const printAreaId = `print-area-${g.code}`;

  function printThis() {
    // Give this card's content #print-area for the duration of the print,
    // since the shared print stylesheet only shows the element with that id.
    const el = document.getElementById(printAreaId);
    el.id = 'print-area';
    window.print();
    el.id = printAreaId;
  }

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
        <div>
          <Link to={`/dealers/${g.code}`}><b>{g.name}</b></Link>{' '}
          <span className="mono muted" style={{ fontSize: 10 }}>{g.code}</span>
          {g.assignedTo && <span className="muted" style={{ fontSize: 12 }}> · {g.assignedTo}</span>}
        </div>
        <div className="btnrow" style={{ margin: 0 }}>
          <span className="muted" style={{ fontSize: 12, alignSelf: 'center' }}>{g.pis.length} open PI{g.pis.length > 1 ? 's' : ''} · ₹{Math.round(g.total).toLocaleString('en-IN')}</span>
          <button className="btn o sm" onClick={printThis}>🖨️ Print</button>
        </div>
      </div>

      <div id={printAreaId} className="print-target">
        <div className="print-only" style={{ marginBottom: 8 }}>
          <b>{g.name}</b> ({g.code}) — pending items across {g.pis.length} open PI{g.pis.length > 1 ? 's' : ''}
        </div>
        <div className="tblwrap" style={{ marginBottom: 10 }}>
          <table className="dt">
            <thead><tr><th></th><th>Item</th><th>Pending pcs (total)</th></tr></thead>
            <tbody>
              {g.items.map((it) => (
                <tr key={it.code}>
                  <td>{it.photo ? <img src={it.photo} alt="" style={{ width: 26, height: 26, borderRadius: 4, objectFit: 'cover' }} /> : '📦'}</td>
                  <td><b>{it.name}</b> <span className="mono muted" style={{ fontSize: 10 }}>{it.code}</span></td>
                  <td><b>{it.pending}</b></td>
                </tr>
              ))}
              {!g.items.length && <tr><td colSpan={3}><div className="empty">Nothing pending (fully reserved, awaiting dispatch elsewhere)</div></td></tr>}
            </tbody>
          </table>
        </div>
        <div style={{ fontSize: 12 }}>
          <b>PIs:</b>{' '}
          {g.pis.map((p, i) => (
            <span key={p.no}>
              <Link to={`/pis/${p.no}`} className="mono">{p.no}</Link>
              <span className={`badge ${p.status === 'Partial Dispatched' ? 'y' : 'g'}`} style={{ marginLeft: 4, marginRight: 8 }}>{p.status}</span>
              {i < g.pis.length - 1 ? '' : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

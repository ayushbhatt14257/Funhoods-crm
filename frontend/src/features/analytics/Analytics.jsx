import { useEffect, useRef, useState } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { firebaseAuth } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { analyticsApi, getAnalyticsSession, clearAnalyticsSession } from './analyticsApi';
import { productsApi } from '../products/api';
import { IndiaSvgMap } from 'vardhan-maps/react';
import { buildColorScale } from 'vardhan-maps/spec';

// Not a real security boundary by itself — the backend enforces this same
// check on every request (see analytics/routes.js) regardless of what this
// component decides to render. This just avoids showing the OTP gate at all
// to someone who could never pass it.
function useEligible() {
  const { user } = useAuth();
  return user?.role === 'masterAdmin' && !!user?.analyticsAccess;
}

function OtpGate({ onVerified }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null);
  const recaptchaRef = useRef(null);

  function getRecaptcha() {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, 'analytics-recaptcha-container', { size: 'invisible' });
    }
    return recaptchaRef.current;
  }

  // Sends straight to THIS account's own registered mobile — no number entry
  // step, since the backend will refuse an idToken for any other number anyway.
  async function sendOtp() {
    if (!user.mobile) return showToast('This account has no registered mobile number — ask a masterAdmin to add one before Analysis access can work.', 'err');
    setBusy(true);
    try {
      const result = await signInWithPhoneNumber(firebaseAuth, `+91${user.mobile}`, getRecaptcha());
      setConfirmation(result);
      showToast('OTP sent to ' + user.mobile, 'g');
    } catch (err) {
      showToast(err.message, 'err');
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally { setBusy(false); }
  }

  async function verify(e) {
    e.preventDefault();
    if (!otp.trim()) return showToast('Enter the OTP', 'err');
    setBusy(true);
    try {
      const cred = await confirmation.confirm(otp.trim());
      const idToken = await cred.user.getIdToken();
      await analyticsApi.verifyOtp(idToken);
      onVerified();
    } catch (err) {
      showToast(err.code === 'auth/invalid-verification-code' ? 'Wrong OTP — try again' : err.message, 'err');
    } finally { setBusy(false); }
  }

  useEffect(() => () => { recaptchaRef.current?.clear(); }, []);

  return (
    <div style={{ maxWidth: 420, margin: '60px auto' }}>
      <div className="card">
        <h3 style={{ marginTop: 0 }}>🔒 Verify to enter Analysis</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          This page holds company-wide sales, dealer, and financial data. Verifying takes one minute
          and unlocks the page for the next 24 hours.
        </p>
        {!confirmation ? (
          <button className="btn" style={{ width: '100%' }} disabled={busy} onClick={sendOtp}>
            {busy ? 'Sending…' : `Send OTP to ${user.mobile || 'your registered number'}`}
          </button>
        ) : (
          <form onSubmit={verify}>
            <div className="fg">
              <label>Enter the OTP sent to {user.mobile}</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" autoFocus />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>{busy ? 'Verifying…' : 'Verify & enter'}</button>
            <button type="button" className="btn o sm" style={{ width: '100%', marginTop: 8 }} onClick={() => { setConfirmation(null); setOtp(''); }}>← Resend</button>
          </form>
        )}
        <div id="analytics-recaptcha-container" />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }) {
  return (
    <div className="card" style={{ padding: '10px 16px', minWidth: 140 }}>
      <b style={{ fontSize: 20 }}>{value}</b>
      <div className="muted" style={{ fontSize: 11 }}>{label}</div>
      {sub && <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Bar({ pct, color = 'var(--spruce)' }) {
  return (
    <div style={{ background: 'var(--paper-d)', borderRadius: 4, height: 8, width: 120, overflow: 'hidden' }}>
      <div style={{ background: color, height: '100%', width: `${Math.min(100, Math.max(0, pct || 0))}%` }} />
    </div>
  );
}

const inr = (n) => `₹${Math.round(n || 0).toLocaleString('en-IN')}`;

function SalesSection() {
  const [data, setData] = useState(null);
  const [months, setMonths] = useState(12);
  const [locationView, setLocationView] = useState('combined'); // 'combined' | 'city' | 'state'
  useEffect(() => { analyticsApi.sales(months).then(setData).catch(() => {}); }, [months]);
  if (!data) return <div className="empty">Loading…</div>;
  return (
    <div>
      <div className="btnrow" style={{ marginBottom: 12 }}>
        {[3, 6, 12, 24].map((m) => (
          <button key={m} className={months === m ? 'btn sm' : 'btn o sm'} onClick={() => setMonths(m)}>{m}mo</button>
        ))}
      </div>

      <h4>Repeat item count (all products)</h4>
      <table className="dt"><thead><tr><th>Code</th><th>Product</th><th># invoices reordered on</th><th>Dispatched (all-time)</th></tr></thead>
        <tbody>{data.repeatItems.map((r) => (
          <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td>{r.invoiceCount}</td><td>{(r.pcsAllTime || 0).toLocaleString('en-IN')} pcs</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Dealer order frequency (top 30, orders/month)</h4>
      <table className="dt"><thead><tr><th>Dealer</th><th>Orders/mo</th><th>Total orders</th><th>Months active</th></tr></thead>
        <tbody>{data.dealerFrequency.map((r) => (
          <tr key={r.dealer}><td className="mono">{r.dealer}</td><td>{r.ordersPerMonth}</td><td>{r.totalOrders}</td><td>{r.monthsActive}</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>City/state order volume</h4>
      <p className="muted" style={{ fontSize: 12 }}>Merged by city/state spelled the same way (case and spacing ignored) — a genuinely different spelling or abbreviation (e.g. "UP" vs "Uttar Pradesh") still shows as a separate row, since merging those automatically risks combining two different places.</p>
      <div className="btnrow" style={{ marginBottom: 8 }}>
        <button className={locationView === 'combined' ? 'btn sm' : 'btn o sm'} onClick={() => setLocationView('combined')}>City + State</button>
        <button className={locationView === 'city' ? 'btn sm' : 'btn o sm'} onClick={() => setLocationView('city')}>By City</button>
        <button className={locationView === 'state' ? 'btn sm' : 'btn o sm'} onClick={() => setLocationView('state')}>By State</button>
      </div>
      {locationView === 'combined' && (
        <table className="dt"><thead><tr><th>Location</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>{data.locationVolume.map((r) => (
            <tr key={r.city + r.state}><td>{r.city}, {r.state}</td><td>{r.orders}</td><td>{inr(r.revenue)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {locationView === 'city' && (
        <table className="dt"><thead><tr><th>City</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>{data.cityVolume.map((r) => (
            <tr key={r.city}><td>{r.city}</td><td>{r.orders}</td><td>{inr(r.revenue)}</td></tr>
          ))}</tbody>
        </table>
      )}
      {locationView === 'state' && (
        <table className="dt"><thead><tr><th>State</th><th>Orders</th><th>Revenue</th></tr></thead>
          <tbody>{data.stateVolume.map((r) => (
            <tr key={r.state}><td>{r.state}</td><td>{r.orders}</td><td>{inr(r.revenue)}</td></tr>
          ))}</tbody>
        </table>
      )}

      <h4 style={{ marginTop: 24 }}>New vs. repeat dealer revenue, by month</h4>
      <table className="dt"><thead><tr><th>Month</th><th>New dealer ₹</th><th>Repeat dealer ₹</th><th>% new</th></tr></thead>
        <tbody>{data.newVsRepeat.map((r) => {
          const totalM = r.newRevenue + r.repeatRevenue;
          return (
            <tr key={r.month}><td>{r.month}</td><td>{inr(r.newRevenue)}</td><td>{inr(r.repeatRevenue)}</td><td>{totalM ? Math.round((r.newRevenue / totalM) * 100) : 0}%</td></tr>
          );
        })}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Order size trend</h4>
      <table className="dt"><thead><tr><th>Month</th><th>Orders</th><th>Avg cartons/order</th><th>Avg pcs/order</th></tr></thead>
        <tbody>{data.orderSizeTrend.map((r) => (
          <tr key={r.month}><td>{r.month}</td><td>{r.orders}</td><td>{r.avgCartons}</td><td>{r.avgPcs}</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Seasonality — top 8 products, pcs sold by month</h4>
      <table className="dt"><thead><tr><th>Product</th>{Object.keys(data.seasonality[0]?.byMonth || {}).sort().map((m) => <th key={m}>{m}</th>)}</tr></thead>
        <tbody>{data.seasonality.map((r) => (
          <tr key={r.code}>
            <td>{r.name}</td>
            {Object.keys(data.seasonality[0]?.byMonth || {}).sort().map((m) => <td key={m}>{r.byMonth[m] || 0}</td>)}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function DealerSection() {
  const [data, setData] = useState(null);
  const [dormantDays, setDormantDays] = useState(60);
  const [dealerCode, setDealerCode] = useState('');
  const [mixData, setMixData] = useState(null);

  useEffect(() => { analyticsApi.dealers({ dormantDays }).then(setData).catch(() => {}); }, [dormantDays]);

  async function loadMix() {
    if (!dealerCode.trim()) return;
    const res = await analyticsApi.dealers({ dormantDays, dealer: dealerCode.trim() });
    setMixData(res.productMix);
  }

  if (!data) return <div className="empty">Loading…</div>;
  return (
    <div>
      <div className="btnrow" style={{ marginBottom: 12 }}>
        <Stat label="Top 10 dealers = % of revenue" value={`${data.top10ConcentrationPct}%`} />
      </div>

      <h4>Dealer lifetime value ranking (top 50)</h4>
      <table className="dt"><thead><tr><th>Dealer</th><th>Name</th><th>Revenue</th><th>% of total</th></tr></thead>
        <tbody>{data.ranking.map((r, i) => (
          <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td>{inr(r.revenue)}</td><td><Bar pct={r.pctOfTotal * 3} /> {r.pctOfTotal}%</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Dormant dealers <input type="number" value={dormantDays} onChange={(e) => setDormantDays(+e.target.value || 60)} style={{ width: 70, marginLeft: 8 }} /> days+</h4>
      <table className="dt"><thead><tr><th>Dealer</th><th>Last order</th><th>Days since</th></tr></thead>
        <tbody>{data.dormant.map((r) => (
          <tr key={r.code}><td className="mono">{r.code} — {r.name}</td><td>{new Date(r.lastOrderAt).toLocaleDateString('en-IN')}</td><td style={{ color: 'var(--red)' }}>{r.daysSince}</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Dealer product-wise pcs (all-time)</h4>
      <p className="muted" style={{ fontSize: 12 }}>Every product in the catalog, with total pcs ever actually dispatched to this one dealer — 0 for anything they've never ordered.</p>
      <div className="btnrow" style={{ marginBottom: 8 }}>
        <input placeholder="Dealer code, e.g. DLR0084" value={dealerCode} onChange={(e) => setDealerCode(e.target.value.toUpperCase())} style={{ maxWidth: 220 }} />
        <button className="btn sm" onClick={loadMix}>Load</button>
      </div>
      {mixData && (
        <table className="dt"><thead><tr><th>Code</th><th>Product</th><th>Pcs dispatched (all-time)</th></tr></thead>
          <tbody>{mixData.items.map((p) => (
            <tr key={p.code}><td className="mono">{p.code}</td><td>{p.name}</td><td style={{ color: p.pcs ? 'inherit' : 'var(--muted)' }}>{p.pcs.toLocaleString('en-IN')}</td></tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

function InventorySection() {
  const [data, setData] = useState(null);
  useEffect(() => { analyticsApi.inventory().then(setData).catch(() => {}); }, []);
  if (!data) return <div className="empty">Loading…</div>;
  return (
    <div>
      <h4>Split/loose stock — leftover inner cartons sitting in godown, by SKU</h4>
      <p className="muted" style={{ fontSize: 12 }}>Check this before splitting a fresh outer carton — one of these might already cover the need.</p>
      <table className="dt"><thead><tr><th>Code</th><th>Product</th><th>Inner cartons in stock</th><th>Pcs</th></tr></thead>
        <tbody>{data.looseStockList.map((r) => (
          <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td>{r.innerCartons}</td><td>{r.pcs}</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Stock age — oldest carton still in godown, by SKU</h4>
      <table className="dt"><thead><tr><th>Code</th><th>Product</th><th>Oldest outer (days)</th><th>Oldest inner (days)</th></tr></thead>
        <tbody>{data.stockAge.map((r) => (
          <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td>
            <td style={{ color: r.oldestOuterDays > 60 ? 'var(--red)' : 'inherit' }}>{r.oldestOuterDays ?? '—'}</td>
            <td style={{ color: r.oldestInnerDays > 60 ? 'var(--red)' : 'inherit' }}>{r.oldestInnerDays ?? '—'}</td>
          </tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Batch sell-through, by product and month generated</h4>
      <table className="dt"><thead><tr><th>Month</th><th>Product</th><th>Outer sell-through</th><th>Inner sell-through</th></tr></thead>
        <tbody>{data.batchSellThrough.map((r) => (
          <tr key={r.product + r.month}>
            <td>{r.month}</td><td>{r.name}</td>
            <td>{r.outerSellThroughPct != null ? `${r.outerDispatched}/${r.outerTotal} (${r.outerSellThroughPct}%)` : '—'}</td>
            <td>{r.innerSellThroughPct != null ? `${r.innerDispatched}/${r.innerTotal} (${r.innerSellThroughPct}%)` : '—'}</td>
          </tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>Stockouts &amp; estimated revenue lost</h4>
      <p className="muted" style={{ fontSize: 12 }}>Reconstructed from carton scan timestamps — accuracy depends on stock-in scanning having been done consistently. Revenue-lost is an estimate (avg daily sales rate × days out of stock), not an exact figure.</p>
      <table className="dt"><thead><tr><th>Code</th><th>Product</th><th>Times out of stock</th><th>Total days out</th><th>Currently out?</th><th>Est. revenue lost</th></tr></thead>
        <tbody>{data.stockouts.map((r) => (
          <tr key={r.code}><td className="mono">{r.code}</td><td>{r.name}</td><td>{r.timesOutOfStock}</td><td>{r.totalDaysOut}</td><td>{r.currentlyOut ? '🔴 Yes' : ''}</td><td>{inr(r.estimatedRevenueLost)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function FinancialSection() {
  const [data, setData] = useState(null);
  useEffect(() => { analyticsApi.financial().then(setData).catch(() => {}); }, []);
  if (!data) return <div className="empty">Loading…</div>;
  return (
    <div>
      <p className="muted" style={{ fontSize: 12, background: 'var(--paper-d)', padding: '8px 12px', borderRadius: 6 }}>⚠️ {data.caveat}</p>

      <div className="btnrow" style={{ marginBottom: 16 }}>
        <Stat label="0–30 days overdue" value={inr(data.ageingBuckets['0-30'])} />
        <Stat label="30–60 days overdue" value={inr(data.ageingBuckets['30-60'])} />
        <Stat label="60+ days overdue" value={inr(data.ageingBuckets['60+'])} />
      </div>

      <h4>Outstanding receivables by dealer</h4>
      <table className="dt"><thead><tr><th>Dealer</th><th>Outstanding</th><th>Invoices</th><th>Oldest (days)</th></tr></thead>
        <tbody>{data.outstandingByDealer.map((r) => (
          <tr key={r.dealer}><td className="mono">{r.dealer} — {r.name}</td><td>{inr(r.outstanding)}</td><td>{r.invoiceCount}</td><td style={{ color: r.oldestDays > 60 ? 'var(--red)' : 'inherit' }}>{r.oldestDays}</td></tr>
        ))}</tbody>
      </table>

      <h4 style={{ marginTop: 24 }}>DSO trend (last 6 months)</h4>
      <table className="dt"><thead><tr><th>Month</th><th>DSO (days)</th><th>Revenue</th><th>Receivables</th></tr></thead>
        <tbody>{data.dsoTrend.map((r) => (
          <tr key={r.month}><td>{r.month}</td><td>{r.dso ?? '—'}</td><td>{inr(r.revenue)}</td><td>{inr(r.receivables)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

function OpsSection() {
  const [data, setData] = useState(null);
  useEffect(() => { analyticsApi.ops().then(setData).catch(() => {}); }, []);
  if (!data) return <div className="empty">Loading…</div>;
  return (
    <div>
      <div className="btnrow" style={{ marginBottom: 16 }}>
        <Stat label="Avg scan-to-invoice" value={data.avgTurnaroundHours != null ? `${data.avgTurnaroundHours}h` : '—'} sub="Should be ~0 — invoice is auto-created at dispatch" />
        <Stat label="Avg order-to-dispatch lag" value={data.avgOrderToDispatchDays != null ? `${data.avgOrderToDispatchDays}d` : '—'} sub={`from ${data.sampleSize} PI-linked dispatches`} />
      </div>

      <h4>mhead-wise performance (last 6 months)</h4>
      <table className="dt"><thead><tr><th>Rep</th><th>Invoices</th><th>Revenue</th></tr></thead>
        <tbody>{data.repPerformance.map((r) => (
          <tr key={r.rep}><td>{r.rep}</td><td>{r.invoices}</td><td>{inr(r.revenue)}</td></tr>
        ))}</tbody>
      </table>
    </div>
  );
}

const GEO_METRICS = [
  { key: 'sales', label: 'Sales value' },
  { key: 'dealerCount', label: 'Dealer count' },
  { key: 'pendingValue', label: 'Pending orders' },
  { key: 'outstanding', label: 'Outstanding' },
];

// Case-insensitive lookup by name — the map library's state/district names
// (Title Case, e.g. "Madhya Pradesh") don't necessarily match our data's
// casing (the india-pincode dataset returns upper case, e.g. "MADHYA
// PRADESH"), so every match here goes through this rather than a direct
// key lookup.
function findByName(list, name) {
  const needle = (name || '').trim().toLowerCase();
  return list.find((x) => (x.state || '').toLowerCase() === needle || (x.district || '').toLowerCase() === needle);
}

function MapSection() {
  const { showToast } = useToast();
  const [geo, setGeo] = useState(null); // null = loading
  const [metric, setMetric] = useState('sales');
  const [drillState, setDrillState] = useState(null); // null = India view; else a state name
  const [dealerList, setDealerList] = useState(null); // drill-down table for a clicked district
  const [dealerListLabel, setDealerListLabel] = useState('');

  useEffect(() => { analyticsApi.geo().then(setGeo).catch((err) => showToast(err.message, 'err')); }, []);

  if (!geo) return <div className="empty">Loading…</div>;

  const metricLabel = GEO_METRICS.find((m) => m.key === metric).label;
  const fmt = (v) => (metric === 'dealerCount' ? v.toLocaleString('en-IN') : inr(v));

  // Districts for the drilled-in state only — byDistrict covers all of
  // India, so narrow it down before building the scale (otherwise the
  // color range would be dominated by whichever state has the most data).
  const districtsOfState = drillState ? geo.byDistrict.filter((d) => (d.state || '').toLowerCase() === drillState.toLowerCase()) : [];
  const stateScale = buildColorScale(geo.byState.map((s) => s[metric]));
  const districtScale = buildColorScale(districtsOfState.map((d) => d[metric]));

  async function openDistrict(stateName, districtName) {
    try {
      const rows = await analyticsApi.geoDealers(stateName, districtName);
      setDealerList(rows);
      setDealerListLabel(`${districtName}, ${stateName}`);
    } catch (err) { showToast(err.message, 'err'); }
  }

  const unknownState = geo.byState.find((s) => s.state === 'Unknown');

  return (
    <div>
      <div className="btnrow" style={{ marginBottom: 12 }}>
        {GEO_METRICS.map((m) => (
          <button key={m.key} className={metric === m.key ? 'btn sm' : 'btn o sm'} onClick={() => setMetric(m.key)}>{m.label}</button>
        ))}
        {drillState && <button className="btn o sm" style={{ marginLeft: 'auto' }} onClick={() => { setDrillState(null); setDealerList(null); }}>← Back to India</button>}
      </div>

      <p className="muted" style={{ fontSize: 12 }}>
        Colored by <b>{metricLabel}</b> · state uses each dealer's pincode-derived state where available, else their typed state (common abbreviations/misspellings merged automatically); district only comes from a pincode, so a dealer with no pincode on file still falls into that state's "Unknown" district.
        {unknownState && unknownState.dealerCount > 0 && <> {unknownState.dealerCount} dealer(s) have no state on file at all (pincode or typed) — not shown on the map; add a pincode or state on the Dealers page to place them.</>}
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'center' }}>
        <div style={{ maxWidth: 680, flex: '1 1 480px' }}>
          {!drillState ? (
            <IndiaSvgMap
              level="state"
              width={680}
              height={760}
              stateFill={(name) => {
                const row = findByName(geo.byState, name);
                return row ? stateScale.colorFor(row[metric]) : '#e2e8f0';
              }}
              onStateClick={(name) => setDrillState(name)}
              tooltip={(ctx) => {
                const row = findByName(geo.byState, ctx.name);
                return <div><b>{ctx.name}</b><br />{metricLabel}: {row ? fmt(row[metric]) : '—'}<br />Dealers: {row ? row.dealerCount : 0}</div>;
              }}
            />
          ) : (
            <IndiaSvgMap
              level="district"
              stateName={drillState}
              width={680}
              height={760}
              districtFill={(name) => {
                const row = findByName(districtsOfState, name);
                return row ? districtScale.colorFor(row[metric]) : '#e2e8f0';
              }}
              onDistrictClick={(name) => openDistrict(drillState, name)}
              tooltip={(ctx) => {
                const row = findByName(districtsOfState, ctx.name);
                return <div><b>{ctx.name}</b><br />{metricLabel}: {row ? fmt(row[metric]) : '—'}<br />Dealers: {row ? row.dealerCount : 0}</div>;
              }}
            />
          )}
        </div>

        {/* The map itself has no room to print a name on every one of 36
            states / 700+ districts legibly, and hover tooltips are easy to
            miss — so every name + its number is always listed here too,
            ranked highest first, same metric as the map's coloring. */}
        <div style={{ flex: '1 1 280px', minWidth: 260, maxWidth: 340 }}>
          <h4 style={{ marginTop: 0 }}>{drillState ? `${drillState} — districts` : 'States'}</h4>
          <div style={{ maxHeight: 700, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table className="dt" style={{ fontSize: 12.5 }}>
              <thead>
                <tr><th>{drillState ? 'District' : 'State'}</th><th>{metricLabel}</th><th>Dealers</th></tr>
              </thead>
              <tbody>
                {(drillState ? districtsOfState : geo.byState)
                  .filter((r) => r.state !== 'Unknown')
                  .slice()
                  .sort((a, b) => b[metric] - a[metric])
                  .map((r) => (
                    <tr
                      key={drillState ? r.district : r.state}
                      style={{ cursor: 'pointer' }}
                      onClick={() => (drillState ? openDistrict(drillState, r.district) : setDrillState(r.state))}
                    >
                      <td>{drillState ? r.district : r.state}</td>
                      <td>{fmt(r[metric])}</td>
                      <td>{r.dealerCount}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {dealerList && (
        <div style={{ marginTop: 20 }}>
          <h4>Dealers in {dealerListLabel}</h4>
          {dealerList.length ? (
            <table className="dt">
              <thead><tr><th>Code</th><th>Name</th><th>City</th><th>Sales</th><th>Outstanding</th><th>Pending orders</th></tr></thead>
              <tbody>{dealerList.map((d) => (
                <tr key={d.code}>
                  <td className="mono">{d.code}</td><td>{d.name}</td><td>{d.city}</td>
                  <td>{inr(d.sales)}</td><td>{inr(d.outstanding)}</td><td>{inr(d.pendingValue)}</td>
                </tr>
              ))}</tbody>
            </table>
          ) : <div className="empty">No dealers found here.</div>}
        </div>
      )}
    </div>
  );
}

// Small +/- stepper used for every quantity field in Sales Forecast. Plain
// number input otherwise (no stepper) — used for the selling-price field,
// since price is typed directly rather than nudged one unit at a time.
function NumberStepper({ value, onChange, min = 0, step = 1, width = 90 }) {
  function set(v) { onChange(Math.max(min, v)); }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <button type="button" className="btn o sm" style={{ padding: '2px 8px' }} onClick={() => set((Number(value) || 0) - step)}>−</button>
      <input
        type="number"
        value={value}
        onChange={(e) => set(e.target.value === '' ? 0 : Number(e.target.value))}
        style={{ width, textAlign: 'center' }}
      />
      <button type="button" className="btn o sm" style={{ padding: '2px 8px' }} onClick={() => set((Number(value) || 0) + step)}>+</button>
    </div>
  );
}

let forecastRowId = 0;
const emptyAccessory = () => ({ id: ++forecastRowId, name: '', ordered: 0, perUnit: 1 });
const emptyCalc = () => ({ accessories: [emptyAccessory()], mouldQty: 0, price: '' });

// A product is identified by its catalog code, or by its own local id when
// it's an upcoming/typed one — this is the key every product's calculator
// state is stored and resumed under (see calcByKey below).
function keyOf(p) { return p.upcoming ? `up-${p.id}` : `cat-${p.code}`; }

// Pure function so both the open calculator AND the upcoming-products list
// (which shows each one's forecast total inline, without opening it) can
// compute the same numbers from a stored calc state.
function computeForecast(calc) {
  const results = calc.accessories.map((r) => ({
    ...r,
    buildable: r.perUnit > 0 ? Math.floor((Number(r.ordered) || 0) / r.perUnit) : 0,
  }));
  const candidateCaps = [...results.map((r) => r.buildable), Number(calc.mouldQty) || 0];
  const finalUnits = candidateCaps.length ? Math.min(...candidateCaps) : 0;
  const leftovers = results.map((r) => ({ ...r, leftover: (Number(r.ordered) || 0) - finalUnits * r.perUnit }));
  const forecastRevenue = finalUnits * (Number(calc.price) || 0);
  return { results, finalUnits, leftovers, forecastRevenue };
}

function ForecastSection() {
  const [catalog, setCatalog] = useState(null); // null = loading
  const [search, setSearch] = useState('');
  const [customName, setCustomName] = useState('');
  const [extraProducts, setExtraProducts] = useState([]); // locally-typed "upcoming" products — forecast-only, never saved
  const [selected, setSelected] = useState(null); // { code, name } or { name } for a typed one

  // Each product (catalog or upcoming) keeps its OWN accessories/mould/price
  // state here, keyed by keyOf(product) — so switching products and coming
  // back resumes exactly where it was left, instead of resetting every time.
  const [calcByKey, setCalcByKey] = useState({});

  useEffect(() => { productsApi.list().then(setCatalog).catch(() => setCatalog([])); }, []);

  function pick(product) {
    setSelected(product);
    const k = keyOf(product);
    setCalcByKey((m) => (m[k] ? m : { ...m, [k]: emptyCalc() }));
  }

  function addUpcoming() {
    const name = customName.trim();
    if (!name) return;
    const p = { id: ++forecastRowId, name, upcoming: true };
    setExtraProducts((list) => [...list, p]);
    setCustomName('');
    pick(p);
  }

  function removeUpcoming(id) {
    setExtraProducts((list) => list.filter((p) => p.id !== id));
    setSelected((s) => (s?.id === id ? null : s));
    setCalcByKey((m) => { const { [`up-${id}`]: _, ...rest } = m; return rest; });
  }

  function resetUpcoming() {
    setExtraProducts([]);
    setSelected((s) => (s?.upcoming ? null : s));
    setCalcByKey((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !k.startsWith('up-'))));
  }

  const selectedKey = selected ? keyOf(selected) : null;
  const calc = (selectedKey && calcByKey[selectedKey]) || emptyCalc();

  // Patches just this one selected product's stored calc state — every
  // field editor below goes through this, so edits always land on the
  // right product even after switching back and forth.
  function patchCalc(patch) {
    if (!selectedKey) return;
    setCalcByKey((m) => ({ ...m, [selectedKey]: { ...(m[selectedKey] || emptyCalc()), ...patch } }));
  }
  function updateAccessory(id, patch) {
    patchCalc({ accessories: calc.accessories.map((r) => (r.id === id ? { ...r, ...patch } : r)) });
  }
  function removeAccessory(id) {
    if (calc.accessories.length <= 1) return;
    patchCalc({ accessories: calc.accessories.filter((r) => r.id !== id) });
  }

  const { results, finalUnits, leftovers, forecastRevenue } = computeForecast(calc);
  const price = calc.price;
  const mouldQty = calc.mouldQty;
  const accessories = calc.accessories;

  const visibleCatalog = catalog ? catalog.filter((p) => !search.trim() || p.name.toLowerCase().includes(search.trim().toLowerCase()) || p.code.toLowerCase().includes(search.trim().toLowerCase())) : [];

  return (
    <div>
      <p className="muted" style={{ fontSize: 12 }}>
        Live calculator only — nothing here is saved. Pick a product (or add an upcoming one that isn't in the catalog yet), enter its accessories/parts, total pc to be made and selling price, and see the buildable units, leftover parts, and forecast revenue update instantly.
      </p>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div style={{ minWidth: 260, flex: '0 0 280px' }}>
          <input placeholder="Search products…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 8, width: '100%' }} />
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
            {catalog === null && <div className="empty" style={{ padding: 10 }}>Loading…</div>}
            {catalog !== null && visibleCatalog.length === 0 && <div className="empty" style={{ padding: 10 }}>No products</div>}
            {visibleCatalog.map((p) => (
              <div
                key={p.code}
                onClick={() => pick(p)}
                style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, background: selected?.code === p.code ? 'var(--paper-d)' : 'transparent' }}
              >
                <span className="mono" style={{ marginRight: 6 }}>{p.code}</span>{p.name}
              </div>
            ))}
          </div>
        </div>

        <div style={{ minWidth: 220, flex: '0 0 240px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <b style={{ fontSize: 13 }}>Upcoming products</b>
            {extraProducts.length > 0 && <button type="button" className="btn o rd sm" onClick={resetUpcoming}>Reset all</button>}
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 6, marginBottom: 10 }}>
            {extraProducts.length === 0 && <div className="empty" style={{ padding: 10, fontSize: 12 }}>None added yet</div>}
            {extraProducts.map((p) => {
              const pCalc = calcByKey[keyOf(p)];
              const pForecast = pCalc ? computeForecast(pCalc).forecastRevenue : 0;
              return (
                <div
                  key={p.id}
                  onClick={() => pick(p)}
                  style={{ padding: '6px 10px', cursor: 'pointer', fontSize: 13, background: selected?.id === p.id ? 'var(--paper-d)' : 'transparent', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}
                >
                  <div>
                    <div>🆕 {p.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{inr(pForecast)}</div>
                  </div>
                  <button type="button" className="btn o rd sm" style={{ padding: '1px 7px' }} onClick={(e) => { e.stopPropagation(); removeUpcoming(p.id); }}>✕</button>
                </div>
              );
            })}
          </div>
          <div className="btnrow">
            <input placeholder="Upcoming product name" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            <button type="button" className="btn sm" onClick={addUpcoming}>+ Add</button>
          </div>
        </div>

        <div style={{ flex: '1 1 420px', minWidth: 320 }}>
          {!selected && <div className="empty">Select or add a product to forecast</div>}
          {selected && (
            <div className="card">
              <h3 style={{ marginTop: 0 }}>{selected.name}{selected.upcoming && <span className="muted" style={{ fontSize: 12, marginLeft: 6 }}>(upcoming)</span>}</h3>

              <h4 style={{ marginBottom: 6 }}>Accessories / parts</h4>
              {accessories.map((row) => {
                const r = results.find((x) => x.id === row.id);
                const lo = leftovers.find((x) => x.id === row.id);
                return (
                  <div key={row.id} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
                    <input
                      placeholder="Accessory name"
                      value={row.name}
                      onChange={(e) => updateAccessory(row.id, { name: e.target.value })}
                      style={{ width: 160 }}
                    />
                    <div>
                      <div className="muted" style={{ fontSize: 10 }}>Ordered qty</div>
                      <NumberStepper value={row.ordered} onChange={(v) => updateAccessory(row.id, { ordered: v })} />
                    </div>
                    <div>
                      <div className="muted" style={{ fontSize: 10 }}>Qty per unit</div>
                      <NumberStepper value={row.perUnit} onChange={(v) => updateAccessory(row.id, { perUnit: Math.max(1, v) })} min={1} />
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div className="muted" style={{ fontSize: 10 }}>Buildable</div>
                      <b>{r?.buildable ?? 0}</b>
                    </div>
                    <div style={{ fontSize: 12 }}>
                      <div className="muted" style={{ fontSize: 10 }}>Leftover</div>
                      <b style={{ color: (lo?.leftover ?? 0) > 0 ? 'var(--spruce)' : 'inherit' }}>{lo?.leftover ?? 0}</b>
                    </div>
                    <button type="button" className="btn o rd sm" onClick={() => removeAccessory(row.id)}>✕</button>
                  </div>
                );
              })}
              <button type="button" className="btn o sm" onClick={() => patchCalc({ accessories: [...accessories, emptyAccessory()] })}>+ Add accessory</button>

              <div style={{ display: 'flex', gap: 24, marginTop: 20, flexWrap: 'wrap' }}>
                <div>
                  <div className="muted" style={{ fontSize: 10 }}>Total pc to be made</div>
                  <NumberStepper value={mouldQty} onChange={(v) => patchCalc({ mouldQty: v })} />
                </div>
                <div>
                  <div className="muted" style={{ fontSize: 10 }}>Approx selling price/pc (₹)</div>
                  <input type="number" value={price} onChange={(e) => patchCalc({ price: e.target.value })} placeholder="0" style={{ width: 110 }} />
                </div>
              </div>

              <div className="btnrow" style={{ marginTop: 20, gap: 24 }}>
                <Stat label="Final buildable units" value={finalUnits.toLocaleString('en-IN')} sub="min of every accessory + total pc to be made" />
                <Stat label="Sales forecast" value={inr(forecastRevenue)} sub={`${finalUnits.toLocaleString('en-IN')} pcs × ₹${price || 0}`} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const SECTIONS = [
  { key: 'sales', label: 'A · Sales Patterns', Comp: SalesSection },
  { key: 'dealers', label: 'B · Dealer Intelligence', Comp: DealerSection },
  { key: 'inventory', label: 'C · Inventory & Batch', Comp: InventorySection },
  { key: 'financial', label: 'D · Financial', Comp: FinancialSection },
  { key: 'ops', label: 'E · Ops & Dispatch', Comp: OpsSection },
  { key: 'forecast', label: 'F · Sales Forecast', Comp: ForecastSection },
  { key: 'map', label: 'G · India Map', Comp: MapSection },
];

export default function Analytics() {
  const eligible = useEligible();
  const [verified, setVerified] = useState(!!getAnalyticsSession());
  const [tab, setTab] = useState('sales');

  if (!eligible) {
    return (
      <div className="card" style={{ maxWidth: 480, margin: '60px auto', textAlign: 'center' }}>
        <h3>🔒 Not available</h3>
        <p className="muted">This account doesn't have Analysis access. Ask a masterAdmin to enable it on the Users page.</p>
      </div>
    );
  }

  if (!verified) return <OtpGate onVerified={() => setVerified(true)} />;

  const Active = SECTIONS.find((s) => s.key === tab).Comp;
  return (
    <div className="no-print">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div>
          <div className="muted" style={{ fontSize: 11, letterSpacing: '.08em' }}>COMPANY-WIDE · MASTER ONLY</div>
          <h2 style={{ margin: '2px 0 12px' }}>Analysis</h2>
        </div>
        <button className="btn o sm" onClick={() => { clearAnalyticsSession(); setVerified(false); }}>Lock this page</button>
      </div>
      <div className="btnrow" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
        {SECTIONS.map((s) => (
          <button key={s.key} className={tab === s.key ? 'btn sm' : 'btn o sm'} onClick={() => setTab(s.key)}>{s.label}</button>
        ))}
      </div>
      <Active />
    </div>
  );
}

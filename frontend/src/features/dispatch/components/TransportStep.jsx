const TRANSPORT_MODES = ['Railway', 'Roadways / Truck', 'Safe Express', 'Delivery Courier', 'Self-pickup', 'DTDC'];

// Step 2 of the dispatch form: mode of transport + optional vehicle/LR/eway details.
export default function TransportStep({
  transporter, setTransporter, freight, setFreight, freightTerm, setFreightTerm,
  showAdvanced, setShowAdvanced, vehicle, setVehicle, lr, setLr, eway, setEway, driver, setDriver,
}) {
  return (
    <div className="card">
      <h3 style={{ marginBottom: 10 }}>Step 2 · Mode of transport</h3>
      <div className="row2">
        <div className="fg">
          <label>Via / mode *</label>
          <input list="modes" value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="e.g. Railway, Safe Express" />
          <datalist id="modes">{TRANSPORT_MODES.map((m) => <option key={m} value={m} />)}</datalist>
        </div>
        <div className="fg"><label>Freight ₹</label><input type="number" value={freight} onChange={(e) => setFreight(+e.target.value)} /></div>
        <div className="fg"><label>Freight term</label>
          <select value={freightTerm} onChange={(e) => setFreightTerm(e.target.value)}>
            <option>To Pay</option><option>Paid</option>
          </select>
        </div>
      </div>
      <button className="btn o sm" onClick={() => setShowAdvanced((s) => !s)}>{showAdvanced ? 'Hide' : '+ Show'} advanced (vehicle/LR/eway)</button>
      {showAdvanced && (
        <div className="row2" style={{ marginTop: 10 }}>
          <div className="fg"><label>Vehicle no</label><input value={vehicle} onChange={(e) => setVehicle(e.target.value)} /></div>
          <div className="fg"><label>LR no</label><input value={lr} onChange={(e) => setLr(e.target.value)} /></div>
          <div className="fg"><label>Eway bill no</label><input value={eway} onChange={(e) => setEway(e.target.value)} /></div>
          <div className="fg"><label>Driver mobile</label><input value={driver} onChange={(e) => setDriver(e.target.value)} /></div>
        </div>
      )}
    </div>
  );
}

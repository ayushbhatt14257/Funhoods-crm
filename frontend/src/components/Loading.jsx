export default function Loading({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--muted)' }}>
      <div
        style={{
          width: 30, height: 30, borderRadius: '50%',
          border: '3px solid var(--paper-d)', borderTopColor: 'var(--spruce)',
          animation: 'spin 0.8s linear infinite', marginBottom: 10,
        }}
      />
      <div style={{ fontSize: 12.5 }}>{label || 'Loading…'}</div>
      <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
    </div>
  );
}

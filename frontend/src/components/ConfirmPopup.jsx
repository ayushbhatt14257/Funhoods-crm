import Modal from './Modal';

// Generic confirm dialog. Usage:
// <ConfirmPopup title="Delete PI?" message="..." confirmLabel="Delete" danger onConfirm={..} onClose={..} />
export default function ConfirmPopup({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger, busy, onConfirm, onClose }) {
  return (
    <Modal title={title} onClose={onClose}>
      <p style={{ fontSize: 14, marginBottom: 16 }}>{message}</p>
      <div className="btnrow">
        <button className={danger ? 'btn rd' : 'btn g'} disabled={busy} onClick={onConfirm}>
          {busy ? 'Working…' : confirmLabel}
        </button>
        <button className="btn o" disabled={busy} onClick={onClose}>{cancelLabel}</button>
      </div>
    </Modal>
  );
}

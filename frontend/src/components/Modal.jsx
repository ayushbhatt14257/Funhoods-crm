import { useEffect } from 'react';

// Shared across all Modal instances — a reference count so nested/simultaneous modals
// (e.g. product picker + its confirm popup) don't step on each other's scroll-restore,
// which is what was leaving the page permanently unscrollable.
let lockCount = 0;
let savedScrollY = 0;
let savedStyle = null;

function lockBodyScroll() {
  if (lockCount === 0) {
    savedScrollY = window.scrollY;
    savedStyle = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      right: document.body.style.right,
      width: document.body.style.width,
    };
    document.body.style.position = 'fixed';
    document.body.style.top = `-${savedScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
  }
  lockCount++;
}

function unlockBodyScroll() {
  lockCount = Math.max(0, lockCount - 1);
  if (lockCount === 0 && savedStyle) {
    document.body.style.position = savedStyle.position;
    document.body.style.top = savedStyle.top;
    document.body.style.left = savedStyle.left;
    document.body.style.right = savedStyle.right;
    document.body.style.width = savedStyle.width;
    window.scrollTo(0, savedScrollY);
    savedStyle = null;
  }
}

export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    lockBodyScroll();
    return () => unlockBodyScroll();
  }, []);

  return (
    <div className="modal" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mbox">
        <div className="mhead">
          <div style={{ fontWeight: 600 }}>{title}</div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="mbody">{children}</div>
      </div>
    </div>
  );
}

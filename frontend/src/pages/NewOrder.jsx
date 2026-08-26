import { useState } from 'react';
import WhatsAppOrderMode from './WhatsAppOrderMode';
import StructuredOrderMode from './StructuredOrderMode';

export default function NewOrder() {
  const [mode, setMode] = useState('whatsapp'); // 'whatsapp' | 'structured'

  return (
    <div>
      <div className="ph">
        <div className="eyebrow">Two ways to enter an order</div>
        <h2>New Order</h2>
        <p>Paste from WhatsApp OR fill in step-by-step at the counter. Both end in a confirmed PI.</p>
      </div>

      <div className="btnrow order-mode-tabs" style={{ marginBottom: 14 }}>
        <button className={mode === 'whatsapp' ? 'btn' : 'btn o'} onClick={() => setMode('whatsapp')}>📱 From WhatsApp (paste)</button>
        <button className={mode === 'structured' ? 'btn' : 'btn o'} onClick={() => setMode('structured')}>✎ Structured entry (at counter)</button>
      </div>

      {mode === 'whatsapp' ? <WhatsAppOrderMode /> : <StructuredOrderMode />}
    </div>
  );
}

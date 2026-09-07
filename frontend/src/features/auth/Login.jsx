import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { firebaseAuth } from '../../firebase';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

// OTP-only sign-in — no password option. A phone number only gets in if an
// admin has already added that mobile number as a user (see otpLogin in
// AuthContext / the backend's /auth/otp-login).
export default function Login() {
  const { otpLogin } = useAuth();
  const { showToast } = useToast();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);

  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmation, setConfirmation] = useState(null); // Firebase confirmationResult, set once OTP is sent
  const recaptchaRef = useRef(null);

  function getRecaptcha() {
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(firebaseAuth, 'recaptcha-container', { size: 'invisible' });
    }
    return recaptchaRef.current;
  }

  async function sendOtp(e) {
    e.preventDefault();
    if (!/^\d{10}$/.test(mobile)) return showToast('Enter a 10-digit mobile number', 'err');
    setBusy(true);
    try {
      const result = await signInWithPhoneNumber(firebaseAuth, `+91${mobile}`, getRecaptcha());
      setConfirmation(result);
      showToast('OTP sent', 'g');
    } catch (err) {
      showToast(err.message, 'err');
      // A failed send can leave the invisible reCAPTCHA in a bad state — reset so the next attempt works.
      recaptchaRef.current?.clear();
      recaptchaRef.current = null;
    } finally { setBusy(false); }
  }

  async function verifyOtp(e) {
    e.preventDefault();
    if (!otp.trim()) return showToast('Enter the OTP', 'err');
    setBusy(true);
    try {
      const cred = await confirmation.confirm(otp.trim());
      const idToken = await cred.user.getIdToken();
      await otpLogin(idToken);
      nav('/');
    } catch (err) {
      showToast(err.code === 'auth/invalid-verification-code' ? 'Wrong OTP — try again' : err.message, 'err');
    } finally { setBusy(false); }
  }

  useEffect(() => () => { recaptchaRef.current?.clear(); }, []);

  return (
    <div className="loginwrap">
      <div className="logincard">
        <img src="/funhoods-logo.jpg" alt="Funhoods" />
        <div className="sub">CRM · ORDER · INVOICE · DISPATCH</div>

        {!confirmation ? (
          <form onSubmit={sendOtp}>
            <div className="fg">
              <label>Mobile number</label>
              <input value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="9000000008" required autoFocus />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Sending…' : 'Send OTP'}
            </button>
          </form>
        ) : (
          <form onSubmit={verifyOtp}>
            <div className="fg">
              <label>Enter the OTP sent to {mobile}</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="123456" required autoFocus />
            </div>
            <button className="btn" style={{ width: '100%' }} disabled={busy}>
              {busy ? 'Verifying…' : 'Verify & sign in'}
            </button>
            <button type="button" className="btn o sm" style={{ width: '100%', marginTop: 8 }} onClick={() => { setConfirmation(null); setOtp(''); }}>
              ← Change number
            </button>
          </form>
        )}

        {/* Invisible reCAPTCHA anchor required by Firebase Phone Auth — renders nothing visible */}
        <div id="recaptcha-container" />
      </div>
    </div>
  );
}

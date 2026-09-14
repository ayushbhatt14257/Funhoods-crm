import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('funhoods_token');
    if (!token) { setLoading(false); return; }
    // Only a genuine "your token is invalid" (401) should log you out. A
    // network hiccup or a slow/waking-up backend (Render's free tier can
    // take 30-60s to spin back up after being idle) is a completely
    // different problem — wiping a perfectly good token because the first
    // request timed out was the actual bug here. Retry a couple of times
    // first, since that alone covers the common cold-start case.
    async function checkSession() {
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const me = await api.get('/auth/me');
          setUser(me);
          return;
        } catch (err) {
          if (err.status === 401) { localStorage.removeItem('funhoods_token'); return; }
          if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 2000)); // 2s, then 4s
        }
      }
      // All retries failed and it was never a 401 — leave the token alone.
      // Better to show "logged out for now" than to silently destroy a
      // valid session over a temporary connectivity problem.
    }
    checkSession().finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (identifier, password) => {
    const data = await api.post('/auth/login', { identifier, password });
    localStorage.setItem('funhoods_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  // Called after Firebase has already verified the OTP client-side — we just
  // hand its ID token to our backend, which checks it's genuine and maps the
  // phone number to one of our existing user accounts.
  const otpLogin = useCallback(async (idToken) => {
    const data = await api.post('/auth/otp-login', { idToken });
    localStorage.setItem('funhoods_token', data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('funhoods_token');
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, otpLogin, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

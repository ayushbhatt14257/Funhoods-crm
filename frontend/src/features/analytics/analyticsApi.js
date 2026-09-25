import { api } from '../../api/client';

// The 24h analytics session token is deliberately kept separate from the
// normal login token (funhoods_token) — it gates one page, expires on its
// own schedule regardless of how long the regular login session lasts, and
// is sent as its own header rather than folded into the normal
// Authorization bearer token.
const SESSION_KEY = 'funhoods_analytics_session';

export function getAnalyticsSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const { token, expiresAt } = JSON.parse(raw);
    if (Date.now() >= expiresAt) { localStorage.removeItem(SESSION_KEY); return null; }
    return token;
  } catch { return null; }
}

function setAnalyticsSession(token, expiresInHours) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ token, expiresAt: Date.now() + expiresInHours * 3600000 }));
}

export function clearAnalyticsSession() {
  localStorage.removeItem(SESSION_KEY);
}

function withSessionHeader() {
  const token = getAnalyticsSession();
  return token ? { 'x-analytics-token': token } : {};
}

export const analyticsApi = {
  verifyOtp: async (idToken) => {
    const res = await api.post('/analytics/verify-otp', { idToken });
    setAnalyticsSession(res.token, res.expiresInHours);
    return res;
  },
  sales: (months) => api.get(`/analytics/sales?months=${months || 12}`, { headers: withSessionHeader() }),
  dealers: (opts = {}) => {
    const params = new URLSearchParams();
    if (opts.dormantDays) params.set('dormantDays', opts.dormantDays);
    if (opts.dealer) params.set('dealer', opts.dealer);
    return api.get(`/analytics/dealers?${params}`, { headers: withSessionHeader() });
  },
  inventory: () => api.get('/analytics/inventory', { headers: withSessionHeader() }),
  financial: () => api.get('/analytics/financial', { headers: withSessionHeader() }),
  ops: () => api.get('/analytics/ops', { headers: withSessionHeader() }),
};

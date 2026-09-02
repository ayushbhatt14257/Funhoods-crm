import { api } from '../../api/client';

// All HTTP calls the dispatch feature makes, named for what they do rather
// than the raw REST path — callers don't need to know the URL shape.
export const dispatchApi = {
  getReadyPIs: () => api.get('/dispatch/ready-pis'),
  getPendingPIForDealer: (dealerCode) => api.get(`/dispatch/pending-pi/${dealerCode}`),
  dispatchFromPI: (piNo, payload) => api.post(`/dispatch/from-pi/${piNo}`, payload),
  dispatchManual: (payload) => api.post('/dispatch/manual', payload),
};

import { api } from '../../api/client';

// All HTTP calls the dispatch feature makes, named for what they do rather
// than the raw REST path — callers don't need to know the URL shape.
export const dispatchApi = {
  getPendingPIForDealer: (dealerCode) => api.get(`/dispatch/pending-pi/${dealerCode}`),
  getCustomerPool: (dealerCode) => api.get(`/dispatch/customer-pool/${dealerCode}`),
  dispatchFromPool: (payload) => api.post('/dispatch/from-customer-pool', payload),
  dispatchManual: (payload) => api.post('/dispatch/manual', payload),
};

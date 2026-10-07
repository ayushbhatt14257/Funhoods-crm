import { api } from '../../api/client';

// Everything the Gift Approvals feature does against /api/gift-approvals.
export const giftApprovalsApi = {
  // body: { dealer, dealerName, gifts }
  create: (body) => api.post('/gift-approvals', body),
  listPending: () => api.get('/gift-approvals/pending'),
  approve: (id) => api.post(`/gift-approvals/${id}/approve`),
};

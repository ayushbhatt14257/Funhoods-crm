import { api } from '../../api/client';

// Everything the Invoices (Tax Invoice) feature does against /api/invoices.
export const invoicesApi = {
  list: (queryString = '') => api.get(`/invoices${queryString ? `?${queryString}` : ''}`),
  getByNo: (no) => api.get(`/invoices/${no}`),
  markDelivered: (no) => api.patch(`/invoices/${no}/delivered`),
  uploadBuilty: (no, formData) => api.putForm(`/invoices/${no}/builty`, formData),
  markPaid: (no) => api.patch(`/invoices/${no}/mark-paid`),
};

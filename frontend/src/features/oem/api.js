import { api, API_URL, getToken } from '../../api/client';

// Everything the OEM Orders feature does against /api/oem.
export const oemApi = {
  list: (qs = '') => api.get(`/oem${qs ? `?${qs}` : ''}`),
  counts: () => api.get('/oem/counts'),
  getByNo: (no) => api.get(`/oem/${no}`),
  create: (payload) => api.post('/oem', payload),
  update: (no, payload) => api.put(`/oem/${no}`, payload),
  setStatus: (no, status, note) => api.post(`/oem/${no}/status`, { status, note }),
  remove: (no) => api.del(`/oem/${no}`),
  exportUrl: (status) => `${API_URL}/oem/export.xlsx${status ? `?status=${encodeURIComponent(status)}` : ''}`,
  token: getToken,
};

export const OEM_STATUSES = ['Draft', 'Confirmed', 'In Production', 'Ready', 'Delivered', 'Cancelled'];

export function oemStatusCls(s) {
  if (s === 'Cancelled') return 'r';
  if (s === 'Delivered') return 'g';
  if (s === 'In Production' || s === 'Ready') return 'y';
  return '';
}

import { api } from '../../api/client';

// Everything the PI (Proforma Invoice / order) feature does against /api/pi.
export const piApi = {
  list: (queryString = '') => api.get(`/pi${queryString ? `?${queryString}` : ''}`),
  getByNo: (no) => api.get(`/pi/${no}`),
  parseOrderText: (text) => api.post('/pi/parse', { text }),
  create: (payload) => api.post('/pi', payload),
  update: (no, payload) => api.put(`/pi/${no}`, payload),
  setStatus: (no, status) => api.patch(`/pi/${no}/status`, { status }),
  confirm: (no) => api.post(`/pi/${no}/confirm`),
  cancel: (no) => api.post(`/pi/${no}/cancel`),
  closeRemaining: (no, note) => api.post(`/pi/${no}/close-remaining`, { note }),
  remove: (no) => api.del(`/pi/${no}`),
};
